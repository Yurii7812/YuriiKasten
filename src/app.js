import { EditorView, Decoration, ViewPlugin, WidgetType, keymap, placeholder } from '@codemirror/view';
import { EditorState, RangeSetBuilder, StateField } from '@codemirror/state';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import L from '../lib.js';
import { mdExtensions, tableTemplate } from './md.js';
import { ctx } from './shared.js';
import * as Chat from './chat.js';
import * as RP from './roleplay.js';
import * as CV from './canvas.js';
import { dialog, popMenu, toast } from './shared.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SP = { d: 'デジタル', p: '紙' };

let notes = [], topics = [], readings = {}, tab = 'd', cur = null, vault = '';
// 開いているタブ（Obsidian 風）。cur は今のタブ
let tabs = [], active = -1, newTab = false;
let mode = 'notes', diaries = [], lastNote = null; // 左の列で選んでいる種類（ノート・日記…）
let selMode = false, picked = new Set(), lastPick = null; // 一括選択
const get = (s, id) => notes.find(n => n.s === s && n.id === id);
const free = (s, id) => { while (get(s, id)) id = L.sibling(id); return id; };
const topicOf = (s, id) => topics.find(t => t.entry && t.entry.s === s && t.entry.id === id); // 入口は1つ
const topicsWith = n => topics.map(t => ({ t, kws: L.mergeTopic(t).rows.filter(r => r[n.s].includes(n.id)).map(r => r.kw) })).filter(x => x.kws.length);
const allKeywords = () => [...new Set(notes.flatMap(n => n.keywords))].sort(L.byReading(k => readings[k]));
const yomi = k => readings[k] && readings[k] !== k ? `<small class="yomi">${esc(readings[k])}</small>` : '';
const kwTopic = k => topics.find(t => t.keyword === k);
// そのキーワードのトピックIndex があれば赤い点（押すと開く）。IDが2つ以上でまだ無ければ「作る」
const ixRow = ([k, v]) => {
  const t = kwTopic(k), n = v.d.length + v.p.length;
  const mark = !t && n >= 2 ? `<button class="mini mk-topic" data-kw="${esc(k)}" title="このキーワードのトピックIndexを作る">📑 作る</button>` : '';
  return `<div class="ix">${mark}<b>${esc(k)}</b>${yomi(k)} ${chips(v, t)}</div>`;
};
// 入口のノートに、そのキーワードを付ける（Index の ID の並びに入り、そこに赤い点が付く）
async function ensureKeyword(sp, id, kw) {
  const n = get(sp, id);
  if (!kw || !n || n.keywords.includes(kw)) return;
  n.keywords.push(kw); await api.saveNote(pubNote(n));
}

