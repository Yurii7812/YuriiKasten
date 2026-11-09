const test = require('node:test');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const { openVault } = require('../store');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const bundled = require('esbuild').buildSync({ entryPoints: [path.join(__dirname, '../src/app.js')], bundle: true, write: false, format: 'iife', logLevel: 'silent' }).outputFiles[0].text;
const tick = () => new Promise(r => setTimeout(r, 30));

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yn-ui-')), store = openVault(dir);
  store.saveNote({ s: 'd', id: '1', title: 'A', body: '最初の文章' });
  store.saveNote({ s: 'd', id: '2', title: 'B', body: '別のノート' });
  store.saveDoc('K_settings', { lang: 'ja' });
  return { dir, store, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
async function client(store, initialStorage = {}) {
  const errors = [], callbacks = {}, flags = { fail: false }, vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!String(e).includes('Not implemented')) errors.push(String(e)); });
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.Range.prototype.getClientRects = () => [];
  w.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  w.confirm = () => true; w.alert = x => { errors.push('alert: ' + x); };
  flags.clipboard = [];
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async text => { flags.clipboard.push(text); } } });
  for (const [key, value] of Object.entries(initialStorage)) w.localStorage.setItem(key, value);
  w.api = new Proxy({}, { get(_, key) {
    if (String(key).startsWith('on')) return cb => { callbacks[key] = cb; };
    if (key === 'load' || key === 'state') return async () => structuredClone(store.state());
    if (key === 'urlTitle') return () => new Promise(resolve => { flags.resolveTitle = resolve; });
    if (key === 'saveNote') return async n => { if (flags.fail) throw Error('disk full'); return structuredClone(store.saveNote(n)); };
    if (typeof store[key] === 'function') return async (...args) => structuredClone(store[key](...args));
    if (key === 'appInfo') return async () => ({ version: 'test' });
    return async () => null;
  } });
  w.eval(bundled); await tick();
  const click = selector => { const el = w.document.querySelector(selector); assert.ok(el, selector); el.click(); };
  return {
    w, callbacks, flags, errors, click,
    open: id => click(`#list [data-id="${id}"][data-s="d"]`),
    edit: text => { const v = w.__pkm.view; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } }); },
    text: () => w.__pkm.view.state.doc.toString(), close: () => dom.window.close(),
    storage: () => Object.fromEntries(Array.from({ length: w.localStorage.length }, (_, i) => { const k = w.localStorage.key(i); return [k, w.localStorage.getItem(k)]; }))
  };
}

test('renderer: rapid switching, mounted editor refresh, save failure/retry and adjacent plus/name/create flow', async () => {
  const f = fixture(), c = await client(f.store);
  try {
    c.open('1'); assert.equal(c.text(), '最初の文章');
    c.edit('書いてすぐ移動しても残る'); c.open('2'); c.open('1');
    assert.equal(c.text(), '書いてすぐ移動しても残る'); await c.callbacks.onFlush();
    await c.callbacks.onPhoneAuto({ ok: true, state: f.store.state() });
    c.edit('再読み込み後の追記'); c.open('2'); c.open('1');
    assert.equal(c.text(), '再読み込み後の追記'); await c.callbacks.onFlush();
    assert.equal(f.store.state().notes.find(n => n.id === '1').body, '再読み込み後の追記');
    c.flags.fail = true; c.edit('失敗しても保持する'); await assert.rejects(c.callbacks.onFlush());
    c.open('2'); c.open('1'); assert.equal(c.text(), '失敗しても保持する');
    assert.match(c.w.document.querySelector('#save-status').textContent, /保存エラー/);
    c.flags.fail = false; await c.callbacks.onFlush();
    assert.equal(f.store.state().notes.find(n => n.id === '1').body, '失敗しても保持する');
    c.click('[data-act="tadd"]');
    const $ = s => c.w.document.querySelector(s);
    assert.equal($('#ta-create').hidden, true);
    assert.equal($('#ta-q').parentElement, $('#ta-new').parentElement); assert.ok(!$('.da-sep'));
    c.click('#ta-new'); assert.equal(c.w.document.activeElement.id, 'ta-name');
    c.click('#ta-create-ok'); assert.match($('#ta-create-error').textContent, /名前を入力/);
    $('#ta-name').value = '自分の索引'; c.click('#ta-create-ok'); await tick();
    assert.ok(f.store.state().topics.some(t => t.name === '自分の索引' && t.entry.id === '1'));
    await c.callbacks.onFlush(); assert.deepEqual(c.errors, []);
  } finally { c.close(); f.cleanup(); }
});

test('renderer: restart replays unsaved recovery copies before rendering the note', async () => {
  const f = fixture(); let c = await client(f.store);
  try {
    c.open('1'); c.flags.fail = true; c.edit('再起動しても日本語の下書きを保持');
    await assert.rejects(c.callbacks.onFlush());
    const savedStorage = c.storage(); c.close();
    assert.equal(openVault(f.dir).state().notes.find(n => n.id === '1').body, '最初の文章');
    c = await client(openVault(f.dir), savedStorage);
    assert.equal(c.text(), '再起動しても日本語の下書きを保持'); await c.callbacks.onFlush();
    assert.equal(openVault(f.dir).state().notes.find(n => n.id === '1').body, '再起動しても日本語の下書きを保持');
    assert.ok(!Object.keys(c.storage()).some(k => k.startsWith('pkm-recovery:')));
    assert.deepEqual(c.errors, []);
  } finally { c.close(); f.cleanup(); }
});

