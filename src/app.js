import { EditorView, Decoration, ViewPlugin, keymap, placeholder } from '@codemirror/view';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import L from '../lib.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SP = { d: 'デジタル', p: '紙' };

let notes = [], topics = [], tab = 'd', cur = null, vault = '';
const get = (s, id) => notes.find(n => n.s === s && n.id === id);
const free = (s, id) => { while (get(s, id)) id = L.sibling(id); return id; };
const topicOf = (s, id) => topics.find(t => t.anchors.some(a => a.s === s && a.id === id));

// ===== 保存（少し待ってまとめて）=====
const timers = {};
const later = (k, f) => { if (timers[k]) clearTimeout(timers[k].t); timers[k] = { f, t: setTimeout(() => { delete timers[k]; f(); }, 400) }; };
const pubNote = n => ({ s: n.s, id: n.id, created: n.created, keywords: n.keywords, body: n.body });
const saveNote = n => later('n' + n.s + n.id, () => api.saveNote(pubNote(n)));
const saveTopic = t => later('t' + t.name, () => api.saveTopic(t));
async function flush() { // 待っている保存を今すぐ
  const fs = Object.values(timers); for (const k in timers) { clearTimeout(timers[k].t); delete timers[k]; }
  await Promise.all(fs.map(x => x.f()));
}
window.addEventListener('beforeunload', () => { flush(); });

