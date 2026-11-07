import { EditorView, Decoration, ViewPlugin, keymap, placeholder } from '@codemirror/view';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import L from '../lib.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SP = { d: 'デジタル', p: '紙' };

let notes = [], topics = [], tab = 'd', cur = null, vault = '';
// 開いているタブ（Obsidian 風）。cur は今のタブ
let tabs = [], active = -1, newTab = false;
const get = (s, id) => notes.find(n => n.s === s && n.id === id);
const free = (s, id) => { while (get(s, id)) id = L.sibling(id); return id; };
const topicOf = (s, id) => topics.find(t => t.entry && t.entry.s === s && t.entry.id === id); // 入口は1つ
const topicsWith = n => topics.map(t => ({ t, kws: L.mergeTopic(t).rows.filter(r => r[n.s].includes(n.id)).map(r => r.kw) })).filter(x => x.kws.length);
const allKeywords = () => [...new Set(notes.flatMap(n => n.keywords))].sort((a, b) => a.localeCompare(b, 'ja'));

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
const noteRow = (n, label = false) =>
  `<div class="item${cur && cur.k === 'note' && cur.s === n.s && cur.id === n.id ? ' on' : ''}" draggable="true" data-s="${n.s}" data-id="${esc(n.id)}">` +
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
    if (hit.length) out.push('<h4>ノート</h4>', ...hit.map(n => noteRow(n, true)));
    if (!out.length) out.push('<div class="none">見つかりません</div>');
  } else if (tab === 'i') {
    out.push('<h4>Index</h4>', ...globalIndex().map(([k, v]) => `<div class="ix"><b>${esc(k)}</b> ${chips(v)}</div>`));
    if (out.length === 1) out.push('<div class="none">ノートにキーワードを書くと、ここに並びます</div>');
  } else {
    const list = notes.filter(n => n.s === tab).sort((a, b) => L.cmpId(a.id, b.id));
    for (const n of list) out.push(noteRow(n));
    if (!list.length) out.push(`<div class="none">${tab === 'p' ? '「📷 スキャン取り込み」で紙を入れます' : '「＋ 新規」で書き始めます'}</div>`);
  }
  $('#list').innerHTML = out.join('');
}
// Ctrl+クリック・中クリックは新しいタブで開く
document.addEventListener('mousedown', e => { newTab = e.ctrlKey || e.metaKey || e.button === 1; }, true);
function onOpenClick(e) {
  if (e.target.closest('#modal')) return;
  const t = e.target.closest('[data-topic]'); if (t) return openTopic(t.dataset.topic);
  const n = e.target.closest('[data-id][data-s]');
  if (n && !e.target.closest('.cm-editor')) {
    if (get(n.dataset.s, n.dataset.id)) openNote(n.dataset.s, n.dataset.id);
    else if (confirm(`${SP[n.dataset.s]} ${n.dataset.id} はまだありません。作りますか？`)) create(n.dataset.s, n.dataset.id);
  }
}
document.addEventListener('click', onOpenClick);
document.addEventListener('auxclick', e => { if (e.button === 1 && !e.target.closest('#tabbar')) onOpenClick(e); });
// 一覧からトピックIndexの欄へドラッグすると ID が入る
$('#list').addEventListener('dragstart', e => { const n = e.target.closest('[data-id]'); if (n) e.dataTransfer.setData('text/plain', n.dataset.id); });
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.tab; $('#q').value = ''; renderList(); } };
$('#q').oninput = renderList;
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || $('#modal').style.display === 'flex') return;
  if (e.key === 'f') { e.preventDefault(); $('#q').focus(); $('#q').select(); }
  if (e.key === 'w') { e.preventDefault(); closeTab(active); }
  if (e.key === 't') { e.preventDefault(); tabs.push({ k: 'empty' }); show(tabs.length - 1); }
  if (e.key === 'Tab' && tabs.length) { e.preventDefault(); show((active + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length); }
});

