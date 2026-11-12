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
    if (typeof store[key] === 'function') return async (...args) => structuredClone(store[key](...structuredClone(args)));
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

test('renderer: multi-target link creates an ordinary editable note with live prose expansion and persistent display settings', async () => {
  const f=fixture();let c=await client(f.store);const menu=label=>{c.click('[data-act="nmenu"]');[...c.w.document.querySelectorAll('.popmenu>div')].find(x=>x.textContent.includes(label)).click();};
  try{
    c.open('1');menu('リンクを作成');
    c.w.document.querySelector('#ln-title').value='集めた知識';
    c.w.document.querySelector('#ln-query').value='別のノート';c.w.document.querySelector('#ln-query').dispatchEvent(new c.w.Event('input',{bubbles:true}));
    c.click('[data-ln-add="0"]');assert.match(c.w.document.querySelector('#ln-count').textContent,/2件/);
    assert.ok(!f.store.state().docs.K_links);
    c.click('#ln-save');await tick();
    const bundle=f.store.state().docs.K_links.items[0];assert.equal(bundle.title,'集めた知識');assert.equal(bundle.targets.length,2);assert.equal(bundle.manual,undefined);
    c.click('#ln-note');await tick();const created=f.store.state().notes.find(n=>n.title==='集めた知識');assert.equal(created.kind,'text');assert.match(created.body,/!\[集めた知識\]\(link:/);
    assert.match(c.w.document.querySelector('#pane .linked-prose').textContent,/最初の文章/);assert.match(c.w.document.querySelector('#pane .linked-prose').textContent,/別のノート/);
    assert.equal(c.w.document.querySelector('#pane .linked-expansion .bub'),null);
    c.click('#pane .linked-fold');await c.callbacks.onFlush();assert.equal(c.w.document.querySelector('#pane .linked-prose').hidden,true,JSON.stringify({display:f.store.state().docs.K_display,errors:c.errors,html:c.w.document.querySelector('#pane .linked-expansion').outerHTML.slice(0,1000)}));
    const saved=c.storage();c.close();c=await client(openVault(f.dir),saved);
    assert.equal(c.w.document.querySelector('#pane .linked-prose').hidden,true);c.click('#pane .linked-fold');await c.callbacks.onFlush();
    c.click('#tabs [data-tab="d"]');c.open('1');c.edit('原文を編集した最新の内容');await c.callbacks.onFlush();
    c.click('#tabs [data-tab="u"]');c.open(created.id);
    assert.match(c.w.document.querySelector('#pane .linked-prose').textContent,/最新の内容/);assert.deepEqual(c.errors,[]);
  }finally{c.close();f.cleanup();}
});

test('renderer: circular expansion stops; memo timestamps default off and toggle above the prose',async()=>{
  const f=fixture();f.store.saveNote({s:'d',id:'1',body:'![循環](link:loop)'});const one=f.store.state().notes.find(n=>n.id==='1');
  f.store.saveDoc('C_チャット',{messages:[{id:'m1',topic:'哲学',text:'チャットの原文',t:1730000000000}],topics:[{name:'哲学',type:'bubble'}]});
  f.store.saveDoc('K_links',{items:[{id:'loop',title:'循環',targets:[{kind:'note',s:'d',stem:one.stem,id:'1'},{kind:'memo',id:'m1'}],order:'newest'}]});
  f.store.saveNote({s:'d',id:'2',body:'![参照](link:loop)'});const c=await client(f.store);
  try{
    c.open('2');await tick();assert.match(c.w.document.querySelector('#pane .linked-prose').textContent,/循環参照/);assert.ok(c.w.document.querySelectorAll('#pane .linked-expansion').length<6);
    assert.equal(c.w.document.querySelector('#pane .linked-source time'),null);
    const toggle=c.w.document.querySelector('#pane .linked-time');toggle.checked=true;toggle.dispatchEvent(new c.w.Event('change',{bubbles:true}));
    assert.ok(c.w.document.querySelector('#pane .linked-head'));assert.ok(c.w.document.querySelector('#pane .linked-source time'));await c.callbacks.onFlush();assert.deepEqual(c.errors,[]);
  }finally{c.close();f.cleanup();}
});

test('renderer: colon keyboard completion inserts postfix memo references, while Esc leaves typed text intact',async()=>{
  const f=fixture();f.store.saveDoc('C_チャット',{topics:[],messages:[{id:'m1',text:'参照先メモ',t:Date.now()}]});const c=await client(f.store);
  try{
    c.open('1');const v=c.w.__pkm.view;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:':'},selection:{anchor:1}});v.dispatch({changes:{from:1,insert:'参照先メモ'},selection:{anchor:1+'参照先メモ'.length}});
    assert.ok(c.w.document.querySelector('.reference-picker'));
    v.contentDOM.dispatchEvent(new c.w.KeyboardEvent('keydown',{key:'Enter',code:'Enter',shiftKey:true,bubbles:true,cancelable:true}));
    assert.match(c.text(),/\[参照先メモ\]\(memo:m1\):/);
    v.dispatch({changes:{from:0,to:v.state.doc.length,insert:':'},selection:{anchor:1}});v.dispatch({changes:{from:1,insert:'参照'},selection:{anchor:3}});
    v.contentDOM.dispatchEvent(new c.w.KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));assert.equal(c.text(),':参照');assert.equal(c.w.document.querySelector('.reference-picker'),null);
    v.dispatch({changes:{from:3,insert:'続き'},selection:{anchor:5}});assert.equal(c.w.document.querySelector('.reference-picker'),null);await c.callbacks.onFlush();assert.deepEqual(c.errors,[]);
  }finally{c.close();f.cleanup();}
});