// ===== 保存（少し待ってまとめて）=====
const timers = {};
const later = (k, f) => { if (timers[k]) clearTimeout(timers[k].t); timers[k] = { f, t: setTimeout(() => { delete timers[k]; f(); }, 400) }; };
const pubNote = n => ({ s: n.s, id: n.id, created: n.created, keywords: n.keywords, body: n.body, kind: n.kind, data: n.data, title: n.title });
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
      const items = [];
      for (const t of L.tokens(text)) {
        if (t.k === 'ref') items.push([t.from, t.to, { t: 'ref', s: space, id: t.id, n: t.n }, !!get(space, t.id)]);
        else if (t.bare) items.push([t.from, t.to, 'mk']); // 素の (1) は赤いだけ
        else items.push([t.from, t.to, { t: 'self', n: t.n, bare: t.bare }, L.selfTarget(text, t.n, t.bare) >= 0]);
      }
      for (const m of text.matchAll(new RegExp(L.MDLINK.source, 'g'))) { // 添付・外部リンク。押すと既定のアプリで開く
        const rel = m[0].slice(m[0].lastIndexOf('](') + 2, -1);
        items.push([m.index, m.index + m[0].length, { t: 'file', rel }, true, 'file']);
      }
      // カーソルが外にあるとき、リンクは名前だけを見せる（![ や ](パス) を隠す）。カーソルを置くと元の記述が出る
      const sel = view.state.selection.main, rs = [];
      for (const [f, t, d, ok, cls] of items) {
        if (d === 'mk') { rs.push(Decoration.mark({ class: 'mk' }).range(f, t)); continue; }
        rs.push(Decoration.mark({ class: 'lk' + (cls ? ' ' + cls : '') + (ok ? '' : ' miss'), attributes: { 'data-l': JSON.stringify(d) } }).range(f, t));
        if (cls === 'file' && !(sel.from <= t && sel.to >= f)) {
          const open = text[f] === '!' ? 2 : 1, close = text.lastIndexOf('](', t);
          if (close === f + open) { // ![](ファイル名): 説明文が空なので、ファイル名を見せる
            let nm = text.slice(close + 2, t - 1); try { nm = decodeURIComponent(nm); } catch { }
            rs.push(Decoration.replace({ widget: new NameWidget(nm) }).range(f, t));
          } else rs.push(Decoration.replace({}).range(f, f + open), Decoration.replace({}).range(close, t));
        }
      }
      return Decoration.set(rs, true);
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
    update(u) { if (u.docChanged || u.selectionSet) this.decorations = build(u.view); }
  }, {
    decorations: v => v.decorations,
    eventHandlers: {
      mousedown(e, view) {
        const el = e.target.closest('[data-l]');
        if (!el || e.button !== 0) return false;
        e.preventDefault(); follow(JSON.parse(el.dataset.l), view); return true;
      }
    }
  });
}
// ![名前](パス) の行の下に、画像をそのまま表示する（見るだけ。押しても開かない）
const vaultUrl = () => 'file://' + vault.split('/').map(encodeURIComponent).join('/') + '/';
class NameWidget extends WidgetType {
  constructor(name) { super(); this.name = name; }
  eq(o) { return o.name === this.name; }
  toDOM() { const e = document.createElement('span'); e.className = 'imgname'; e.textContent = this.name; return e; }
}
class ImgWidget extends WidgetType {
  constructor(rel) { super(); this.rel = rel; }
  eq(o) { return o.rel === this.rel; }
  toDOM() {
    const d = document.createElement('div'); d.className = 'cm-img';
    const i = new Image();
    try { i.src = /^https?:|^data:/.test(this.rel) ? this.rel : new URL(this.rel, vaultUrl()).href; } catch { }
    d.append(i); return d;
  }
  ignoreEvent() { return true; }
}
const images = space => {
  const build = state => {
    const b = new RangeSetBuilder();
    for (const m of state.doc.toString().matchAll(/!\[[^\]\n]*\]\(([^)\s]*)\)/g)) {
      b.add(state.doc.lineAt(m.index + m[0].length).to, state.doc.lineAt(m.index + m[0].length).to, Decoration.widget({ widget: new ImgWidget(m[1]), block: true, side: 1 }));
    }
    return b.finish();
  };
  return StateField.define({ create: build, update: (v, tr) => tr.docChanged ? build(tr.state) : v, provide: f => EditorView.decorations.from(f) });
};
let lastView = null;
function editor(parent, doc, mode, space, onChange, ph) {
  return lastView = new EditorView({
    parent, state: EditorState.create({
      doc, extensions: [history(), keymap.of([...defaultKeymap, ...historyKeymap]), EditorView.lineWrapping,
        placeholder(ph), ...(mode === 'note' ? mdExtensions : []), links(mode, space), ...(mode === 'note' ? [images(space)] : []), EditorView.updateListener.of(u => { if (u.docChanged) onChange(u.state.doc.toString()); })]
    })
  });
}
function jump(view, pos) {
  view.dispatch({ selection: { anchor: pos, head: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
  view.focus();
}
// 本文のリンクの行き先。アプリの中のもの（なりきり会話・日記）は中で開き、それ以外は既定のアプリで開く
function openLink(rel) {
  let path = rel, hash = '';
  const i = rel.indexOf('#'); if (i >= 0) { path = rel.slice(0, i); hash = rel.slice(i + 1); }
  try { path = decodeURIComponent(path); } catch { }
  let m;
  if ((m = path.match(/^D_(.+)\.md$/)) && get('d', m[1])) return openNote('d', m[1], null, false, hash); // ノート（IDなし・なりきり・キャンバスも）
  if ((m = path.match(/^D_(\d{4}-\d{2}-\d{2})(?:-.*)?\.md$/))) return openDiary(m[1]);
  return api.openPath(rel);
}
async function follow(l, view) {
  if (l.t === 'self') { const p = L.selfTarget(view.state.doc.toString(), l.n, l.bare); if (p >= 0) jump(view, p); return; }
  if (l.t === 'file') return openLink(l.rel);
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
  return [...m].sort((a, b) => L.byReading(k => readings[k])(a[0], b[0]));
}
const chip = (s, id, topic) => `<span class="chip ${s}${get(s, id) ? '' : ' miss'}${topic ? ' dotted' : ''}" data-s="${s}" data-id="${esc(id)}">${topic ? `<i class="dotabove" data-topic="${esc(topic.name)}" title="トピックIndex ${esc(topic.name)}">●</i>` : ''}${s === 'p' ? '紙' : ''}${esc(id)}</span>`;
// t があれば、その入口のIDだけ点を付ける
const chips = (v, t) => [['d', v.d], ['p', v.p]].map(([s, l]) => l.map(x => chip(s, x, t && t.entry && t.entry.s === s && t.entry.id === x ? t : null)).join('')).join('');
const tchip = name => `<span class="chip t" data-topic="${esc(name)}">${esc(name)}</span>`;
const firstLine = n => (n.body.split('\n').find(x => x.trim()) || '').replace(/^#+\s*/, '').trim().slice(0, 40);
const titleOf = n => (n.title || '').trim() || firstLine(n) || (n.kind === 'rp' ? '会話' : n.kind === 'canvas' ? 'キャンバス' : '（無題）');
const icon = n => L.KINDS[n.kind || 'text'] || '';
const shortTime = c => (c || '').slice(5, 16).replace('-', '/');
const kwTags = n => n.keywords.length ? `<span class="tag">${n.keywords.map(esc).join('・')}</span>` : '';
const firstLineOf = b => (b.split('\n').find(x => x.trim() && !/^##\s/.test(x)) || '').trim().slice(0, 40);
// 左の一覧の行: タイトル（無ければ本文の最初の行）と、その下に小さく ID（IDなしは日時）とキーワード
const noteRow = (n, label = false) =>
  `<div class="item note${cur && cur.k === 'note' && cur.s === n.s && cur.id === n.id ? ' on' : ''}" draggable="true" data-s="${n.s}" data-id="${esc(n.id)}">` +
  `${selMode ? `<input type="checkbox" class="ck" ${picked.has(n.s + ':' + n.id) ? 'checked' : ''}>` : ''}<div class="nrow">` +
  `<div class="nt">${label ? `<span class="sp ${n.s}">${SP[n.s]}</span>` : ''}${icon(n) ? icon(n) + ' ' : ''}${n.image ? '📷 ' : ''}${esc(titleOf(n))}</div>` +
  `<div class="ns">${n.noid ? `IDなし · ${shortTime(n.created)}` : `${n.s === 'p' ? '紙 ' : ''}${esc(n.id)}`}${n.keywords.length ? ` · ${n.keywords.map(esc).join('・')}` : ''}</div></div></div>`;
// トピックIndex の行（その入口のノートの手前に出す）
const topicRow = t => `<div class="item topicrow" data-topic="${esc(t.name)}"><div class="nrow"><div class="nt"><span class="tbadge">トピックIndex</span>📑 ${esc(t.name)}</div><div class="ns">${t.entry ? `入口 ${t.entry.s === 'p' ? '紙 ' : ''}${esc(t.entry.id)}` : '入口なし'}</div></div></div>`;

function renderList() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('#rail button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  const q = $('#q').value.trim().toLowerCase(), out = [];
  $('#tabs').style.display = mode === 'notes' || q ? '' : 'none';
  if (!q && mode === 'diary') { $('#list').innerHTML = diaryList(); renderSelbar(); return; }
  if (!q && mode === 'chat') { $('#list').innerHTML = Chat.listHtml(); renderSelbar(); return; }
  if (q) {
    // 1. Index  2. トピックIndex  3. ノート
    const rank = k => (k.toLowerCase() === q ? 0 : k.toLowerCase().startsWith(q) ? 1 : 2);
    const hq = L.toHira(q), rk = k => Math.min(rank(k), readings[k] ? rank(readings[k]) : 9);
    const gi = globalIndex().filter(([k]) => k.toLowerCase().includes(q) || (readings[k] || '').includes(hq)).sort((a, b) => rk(a[0]) - rk(b[0]));
    if (gi.length) out.push('<h4>Index</h4>', ...gi.map(ixRow));
    const ti = [];
    for (const t of topics) {
      if (t.name.toLowerCase().includes(q)) ti.push([-1, `<div class="ix">${tchip(t.name)}</div>`]);
      for (const r of L.mergeTopic(t).rows) if (r.kw.toLowerCase().includes(q)) ti.push([rank(r.kw), `<div class="ix"><b>${esc(r.kw)}</b> ${chips(r)} <small>← ${tchip(t.name)}</small></div>`]);
    }
    if (ti.length) out.push('<h4>トピックIndex</h4>', ...ti.sort((a, b) => a[0] - b[0]).map(x => x[1]));
    const hit = notes.filter(n => [n.id, n.title || '', n.body, n.keywords.join(' '), n.keywords.map(k => readings[k] || '').join(' ')].join('\n').toLowerCase().includes(q))
      .sort((a, b) => a.s.localeCompare(b.s) || L.cmpId(a.id, b.id));
    if (hit.length) out.push('<h4>ノート</h4>', ...hit.map(n => noteRow(n, true)));
    const dh = diaries.filter(d => [d.date, d.title, d.body].join('\n').toLowerCase().includes(q)).sort((a, b) => b.date.localeCompare(a.date));
    if (dh.length) out.push('<h4>日記</h4>', ...dh.map(d => `<div class="item" data-diary="${d.date}"><b>${d.date.slice(2)}</b><small>${esc(d.title || firstLineOf(d.body))}</small></div>`));
    if (!out.length) out.push('<div class="none">見つかりません</div>');
  } else if (tab === 'i') {
    out.push('<div class="ix"><button class="mini mk-topic" data-kw="">＋ トピックIndexを新しく作る</button></div>');
    let row = null;
    for (const e of globalIndex()) {
      const r = L.kanaRow(readings[e[0]] || e[0]);
      if (r !== row) { out.push(`<h4>${r}</h4>`); row = r; }
      out.push(ixRow(e));
    }
    if (out.length === 1) out.push('<div class="none">ノートにキーワードを書くと、ここに並びます</div>');
  } else {
    const list = tab === 'u' ? notes.filter(n => n.noid).sort((a, b) => (b.created || '').localeCompare(a.created || ''))
      : notes.filter(n => n.s === tab && !n.noid).sort((a, b) => L.cmpId(a.id, b.id));
    if (tab === 'd' || tab === 'p') for (const t of topics.filter(x => !x.entry || !get(x.entry.s, x.entry.id)).sort((a, b) => a.name.localeCompare(b.name, 'ja'))) if (tab === 'd') out.push(topicRow(t)); // 入口がないものは、デジタルの先頭
    for (const n of list) {
      const t = tab !== 'u' && topicOf(n.s, n.id); if (t) out.push(topicRow(t)); // 「1-PKM」は、ノート 1 の手前
      out.push(noteRow(n));
    }
    if (!list.length) out.push(`<div class="none">${tab === 'p' ? '「📷 スキャン取り込み」で紙を入れます' : tab === 'u' ? 'IDなしで書いたノートが、ここに並びます。あとでIDを付けて整理します' : '「＋ 新規」で書き始めます'}</div>`);
  }
  $('#list').innerHTML = out.join('');
  renderSelbar();
}
// Ctrl+クリック・中クリックは新しいタブで開く
document.addEventListener('mousedown', e => { newTab = e.ctrlKey || e.metaKey || e.button === 1; }, true);
function onOpenClick(e) {
  if (e.target.closest('#modal') || e.target.closest('#selbar')) return;
  const dd = e.target.closest('[data-diary]'); if (dd && !e.target.closest('.cm-editor')) return openDiary(dd.dataset.diary);
  const cc = e.target.closest('[data-chat]'); if (cc) return Chat.open(cc.dataset.chat);
  if (e.target.id === 'c-new') return Chat.newTopicDialog();
  const row = e.target.closest('#list .item');
  if (selMode && row) return togglePick(row, e.shiftKey);
  const t = e.target.closest('[data-topic]'); if (t) return openTopic(t.dataset.topic);
  const n = e.target.closest('[data-id][data-s]');
  if (n && !e.target.closest('.cm-editor')) {
    if (get(n.dataset.s, n.dataset.id)) openNote(n.dataset.s, n.dataset.id);
    else if (confirm(`${SP[n.dataset.s]} ${n.dataset.id} はまだありません。作りますか？`)) create(n.dataset.s, n.dataset.id);
  }
}
document.addEventListener('click', onOpenClick);
$('#rail').onclick = e => { const b = e.target.closest('button'); if (b) { mode = b.dataset.mode; $('#q').value = ''; renderList(); } };
document.addEventListener('auxclick', e => { if (e.button === 1 && !e.target.closest('#tabbar')) onOpenClick(e); });
// 一覧からトピックIndexの欄へドラッグすると ID が入る
$('#list').addEventListener('click', e => { const b = e.target.closest('.mk-topic'); if (b) topicNewDialog(b.dataset.kw); });
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
  if (t.k === 'note') openNote(t.s, t.id, null, true); else if (t.k === 'diary') openDiary(t.date, true); else if (t.k === 'chat') Chat.open(t.topic, true); else openTopic(t.name, t.mode, true);
}
function closeTab(i) {
  if (i < 0 || i >= tabs.length) return;
  if (i === active) rememberPos();
  tabs.splice(i, 1);
  if (active > i || active >= tabs.length) active--;
  show(active < 0 && tabs.length ? 0 : active);
}
const tabLabel = t => t.k === 'note' ? (n => `${n && icon(n) ? icon(n) + ' ' : ''}${n ? esc(titleOf(n).slice(0, 16)) : esc(t.id)}<small>${n && n.noid ? 'IDなし' : (t.s === 'p' ? '紙 ' : '') + esc(t.id)}</small>`)(get(t.s, t.id))
  : t.k === 'topic' ? `📑 ${esc(t.name)}` : t.k === 'diary' ? `📔 ${esc(t.date.slice(5))}` : t.k === 'chat' ? `💬 ${esc(Chat.label(t.topic))}` : '新しいタブ';
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
function openNote(s, id, n, keep, mid) {
  const note = get(s, id); if (!note) return;
  cur = place({ k: 'note', s, id }, keep); mode = 'notes'; lastNote = { s, id };
  if (!$('#q').value) tab = note.noid ? 'u' : s;
  const kind = note.kind || 'text', noid = !!note.noid, text = kind === 'text';
  $('#pane').innerHTML = `
    <div class="row">
      <span class="sp ${s}">${SP[s]}</span>${L.KINDS[kind] ? `<span class="kind" title="${kind === 'rp' ? 'なりきりチャット' : 'キャンバス'}">${L.KINDS[kind]}</span>` : ''}
      <input class="id" id="f-id" value="${noid ? '' : esc(id)}" placeholder="IDなし" title="${noid ? 'IDを入れると、整理されます' : 'ID（変えると名前も変わります）'}">
      <input class="ntitle" id="f-title" value="${esc(note.title || '')}" placeholder="タイトル（任意）">
      ${s === 'd' ? `<span class="date">${esc(note.created)}</span>` : ''}
      ${noid ? '<button data-act="giveid" class="p" title="IDを付けて整理する">IDを付ける</button>' : `
      <button data-act="sib" title="同じ段の次（Ctrl+クリックで新しいタブ）">並列 ${free(s, L.sibling(id))}</button>
      <button data-act="chi" title="一段下（Ctrl+クリックで新しいタブ）">分岐 ${free(s, L.child(id))}</button>`}
      ${text ? `<button data-act="table" title="表を入れる">▦ 表</button>
      <button data-act="attach" title="ファイルを添付（ドラッグや貼り付けでも）">📎 添付</button>` : ''}
      <button data-act="ndel" class="danger" title="このノートを削除">削除</button>
    </div>
    ${noid ? '<div class="noid-hint">IDなしのノートです。とりあえず書いて、あとで「IDを付ける」で整理できます（IDを付けると、キーワードやトピックIndexも付けられます）。</div>' : '<div class="meta" id="meta"></div>'}
    ${!text ? '<div id="nbody"></div>' : s === 'p' ? `<div class="paper"><div class="pic">${note.image ? `<img src="${note.image}">` : '<button data-act="img">画像を入れる</button>'}</div><div class="ed" id="ed"></div></div>` : '<div class="ed" id="ed"></div>'}`;
  if (!noid) renderMeta(note);
  $('#f-title').oninput = e => { // タイトル: 打ったらすぐ一覧とタブに反映し、少し待って保存
    note.title = e.target.value; if (note.data) note.data.title = note.title || note.data.title;
    if (!text) note.body = L.deriveBody(kind, note.data);
    saveNote(note); renderList(); renderTabs();
  };
  $('#f-id').onchange = async e => {
    const v = e.target.value.trim().toLowerCase();
    if (v === (noid ? '' : id)) return;
    if (!v) { e.target.value = noid ? '' : id; return; }
    const ok = await changeId(note, v);
    if (!ok) { alert('そのIDは使えません（形が違うか、既にあります）'); e.target.value = noid ? '' : id; }
  };
  renderTabs(); renderList();
  if (!text) { // なりきりチャット・キャンバス: ノートの中に、それぞれの画面
    if (kind === 'rp') RP.render($('#nbody'), note, mid); else CV.render($('#nbody'), note);
    return;
  }
  const view = editor($('#ed'), note.body, 'note', s, v => { note.body = v; saveNote(note); renderList(); },
    s === 'p' ? '紙の内容を文字で（テキスト化）' : '本文。続き :1a1　引用 (1) と (1):　別ノート 1a(1)　全体 1a:');
  if (n) { const p = L.anchorPos(note.body, n); if (p >= 0) jump(view, p); }
  else if (keep && cur.pos != null) jump(view, Math.min(cur.pos, view.state.doc.length));
  else if (s === 'd' && !note.body) view.focus();
}
// ノートにIDを付ける・変える（ファイル名が変わり、日記のリンクなども直る）
async function changeId(note, v) {
  if (!L.isId(v) || get(note.s, v)) return false;
  await flush(); await api.saveNote(pubNote(note));
  const old = note.id, r = await api.rename(note.s, old, v);
  if (!r) return false;
  Object.assign(note, r, { body: r.body });
  for (const t of topics) if (t.entry && t.entry.s === note.s && t.entry.id === old) t.entry.id = v;
  for (const t of tabs) if (t.k === 'note' && t.s === note.s && t.id === old) t.id = v;
  for (const m of notes) if (m.kind === 'text' && m !== note) { const b = m.body.split('](D_' + old + '.md').join('](D_' + v + '.md'); if (b !== m.body) m.body = b; }
  await refreshDiaries(); openNote(note.s, v, null, true); return true;
}
// IDを付けるダイアログ: IDを直接 / 親のノートにぶら下げる（分岐として）
function giveIdDialog(note) {
  const roots = notes.filter(x => x.s === 'd' && /^\d+$/.test(x.id)).map(x => +x.id);
  dialog(`<h3>IDを付ける</h3><div class="sub">IDを付けると、キーワードやトピックIndexが付けられ、Index や 日記に ID で載ります。</div>
    <label class="rad"><input type="radio" name="gi" value="id" checked> ID <input id="gi-id" style="width:100px" value="${esc(free('d', String((roots.length ? Math.max(...roots) : 0) + 1)))}"></label>
    <label class="rad"><input type="radio" name="gi" value="parent"> 親のノートのID（分岐として付ける） <input id="gi-parent" style="width:100px" placeholder="例: 1a"></label>
    <label class="rad"><input type="radio" name="gi" value="sib"> となりのノートのID（並列として付ける） <input id="gi-sib" style="width:100px" placeholder="例: 1a"></label>
    <div class="row"><button class="p" id="gi-ok">付ける</button><button id="gi-no">やめる</button></div>`, close => {
    for (const k of ['id', 'parent', 'sib']) $('#gi-' + k).onfocus = () => { document.querySelector(`input[value=${k}]`).checked = true; };
    $('#gi-no').onclick = close; $('#gi-id').select();
    $('#gi-ok').onclick = async () => {
      const mode2 = document.querySelector('input[name=gi]:checked').value; let v;
      if (mode2 === 'id') v = $('#gi-id').value.trim().toLowerCase();
      else {
        const base = $('#gi-' + mode2).value.trim().toLowerCase();
        if (!get('d', base)) return alert(`デジタルのノート ${base || '（空）'} がありません`);
        v = free('d', mode2 === 'parent' ? L.child(base) : L.sibling(base));
      }
      if (!L.isId(v) || get('d', v)) return alert('そのIDは使えません（形が違うか、既にあります）');
      close(); await changeId(note, v);
    };
  });
}
// キーワードとトピックIndex（ボタンで足す）
function renderMeta(note) {
  const entry = topicOf(note.s, note.id);
  $('#meta').innerHTML =
    (note.keywords.length ? '<span class="lbl">索引</span>' : '') +
    note.keywords.map(k => `<span class="kwc" title="${esc(readings[k] || '')}">${esc(k)}<b data-kwdel="${esc(k)}" title="外す">×</b></span>`).join('') +
    `<span id="kw-wrap"><button class="mini" data-act="kwadd">＋キーワード</button></span>` +
    '<span class="vsep"></span>' +
    (entry ? `<span class="chip t" data-topic="${esc(entry.name)}" title="このノートが入口">📑 ${esc(entry.name)}</span>` : '') +
    topicsWith(note).filter(x => x.t !== entry).map(x => `<span class="chip t" data-topic="${esc(x.t.name)}">${esc(x.t.name)}<small> · ${x.kws.map(esc).join('、')}</small></span>`).join('') +
    `<button class="mini" data-act="tadd">＋トピックIndex</button>`;
}
// キーワードと読みを入れる。読みは候補が自動で入り、違っていれば直す
function addKeywordInput(note) {
  $('#kw-wrap').innerHTML = `<input id="kw-in" list="kw-all" placeholder="キーワード"><input id="kw-yomi" placeholder="よみ"><datalist id="kw-all">${allKeywords().map(k => `<option value="${esc(k)}">`).join('')}</datalist>`;
  const kw = $('#kw-in'), rd = $('#kw-yomi'); kw.focus();
  let touched = false, timer = null;
  rd.oninput = () => { touched = true; };
  kw.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (touched) return;
      const k = kw.value.trim();
      rd.value = !k ? '' : readings[k] || await api.suggest(k);
    }, 200);
  };
  const done = () => renderMeta(note);
  const onKey = async e => {
    if (e.key === 'Escape') return done();
    if (e.key !== 'Enter' || e.isComposing) return;
    const k = kw.value.trim(); if (!k) return;
    clearTimeout(timer);
    const r = L.toHira(rd.value.trim()) || readings[k] || await api.suggest(k);
    if (r !== readings[k]) { readings[k] = r; await api.setReading(k, r); }
    if (!note.keywords.includes(k)) note.keywords.push(k);
    saveNote(note); renderList(); done();
  };
  kw.onkeydown = onKey; rd.onkeydown = onKey;
  const blur = () => setTimeout(() => { const a = document.activeElement; if (a !== kw && a !== rd && $('#kw-in') === kw) done(); }, 150);
  kw.onblur = blur; rd.onblur = blur;
}
async function create(s, id) {
  const n = await api.saveNote({ s, id, created: L.now(), keywords: [], body: '' });
  notes.push(n); if (s === 'd') await refreshDiaries();
  openNote(s, id);
}
// ノートを作ると作った日の日記が（無ければ）できて、リンクが入る。その日記を取り込み直す
async function refreshDiaries() {
  for (const r of await api.diaryState()) { const d = getDiary(r.date); if (!d) diaries.push(r); else if (!timers['dy' + r.date] && !timers['dt' + r.date]) Object.assign(d, r); }
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
  if (cur.k === 'diary') return diaryAct(act);
  const { s, id } = cur, note = get(s, id);
  if (act === 'sib') create(s, free(s, L.sibling(id)));
  if (act === 'chi') create(s, free(s, L.child(id)));
  if (act === 'giveid') return giveIdDialog(note);
  if (act === 'kwadd') addKeywordInput(note);
  if (act === 'ndel') deleteNotes([{ s, id }]);
  if (act === 'attach') pick(true, f => attach(note, f), '*');
  if (act === 'table' && lastView) {
    const v = lastView, h = v.state.selection.main.head, at = v.state.doc.lineAt(h);
    const ins = (h === at.from ? '' : '\n') + tableTemplate;
    v.dispatch({ changes: { from: h, insert: ins }, selection: { anchor: h + ins.length - 8 } }); v.focus();
  }
  if (act === 'tadd') topicAddDialog(note);
  if (act === 'img') pick(false, async f => { const r = await api.saveImage(s, id, await shrink(f[0])); Object.assign(get(s, id), r); openNote(s, id); });
});
// IDなしのノートを作る（kind: text / rp / canvas）。あとでIDを付けて整理する
async function createNoid(kind) {
  const data = kind === 'rp' ? RP.emptyData() : kind === 'canvas' ? CV.emptyData() : null;
  const n = await api.createNote({ kind, data, created: L.now() });
  notes.push(n); await refreshDiaries(); openNote('d', n.id);
  if (kind === 'text') setTimeout(() => lastView && lastView.focus(), 30);
}
$('#new').onclick = e => {
  if (mode === 'diary') return openDiary(L.todayStr());
  if (mode === 'chat') return Chat.newTopicDialog();
  const r = $('#new').getBoundingClientRect();
  popMenu({ clientX: r.left, clientY: r.bottom + 4 }, [
    ['ノート（IDなし）', () => createNoid('text')],
    ['ノート（IDを付けて作る）', () => { const s = tab === 'p' ? 'p' : 'd'; const roots = notes.filter(n => n.s === s && /^\d+$/.test(n.id)).map(n => +n.id); create(s, free(s, String((roots.length ? Math.max(...roots) : 0) + 1))); }],
    ['🎭 なりきりチャット', () => createNoid('rp')],
    ['🗺 キャンバス', () => createNoid('canvas')]
  ]);
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
// トピックIndexを単独で作る。入口は新しいノート（新しいID）か、既存のノート
// キーワードを指定すると、そのキーワードのIDが最初から入り、Index に赤い点が付く（IDが2つ以上のときだけ）
function topicNewDialog(kw = '') {
  const rootFree = sp => { const r = notes.filter(n => n.s === sp && /^\d+$/.test(n.id)).map(n => +n.id); return free(sp, String((r.length ? Math.max(...r) : 0) + 1)); };
  const idsOf = k => { const v = globalIndex().find(x => x[0] === k); return v ? v[1] : { d: [], p: [] }; };
  $('#modal .box').innerHTML = `
    <h3>トピックIndexを作る</h3>
    <div class="sub">キーワード（任意）。同じキーワードのIDが2つ以上あるとき、それらをまとめます</div>
    <input id="tn-kw" list="tn-kws" value="${esc(kw)}" placeholder="例: GUI"><datalist id="tn-kws">${globalIndex().filter(([, v]) => v.d.length + v.p.length >= 2).map(([k]) => `<option value="${esc(k)}">`).join('')}</datalist>
    <div class="sub">入口のノート（赤い点を付けるID）。無いIDなら、新しいノートを作ります。キーワードのIDの中から選べます</div>
    <div class="row"><select id="tn-s"><option value="d">デジタル</option><option value="p">紙</option></select><input id="tn-id" style="width:100px"><span id="tn-note" class="sub"></span></div>
    <div class="sub">名前</div>
    <input id="tn-name">
    <div id="tn-pre" class="sub"></div>
    <div class="row"><button id="tn-ok" class="p">作る</button><button id="tn-cancel">やめる</button></div>`;
  $('#modal').style.display = 'flex';
  const close = () => { $('#modal').style.display = 'none'; };
  let nameTouched = false;
  const refresh = () => {
    const k = $('#tn-kw').value.trim(), sp = $('#tn-s').value, id = $('#tn-id').value.trim().toLowerCase();
    const exists = !!get(sp, id);
    $('#tn-note').textContent = !id ? '' : exists ? `既存のノート ${id} を入口にします` : `新しいノート ${id} を作ります`;
    if (!nameTouched) $('#tn-name').value = id + (k ? '-' + k : '-');
    const v = k ? idsOf(k) : null;
    $('#tn-pre').textContent = v ? (v.d.length + v.p.length >= 2 ? `${k} ${[...v.d, ...v.p.map(x => '紙' + x)].join(' ')}` + (exists && !(sp === 'd' ? v.d : v.p).includes(id) || !exists ? ` ${sp === 'p' ? '紙' : ''}${id}` : '') + `　→ ${sp === 'p' ? '紙' : ''}${id} の上に赤い点が付きます` : 'このキーワードのIDは2つ未満です') : '';
  };
  $('#tn-s').value = 'd'; $('#tn-id').value = rootFree('d');
  $('#tn-s').onchange = () => { $('#tn-id').value = rootFree($('#tn-s').value); refresh(); };
  $('#tn-kw').oninput = refresh; $('#tn-id').oninput = refresh;
  $('#tn-name').oninput = () => { nameTouched = true; };
  $('#tn-ok').onclick = async () => {
    const k = $('#tn-kw').value.trim(), sp = $('#tn-s').value, id = $('#tn-id').value.trim().toLowerCase(), name = $('#tn-name').value.trim();
    if (!L.isId(id)) return alert('IDの形が違います（例: 12 や 3a）');
    if (!name) return alert('名前を入れてください');
    if (topics.find(t => t.name === name)) return alert('その名前は既にあります');
    const other = topicOf(sp, id);
    if (other) return alert(`${SP[sp]} ${id} は、もう「${other.name}」の入口です（1つのノートに索引は1つ）`);
    let v = null;
    if (k) {
      v = idsOf(k);
      if (v.d.length + v.p.length < 2) return alert('キーワードは、IDが2つ以上あるものだけです');
      if (kwTopic(k)) return alert(`「${k}」のトピックIndexは、もう「${kwTopic(k).name}」があります`);
    }
    if (!get(sp, id)) notes.push(await api.saveNote({ s: sp, id, created: L.now(), keywords: k ? [k] : [], body: '' }));
    else await ensureKeyword(sp, id, k);
    const t = { name, entry: { s: sp, id }, keyword: k, d: v && v.d.length ? k + ' ' + v.d.join(' ') : '', p: v && v.p.length ? k + ' ' + v.p.join(' ') : '' };
    if (!(await api.saveTopic(t))) return alert('保存できませんでした');
    topics.push(t); close(); renderList(); newTab = true; openTopic(name, 'edit');
  };
  $('#tn-cancel').onclick = close;
  $('#modal').onkeydown = e => { if (e.key === 'Escape') close(); };
  refresh(); $('#tn-kw').focus();
}
// mode: view（まとめて表示）| edit（デジタル欄・紙欄に書く）| conf（入口・名前を変える）
function openTopic(name, tmode = 'view', keep) {
  const t = topics.find(x => x.name === name); if (!t) return;
  cur = place({ k: 'topic', name, mode: tmode }, keep); cur.mode = tmode; mode = 'notes';
  const { rows, stars } = L.mergeTopic(t), e = t.entry;
  let body;
  if (tmode === 'edit') body = `<div class="sub">1行に「キーワード ID ID …」。★ で始めると別のトピックIndexへの案内。デジタルと紙は別々に書き、表示はまとめます。</div>
      <div class="two"><div><h4>デジタル</h4><div class="ed" id="ed-d"></div></div><div><h4>紙</h4><div class="ed" id="ed-p"></div></div></div>`;
  else if (tmode === 'conf') body = `<div class="conf">
      <label>名前 <input id="t-name" value="${esc(t.name)}"></label>
      <label>入口 <select id="t-s"><option value="d"${e && e.s === 'd' ? ' selected' : ''}>デジタル</option><option value="p"${e && e.s === 'p' ? ' selected' : ''}>紙</option></select>
        <input id="t-id" value="${e ? esc(e.id) : ''}" style="width:90px"></label>
      <label>点のキーワード <input id="t-kw" list="t-kws" value="${esc(t.keyword || '')}" placeholder="キーワード（空なら点なし）"><datalist id="t-kws">${globalIndex().filter(([, v]) => v.d.length + v.p.length >= 2).map(([k]) => `<option value="${esc(k)}">`).join('')}</datalist></label>
      <div class="sub">そのキーワードの ID（GUI 1 2 3 …）のうち、上の入口のIDの真上に赤い点が付きます（押すとこのトピックIndex へ）。IDが2つ以上のキーワードだけ。1つのキーワードに1つ</div>
      <div class="row"><button data-act="tsave" class="p">決定</button><button data-act="tcancel">やめる</button>
        <span class="grow"></span><button data-act="tdel" class="danger">このトピックIndexを削除</button></div></div>`;
  else body = `<table class="ti">${rows.map(r => `<tr><td>${esc(r.kw)}</td><td>${chips(r)}</td></tr>`).join('') || '<tr><td class="none">まだ空です。「編集」で書きます</td></tr>'}</table>
      ${stars.map(x => `<div class="star">★ ${tchip(x)}</div>`).join('')}`;
  $('#pane').innerHTML = `
    <div class="row">
      <h2>${esc(name)}</h2>
      <span class="sub">入口</span>${e ? chip(e.s, e.id) : '<span class="sub">なし</span>'}
      <span class="grow"></span>
      ${tmode === 'conf' ? '' : `<button data-act="tconf">入口・名前</button>
      <button data-act="tedit" class="${tmode === 'edit' ? 'p' : ''}">${tmode === 'edit' ? '完了' : '編集'}</button>`}
    </div>${body}`;
  if (tmode === 'edit') for (const s of ['d', 'p']) {
    const v = editor($('#ed-' + s), t[s], 'topic', s, x => { t[s] = x; saveTopic(t); }, s === 'd' ? 'PKM 1a 3' : 'PKM 2');
    if (s === 'd') v.focus();
  }
  if (tmode === 'conf') $('#t-id').focus();
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
    const kw = $('#t-kw').value.trim();
    if (kw) {
      const v = globalIndex().find(x => x[0] === kw);
      if (!v || v[1].d.length + v[1].p.length < 2) return alert('赤い点は、IDが2つ以上あるキーワードだけに付けられます');
      const o = kwTopic(kw);
      if (o && o !== t) return alert(`「${kw}」の赤い点は、もう「${o.name}」に付いています`);
    }
    await flush();
    t.keyword = kw;
    await ensureKeyword(s, id, kw);
    const old = t.name; t.name = name; t.entry = { s, id };
    await api.saveTopic(t, old);
    for (const x of tabs) if (x.k === 'topic' && x.name === old) x.name = name;
    openTopic(name, 'view', true);
  }
}

// ===== 日記 =====
// 名前は D_2026-11-07-タイトル。日付が変わるのは朝5時。その日に作ったノートのリンクと、紙の日記の画像は、本文に書き込まれる
const getDiary = date => diaries.find(d => d.date === date);
const upsertDiary = r => { const d = getDiary(r.date); if (d) { Object.assign(d, r); return d; } diaries.push(r); return r; };
function diaryList() {
  const dayRow = d => `<div class="day${cur && cur.k === 'diary' && cur.date === d.date ? ' on' : ''}" data-diary="${d.date}"><span>${d.date.slice(8)}（${L.weekday(d.date)}）</span><small>${esc(d.title)}${d.pages.length ? ' 📷' : ''}</small></div>`;
  const tree = L.diaryTree(diaries.map(d => d.date));
  const grp = (label, inner, open) => `<details${open ? ' open' : ''}><summary>${label}</summary>${inner}</details>`;
  const days = ds => ds.map(x => dayRow(getDiary(x))).join('');
  let first = true;
  const html = tree.map(g => {
    const open = first; first = false;
    return grp(g.label, g.months ? g.months.map((m, i) => grp(m.label, days(m.days), open && i === 0)).join('') : days(g.days), open);
  }).join('');
  return `<div id="dlist"><div class="dtop"><button class="p" id="d-today">今日の日記</button><input type="date" id="d-pick" value="${L.todayStr()}"><button id="d-make" title="この日の日記を開く（無ければ作る）">開く</button></div>${html || '<div class="none">日記はまだありません</div>'}</div>`;
}
$('#list').addEventListener('click', e => {
  if (e.target.id === 'd-today') openDiary(L.todayStr());
  if (e.target.id === 'd-make') { const v = $('#d-pick').value; if (L.isDate(v)) openDiary(v); }
});
async function openDiary(date, keep) {
  let d = getDiary(date);
  if (!d || !keep) { // 開くとき、その日に作ったノートで足りないリンクを足す。無い日は作る
    await flush();
    const r = await api.openDiary(date); if (!r) return;
    d = upsertDiary(r);
  }
  cur = place({ k: 'diary', date }, keep); mode = 'diary';
  const idx = diaries.map(x => x.date).sort().indexOf(date);
  $('#pane').innerHTML = `
    <div class="row">
      <span class="sp d">日記</span>
      <h2 style="margin:0">${date}（${L.weekday(date)}）</h2>
      <input class="kw" id="d-title" style="flex:1;min-width:140px;margin:0" value="${esc(d.title)}" placeholder="タイトル（任意）　例: 旅の話">
      <button data-act="dprev" title="前の日記">←</button><button data-act="dnext" title="次の日記">→</button>
      <button data-act="table" title="表を入れる">▦ 表</button>
      <button data-act="attach" title="ファイルを添付（ドラッグや貼り付けでも）">📎 添付</button>
      <button data-act="ddel" class="danger">削除</button>
    </div>
    <div class="ed" id="ed"></div>`;
  const view = editor($('#ed'), d.body, 'note', 'd', v => { d.body = v; later('dy' + date, () => api.saveDiary({ date, body: d.body })); },
    '今日のこと。書いたノートのリンクは、下の「今日のノート」に自動で入ります');
  $('#d-title').oninput = e => { d.title = e.target.value; later('dt' + date, () => api.saveDiary({ date, title: d.title, body: d.body }).then(() => { renderList(); renderTabs(); })); renderList(); };
  renderTabs(); renderList();
  // 自由に書く部分（最初の「## 」より前）にカーソル。節で始まる日記は、その前に空行を足して書く場所を作る
  if (/^## /.test(view.state.doc.toString())) view.dispatch({ changes: { from: 0, insert: '\n\n\n' } }); // 本文は onChange で d.body に入る（上下に空行）
  const text = view.state.doc.toString(), h2 = text.search(/^## /m), at = h2 > 0 ? h2 - 2 : text.length; // 見出しの前の、真ん中の空行
  if (cur.pos != null && keep) view.dispatch({ selection: { anchor: Math.min(cur.pos, view.state.doc.length) } });
  else { view.dispatch({ selection: { anchor: at } }); view.focus(); }
}
async function diaryAct(act) {
  const d = getDiary(cur.date), dates = diaries.map(x => x.date).sort(), i = dates.indexOf(cur.date);
  if (act === 'dprev' && i > 0) openDiary(dates[i - 1]);
  if (act === 'dnext' && i < dates.length - 1) openDiary(dates[i + 1]);
  if (act === 'ddel') {
    if (!confirm(`${cur.date} の日記を削除しますか？（ファイルは .trash に移ります。紙の日記の画像は残ります）`)) return;
    await flush(); await api.deleteDiary(cur.date);
    diaries = diaries.filter(x => x !== d);
    for (let k = tabs.length - 1; k >= 0; k--) if (tabs[k].k === 'diary' && tabs[k].date === cur.date) { tabs.splice(k, 1); if (active >= k) active--; }
    return show(Math.max(0, active));
  }
  if (act === 'attach') pick(true, f => attach(d, f), '*');
  if (act === 'table') insertTable();
}
function insertTable() {
  if (!lastView) return;
  const v = lastView, h = v.state.selection.main.head, at = v.state.doc.lineAt(h), ins = (h === at.from ? '' : '\n') + tableTemplate;
  v.dispatch({ changes: { from: h, insert: ins }, selection: { anchor: h + ins.length - 8 } }); v.focus();
}

// ===== スキャン取り込み（紙）=====
function pick(multi, cb, accept = 'image/*') {
  const f = document.createElement('input'); f.type = 'file'; f.accept = accept; f.multiple = multi;
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
const startScan = fs => {
  queue = [...fs].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  qi = 0; $('#scan').style.display = 'flex'; showScan();
};
$('#imp').onclick = () => pick(true, startScan);
function showScan() {
  if (qi >= queue.length) return closeScan();
  $('#sc-n').textContent = `${qi + 1} / ${queue.length}`;
  $('#sc-img').src = URL.createObjectURL(queue[qi]);
  $('#sc-id').value = free('p', lastId ? L.sibling(lastId) : '1');
  $('#sc-kw').value = ''; $('#sc-msg').textContent = queue[qi].name; if (!$('#sc-date').value) $('#sc-date').value = L.todayStr();
  $('#sc-id').focus(); $('#sc-id').select();
}
async function scanOk() {
  const id = $('#sc-id').value.trim().toLowerCase();
  if (!L.isId(id)) { $('#sc-msg').textContent = 'IDの形が違います（例: 2a1）'; return; }
  if (get('p', id)) { $('#sc-msg').textContent = `紙 ${id} は既にあります。別のIDにしてください`; return; }
  await api.saveImage('p', id, await shrink(queue[qi]));
  const kws = L.splitKw($('#sc-kw').value);
  for (const k of kws) if (!readings[k]) { readings[k] = await api.suggest(k); await api.setReading(k, readings[k]); }
  const n = await api.saveNote({ s: 'p', id, keywords: kws, body: '' });
  notes.push(n); lastId = id; qi++; renderList(); showScan();
}
async function diaryScanOk() { // 紙の日記: ID は付けず、日付の日記の最後に入れる
  const date = $('#sc-date').value;
  if (!L.isDate(date)) { $('#sc-msg').textContent = '日付を入れてください'; return; }
  upsertDiary(await api.addDiaryScan(date, await shrink(queue[qi])));
  lastDiary = date; lastId = ''; qi++; renderList(); showScan();
}
let lastDiary = '';
function closeScan() {
  $('#scan').style.display = 'none';
  if (lastDiary && !lastId) { renderList(); return openDiary(lastDiary); }
  tab = 'p'; mode = 'notes'; renderList(); if (lastId && get('p', lastId)) openNote('p', lastId);
}
$('#sc-ok').onclick = scanOk;
$('#sc-diary').onclick = diaryScanOk;
$('#sc-skip').onclick = () => { qi++; showScan(); };
$('#sc-prev').onclick = () => { if (lastId) { $('#sc-id').value = lastId; $('#sc-id').focus(); } };
$('#sc-close').onclick = closeScan;
$('#scan').onkeydown = e => {
  if (e.key === 'Enter' && e.target.id !== 'sc-date') { e.preventDefault(); scanOk(); }
  else if (e.altKey && e.key.toLowerCase() === 'd') { e.preventDefault(); diaryScanOk(); }
  else if (e.key === 'Escape') closeScan();
  else if (e.key === 'Tab') { e.preventDefault(); $('#sc-prev').click(); }
};

// ===== 保存フォルダ =====
function loaded(st) {
  ({ notes, topics, vault } = st); readings = st.readings || {}; diaries = st.diaries || []; Chat.init(st.docs || {}); RP.init(st.docs || {}); cur = null; tabs = []; active = -1;
  $('#vault').textContent = '📁 ' + vault.split('/').pop(); $('#vault').title = vault + '\n（Brave では Index.md を開くと全部たどれます）';
  try {
    const saved = JSON.parse(localStorage.getItem('pkm-tabs:' + vault) || 'null');
    if (saved) {
      tabs = saved.tabs.filter(t => t.k === 'empty' || (t.k === 'note' && get(t.s, t.id)) || (t.k === 'topic' && topics.find(x => x.name === t.name)) || (t.k === 'diary' && getDiary(t.date)) || t.k === 'chat');
      tabs.forEach(t => { if (t.k === 'topic') t.mode = 'view'; });
      active = Math.min(saved.active, tabs.length - 1);
    }
  } catch { tabs = []; active = -1; }
  show(active);
}
// 右上の「⋯」: 更新を確認（押したときだけ。自動では確認も更新もしない）・ショートカット・バージョン
$('#more').onclick = async () => {
  const info = await api.appInfo(), r = $('#more').getBoundingClientRect();
  popMenu({ clientX: r.right - 190, clientY: r.bottom + 4 }, [
    [`YuriiKasten ${info.version}`, () => { }],
    ['更新を確認', () => checkUpdate(info)],
    ...(info.platform !== 'win32' ? [[info.platform === 'darwin' ? 'デスクトップにショートカットを作る' : 'ショートカットを作る（デスクトップ・アプリ一覧）', async () => toast(await api.installShortcuts())]] : []),
    ['GitHub を開く', () => api.openUrl('https://github.com/Yurii7812/YuriiKasten')]
  ]);
};
async function checkUpdate(info) {
  toast('更新を確認しています…');
  const c = await api.checkUpdate();
  if (!c.ok) return alert('確認できませんでした: ' + c.error);
  if (c.none) return alert('まだ公開されたバージョンがありません。');
  if (!c.newer) return alert(`最新です（${c.current}）`);
  const what = info.mode === 'git' ? `新しい変更があります（${c.latest}）` : `新しいバージョンがあります: ${c.current} → ${c.latest}`;
  const how = info.selfUpdate ? '今すぐ更新しますか？（更新したら、アプリを開き直してください）' : '最新のインストーラーのページを開きますか？（ダウンロードして実行すると更新されます）';
  if (!confirm(`${what}\n\n${how}`)) return;
  toast(info.selfUpdate ? '更新しています…（少し待ってください）' : 'ページを開きます…');
  const r = await api.doUpdate();
  alert(r.ok ? r.message : '更新できませんでした: ' + r.error);
}
$('#vault').onclick = async () => { const st = await api.chooseVault(); if (st) loaded(st); };
api.load().then(loaded);
window.__pkm = { scan: startScan, get diaries() { return diaries; }, get mode() { return mode; }, get cur() { return cur; }, get notes() { return notes; }, get topics() { return topics; }, get view() { return lastView; } };

// ===== 削除・一括削除 =====
const keyOf = n => n.s + ':' + n.id;
function visibleRows() { return [...document.querySelectorAll('#list .item')]; }
function togglePick(row, range) {
  const k = row.dataset.s + ':' + row.dataset.id;
  if (range && lastPick) {
    const rows = visibleRows(), a = rows.findIndex(r => r.dataset.s + ':' + r.dataset.id === lastPick), b = rows.indexOf(row);
    if (a >= 0) for (const r of rows.slice(Math.min(a, b), Math.max(a, b) + 1)) picked.add(r.dataset.s + ':' + r.dataset.id);
  } else { picked.has(k) ? picked.delete(k) : picked.add(k); lastPick = k; }
  renderList();
}
function renderSelbar() {
  const bar = $('#selbar');
  bar.innerHTML = selMode
    ? `<span>${picked.size}件を選択</span><span class="grow"></span><button id="sel-all">全部</button><button id="sel-del" class="danger" ${picked.size ? '' : 'disabled'}>削除</button><button id="sel-end">やめる</button>`
    : '<button id="sel-start" title="複数のノートを選んで、まとめて削除します">☑ 選択</button>';
  bar.style.display = (tab === 'i' || mode !== 'notes') && !$('#q').value ? 'none' : 'flex';
}
$('#selbar').addEventListener('click', e => {
  const id = e.target.id;
  if (id === 'sel-start') { selMode = true; picked.clear(); lastPick = null; renderList(); }
  if (id === 'sel-end') { selMode = false; picked.clear(); renderList(); }
  if (id === 'sel-all') { visibleRows().forEach(r => picked.add(r.dataset.s + ':' + r.dataset.id)); renderList(); }
  if (id === 'sel-del') deleteNotes([...picked].map(k => ({ s: k[0], id: k.slice(2) })));
});
async function deleteNotes(items) {
  items = items.filter(x => get(x.s, x.id));
  if (!items.length) return;
  const label = items.length === 1 ? `${SP[items[0].s]} ${items[0].id}` : `${items.length}件のノート`;
  if (!confirm(`${label} を削除しますか？\n（ファイルは .trash に移ります。索引の行からもIDを外します）`)) return;
  await flush();
  const st = await api.deleteNotes(items);
  ({ notes, topics } = st);
  readings = st.readings || readings;
  const gone = new Set(items.map(keyOf));
  const cp = cur;
  tabs = tabs.filter(t => !(t.k === 'note' && gone.has(keyOf(t))));
  active = cp ? tabs.indexOf(cp) : -1;
  if (active < 0) active = Math.min(Math.max(active, 0), tabs.length - 1);
  selMode = false; picked.clear();
  show(active);
}

// ===== 添付（ファイルは保存フォルダにそのままコピーし、本文のカーソル位置にリンクを入れる）=====
// 画像は ![名前](パス)（本文の中に表示される）、ほかは [名前](パス)（押すと既定のアプリで開く）
const PIC = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
// ファイル名はリンクを壊す文字（空白 ( ) < > % # ?）だけ置き換え、日本語などはそのまま書く
const encRel = n => n.replace(/[\s()<>%#?\\]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
async function attach(note, files) {
  const list = [];
  for (const f of files) list.push({ name: f.name || 'image.png', bytes: await f.arrayBuffer() });
  if (!list.length) return;
  const names = await api.addFiles(list);
  const view = lastView;
  if (!view || !view.dom.isConnected || !cur || !['note', 'diary'].includes(cur.k)) return;
  const head = view.state.selection.main.head, at = view.state.doc.lineAt(head);
  const md = (head === at.from ? '' : '\n') + names.map(n => PIC.test(n) ? `![](${encRel(n)})` : `[${n.replace(/[\[\]]/g, '')}](${encRel(n)})`).join('\n') + '\n';
  view.dispatch({ changes: { from: head, insert: md }, selection: { anchor: head + md.length } }); view.focus();
}
const curNote = () => cur && cur.k === 'note' ? get(cur.s, cur.id) : cur && cur.k === 'diary' ? getDiary(cur.date) : null;
$('#pane').addEventListener('dragover', e => { if ((curNote() || (cur && cur.k === 'chat')) && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); $('#pane').classList.add('drop'); } });
$('#pane').addEventListener('dragleave', e => { if (!e.relatedTarget || !$('#pane').contains(e.relatedTarget)) $('#pane').classList.remove('drop'); });
$('#pane').addEventListener('drop', e => {
  $('#pane').classList.remove('drop');
  if (e.target.closest('#cv-wrap') && e.dataTransfer.files.length) { e.preventDefault(); return CV.dropImages(e); }
  if (e.target.closest('.chat') && e.dataTransfer.files.length) { e.preventDefault(); return (e.target.closest('.rp') ? RP : Chat).attach([...e.dataTransfer.files]); }
  const n = curNote(); if (!n || !e.dataTransfer.files.length) return;
  e.preventDefault(); attach(n, [...e.dataTransfer.files]);
});
// 貼り付け（スクリーンショットなど）
document.addEventListener('paste', e => {
  const n = curNote(), fs = [...(e.clipboardData ? e.clipboardData.files : [])];
  const kind = cur && cur.k === 'note' && n ? n.kind : null;
  if (kind === 'canvas' && fs.length) { e.preventDefault(); return CV.attach(fs); }
  if (kind === 'rp' && fs.length) { e.preventDefault(); return RP.attach(fs); }
  if (cur && cur.k === 'chat' && fs.length) { e.preventDefault(); return Chat.attach(fs); }
  if (n && fs.length) { e.preventDefault(); attach(n, fs); }
});

// チャット・なりきり・キャンバスの部品に、アプリの機能を渡す
Object.assign(ctx, {
  api, later, flush, place, renderTabs, openLink, lastNote: () => lastNote,
 renderList, pick, get, free, refreshDiaries, openNote, openDiary, getDiary,
  setCur: c => { cur = c; }, setMode: m => { mode = m; }, cur: () => cur, notes: () => notes, vault: () => vault,
  touchNote: n => saveNote(n),
  touchDiary: d => later('dy' + d.date, () => api.saveDiary({ date: d.date, body: d.body })),
  openDiaryData: async date => { await flush(); const r = await api.openDiary(date); if (r) upsertDiary(r); }
});