// ===== エディタ（:1 や (1) をその場でリンクに）=====
function links(mode, space) {
  const build = view => {
    const b = new RangeSetBuilder(), text = view.state.doc.toString();
    const add = (from, to, data, ok) => b.add(from, to, Decoration.mark({ class: 'lk' + (ok ? '' : ' miss'), attributes: { 'data-l': JSON.stringify(data) } }));
    if (mode === 'note') {
      for (const t of L.tokens(text)) {
        if (t.k === 'ref') add(t.from, t.to, { t: 'ref', s: space, id: t.id, n: t.n }, !!get(space, t.id));
        else if (t.bare) b.add(t.from, t.to, Decoration.mark({ class: 'mk' })); // 素の (1) は赤いだけ
        else add(t.from, t.to, { t: 'self', n: t.n, bare: t.bare }, L.selfTarget(text, t.n, t.bare) >= 0);
      }
    } else {
      let off = 0;
      for (const line of text.split('\n')) {
        const r = L.topicLine(line);
        if (r.star !== undefined) { if (r.star) add(off + r.from, off + r.to, { t: 'topic', name: r.star }, !!topics.find(x => x.name === r.star)); }
        else for (const x of r.ids) add(off + x.from, off + x.to, { t: 'ref', s: space, id: x.id }, !!get(space, x.id));
        off += line.length + 1;
      }
    }
    return b.finish();
  };
  return ViewPlugin.fromClass(class {
    constructor(v) { this.decorations = build(v); }
    update(u) { if (u.docChanged) this.decorations = build(u.view); }
  }, {
    decorations: v => v.decorations,
    eventHandlers: {
      mousedown(e, view) {
        const el = e.target.closest('.lk');
        if (!el || e.button !== 0) return false;
        e.preventDefault(); follow(JSON.parse(el.dataset.l), view); return true;
      }
    }
  });
}
let lastView = null;
function editor(parent, doc, mode, space, onChange, ph) {
  return lastView = new EditorView({
    parent, state: EditorState.create({
      doc, extensions: [history(), keymap.of([...defaultKeymap, ...historyKeymap]), EditorView.lineWrapping,
        placeholder(ph), links(mode, space), EditorView.updateListener.of(u => { if (u.docChanged) onChange(u.state.doc.toString()); })]
    })
  });
}
function jump(view, pos) {
  view.dispatch({ selection: { anchor: pos, head: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
  view.focus();
}
async function follow(l, view) {
  if (l.t === 'self') { const p = L.selfTarget(view.state.doc.toString(), l.n, l.bare); if (p >= 0) jump(view, p); return; }
  if (l.t === 'topic') { if (topics.find(t => t.name === l.name)) openTopic(l.name); return; }
  if (get(l.s, l.id)) return openNote(l.s, l.id, l.n);
  if (confirm(`${SP[l.s]} ${l.id} はまだありません。作りますか？`)) create(l.s, l.id);
}

// ===== 左の一覧 =====
function globalIndex() {
  const m = new Map();
  for (const n of notes) for (const k of n.keywords) {
    if (!m.has(k)) m.set(k, { d: [], p: [] });
    m.get(k)[n.s].push(n.id);
  }
  for (const v of m.values()) { v.d.sort(L.cmpId); v.p.sort(L.cmpId); }
  return [...m].sort((a, b) => a[0].localeCompare(b[0], 'ja'));
}
const chip = (s, id) => `<span class="chip ${s}${get(s, id) ? '' : ' miss'}" data-s="${s}" data-id="${esc(id)}">${s === 'p' ? '紙' : ''}${esc(id)}</span>`;
const chips = v => v.d.map(x => chip('d', x)).join('') + v.p.map(x => chip('p', x)).join('');
const tchip = name => `<span class="chip t" data-topic="${esc(name)}">${esc(name)}</span>`;
const firstLine = n => (n.body.split('\n').find(x => x.trim()) || '').trim().slice(0, 40);
const kwTags = n => n.keywords.map(k => `<span class="tag">${esc(k)}</span>`).join('');
const noteRow = (n, depth = 0, label = false) =>
  `<div class="item${cur && cur.k === 'note' && cur.s === n.s && cur.id === n.id ? ' on' : ''}" data-s="${n.s}" data-id="${esc(n.id)}" style="padding-left:${12 + depth * 14}px">` +
  `${label ? `<span class="sp ${n.s}">${SP[n.s]}</span>` : ''}<b>${esc(n.id)}</b>${n.image ? '📷 ' : ''}<small>${esc(firstLine(n))}</small> ${kwTags(n)}</div>`;

function renderList() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const q = $('#q').value.trim().toLowerCase(), out = [];
  if (q) {
    // 1. Index  2. トピックIndex  3. ノート
    const rank = k => (k.toLowerCase() === q ? 0 : k.toLowerCase().startsWith(q) ? 1 : 2);
    const gi = globalIndex().filter(([k]) => k.toLowerCase().includes(q)).sort((a, b) => rank(a[0]) - rank(b[0]));
    if (gi.length) out.push('<h4>Index</h4>', ...gi.map(([k, v]) => `<div class="ix"><b>${esc(k)}</b> ${chips(v)}</div>`));
    const ti = [];
    for (const t of topics) {
      if (t.name.toLowerCase().includes(q)) ti.push([-1, `<div class="ix">${tchip(t.name)}</div>`]);
      for (const r of L.mergeTopic(t).rows) if (r.kw.toLowerCase().includes(q)) ti.push([rank(r.kw), `<div class="ix"><b>${esc(r.kw)}</b> ${chips(r)} <small>← ${tchip(t.name)}</small></div>`]);
    }
    if (ti.length) out.push('<h4>トピックIndex</h4>', ...ti.sort((a, b) => a[0] - b[0]).map(x => x[1]));
    const hit = notes.filter(n => [n.id, n.body, n.keywords.join(' ')].join('\n').toLowerCase().includes(q))
      .sort((a, b) => a.s.localeCompare(b.s) || L.cmpId(a.id, b.id));
    if (hit.length) out.push('<h4>ノート</h4>', ...hit.map(n => noteRow(n, 0, true)));
    if (!out.length) out.push('<div class="none">見つかりません</div>');
  } else if (tab === 'i') {
    out.push('<h4>Index</h4>', ...globalIndex().map(([k, v]) => `<div class="ix"><b>${esc(k)}</b> ${chips(v)}</div>`));
    out.push('<h4>トピックIndex</h4>', ...topics.slice().sort((a, b) => a.name.localeCompare(b.name, 'ja'))
      .map(t => `<div class="ix${cur && cur.k === 'topic' && cur.name === t.name ? ' on' : ''}">${tchip(t.name)} ${t.anchors.map(a => chip(a.s, a.id)).join('')}</div>`));
    if (out.length === 2) out.push('<div class="none">ノートにキーワードを書くと、ここに並びます</div>');
  } else {
    const list = notes.filter(n => n.s === tab).sort((a, b) => L.cmpId(a.id, b.id)), has = x => !!get(tab, x), depth = {};
    for (const n of list) { const p = L.parentIn(n.id, has); depth[n.id] = p ? depth[p] + 1 : 0; out.push(noteRow(n, depth[n.id])); }
    if (!list.length) out.push(`<div class="none">${tab === 'p' ? '「📷 スキャン取り込み」で紙を入れます' : '「＋ 新規」で書き始めます'}</div>`);
  }
  $('#list').innerHTML = out.join('');
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-topic]'); if (t) return openTopic(t.dataset.topic);
  const n = e.target.closest('[data-id][data-s]');
  if (n && !e.target.closest('.cm-editor')) {
    if (get(n.dataset.s, n.dataset.id)) openNote(n.dataset.s, n.dataset.id);
    else if (confirm(`${SP[n.dataset.s]} ${n.dataset.id} はまだありません。作りますか？`)) create(n.dataset.s, n.dataset.id);
  }
});
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.tab; $('#q').value = ''; renderList(); } };
$('#q').oninput = renderList;
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); $('#q').focus(); $('#q').select(); } });