test('renderer: standalone URL previews hydrate controls, keep inline URLs as text and preserve Markdown when hidden',async()=>{
  const f=fixture(),url='https://example.com/article';f.store.saveDoc('K_urlCache',{items:{[url]:{title:'取得した題',description:'説明',domain:'example.com'}}});
  const c=await client(f.store);
  try{
    c.open('1');c.edit(url);await tick();const original=c.text();assert.match(c.w.document.querySelector('#pane .url-preview').textContent,/取得した題/);
    c.click('#pane .url-menu');[...c.w.document.querySelectorAll('.popmenu>div')].find(x=>x.textContent.includes('非表示')).click();
    assert.equal(c.text(),original);assert.ok(c.w.document.querySelector('#pane .url-preview-off'));await c.callbacks.onFlush();
    c.edit('文章中の '+url+' はテキスト');await tick();assert.equal(c.w.document.querySelector('#pane .url-preview'),null);
    await c.callbacks.onFlush();assert.deepEqual(c.errors,[]);
  }finally{c.close();f.cleanup();}
});

test('renderer: bulk topics expose partial assignments, default to addition, and cancel without changing the source',async()=>{
  const f=fixture();f.store.saveDoc('C_チャット',{topics:[{name:'哲学',type:'bubble'},{name:'歴史',type:'bubble'},{name:'認識論',type:'bubble'}],messages:[{id:'m1',text:'一つ目',topic:'哲学',t:Date.now()},{id:'m2',text:'二つ目',topic:'歴史',t:Date.now()+1}]});const c=await client(f.store);
  try{
    c.click('#rail [data-mode="chat"]');c.click('#list [data-chat="*"]');
    assert.ok(c.w.document.querySelector('[data-c="select"]'),JSON.stringify({errors:c.errors,html:c.w.document.querySelector('#pane').innerHTML.slice(0,500)}));
    c.click('[data-c="select"]');c.click('[data-c="selall"]');c.click('[data-c="selmove"]');
    assert.equal(c.w.document.querySelector('[name=sd-mode][value=add]').checked,true);
    assert.equal(c.w.document.querySelector('[data-u="哲学"]').indeterminate,true);
    const option=c.w.document.querySelector('[data-u="認識論"]');option.checked=true;option.dispatchEvent(new c.w.Event('change',{bubbles:true}));c.click('#sd-no');
    assert.deepEqual(f.store.state().docs.C_チャット.messages.map(m=>m.ups),[undefined,undefined]);
    c.click('[data-c="selmove"]');const next=c.w.document.querySelector('[data-u="認識論"]');next.checked=true;next.dispatchEvent(new c.w.Event('change',{bubbles:true}));c.click('#sd-ok');await tick();await c.callbacks.onFlush();
    const ms=f.store.state().docs.C_チャット.messages;assert.equal(ms[0].topic,'哲学');assert.equal(ms[1].topic,'歴史');assert.deepEqual(ms.map(m=>m.ups),[['認識論'],['認識論']]);
    assert.equal(c.w.document.querySelector('[data-add-topic-filter]'),null);assert.deepEqual(c.errors,[]);
  }finally{c.close();f.cleanup();}
});