// ===== タブ =====
function rememberPos() {
  const t = tabs[active];
  if (t && t.k === 'note' && lastView && lastView.dom.isConnected) t.pos = lastView.state.selection.main.head;
}
// 今のタブに開く（Ctrl+クリックなら新しいタブ）。keep なら今のタブを描き直すだけ
function place(t, keep) {
  if (keep && tabs[active]) return tabs[active];
  rememberPos();
  if (newTab || active < 0 || !tabs[active]) { tabs.push(t); active = tabs.length - 1; }
  else tabs[active] = t;
  newTab = false;
  return t;
}
function show(i) {
  rememberPos();
  active = Math.max(-1, Math.min(i, tabs.length - 1));
  const t = tabs[active];
  if (!t || t.k === 'empty') { cur = t || null; $('#pane').innerHTML = '<div class="none">左から選ぶか、「＋ 新規」で書き始めます。<br>Ctrl+クリックで新しいタブに開きます。</div>'; renderTabs(); return renderList(); }
  if (t.k === 'note') openNote(t.s, t.id, null, true); else openTopic(t.name, t.mode, true);
}
function closeTab(i) {
  if (i < 0 || i >= tabs.length) return;
  if (i === active) rememberPos();
  tabs.splice(i, 1);
  if (active > i || active >= tabs.length) active--;
  show(active < 0 && tabs.length ? 0 : active);
}
const tabLabel = t => t.k === 'note' ? `${t.s === 'p' ? '紙 ' : ''}${esc(t.id)}<small>${esc((firstLine(get(t.s, t.id) || { body: '' })).slice(0, 12))}</small>`
  : t.k === 'topic' ? `📑 ${esc(t.name)}` : '新しいタブ';
function renderTabs() {
  $('#tabbar').innerHTML = tabs.map((t, i) => `<div class="tab${i === active ? ' on' : ''}" data-ti="${i}"><span>${tabLabel(t)}</span><b class="x" data-close="${i}" title="閉じる (Ctrl+W)">×</b></div>`).join('')
    + '<button class="tab-new" title="新しいタブ (Ctrl+T)">＋</button>';
  try { localStorage.setItem('pkm-tabs:' + vault, JSON.stringify({ tabs, active })); } catch { }
}
$('#tabbar').addEventListener('click', e => {
  const x = e.target.closest('[data-close]'); if (x) return closeTab(+x.dataset.close);
  if (e.target.closest('.tab-new')) { tabs.push({ k: 'empty' }); return show(tabs.length - 1); }
  const t = e.target.closest('[data-ti]'); if (t) show(+t.dataset.ti);
});
$('#tabbar').addEventListener('auxclick', e => { const t = e.target.closest('[data-ti]'); if (t && e.button === 1) closeTab(+t.dataset.ti); });