// ===== ノート =====
function openNote(s, id, n) {
  const note = get(s, id); if (!note) return;
  cur = { k: 'note', s, id };
  if (!$('#q').value) tab = s;
  const t = topicOf(s, id);
  $('#pane').innerHTML = `
    <div class="row">
      <span class="sp ${s}">${SP[s]}</span>
      <input class="id" id="f-id" value="${esc(id)}" title="ID（変えると名前も変わります）">
      ${s === 'd' ? `<span class="date">${esc(note.created)}</span>` : ''}
      <span class="grow"></span>
      <button data-act="sib" title="同じ段の次">並列 ${free(s, L.sibling(id))}</button>
      <button data-act="chi" title="一段下">分岐 ${free(s, L.child(id))}</button>
      <button data-act="topic">${t ? 'トピックIndex: ' + esc(t.name) : 'トピックIndex'}</button>
    </div>
    <input class="kw" id="f-kw" value="${esc(note.keywords.join('、'))}" placeholder="キーワード（、で区切る。Index に入ります）">
    ${s === 'p' ? `<div class="paper"><div class="pic">${note.image ? `<img src="${note.image}">` : '<button data-act="img">画像を入れる</button>'}</div><div class="ed" id="ed"></div></div>` : '<div class="ed" id="ed"></div>'}`;
  const view = editor($('#ed'), note.body, 'note', s, v => { note.body = v; saveNote(note); renderList(); },
    s === 'p' ? '紙の内容を文字で（テキスト化）' : '本文。続き :1a1　引用 (1) と (1):　別ノート 1a(1)　全体 1a:');
  $('#f-kw').oninput = e => { note.keywords = L.splitKw(e.target.value); saveNote(note); renderList(); };
  $('#f-id').onchange = async e => {
    const v = e.target.value.trim().toLowerCase();
    if (v === id) return;
    await flush(); await api.saveNote(pubNote(note));
    const r = L.isId(v) && !get(s, v) && await api.rename(s, id, v);
    if (!r) { alert('そのIDは使えません（形が違うか、既にあります）'); e.target.value = id; return; }
    Object.assign(note, r); for (const t of topics) for (const a of t.anchors) if (a.s === s && a.id === id) a.id = v;
    openNote(s, v);
  };
  renderList();
  if (n) { const p = L.anchorPos(note.body, n); if (p >= 0) jump(view, p); }
  else if (s === 'd' && !note.body) view.focus();
}
async function create(s, id) {
  const n = await api.saveNote({ s, id, created: L.now(), keywords: [], body: '' });
  notes.push(n); openNote(s, id);
}
$('#pane').addEventListener('click', async e => {
  const a = e.target.closest('[data-act]'); if (!a || !cur) return;
  const act = a.dataset.act;
  if (cur.k === 'topic') { if (act === 'tedit') openTopic(cur.name, !cur.edit); return; }
  const { s, id } = cur;
  if (act === 'sib') create(s, free(s, L.sibling(id)));
  if (act === 'chi') create(s, free(s, L.child(id)));
  if (act === 'topic') { const t = topicOf(s, id); t ? openTopic(t.name) : topicDialog(s, id); }
  if (act === 'img') pick(false, async f => { const r = await api.saveImage(s, id, await shrink(f[0])); Object.assign(get(s, id), r); openNote(s, id); });
});
$('#new').onclick = () => {
  const s = tab === 'p' ? 'p' : 'd';
  const roots = notes.filter(n => n.s === s && /^\d+$/.test(n.id)).map(n => +n.id);
  create(s, free(s, String((roots.length ? Math.max(...roots) : 0) + 1)));
};