test('renderer: range adjustment and explicit manual order preserve the immutable link ID and existing display modes',async()=>{
  const f=fixture(),all=f.store.state().notes;
  f.store.saveDoc('K_links',{items:[{id:'bundle',title:'順序と範囲',targets:all.map(n=>({kind:'note',stem:n.stem,id:n.id,s:n.s})),order:'newest'}]});
  f.store.saveNote({s:'d',id:'3',body:'![順序と範囲](link:bundle)'});const c=await client(f.store),$=s=>c.w.document.querySelector(s);
  try{
    c.open('3');c.click('#pane .linked-title');c.click('#ln-edit');
    const order=$('#ln-order');order.value='manual';order.dispatchEvent(new c.w.Event('change',{bubbles:true}));assert.equal(f.store.state().docs.K_links.items[0].manual,undefined);
    c.click('[data-ln-move="0"][data-delta="1"]');c.click('[data-ln-range="0"]');
    const input=$('#ln-range-text');input.setSelectionRange(0,2);c.click('#ln-range-ok');
    $('#ln-title').value='名前を変更';c.click('#ln-save');await tick();
    const link=f.store.state().docs.K_links.items[0];assert.equal(link.id,'bundle');assert.equal(link.manual.length,2);assert.equal(link.order,'manual');assert.ok(link.targets.some(t=>t.range?.quote.length===2));
    c.click('#ln-close');c.open('3');const picker=$('#pane .linked-order');picker.value='oldest';picker.dispatchEvent(new c.w.Event('change',{bubbles:true}));await c.callbacks.onFlush();
    assert.equal(f.store.state().docs.K_links.items[0].order,'manual');assert.deepEqual(f.store.state().docs.K_links.items[0].manual,link.manual);
    c.click('#pane .linked-title');c.click('#ln-uses .link-backlink');assert.equal($('#modal').style.display,'none');assert.ok(c.w.__pkm.view.state.selection.main.to>0);
    assert.deepEqual(c.errors,[]);
  }finally{c.close();f.cleanup();}
});

test('renderer: normal note mentions and replies are distinct and appear in the original memo backlinks',async()=>{
  const f=fixture();f.store.saveDoc('C_チャット',{topics:[],messages:[{id:'m1',text:'返信先のメモ',t:Date.now()}]});const c=await client(f.store);
  const choose=label=>{c.click('[data-act="nmenu"]');[...c.w.document.querySelectorAll('.popmenu>div')].find(e=>e.textContent.includes(label)).click();c.click('#ln-memo-results button');};
  try{
    c.open('1');choose('メンション');assert.match(c.text(),/\(memo:m1\)/);choose('リプライ');assert.match(c.text(),/\(reply:m1\)/);await c.callbacks.onFlush();
    c.click('#rail [data-mode="chat"]');c.click('#list [data-chat="*"]');
    const back=c.w.document.querySelector('[data-m="m1"] .memo-reference-backlinks');assert.match(back.textContent,/メンション/);assert.match(back.textContent,/リプライ/);
    assert.equal(f.store.state().docs.C_チャット.messages.length,1);assert.deepEqual(c.errors,[]);
  }finally{c.close();f.cleanup();}
});