test('renderer: delayed pasted URL title cannot overwrite a reopened and edited note', async () => {
  const f = fixture(), c = await client(f.store);
  try {
    c.open('1');
    const paste = new c.w.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'https://example.com/article', files: [] } });
    c.w.__pkm.view.contentDOM.dispatchEvent(paste); assert.equal(typeof c.flags.resolveTitle, 'function');
    c.open('2'); c.open('1'); c.edit('URL取得待ちの間に書いた新しい文章');
    c.flags.resolveTitle('記事の題'); await tick(); await c.callbacks.onFlush();
    assert.equal(c.text(), 'URL取得待ちの間に書いた新しい文章');
    assert.equal(openVault(f.dir).state().notes.find(n => n.id === '1').body, c.text());
    assert.deepEqual(c.errors, []);
  } finally { c.close(); f.cleanup(); }
});

test('renderer: ID copies on click; changing and clearing require the note menu and explicit actions', async () => {
  const f = fixture(), c = await client(f.store);
  const $ = selector => c.w.document.querySelector(selector);
  const settings = () => {
    c.click('[data-act="nmenu"]');
    [...c.w.document.querySelectorAll('.popmenu>div')].find(b => b.textContent.includes('IDを変更・解除')).click();
  };
  try {
    c.open('1');
    assert.equal($('#f-id').tagName, 'BUTTON');
    assert.equal($('#f-id').textContent, '1');
    assert.equal($('.idline input'), null); assert.equal($('.cpid'), null);
    assert.equal($('.idline [data-act="clearid"]'), null);
    assert.equal($('.idline [data-act="giveid"]'), null);
    c.click('#f-id'); await tick(); assert.deepEqual(c.flags.clipboard, ['1']);
    assert.equal(f.store.state().notes.find(n => n.id === '1').body, '最初の文章');
    settings(); $('#id-next').value = ''; c.click('#id-apply');
    assert.match($('#id-error').textContent, /空欄ではIDは外れません/);
    assert.ok(f.store.state().notes.some(n => n.id === '1'));
    $('#id-next').value = '2'; c.click('#id-apply'); await tick();
    assert.match($('#id-error').textContent, /そのIDは使えません/);
    $('#id-next').value = '3'; c.click('#id-apply'); await tick();
    assert.equal($('#modal').style.display, 'none'); assert.equal($('#f-id').textContent, '3');
    settings(); c.w.confirm = () => false; c.click('#id-clear'); await tick();
    assert.ok(f.store.state().notes.some(n => n.id === '3')); assert.equal($('#modal').style.display, 'flex');
    c.w.confirm = () => true; c.click('#id-clear'); await tick();
    assert.equal($('#f-id').textContent, 'IDなし'); assert.ok($('.idline [data-act="giveid"]'));
    assert.equal(f.store.state().notes.find(n => n.noid).body, '最初の文章');
    assert.deepEqual(c.errors, []);
  } finally { c.close(); f.cleanup(); }
});

test('renderer: bulk selection buttons copy, cancel, wrap and exclude topic rows; Esc exits without clearing search', async () => {
  const f = fixture(); f.store.saveTopic({ name: '索引', entry: { s: 'd', id: '1' }, text: '項目 1 2' });
  const c = await client(f.store), $ = selector => c.w.document.querySelector(selector);
  const escape = target => target.dispatchEvent(new c.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  try {
    c.open('1'); c.click('#sel-start');
    assert.equal($('#sel-copy').disabled, true);
    c.click('#list .topicrow'); assert.match($('.sel-head').textContent, /0件/);
    c.click('#sel-all'); assert.equal(c.w.document.querySelectorAll('#list .ck:checked').length, 2);
    assert.match($('.sel-head').textContent, /2件/);
    assert.equal(c.w.getComputedStyle($('.sel-actions')).flexWrap, 'wrap');
    assert.equal(c.w.getComputedStyle($('#selbar')).flexDirection, 'column');
    c.click('#sel-copy'); await tick();
    assert.match(c.flags.clipboard.at(-1), /最初の文章/); assert.match(c.flags.clipboard.at(-1), /別のノート/);
    c.click('#sel-end small'); assert.ok($('#sel-start')); assert.equal($('#list .ck'), null);
    c.click('#sel-start'); c.click('#sel-all'); c.click('#sel-exp');
    assert.equal($('#modal').style.display, 'flex');
    escape($('#modal')); assert.equal($('#modal').style.display, 'none'); assert.ok($('#sel-end'));
    $('#q').value = '残す検索語'; escape($('#q'));
    assert.ok($('#sel-start')); assert.equal($('#q').value, '残す検索語');
    $('#q').value = ''; $('#q').dispatchEvent(new c.w.Event('input', { bubbles: true }));
    c.click('#sel-start'); c.open('1');
    c.w.document.body.dispatchEvent(new c.w.KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }));
    assert.ok($('#sel-end')); escape(c.w.document.body); assert.ok($('#sel-start'));
    await c.callbacks.onFlush(); assert.deepEqual(c.errors, []);
  } finally { c.close(); f.cleanup(); }
});