// ===== トピックIndex =====
function topicDialog(s, id) {
  $('#m-name').value = id + '-';
  $('#m-list').innerHTML = topics.length ? '<div class="sub">または、今あるものに入口として足す</div>' +
    topics.map(t => `<button class="m-add" data-name="${esc(t.name)}">${esc(t.name)}</button>`).join('') : '';
  $('#modal').style.display = 'flex'; $('#m-name').focus();
  const done = () => { $('#modal').style.display = 'none'; };
  $('#m-ok').onclick = async () => {
    const name = $('#m-name').value.trim();
    if (!name) return;
    if (topics.find(t => t.name === name)) return alert('その名前は既にあります');
    const t = { name, anchors: [{ s, id }], d: '', p: '' };
    topics.push(t); await api.saveTopic(t); done(); openTopic(name, true);
  };
  $('#m-list').onclick = async e => {
    const b = e.target.closest('.m-add'); if (!b) return;
    const t = topics.find(x => x.name === b.dataset.name);
    t.anchors.push({ s, id }); await api.saveTopic(t); done(); openTopic(t.name);
  };
  $('#m-cancel').onclick = done;
  $('#m-name').onkeydown = e => { if (e.key === 'Enter') $('#m-ok').click(); if (e.key === 'Escape') done(); };
}
function openTopic(name, edit = false) {
  const t = topics.find(x => x.name === name); if (!t) return;
  cur = { k: 'topic', name, edit };
  if (!$('#q').value) tab = 'i';
  const { rows, stars } = L.mergeTopic(t);
  $('#pane').innerHTML = `
    <div class="row">
      <h2>${esc(name)}</h2>
      <span class="sub">入口</span>${t.anchors.map(a => chip(a.s, a.id)).join('')}
      <span class="grow"></span>
      <button data-act="tedit" class="${edit ? 'p' : ''}">${edit ? '完了' : '編集'}</button>
    </div>
    ${edit ? `<div class="sub">1行に「キーワード ID ID …」。★ で始めると別のトピックIndexへの案内。デジタルと紙は別々に書き、表示はまとめます。</div>
      <div class="two"><div><h4>デジタル</h4><div class="ed" id="ed-d"></div></div><div><h4>紙</h4><div class="ed" id="ed-p"></div></div></div>`
    : `<table class="ti">${rows.map(r => `<tr><td>${esc(r.kw)}</td><td>${chips(r)}</td></tr>`).join('') || '<tr><td class="none">まだ空です。「編集」で書きます</td></tr>'}</table>
      ${stars.map(x => `<div class="star">★ ${tchip(x)}</div>`).join('')}`}`;
  if (edit) for (const s of ['d', 'p']) {
    const v = editor($('#ed-' + s), t[s], 'topic', s, x => { t[s] = x; saveTopic(t); }, s === 'd' ? 'PKM 1a 3' : 'PKM 2');
    if (s === 'd') v.focus();
  }
  renderList();
}

// ===== スキャン取り込み（紙）=====
function pick(multi, cb) {
  const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*'; f.multiple = multi;
  f.onchange = () => f.files.length && cb([...f.files]); f.click();
}
function shrink(file, max = 2000) {
  return new Promise(ok => {
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height));
      const c = document.createElement('canvas'); c.width = im.width * k; c.height = im.height * k;
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      c.toBlob(async b => { URL.revokeObjectURL(u); ok(await b.arrayBuffer()); }, 'image/jpeg', .85);
    };
    im.src = u;
  });
}
let queue = [], qi = 0, lastId = '';
$('#imp').onclick = () => pick(true, fs => {
  queue = fs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  qi = 0; $('#scan').style.display = 'flex'; showScan();
});
function showScan() {
  if (qi >= queue.length) return closeScan();
  $('#sc-n').textContent = `${qi + 1} / ${queue.length}`;
  $('#sc-img').src = URL.createObjectURL(queue[qi]);
  $('#sc-id').value = free('p', lastId ? L.sibling(lastId) : '1');
  $('#sc-kw').value = ''; $('#sc-msg').textContent = queue[qi].name;
  $('#sc-id').focus(); $('#sc-id').select();
}
async function scanOk() {
  const id = $('#sc-id').value.trim().toLowerCase();
  if (!L.isId(id)) { $('#sc-msg').textContent = 'IDの形が違います（例: 2a1）'; return; }
  if (get('p', id)) { $('#sc-msg').textContent = `紙 ${id} は既にあります。別のIDにしてください`; return; }
  await api.saveImage('p', id, await shrink(queue[qi]));
  const n = await api.saveNote({ s: 'p', id, keywords: L.splitKw($('#sc-kw').value), body: '' });
  notes.push(n); lastId = id; qi++; renderList(); showScan();
}
function closeScan() { $('#scan').style.display = 'none'; tab = 'p'; renderList(); if (lastId && get('p', lastId)) openNote('p', lastId); }
$('#sc-ok').onclick = scanOk;
$('#sc-skip').onclick = () => { qi++; showScan(); };
$('#sc-prev').onclick = () => { if (lastId) { $('#sc-id').value = lastId; $('#sc-id').focus(); } };
$('#sc-close').onclick = closeScan;
$('#scan').onkeydown = e => {
  if (e.key === 'Enter') { e.preventDefault(); scanOk(); }
  else if (e.key === 'Escape') closeScan();
  else if (e.key === 'Tab') { e.preventDefault(); $('#sc-prev').click(); }
};

// ===== 保存フォルダ =====
function loaded(st) {
  ({ notes, topics, vault } = st); cur = null;
  $('#vault').textContent = '📁 ' + vault.split('/').pop(); $('#vault').title = vault + '\n（Brave では Index.md を開くと全部たどれます）';
  $('#pane').innerHTML = '<div class="none">左から選ぶか、「＋ 新規」で書き始めます。</div>';
  renderList();
}
$('#vault').onclick = async () => { const st = await api.chooseVault(); if (st) loaded(st); };
api.load().then(loaded);
window.__pkm = { get cur() { return cur; }, get notes() { return notes; }, get topics() { return topics; }, get view() { return lastView; } };