test('renderer: URL preview controls are isolated per occurrence and survive restart',async()=>{
  const f=fixture(),url='https://example.com/article';f.store.saveNote({s:'d',id:'1',body:url+'\n\n'+url});f.store.saveDoc('K_urlCache',{items:{[url]:{title:'既存URLの題'}}});let c=await client(f.store);
  try{
    c.open('1');assert.equal(c.w.document.querySelectorAll('#pane .url-preview').length,2);c.click('#pane .url-menu');[...c.w.document.querySelectorAll('.popmenu>div')].find(b=>b.textContent.includes('非表示')).click();await c.callbacks.onFlush();await tick();
    assert.equal(c.w.document.querySelectorAll('#pane .url-preview-off').length,1);const storage=c.storage();c.close();c=await client(openVault(f.dir),storage);
    assert.equal(c.w.document.querySelectorAll('#pane .url-preview-off').length,1);assert.equal(c.text(),url+'\n\n'+url);assert.deepEqual(c.errors,[]);
  }finally{c.close();f.cleanup();}
});

test('renderer: textarea colon search does not send a message; child creation assigns parent to subsequent memos',async()=>{
  const f=fixture();f.store.saveDoc('C_チャット',{topics:[{name:'哲学',type:'bubble'}],messages:[{id:'m1',text:'検索対象メモ',topic:'哲学',t:Date.now()}]});const c=await client(f.store),$=s=>c.w.document.querySelector(s);
  try{
    c.click('#rail [data-mode="chat"]');c.click('#list [data-chat="哲学"]');const input=$('#c-in');
    input.value=':';input.setSelectionRange(1,1);input.dispatchEvent(new c.w.InputEvent('input',{data:':',inputType:'insertText',bubbles:true}));
    input.value=':検索対象';input.setSelectionRange(5,5);input.dispatchEvent(new c.w.InputEvent('input',{data:'検索対象',inputType:'insertText',bubbles:true}));
    assert.ok($('.reference-picker'));input.dispatchEvent(new c.w.KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true}));assert.match(input.value,/\(memo:m1\):/);assert.equal(f.store.state().docs.C_チャット.messages.length,1);
    c.click('[data-tg="up"]');[...c.w.document.querySelectorAll('.popmenu>div')].find(b=>b.textContent.includes('下位')).click();$('#child-name').value='認識論';c.click('#child-ok');await tick();
    assert.equal(c.w.__pkm.cur.topic,'認識論');assert.deepEqual(f.store.state().docs.C_チャット.upperByTopic['認識論'],['哲学']);
    const field=$('#c-in');field.value='下位のメモ';field.dispatchEvent(new c.w.InputEvent('input',{data:'下位のメモ',bubbles:true}));field.dispatchEvent(new c.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await c.callbacks.onFlush();
    const added=f.store.state().docs.C_チャット.messages.find(m=>m.text==='下位のメモ');assert.equal(added.topic,'認識論');assert.deepEqual(added.ups,['哲学']);assert.deepEqual(c.errors,[]);
  }finally{c.close();f.cleanup();}
});

test('renderer: prose can surround internal embeds; inline code and ordinary images do not become source expansions',async()=>{
  const f=fixture(),one=f.store.state().notes.find(n=>n.id==='1');
  f.store.saveDoc('K_links',{items:[{id:'inline',title:'文章中の参照',targets:[{kind:'note',s:'d',id:'1',stem:one.stem}],order:'newest'}]});
  f.store.saveNote({s:'d',id:'2',body:'前の文章 ![参照](link:inline) 後の文章\n`![コード](link:inline)`\n![画像](photo.jpg)'});
  const c=await client(f.store);
  try{
    c.open('2');await tick();assert.equal(c.w.document.querySelectorAll('#pane .linked-expansion').length,1);
    assert.match(c.w.document.querySelector('#pane .linked-prose').textContent,/最初の文章/);
    assert.match(c.text(),/前の文章.*後の文章/);await c.callbacks.onFlush();assert.deepEqual(c.errors,[]);
  }finally{c.close();f.cleanup();}
});