// ===== ノート =====
function openNote(s, id, n, keep) {
  const note = get(s, id); if (!note) return;
  cur = place({ k: 'note', s, id }, keep);
  if (!$('#q').value) tab = s;
  $('#pane').innerHTML = `
    <div class="row">
      <span class="sp ${s}">${SP[s]}</span>
      <input class="id" id="f-id" value="${esc(id)}" title="ID（変えると名前も変わります）">
      ${s === 'd' ? `<span class="date">${esc(note.created)}</span>` : ''}
      <span class="grow"></span>
      <button data-act="sib" title="同じ段の次（Ctrl+クリックで新しいタブ）">並列 ${free(s, L.sibling(id))}</button>
      <button data-act="chi" title="一段下（Ctrl+クリックで新しいタブ）">分岐 ${free(s, L.child(id))}</button>
    </div>
    <div class="meta" id="meta"></div>
    ${s === 'p' ? `<div class="paper"><div class="pic">${note.image ? `<img src="${note.image}">` : '<button data-act="img">画像を入れる</button>'}</div><div class="ed" id="ed"></div></div>` : '<div class="ed" id="ed"></div>'}`;
  renderMeta(note);
  const view = editor($('#ed'), note.body, 'note', s, v => { note.body = v; saveNote(note); renderList(); },
    s === 'p' ? '紙の内容を文字で（テキスト化）' : '本文。続き :1a1　引用 (1) と (1):　別ノート 1a(1)　全体 1a:');
  $('#f-id').onchange = async e => {
    const v = e.target.value.trim().toLowerCase();
    if (v === id) return;
    await flush(); await api.saveNote(pubNote(note));
    const r = L.isId(v) && !get(s, v) && await api.rename(s, id, v);
    if (!r) { alert('そのIDは使えません（形が違うか、既にあります）'); e.target.value = id; return; }
    Object.assign(note, r);
    for (const t of topics) if (t.entry && t.entry.s === s && t.entry.id === id) t.entry.id = v;
    for (const t of tabs) if (t.k === 'note' && t.s === s && t.id === id) t.id = v;
    openNote(s, v, null, true);
  };
  renderTabs(); renderList();
  if (n) { const p = L.anchorPos(note.body, n); if (p >= 0) jump(view, p); }
  else if (keep && cur.pos != null) jump(view, Math.min(cur.pos, view.state.doc.length));
  else if (s === 'd' && !note.body) view.focus();
}
// キーワードとトピックIndex（ボタンで足す）
function renderMeta(note) {
  const entry = topicOf(note.s, note.id);
  $('#meta').innerHTML =
    note.keywords.map(k => `<span class="kwc">#${esc(k)}<b data-kwdel="${esc(k)}" title="外す">×</b></span>`).join('') +
    `<span id="kw-wrap"><button class="mini" data-act="kwadd">＋キーワード</button></span>` +
    '<span class="vsep"></span>' +
    (entry ? `<span class="chip t" data-topic="${esc(entry.name)}" title="このノートが入口">📑 ${esc(entry.name)}</span>` : '') +
    topicsWith(note).filter(x => x.t !== entry).map(x => `<span class="chip t" data-topic="${esc(x.t.name)}">${esc(x.t.name)}<small> · ${x.kws.map(esc).join('、')}</small></span>`).join('') +
    `<button class="mini" data-act="tadd">＋トピックIndex</button>`;
}
function addKeywordInput(note) {
  $('#kw-wrap').innerHTML = `<input id="kw-in" list="kw-all" placeholder="キーワード（Enter）"><datalist id="kw-all">${allKeywords().map(k => `<option value="${esc(k)}">`).join('')}</datalist>`;
  const inp = $('#kw-in'); inp.focus();
  const done = () => renderMeta(note);
  inp.onkeydown = e => {
    if (e.key === 'Escape') return done();
    if (e.key !== 'Enter') return;
    for (const k of L.splitKw(inp.value)) if (!note.keywords.includes(k)) note.keywords.push(k);
    saveNote(note); renderList(); done();
  };
  inp.onblur = () => setTimeout(() => { if ($('#kw-in') === inp) done(); }, 150);
}
async function create(s, id) {
  const n = await api.saveNote({ s, id, created: L.now(), keywords: [], body: '' });
  notes.push(n); openNote(s, id);
}
$('#pane').addEventListener('click', async e => {
  const del = e.target.closest('[data-kwdel]');
  if (del && cur && cur.k === 'note') {
    const note = get(cur.s, cur.id); note.keywords = note.keywords.filter(k => k !== del.dataset.kwdel);
    saveNote(note); renderMeta(note); return renderList();
  }
  const a = e.target.closest('[data-act]'); if (!a || !cur) return;
  const act = a.dataset.act;
  if (cur.k === 'topic') return topicAct(act);
  const { s, id } = cur, note = get(s, id);
  if (act === 'sib') create(s, free(s, L.sibling(id)));
  if (act === 'chi') create(s, free(s, L.child(id)));
  if (act === 'kwadd') addKeywordInput(note);
  if (act === 'tadd') topicAddDialog(note);
  if (act === 'img') pick(false, async f => { const r = await api.saveImage(s, id, await shrink(f[0])); Object.assign(get(s, id), r); openNote(s, id); });
});
$('#new').onclick = () => {
  const s = tab === 'p' ? 'p' : 'd';
  const roots = notes.filter(n => n.s === s && /^\d+$/.test(n.id)).map(n => +n.id);
  create(s, free(s, String((roots.length ? Math.max(...roots) : 0) + 1)));
};

// ===== トピックIndex =====
// このノートをトピックIndexに追加（検索して選び、キーワードを入れる）。新しく作ることもできる
function topicAddDialog(note) {
  const entry = topicOf(note.s, note.id), name = `${note.s === 'p' ? '紙 ' : ''}${note.id}`;
  let sel = null;
  $('#modal .box').innerHTML = `
    <h3>${esc(name)} をトピックIndexに追加</h3>
    <input id="ta-q" placeholder="トピックIndexを探す">
    <div id="ta-list" class="ta-list"></div>
    <div class="sub">キーワード</div>
    <input id="ta-kw" list="ta-kws" placeholder="例: 英雄伝"><datalist id="ta-kws"></datalist>
    <div class="row"><button id="ta-ok" class="p">追加</button><button id="ta-cancel">やめる</button></div>
    ${entry ? '' : `<hr><div class="sub">新しいトピックIndexを作る（このノートが入口）</div>
    <div class="row"><input id="ta-name" value="${esc(note.id)}-" style="flex:1"><button id="ta-new">作る</button></div>`}`;
  $('#modal').style.display = 'flex';
  const close = () => { $('#modal').style.display = 'none'; };
  const draw = () => {
    const q = $('#ta-q').value.trim().toLowerCase();
    const list = topics.filter(t => t.name.toLowerCase().includes(q) || L.mergeTopic(t).rows.some(r => r.kw.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    if (sel && !list.includes(sel)) sel = null;
    if (!sel && list.length) choose(list[0], false);
    $('#ta-list').innerHTML = list.map(t => `<div class="ta-row${t === sel ? ' on' : ''}" data-name="${esc(t.name)}">📑 ${esc(t.name)}${t.entry ? `<small> 入口 ${t.entry.s === 'p' ? '紙' : ''}${esc(t.entry.id)}</small>` : ''}</div>`).join('')
      || '<div class="sub" style="padding:6px">ありません</div>';
  };
  function choose(t, redraw = true) {
    sel = t;
    $('#ta-kws').innerHTML = L.mergeTopic(t).rows.map(r => `<option value="${esc(r.kw)}">`).join('');
    if (redraw) draw();
  }
  $('#ta-list').onclick = e => { const r = e.target.closest('[data-name]'); if (r) { choose(topics.find(t => t.name === r.dataset.name)); $('#ta-kw').focus(); } };
  $('#ta-q').oninput = draw;
  $('#ta-q').onkeydown = e => { if (e.key === 'Enter') $('#ta-kw').focus(); };
  $('#ta-kw').onkeydown = e => { if (e.key === 'Enter') $('#ta-ok').click(); };
  $('#ta-ok').onclick = async () => {
    const kw = $('#ta-kw').value.trim();
    if (!sel) return alert('トピックIndexを選んでください');
    if (!kw) return $('#ta-kw').focus();
    await flush();
    sel[note.s] = L.addToTopic(sel[note.s], kw, note.id);
    await api.saveTopic(sel); close(); renderMeta(note);
  };
  $('#ta-cancel').onclick = close;
  if ($('#ta-new')) $('#ta-new').onclick = async () => {
    const nm = $('#ta-name').value.trim();
    if (!nm) return;
    if (topics.find(t => t.name === nm)) return alert('その名前は既にあります');
    const t = { name: nm, entry: { s: note.s, id: note.id }, d: '', p: '' };
    topics.push(t); await api.saveTopic(t); close(); renderMeta(note);
    newTab = true; openTopic(nm, 'edit');
  };
  $('#modal').onkeydown = e => { if (e.key === 'Escape') close(); };
  draw(); $('#ta-q').focus();
}
// mode: view（まとめて表示）| edit（デジタル欄・紙欄に書く）| conf（入口・名前を変える）
function openTopic(name, mode = 'view', keep) {
  const t = topics.find(x => x.name === name); if (!t) return;
  cur = place({ k: 'topic', name, mode }, keep); cur.mode = mode;
  const { rows, stars } = L.mergeTopic(t), e = t.entry;
  let body;
  if (mode === 'edit') body = `<div class="sub">1行に「キーワード ID ID …」。★ で始めると別のトピックIndexへの案内。デジタルと紙は別々に書き、表示はまとめます。</div>
      <div class="two"><div><h4>デジタル</h4><div class="ed" id="ed-d"></div></div><div><h4>紙</h4><div class="ed" id="ed-p"></div></div></div>`;
  else if (mode === 'conf') body = `<div class="conf">
      <label>名前 <input id="t-name" value="${esc(t.name)}"></label>
      <label>入口 <select id="t-s"><option value="d"${e && e.s === 'd' ? ' selected' : ''}>デジタル</option><option value="p"${e && e.s === 'p' ? ' selected' : ''}>紙</option></select>
        <input id="t-id" value="${e ? esc(e.id) : ''}" style="width:90px"></label>
      <div class="row"><button data-act="tsave" class="p">決定</button><button data-act="tcancel">やめる</button>
        <span class="grow"></span><button data-act="tdel" class="danger">このトピックIndexを削除</button></div></div>`;
  else body = `<table class="ti">${rows.map(r => `<tr><td>${esc(r.kw)}</td><td>${chips(r)}</td></tr>`).join('') || '<tr><td class="none">まだ空です。「編集」で書きます</td></tr>'}</table>
      ${stars.map(x => `<div class="star">★ ${tchip(x)}</div>`).join('')}`;
  $('#pane').innerHTML = `
    <div class="row">
      <h2>${esc(name)}</h2>
      <span class="sub">入口</span>${e ? chip(e.s, e.id) : '<span class="sub">なし</span>'}
      <span class="grow"></span>
      ${mode === 'conf' ? '' : `<button data-act="tconf">入口・名前</button>
      <button data-act="tedit" class="${mode === 'edit' ? 'p' : ''}">${mode === 'edit' ? '完了' : '編集'}</button>`}
    </div>${body}`;
  if (mode === 'edit') for (const s of ['d', 'p']) {
    const v = editor($('#ed-' + s), t[s], 'topic', s, x => { t[s] = x; saveTopic(t); }, s === 'd' ? 'PKM 1a 3' : 'PKM 2');
    if (s === 'd') v.focus();
  }
  if (mode === 'conf') $('#t-id').focus();
  renderTabs(); renderList();
}
async function topicAct(act) {
  const t = topics.find(x => x.name === cur.name); if (!t) return;
  if (act === 'tedit') return openTopic(t.name, cur.mode === 'edit' ? 'view' : 'edit', true);
  if (act === 'tconf') return openTopic(t.name, 'conf', true);
  if (act === 'tcancel') return openTopic(t.name, 'view', true);
  if (act === 'tdel') {
    if (!confirm(`トピックIndex「${t.name}」を削除しますか？（ファイルは .trash に移ります）`)) return;
    await flush(); await api.deleteTopic(t.name);
    topics = topics.filter(x => x !== t);
    for (let i = tabs.length - 1; i >= 0; i--) if (tabs[i].k === 'topic' && tabs[i].name === t.name) { tabs.splice(i, 1); if (active >= i) active--; }
    return show(Math.max(0, active));
  }
  if (act === 'tsave') {
    const name = $('#t-name').value.trim(), s = $('#t-s').value, id = $('#t-id').value.trim().toLowerCase();
    if (!name) return alert('名前を入れてください');
    if (name !== t.name && topics.find(x => x.name === name)) return alert('その名前は既にあります');
    if (!get(s, id)) return alert(`${SP[s]} ${id} というノートはありません`);
    const other = topicOf(s, id);
    if (other && other !== t) return alert(`${SP[s]} ${id} は、もう「${other.name}」の入口です（1つのIDに1つの索引）`);
    await flush();
    const old = t.name; t.name = name; t.entry = { s, id };
    await api.saveTopic(t, old);
    for (const x of tabs) if (x.k === 'topic' && x.name === old) x.name = name;
    openTopic(name, 'view', true);
  }
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
  ({ notes, topics, vault } = st); cur = null; tabs = []; active = -1;
  $('#vault').textContent = '📁 ' + vault.split('/').pop(); $('#vault').title = vault + '\n（Brave では Index.md を開くと全部たどれます）';
  try {
    const saved = JSON.parse(localStorage.getItem('pkm-tabs:' + vault) || 'null');
    if (saved) {
      tabs = saved.tabs.filter(t => t.k === 'empty' || (t.k === 'note' && get(t.s, t.id)) || (t.k === 'topic' && topics.find(x => x.name === t.name)));
      tabs.forEach(t => { if (t.k === 'topic') t.mode = 'view'; });
      active = Math.min(saved.active, tabs.length - 1);
    }
  } catch { tabs = []; active = -1; }
  show(active);
}
$('#vault').onclick = async () => { const st = await api.chooseVault(); if (st) loaded(st); };
api.load().then(loaded);
window.__pkm = { get cur() { return cur; }, get notes() { return notes; }, get topics() { return topics; }, get view() { return lastView; } };