test('renderer: 0 Index lists only root Topic Indexes in ID order and keeps the list when opening one', async () => {
  const f = fixture();
  f.store.saveNote({ s: 'd', id: '10', body: '十番目' });
  f.store.saveNote({ s: 'd', id: '1a', body: '分岐の本文' });
  f.store.saveNote({ s: 'p', id: '1', body: '紙の本文' });
  const draft = f.store.createNote({ body: 'ID未設定の考え' });
  for (const t of [
    { name: '十番目の索引', entry: { s: 'd', id: '10' } },
    { name: '別の親', entry: { s: 'd', id: '2' } },
    { name: '紙の入口', entry: { s: 'p', id: '1' } },
    { name: '紙を取り込む前', entry: { s: 'p', id: '8' } },
    { name: '読書の入口', entry: { s: 'd', id: '1' } },
    { name: '分岐の索引', entry: { s: 'd', id: '1a' } },
    { name: '親なし', entry: null },
    { name: 'まだIDのないノートの索引', entry: { s: 'd', id: draft.id } }
  ]) assert.ok(f.store.saveTopic({ ...t, text: '項目 1 2' }));
  const before = structuredClone(f.store.state().topics);
  const c = await client(f.store), $ = s => c.w.document.querySelector(s);
  try {
    c.open('1'); c.edit('0 Indexへ移っても保持する');
    c.click('[data-tab="0"]');
    const rows = [...c.w.document.querySelectorAll('#list .topicrow')];
    assert.deepEqual(rows.map(el => el.dataset.topic), ['読書の入口', '紙の入口', '別の親', '紙を取り込む前', '十番目の索引']);
    assert.deepEqual(rows.map(el => el.querySelector('.ns').textContent), ['デジタル 1', '紙 1', 'デジタル 2', '紙 8', 'デジタル 10']);
    assert.equal(c.text(), '0 Indexへ移っても保持する');
    c.click('#list [data-topic="読書の入口"]');
    assert.ok($('[data-tab="0"].on'));
    assert.ok($('#list [data-topic="読書の入口"].on'));
    assert.match($('#pane .ti').textContent, /項目/);
    c.click('#list [data-topic="十番目の索引"]');
    assert.ok($('[data-tab="0"].on'));
    assert.ok($('#list [data-topic="十番目の索引"].on'));
    await c.callbacks.onFlush();
    assert.equal(f.store.state().notes.find(n => n.s === 'd' && n.id === '1').body, '0 Indexへ移っても保持する');
    assert.deepEqual(f.store.state().topics, before); // Opening 0 Index never rewrites existing indexes.
    c.click('[data-tab="d"]');
    assert.ok($('#list [data-id="1"][data-s="d"]'));
    assert.ok($('#list [data-topic="分岐の索引"]'));
    assert.deepEqual(c.errors, []);
  } finally { c.close(); f.cleanup(); }
});

test('renderer: 0 Index handles an empty vault and updates when existing Topic Indexes change', async () => {
  const f = fixture(), c = await client(f.store), $ = s => c.w.document.querySelector(s);
  try {
    c.click('[data-tab="0"]');
    assert.match($('#list .none').textContent, /親ID/);
    assert.equal($('#list .topicrow'), null);
    f.store.saveTopic({ name: '追加した索引', entry: { s: 'd', id: '2' }, text: '考え 2' });
    await c.callbacks.onPhoneAuto({ ok: true, state: f.store.state() });
    assert.ok($('#list [data-topic="追加した索引"]'));
    assert.ok($('[data-tab="0"].on'));
    f.store.deleteTopic('追加した索引');
    await c.callbacks.onPhoneAuto({ ok: true, state: f.store.state() });
    assert.equal($('#list .topicrow'), null);
    assert.match($('#list .none').textContent, /親ID/);
    assert.deepEqual(c.errors, []);
  } finally { c.close(); f.cleanup(); }
});
