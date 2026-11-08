import { EditorView, Decoration, ViewPlugin, WidgetType, keymap, placeholder } from '@codemirror/view';
import { EditorState, RangeSetBuilder, StateField } from '@codemirror/state';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import L from '../lib.js';
import { mdExtensions, tableTemplate, searchExt, setSearch } from './md.js';
import { ctx } from './shared.js';
import * as Chat from './chat.js';
import * as RP from './roleplay.js';
import * as PI from './pindex.js';
import * as GR from './graph.js';
import * as MD from './mandala.js';
import * as SM from './similar.js';
import * as CV from './canvas.js';
import { dialog, popMenu, toast, renderMd } from './shared.js';
import { setLang } from './i18n.js';
let pendingLang = null;

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SP = { d: 'デジタル', p: '紙' };

let notes = [], topics = [], readings = {}, tab = 'd', cur = null, vault = '';
// 開いているタブ（Obsidian 風）。cur は今のタブ
let tabs = [], active = -1, newTab = false, bgOpen = false;
let mode = 'notes', diaries = [], records = [{ name: '日記', parent: '' }], lastNote = null, curKind = (() => { try { return localStorage.getItem('pkm-kind') || '日記'; } catch { return '日記'; } })(); // 左の列で選んでいる種類（ノート・日記…）
let selMode = false, picked = new Set(), lastPick = null; // 一括選択
let searchQ = ''; // いま検索している語（一覧と、開いたノートの中の印に使う）
const get = (s, id) => notes.find(n => n.s === s && n.id === id);
const free = (s, id) => { while (get(s, id)) id = L.sibling(id); return id; };
const topicOf = (s, id) => topics.find(t => t.entry && t.entry.s === s && t.entry.id === id); // 入口は1つ
const topicsWith = n => topics.map(t => ({ t, kws: L.mergeTopic(t).rows.filter(r => r[n.s].some(x => L.splitAnchor(x).id === n.id)).map(r => r.kw) })).filter(x => x.kws.length);
const allKeywords = () => [...new Set(notes.flatMap(n => n.keywords))].sort(L.byReading(k => readings[k]));
const yomi = k => readings[k] && readings[k] !== k ? `<small class="yomi">${esc(readings[k])}</small>` : '';
const kwTopic = k => topics.find(t => t.keyword === k);
// そのキーワードのトピックIndex があれば赤い点（押すと開く）。IDが2つ以上でまだ無ければ「作る」
// 左の一覧の並べ替えと表示（デジタル・紙・未整理・日記で共通。覚えておく）
const prefs = (() => { try { return JSON.parse(localStorage.getItem('pkm-list-prefs') || '{}'); } catch { return {}; } })();
let sortBy = prefs.by || 'fz', sortDir = prefs.dir || 'asc', listView = prefs.view || 'list';
const savePrefs = () => { try { localStorage.setItem('pkm-list-prefs', JSON.stringify({ by: sortBy, dir: sortDir, view: listView })); } catch { } };
let ixEdit = false;   // グローバルIndexの編集モード（赤い点を付けるIDを選ぶ）
const pickChips = (k, v, t) => { const dd = t && dotOf(t, k); return [['d', v.d], ['p', v.p]].map(([s, l]) => l.map(id => { const on = dd && dd.s === s && dd.id === id; return `<span class="chip ${s} pick${on ? ' on' : ''}" data-pk="${esc(k)}" data-ps="${s}" data-pid="${esc(id)}" title="${on ? '点を外す' : 'ここに赤い点を付ける'}">${on ? '<i class="dotabove">●</i>' : ''}${s === 'p' ? '紙' : ''}${esc(id)}</span>`; }).join('')).join(''); };
// 「キーワード ID ID(p) …」の 1 行。入口の側と違う ID には、(p) か (d) を付ける
const idsText = (k, v, def) => { const toks = [...v.d.map(x => def === 'd' ? x : x + '(d)'), ...v.p.map(x => def === 'p' ? x : x + '(p)')]; return toks.length ? k + ' ' + toks.join(' ') : ''; };
// 赤い点を k の ID（s, id）に付ける。そのIDにトピックIndexがあればそれを、無ければ新しく作る
async function pickDot(k, s, id) {
  const cur0 = kwTopic(k), dd = cur0 && dotOf(cur0, k);
  const strip = t => { t.text = L.topicText(t).split('\n').map(l => { const r = L.topicLine(l); return r.star === undefined && r.kw === k ? l.replace(/(^|\s)[*＊](?=\S)/g, '$1') : l; }).join('\n'); };
  if (cur0 && dd && dd.s === s && dd.id === id) { cur0.keyword = ''; strip(cur0); saveTopic(cur0); return renderList(); }       // 点を外す
  let t = topicOf(s, id);
  if (!t) {
    if (!get(s, id)) return alert('そのノートがまだありません');
    if (!confirm(`「${k}」の赤い点を ${SP[s]} ${id} に付けるため、トピックIndex「${id}-${k}」を新しく作ります。よろしいですか？`)) return;
    const v = globalIndex().find(x => x[0] === k)[1];
    let name = `${id}-${k}`; while (topics.some(x => x.name === name)) name += '_';
    t = { name, entry: { s, id }, keyword: '', text: idsText(k, v, s) };
    topics.push(t);
  } else if (t.keyword && t.keyword !== k && !confirm(`${SP[s]} ${id} のトピックIndex「${stripId(t.name)}」は、いま「${t.keyword}」の点です。「${k}」に変えますか？`)) return;
  if (cur0 && cur0 !== t) { cur0.keyword = ''; strip(cur0); saveTopic(cur0); }
  t.keyword = k; strip(t); await api.saveTopic(t); renderList();
}
const ixRow = ([k, v]) => {
  const t = kwTopic(k), n = v.d.length + v.p.length;
  const mark = '';
  const on = cur && cur.k === 'topic' && (() => { const o = topics.find(x => x.name === cur.name); return o && ((o.keyword && o.keyword === k) || (o.entry && v[o.entry.s].includes(o.entry.id) && !o.keyword && false)); })();
  if (ixEdit) return `<div class="ix"><b>${esc(k)}</b>${yomi(k)} ${pickChips(k, v, t)}</div>`;
  return `<div class="ix${on ? ' on' : ''}">${mark}<b>${esc(k)}</b>${yomi(k)} ${chips(v, t)}</div>`;
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
const saveNote = n => later('n' + n.s + n.id, async () => { const r = await api.saveNote(pubNote(n)); if (r && r.updated) n.updated = r.updated; });
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
        if (t.k === 'ref') items.push([t.from, t.to, { t: 'ref', s: t.sp || space, id: t.id, n: t.n }, !!get(t.sp || space, t.id)]);   // (p) 紙・(d) デジタル。書かなければ、いまのノートと同じ側
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
        if (r.star !== undefined) { if (r.star) add(off + r.from, off + r.to, { t: 'topic', name: r.star }, !!topics.find(x => x.name === r.star)); else if (r.ref) add(off + r.ref.from, off + r.ref.to, { t: 'ref', s: r.ref.sp || space, id: r.ref.id }, !!get(r.ref.sp || space, r.ref.id)); }
        else for (const x of r.ids) add(off + x.from, off + x.to, { t: 'ref', s: x.sp || space, id: x.id, n: x.n }, !!get(x.sp || space, x.id));
        off += line.length + 1;
      }
    }
    return b.finish();
  };
  return ViewPlugin.fromClass(class {
    constructor(v) { this.decorations = build(v); this.pending = false; }
    update(u) {
      if (u.view.composing) { if (u.docChanged) this.decorations = this.decorations.map(u.changes); this.pending = true; return; }   // 日本語の変換中は、作り直さない
      if (u.docChanged || u.selectionSet || this.pending) { this.decorations = build(u.view); this.pending = false; }
    }
  }, {
    decorations: v => v.decorations,
    eventHandlers: {
      compositionend(_e, view) { setTimeout(() => view.dispatch({}), 0); },
      mousedown(e, view) {
        const el = e.target.closest('[data-l]');
        if (!el || (e.button !== 0 && e.button !== 1)) return false;
        e.preventDefault();
        if (e.button === 1) { // 中クリック: 新しいタブ（背景）。今のページは動かない
          const l = JSON.parse(el.dataset.l);
          if (l.t === 'self') return true;
          bgOpen = true; try { follow(l, view); } finally { setTimeout(() => { bgOpen = false; renderTabs(); }, 0); }
          return true;
        }
        follow(JSON.parse(el.dataset.l), view); return true;
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
// 開いているノートの本文に、検索した語の印を付ける（md.js の searchHighlight が読む）
function searchMark() { if (lastView && lastView.dom.isConnected) lastView.dispatch({ effects: setSearch.of(searchQ) }); }
let lastView = null;
function editor(parent, doc, mode, space, onChange, ph) {
  return lastView = new EditorView({
    parent, state: EditorState.create({
      doc, extensions: [history(), keymap.of([...defaultKeymap, ...historyKeymap]), EditorView.lineWrapping,
        placeholder(ph), ...(mode === 'note' ? [...mdExtensions, searchExt] : []), links(mode, space), ...(mode === 'note' ? [images(space)] : []), EditorView.updateListener.of(u => { if (u.docChanged) onChange(u.state.doc.toString()); })]
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
  if ((m = path.match(/^(\d{14}(?:-\d+)?)\.md$/)) && (m = notes.find(x => x.stem === m[1]))) return openNote(m.s, m.id, null, false, hash); // ノート（紙・IDなし・なりきり・キャンバスも）
  if ((m = path.match(/^C_\d{4}-\d{2}-\d{2}\.md$/)) && /^m-/.test(hash)) return Chat.gotoMemo(hash.slice(2));   // チャットメモの出典リンク
  if ((m = path.match(/^(\d{14}(?:-\d+)?)\.md$/)) && (m = diaries.find(x => x.stem === m[1]))) return openDiary(m.date, false, m.kind);   // 記録（日記・夢…）の、その日のノート
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
// id は 1a のほか 1a(1) も（(番号) は、ノートの中のその場所へ）
const entryOn = (s_, id) => { const o = cur && cur.k === 'topic' && topics.find(x => x.name === cur.name); return !!(o && o.entry && o.entry.s === s_ && o.entry.id === id); };
const chip = (s, raw, topic) => { const { id, n } = L.splitAnchor(raw); return `<span class="chip ${s}${get(s, id) ? '' : ' miss'}${topic ? ' dotted' : ''}${entryOn(s, id) ? ' entry-on' : ''}" data-s="${s}" data-id="${esc(id)}"${n ? ` data-n="${n}"` : ''}>${topic ? (topic.name ? `<i class="dotabove" data-topic="${esc(topic.name)}" title="トピックIndex ${esc(topic.name)}">●</i>` : '<i class="dotabove">●</i>') : ''}${s === 'p' ? '紙' : ''}${esc(raw)}</span>`; };
// t があれば、その入口のIDだけ点を付ける
const dotOf = (t, kw) => { const r = t && L.mergeTopic(t).rows.find(x => x.kw === (kw !== undefined ? kw : t.keyword) && x.dot); return r ? r.dot : t && t.entry; }; // * の印があればそのID、なければ入口
// トピックIndex の中の行: ID の前の * の印のIDの上に赤い点（そのIDが入口のトピックIndexがあれば、押すとそこへ）
const rowChips = r => [['d', r.d], ['p', r.p]].map(([s, l]) => l.map(x => chip(s, x, r.dot && r.dot.s === s && r.dot.id === L.splitAnchor(x).id ? (topicOf(s, x) || { name: '' }) : null)).join('')).join('');
const chips = (v, t, kw) => { const dd = t && dotOf(t, kw); return [['d', v.d], ['p', v.p]].map(([s, l]) => l.map(x => chip(s, x, dd && dd.s === s && dd.id === L.splitAnchor(x).id ? t : null)).join('')).join(''); };
const stripId = name => name.replace(/^[0-9][0-9a-z]*-/, '') || name;
const topicLabel = t => stripId(t.name);
const tchip = name => `<span class="chip t" data-topic="${esc(name)}">${esc(stripId(name))}</span>`;
const firstLine = n => (n.body.split('\n').find(x => x.trim()) || '').replace(/^#+\s*/, '').trim().slice(0, 40);
const titleOf = n => (n.title || '').trim() || firstLine(n) || (n.kind === 'rp' ? '会話' : n.kind === 'canvas' ? 'キャンバス' : '（無題）');
// 検索: 一致した所を mark で囲む（大文字小文字は区別しない）
const escRe = q => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mk = (text, q) => !q ? esc(text) : String(text).split(new RegExp('(' + escRe(q) + ')', 'ig')).map((p, i) => i % 2 ? `<mark>${esc(p)}</mark>` : esc(p)).join('');
// 本文の中の、最初に一致した所の周辺（前後を省略して）。一致が無ければ ''
function snippet(body, q) {
  const i = body.toLowerCase().indexOf(q.toLowerCase()); if (i < 0) return '';
  const a = Math.max(0, i - 24), b = Math.min(body.length, i + q.length + 56);
  return (a > 0 ? '…' : '') + mk(body.slice(a, b).replace(/\s*\n\s*/g, ' '), q) + (b < body.length ? '…' : '');
}
const icon = n => L.KINDS[n.kind || 'text'] || '';
const shortTime = c => (c || '').slice(5, 16).replace('-', '/');
const kwTags = n => n.keywords.length ? `<span class="tag">${n.keywords.map(esc).join('・')}</span>` : '';
const firstLineOf = b => (b.split('\n').find(x => x.trim() && !/^##\s/.test(x)) || '').trim().slice(0, 40);
// 左の一覧の行: タイトル（無ければ本文の最初の行）と、その下に小さく ID（IDなしは日時）とキーワード
const noteRow = (n, label = false, q = '') =>
  `<div class="item note${cur && cur.k === 'note' && cur.s === n.s && cur.id === n.id ? ' on' : ''}${isDecided(n.s, n.id) ? ' decided' : ''}" draggable="true" data-s="${n.s}" data-id="${esc(n.id)}">` +
  `${selMode ? `<input type="checkbox" class="ck" ${picked.has(n.s + ':' + n.id) ? 'checked' : ''}>` : ''}<div class="nrow">` +
  `<div class="nt">${label && n.s === 'p' ? `<span class="sp ${n.s}">${SP[n.s]}</span>` : ''}${icon(n) ? icon(n) + ' ' : ''}${n.image ? '📷 ' : ''}${mk(titleOf(n), q)}</div>` +
  `<div class="ns">${n.noid ? `IDなし · ${shortTime(n.created)}` : `${n.s === 'p' ? '紙 ' : ''}${mk(n.id, q)}`}${n.keywords.length ? ` · ${n.keywords.map(k => mk(k, q)).join('・')}` : ''}</div>${q && snippet(n.body, q) ? `<div class="sn">${snippet(n.body, q)}</div>` : ''}</div></div>`;
// トピックIndex の行（その入口のノートの手前に出す）
const topicRow = t => `<div class="item topicrow${listView === 'card' ? ' tc' : ''}${cur && cur.k === 'topic' && cur.name === t.name ? ' on' : ''}${decided && decided.k === 'topic' && decided.name === t.name ? ' decided' : ''}" data-topic="${esc(t.name)}"><div class="nrow"><div class="nt">${esc(topicLabel(t))}</div><div class="ns">トピックIndex</div></div></div>`;

// ===== 取り込んだファイル（画像・html・csv など）。タイトルと説明を付けて、探せるようにする =====
let filesCache = [], fileFilter = 'all', filesBusy = false;
const refreshFiles = async () => { if (filesBusy) return; filesBusy = true; try { const x = await api.filesInfo(); if (JSON.stringify(x) !== JSON.stringify(filesCache)) { filesCache = x; if (tab === 'f' && !$('#q').value) renderList(); } } finally { filesBusy = false; } };
const fileIcon = e => /^\.(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(e) ? '🖼' : /^\.html?$/.test(e) ? '🌐' : /^\.(csv|tsv|xlsx?)$/.test(e) ? '📊' : /^\.pdf$/.test(e) ? '📕' : '📄';
const fileRow = (f, q = '') => `<div class="item note frow" data-file="${esc(f.name)}"><div class="nrow"><div class="nt">${fileIcon(f.ext)} ${f.title ? mk(f.title, q) : `<span class="sub">（タイトルなし）</span> ${mk(f.orig, q)}`}</div><div class="ns">${esc(f.name)}${f.title && f.orig !== f.name ? ' · ' + mk(f.orig, q) : ''}${f.desc ? ' · ' + mk(f.desc.slice(0, 40), q) : ''}</div></div></div>`;
function fileDialog(name) {
  const f = filesCache.find(x => x.name === name); if (!f) return;
  const isImg = /^\.(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(f.ext);
  $('#modal .box').innerHTML = `<h3>${fileIcon(f.ext)} ${esc(f.orig)}</h3>
    ${isImg ? `<img src="file://${esc(vault + '/' + name)}" style="max-width:100%;max-height:220px;display:block;margin:0 auto 8px;border-radius:6px">` : ''}
    <div class="sub">保存名 ${esc(name)} · ${Math.round(f.size / 1024)} KB · ${esc(f.added)}</div>
    <div class="sub">タイトル</div><input id="fi-t" value="${esc(f.title)}" placeholder="例: 図でわかる知識管理術の表紙">
    <div class="sub">説明（探すときに使います）</div><textarea id="fi-d" rows="3" style="width:100%;font:inherit">${esc(f.desc)}</textarea>
    <div class="row"><button id="fi-ok" class="p">保存</button><button id="fi-open">開く</button><button id="fi-ins" title="いま開いているノートのカーソルに、リンクを書き込む">ノートに貼る</button><button id="fi-cancel">やめる</button></div>`;
  $('#modal').style.display = 'flex'; $('#fi-t').focus();
  const close = () => { $('#modal').style.display = 'none'; };
  $('#fi-cancel').onclick = close; $('#modal').onkeydown = e => { if (e.key === 'Escape') close(); };
  $('#fi-ok').onclick = async () => { await api.setFileInfo(name, { title: $('#fi-t').value, desc: $('#fi-d').value }); close(); filesCache = await api.filesInfo(); renderList(); };
  $('#fi-open').onclick = () => api.openPath(encRel(name));
  $('#fi-ins').onclick = () => {
    const view = lastView; if (!view || !view.dom.isConnected || !cur || !['note', 'diary'].includes(cur.k)) return toast('先にノートを開いてください');
    const h = view.state.selection.main.head, t = ($('#fi-t').value || f.orig).replace(/[\[\]]/g, ''), md = PIC.test(name) ? `![${t}](${encRel(name)})` : `[${t}](${encRel(name)})`;
    close(); view.dispatch({ changes: { from: h, insert: md }, selection: { anchor: h + md.length } }); view.focus();
  };
}
const sortBar = (diary) => `<div class="sortbar">${diary ? '<span class="sub">日付順</span>' : `<select id="sb-by" title="並べ替え"><option value="fz"${sortBy === 'fz' ? ' selected' : ''}>番号順</option><option value="created"${sortBy === 'created' ? ' selected' : ''}>作成順</option><option value="updated"${sortBy === 'updated' ? ' selected' : ''}>更新順</option></select>`}<button id="sb-dir" class="mini" title="${sortDir === 'asc' ? '昇順（押すと降順）' : '降順（押すと昇順）'}">${sortDir === 'asc' ? '↑' : '↓'}</button>${diary ? '' : '<button id="sb-loc" class="mini" title="いま開いているノートへ飛ぶ (o)">◎</button><button id="sb-sim" class="mini" title="似たノートを探す (s)">≈</button>'}</div>`;
// 並べ替え。IDなし（未整理）は folgezettel が無いので、作成日順
function sortNotes(list, tab) {
  const by = tab === 'u' && sortBy === 'fz' ? 'created' : sortBy, sg = sortDir === 'asc' ? 1 : -1;
  const key = n => by === 'fz' ? null : by === 'updated' ? (n.updated || n.created || '') : (n.created || '');
  return list.slice().sort((a, b) => sg * (by === 'fz' ? L.cmpId(a.id, b.id) : key(a).localeCompare(key(b)) || L.cmpId(a.id, b.id)));
}
// Google Keep 風のカード: 題・本文（長いときは途中まで。「続きを見る」で、その場で全部）・ID・キーワード。押すと開いて編集できる
const cardOpen = new Set();
const cardRow = n => {
  const body = (n.body || '').split('\n').filter(x => x.trim() && x.trim() !== (n.title || '')).map(x => x.replace(/^#+\s*/, '')), text = body.join('\n'), long = text.length > 160 || body.length > 6, open = cardOpen.has(n.s + ':' + n.id);
  const shown = open || !long ? text : body.slice(0, 6).join('\n').slice(0, 160);
  return `<div class="item note card${cur && cur.k === 'note' && cur.s === n.s && cur.id === n.id ? ' on' : ''}" draggable="true" data-s="${n.s}" data-id="${esc(n.id)}">${selMode ? `<input type="checkbox" class="ck" ${picked.has(n.s + ':' + n.id) ? 'checked' : ''}>` : ''}<div class="nrow">` +
    `<div class="nt">${icon(n) ? icon(n) + ' ' : ''}${n.image ? '📷 ' : ''}${esc(titleOf(n))}</div><div class="cbody${open ? ' open' : ''}">${shown ? esc(shown) + (long && !open ? '…' : '') : '<span class="sub">（本文なし）</span>'}</div>` +
    `${long ? `<a class="cmore" data-more="${n.s}:${esc(n.id)}">${open ? '閉じる ▴' : '続きを見る ▾'}</a>` : ''}` +
    `<div class="ns">${n.noid ? 'IDなし' : (n.s === 'p' ? '紙 ' : '') + esc(n.id)} · ${esc(shortTime(sortBy === 'updated' ? (n.updated || n.created) : n.created))}${n.keywords.length ? ' · ' + n.keywords.map(esc).join('・') : ''}</div></div></div>`;
};

function renderList() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('#rail button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  const q = $('#q').value.trim().toLowerCase(), out = []; searchQ = q;
  $('#tabs').style.display = mode === 'notes' || q ? '' : 'none';
  if (!q && mode === 'diary') { $('#list').innerHTML = diaryList(); renderSelbar(); return; }
  if (!q && mode === 'chat') { $('#list').innerHTML = Chat.listHtml(); renderSelbar(); return; }
  if (!q && mode === 'pindex') { if (!$('#pi')) $('#list').innerHTML = PI.html(); PI.draw(); renderSelbar(); return; } // 入力中の欄は、描き直さない
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
    const hit = sortNotes(notes.filter(n => [n.id, n.title || '', n.body, n.keywords.join(' '), n.keywords.map(k => readings[k] || '').join(' ')].join('\n').toLowerCase().includes(q)), 'd');   // 並べ替え（番号・作成・更新 × 昇降）は、ノートの部分だけ
    if (hit.length) out.push('<h4>ノート</h4>', sortBar(false), ...hit.map(n => noteRow(n, true, q)));
    const fh = filesCache.filter(f => [f.title, f.desc, f.orig, f.name].join('\n').toLowerCase().includes(q));
    if (fh.length) out.push('<h4>ファイル</h4>', ...fh.map(f => fileRow(f, q)));
    const dh = diaries.filter(d => [d.date, d.title, d.body].join('\n').toLowerCase().includes(q)).sort((a, b) => b.date.localeCompare(a.date));
    if (dh.length) out.push('<h4>日記</h4>', ...dh.map(d => `<div class="item note" data-diary="${d.date}" data-kind="${esc(d.kind || '日記')}"><div class="nrow"><div class="nt">${mk(d.title || d.date, q)}</div><div class="ns">${esc(d.kind || '日記')} · ${d.date}</div>${snippet(d.body, q) ? `<div class="sn">${snippet(d.body, q)}</div>` : ''}</div></div>`));
    const ch = Chat.searchMemos(q);   // チャットメモも
    if (ch.length) out.push('<h4>チャットメモ</h4>', ...ch.slice(0, 80).map(m => `<div class="item note" data-cmemo="${esc(m.id)}"><div class="nrow"><div class="nt">${mk((m.text || '').split('\n')[0].slice(0, 80), q)}</div><div class="ns">${esc(Chat.label(m.topic))} · ${new Date(m.t).toLocaleString()}</div></div></div>`));
    if (!out.length) out.push('<div class="none">見つかりません</div>');
  } else if (tab === 'f') {
    refreshFiles();
    const fl = filesCache.filter(f => fileFilter === 'all' || !f.title);
    out.push(`<div class="sortbar"><select id="ff-sel"><option value="all"${fileFilter === 'all' ? ' selected' : ''}>すべて（${filesCache.length}）</option><option value="untitled"${fileFilter === 'untitled' ? ' selected' : ''}>タイトルなし（${filesCache.filter(f => !f.title).length}）</option></select><span class="grow"></span><button class="mini" id="ff-add" title="ファイルを取り込む">＋ 取り込む</button></div>`);
    out.push(...fl.map(fileRow));
    if (!fl.length) out.push(`<div class="none">${fileFilter === 'untitled' ? 'タイトルのないファイルはありません' : '取り込んだ画像・html・csv などが、ここに並びます。ノートにドラッグしても取り込めます'}</div>`);
  } else if (tab === 'i') {
    out.push(`<div class="ixbar"><span class="sub">${ixEdit ? '赤い点を付けるIDを選びます（点のIDをもう一度押すと外れます）' : ''}</span><span class="grow"></span><button class="mini${ixEdit ? ' p' : ''}" id="ix-edit">${ixEdit ? '完了' : '編集'}</button></div>`);
    let row = null;
    for (const e of globalIndex()) {
      const r = L.kanaRow(readings[e[0]] || e[0]);
      if (r !== row) { out.push(`<h4>${r}</h4>`); row = r; }
      out.push(ixRow(e));
    }
    if (out.length === 1) out.push('<div class="none">ノートにキーワードを書くと、ここに並びます</div>');
  } else {
    const list = sortNotes(tab === 'u' ? notes.filter(n => n.noid) : notes.filter(n => n.s === tab && !n.noid), tab);
    out.push(sortBar(false));
    const byFz = sortBy === 'fz' && tab !== 'u';
    if (byFz && (tab === 'd' || tab === 'p')) for (const t of topics.filter(x => (!x.entry || !get(x.entry.s, x.entry.id)) && (x.entry ? x.entry.s : 'd') === tab).sort((a, b) => a.name.localeCompare(b.name, 'ja'))) out.push(topicRow(t)); // 入口のノートがまだないもの（取り込み前の紙の番号など）は、その側の先頭
    for (const n of list) {
      const t = byFz && topicOf(n.s, n.id); if (t) out.push(topicRow(t)); // 「1-PKM」は、ノート 1 の手前
      out.push(listView === 'card' ? cardRow(n) : noteRow(n));
    }
    if (!list.length) out.push(`<div class="none">${tab === 'p' ? '「📷 スキャン取り込み」で紙を入れます' : tab === 'u' ? 'IDなしで書いたノートが、ここに並びます。あとでIDを付けて整理します' : '「＋ 新規」で書き始めます'}</div>`);
  }
  $('#list').innerHTML = out.join('');
  renderSelbar();
}
// Ctrl+クリック・中クリックは新しいタブで開く
// 中クリックは、貼り付けも自動スクロールもしない（Linux の中クリック貼り付けをやめる）。リンクは背景の新しいタブで開く
document.addEventListener('mousedown', e => { if (e.button === 1) { e.preventDefault(); } newTab = e.ctrlKey || e.metaKey; }, true);
document.addEventListener('mouseup', e => { if (e.button === 1) e.preventDefault(); }, true);
document.addEventListener('paste', e => { if (e.__mid) e.preventDefault(); }, true);
// 戻る・進む: ボタン、Alt+←/→、マウスの戻る/進むボタン
document.addEventListener('keydown', e => { if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) { e.preventDefault(); go(e.key === 'ArrowLeft' ? -1 : 1); } });
document.addEventListener('mouseup', e => { if (e.button === 3) { e.preventDefault(); go(-1); } if (e.button === 4) { e.preventDefault(); go(1); } });
function onOpenClick(e) {
  if (e.target.closest('#modal') || e.target.closest('#selbar')) return;
  const cct = e.target.closest('[data-cchat]'); if (cct) { mode = 'chat'; return Chat.open(cct.dataset.cchat, e.ctrlKey || e.metaKey); }
  const cm = e.target.closest('[data-cmemo]'); if (cm) { mode = 'chat'; return Chat.gotoMemo(cm.dataset.cmemo); }
  const dd = e.target.closest('[data-diary]'); if (dd && !e.target.closest('.cm-editor')) return openDiary(dd.dataset.diary, undefined, dd.dataset.kind || '日記');
  const cc = e.target.closest('[data-chat]'); if (cc) return Chat.open(cc.dataset.chat);
  if (e.target.id === 'c-new') return Chat.newTopicDialog();
  const row = e.target.closest('#list .item');
  if (selMode && row) return togglePick(row, e.shiftKey);
  const t = e.target.closest('[data-topic]'); if (t) return openTopic(t.dataset.topic);
  const n = e.target.closest('[data-id][data-s]');
  if (n && !e.target.closest('.cm-editor')) {
    // Index（左の一覧）と、トピックIndexの中の ID チップは、トピックIndexがあればそちらへ（ノート本体は、トピックの上の入口から）
    const tp = n.classList.contains('chip') && (e.target.closest('#list') || (cur && cur.k === 'topic')) && topicOf(n.dataset.s, n.dataset.id);
    if (tp && !(cur && cur.k === 'topic' && cur.name === tp.name)) return openTopic(tp.name);
    if (get(n.dataset.s, n.dataset.id)) openNote(n.dataset.s, n.dataset.id, n.dataset.n || undefined);
    else if (confirm(`${SP[n.dataset.s]} ${n.dataset.id} はまだありません。作りますか？`)) create(n.dataset.s, n.dataset.id);
  }
}
document.addEventListener('click', onOpenClick);
$('#rail').onclick = e => { const b = e.target.closest('button'); if (b && b.id === 'settings-btn') return settingsDialog(); if (b && b.dataset.mode === 'graph') return openGraph(); if (b && b.dataset.mode === 'mandala') return openMandala(); if (b && b.dataset.mode === 'cards') return openCards(); if (b) { mode = b.dataset.mode; $('#q').value = ''; renderList(); } };
document.addEventListener('auxclick', e => { if (e.button === 1 && !e.target.closest('#tabbar')) { bgOpen = true; try { onOpenClick(e); } finally { setTimeout(() => { bgOpen = false; renderTabs(); }, 0); } } });
// 一覧からトピックIndexの欄へドラッグすると ID が入る
$('#list').addEventListener('click', e => {
  const mo = e.target.closest('[data-more]'); if (mo) { e.stopPropagation(); e.preventDefault(); cardOpen.has(mo.dataset.more) ? cardOpen.delete(mo.dataset.more) : cardOpen.add(mo.dataset.more); return renderList(); }
  const fr = e.target.closest('[data-file]'); if (fr) return fileDialog(fr.dataset.file);
  if (e.target.closest('#ff-add')) return pick(true, f => attach(null, f), '*');
  if (e.target.closest('#sb-loc')) return locateCur();
  if (e.target.closest('#sb-sim') || e.target.closest('#sel-sim')) return startSimilar();
  if (e.target.closest('#sb-dir')) { sortDir = sortDir === 'asc' ? 'desc' : 'asc'; savePrefs(); return renderList(); }
  if (e.target.closest('#ix-edit')) { ixEdit = !ixEdit; return renderList(); }
  const c = e.target.closest('.chip.pick'); if (c) pickDot(c.dataset.pk, c.dataset.ps, c.dataset.pid);
});
$('#list').addEventListener('dragstart', e => { const n = e.target.closest('[data-id]'); if (n) e.dataTransfer.setData('text/plain', n.dataset.id); });
$('#list').addEventListener('change', e => { if (e.target.id === 'ff-sel') { fileFilter = e.target.value; renderList(); } });
$('#list').addEventListener('change', e => { if (e.target.id === 'sb-by') { sortBy = e.target.value; savePrefs(); renderList(); } });
$('#cardtoggle').onclick = () => { listView = listView === 'card' ? 'list' : 'card'; savePrefs(); $('#cardtoggle').classList.toggle('on', listView === 'card'); if (mode === 'notes') renderList(); };
$('#cardtoggle').classList.toggle('on', listView === 'card');
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.tab; $('#q').value = ''; renderList(); } };
$('#q').oninput = renderList;
$('#q').onkeydown = e => { if (e.key === 'Escape') { $('#q').value = ''; $('#q').blur(); renderList(); if (lastView && cur && cur.k === 'note') lastView.focus(); searchMark(); } };
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || $('#modal').style.display === 'flex') return;
  if (e.key === 'f') { e.preventDefault(); $('#q').focus(); $('#q').select(); }
  if (e.key === 'w') { e.preventDefault(); closeTab(active); }
  if (e.key === 't') { e.preventDefault(); tabs.push({ k: 'empty' }); show(tabs.length - 1); }
  if (e.key === 'Tab' && tabs.length) { e.preventDefault(); show((active + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length); }
});
// ===== 左の一覧のキー操作（文字を入力していないとき）=====
// ↓/j ↑/k: 次・前のノート  ←/h: 親  →/l: 子  [ ]: 前・次の兄弟  Enter: そのノートに決める（書き始める）  o: 探し始めたノートに戻る  Esc: 一覧の操作をやめる
// 動かすと右のノートも切り替わる（プレビュー。履歴は増えない）
// 今のタブを、履歴を増やさずに別のノート・トピックに差し替える（プレビュー）
let inPreview = false;
function swapTab(t) { const o = tabs[active]; if (o) tabs[active] = { ...t, back: o.back, fwd: o.fwd }; }
function kbMove(to) {
  if (!to) return;
  if (!decided && cur && (cur.k === 'note' || cur.k === 'topic')) decided = cur.k === 'note' ? { k: 'note', s: cur.s, id: cur.id } : { k: 'topic', name: cur.name };
  inPreview = true;
  try {
    if (to.dataset.topic && !to.dataset.id) { swapTab({ k: 'topic', name: to.dataset.topic, mode: 'view' }); openTopic(to.dataset.topic, 'view', true); }
    else { swapTab({ k: 'note', s: to.dataset.s, id: to.dataset.id }); openNote(to.dataset.s, to.dataset.id, null, true); }
  } finally { inPreview = false; }
  centerOn();
}
// 左の一覧を、いま開いているノート（トピックIndex なら、その行）へ飛ばす
function locateCur() {
  if (!cur) return;
  if (cur.k === 'note') { const n = get(cur.s, cur.id); if (n) tab = n.noid ? 'u' : n.s; }
  else if (cur.k === 'topic') { const t = topics.find(x => x.name === cur.name); if (t && t.entry && get(t.entry.s, t.entry.id)) tab = t.entry.s; }
  else return;
  mode = 'notes'; $('#q').value = ''; renderList(); centerOn();
}
// 見ているノートを、一覧の真ん中に
function centerOn(sel = '#list .item.on') { const on = document.querySelector(sel) || document.querySelector('#list .item.on'); if (on) on.scrollIntoView({ block: 'center' }); }
// 決めたノート（Enter で決めた・クリックして開いた）。o で、ここへ戻る。一覧では黄色の背景で示す
let decided = null;
const isDecided = (s_, id) => decided && decided.k === 'note' && decided.s === s_ && decided.id === id;
// 一覧の行（ノートとトピックIndex）の並びと、それぞれの親（番号）。トピックIndex は入口のノートと同じ階層（その手前）
function listRows() {
  return [...document.querySelectorAll('#list .item.note[data-id][data-s], #list .item.topicrow')].filter(x => !x.classList.contains('chip')).map(el => {
    if (el.dataset.topic && !el.dataset.id) { const t = topics.find(x => x.name === el.dataset.topic), e = t && t.entry; return { el, topic: t, par: e ? L.parentIn(e.id, x => !!get(e.s, x)) : null, s: e ? e.s : 'd' }; }
    const n = get(el.dataset.s, el.dataset.id); return { el, note: n, par: n && !n.noid ? L.parentIn(n.id, x => !!get(n.s, x)) : null, s: el.dataset.s };
  });
}
// ↑ ↓: トピックIndex も含めて、見えている順に　← : ノート→そのトピックIndex→親　→ : トピックIndex→ノート→子　[ ]: 同じ親の下の行（トピックIndex も含む）　u: 上位のIndex
function kbNav(k) {
  const rows = listRows(), here = cur && cur.k === 'note' ? rows.findIndex(r => r.note && r.note.s === cur.s && r.note.id === cur.id) : cur && cur.k === 'topic' ? rows.findIndex(r => r.topic && r.topic.name === cur.name) : -1;
  const go = r => r && kbMove(r.el);
  const goNote = n => n && kbMove({ dataset: { s: n.s, id: n.id } });
  const goTopic = t => t && kbMove({ dataset: { topic: t.name } });
  if (k === 'ArrowDown' || k === 'j') return go(rows[Math.min(rows.length - 1, here + 1)]);
  if (k === 'ArrowUp' || k === 'k') return go(rows[Math.max(0, here < 0 ? 0 : here - 1)]);
  const r = rows[here]; if (!r) return;
  const base = r.note || (r.topic && r.topic.entry && get(r.topic.entry.s, r.topic.entry.id));
  if (!base || base.noid) return;
  const has = x => !!get(base.s, x), all = notes.filter(n => n.s === base.s && !n.noid).map(n => n.id).sort(L.cmpId), byId = id => id && get(base.s, id);
  if (k === 'ArrowLeft' || k === 'h') { if (r.topic) return goNote(byId(L.parentIn(base.id, has))); const t = topicOf(base.s, base.id); return t ? goTopic(t) : goNote(byId(L.parentIn(base.id, has))); }
  if (k === 'ArrowRight' || k === 'l') return r.topic ? goNote(base) : goNote(byId(all.find(x => L.parentIn(x, has) === base.id)));
  if (k === '[' || k === ']') { const sib = rows.filter(x => x.s === r.s && x.par === r.par && (x.note ? !x.note.noid : true)), at = sib.indexOf(r); return go(sib[at + (k === ']' ? 1 : -1)]); }
  if (k === 'u') { // 自分の番号の祖先をたどって、いちばん近い「入口になっているトピックIndex」へ（自分が入口なら自分の Index。トピックIndex からは、さらに上位へ）
    let id = r.topic ? L.parentIn(base.id, has) : base.id;
    for (; id; id = L.parentIn(id, has)) { const t = topicOf(base.s, id); if (t && !(r.topic && t === r.topic)) return goTopic(t); }
    toast('上位のIndexはありません');
  }
}
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || $('#modal').style.display === 'flex' || $('#idpop') || (cur && cur.k === 'mandala')) return;
  const ae = document.activeElement, editing = ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable);
  if (editing) { if (e.key === 'Escape' && ae.closest && ae.closest('.cm-editor')) { ae.blur(); e.preventDefault(); } return; }   // Esc で書く状態から抜けると、キー操作が使える
  const k = e.key;
  if (k === 'Backspace' && !$('#q').value) { e.preventDefault(); go(-1); const off = () => { const a = document.activeElement; if (a && a !== document.body && (a.closest('.cm-editor') || /^(INPUT|TEXTAREA)$/.test(a.tagName))) a.blur(); }; off(); setTimeout(off, 0); setTimeout(off, 80); return; }   // 戻っても入力状態にならない（続けて Backspace で戻れる）   // 前に開いていたものへ（戻るボタンと同じ）
  if (k === 'o' && !decided && cur && ['note', 'topic'].includes(cur.k)) { e.preventDefault(); return locateCur(); }   // 黄色（決めたもの）が無いときは、いま開いているものを一覧の真ん中に
  if (k === 's' && cur && cur.k === 'note') { e.preventDefault(); return startSimilar(); }
  if (k === 'i' && cur && cur.k === 'note') { e.preventDefault(); const t = $('#c-in'); return t ? t.focus() : lastView && lastView.dom.isConnected && lastView.focus(); }   // なりきり・チャットの入力欄、ふつうのノートの本文に入る
  if (mode !== 'notes') return;
  if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'j', 'k', 'h', 'l', '[', ']', 'Enter', 'o', 'u', 'Escape'].includes(k)) return;
  const cn = cur && cur.k === 'note' ? get(cur.s, cur.id) : null;
  if (k === 'Escape') return;
  if (k === 'o') { // 決めたノート（Enter で決めた・開いたもの）へ戻る。一覧の真ん中に
    if (!decided) return; e.preventDefault(); const d = decided;
    if (d.k === 'note' && get(d.s, d.id)) kbMove({ dataset: { s: d.s, id: d.id } }); else if (d.k === 'topic' && topics.find(t => t.name === d.name)) kbMove({ dataset: { topic: d.name } });
    return;
  }
  if (k === 'Enter') { // いま見ているものを「決める」（黄色の印。o で戻る先になる）
    if (!cur || !['note', 'topic'].includes(cur.k)) return; e.preventDefault();
    decided = cur.k === 'note' ? { k: 'note', s: cur.s, id: cur.id } : { k: 'topic', name: cur.name }; renderList(); centerOn();
    if (cn && lastView && lastView.dom.isConnected) lastView.focus(); return;
  }
  if (!cur || !['note', 'topic'].includes(cur.k)) return;   // カード・曼荼羅・グラフなどを見ているときは、動かさない
  e.preventDefault(); kbNav(k);
});

// ===== 書きながらノートを作る: Ctrl+n（IDなし）/ Ctrl+h（並列）/ Ctrl+b（分岐）/ Ctrl+i（カーソルに :ID を書く）=====
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || $('#modal').style.display === 'flex' || $('#idpop')) return;
  const k = e.key.toLowerCase(); if (!'nhbip'.includes(k) || k.length !== 1) return;
  if (k === 'p') { // Ctrl+P: カーソルに (p)（紙）を書く。:1a のあとで押せば、紙の 1a
    const v = lastView; if (!v || !v.dom.isConnected || !v.hasFocus) return; e.preventDefault(); v.dispatch(v.state.replaceSelection('(p)')); return;
  }
  const ae = document.activeElement, inField = /^(INPUT|TEXTAREA|SELECT)$/.test(ae && ae.tagName) && !(ae.closest && ae.closest('#pane'));   // 作った直後のタイトル欄からも続けて使える
  if (k === 'n') { e.preventDefault(); return createNoid('text'); }
  if (inField || !cur || cur.k !== 'note') return;
  const n = get(cur.s, cur.id); if (!n) return;
  e.preventDefault();
  if (n.noid) return toast('IDなしのノートです。先にIDを付けると、並列・分岐が使えます');
  if (k === 'h') return create(n.s, free(n.s, L.sibling(n.id)));
  if (k === 'b') return create(n.s, free(n.s, L.child(n.id)));
  if (k === 'i') return idPopup(n);
}, true);
// カーソルのところに小さなポップを出し、矢印キー（か b / h）で分岐・並列を選ぶ。選ぶと、その場に :ID を書く（ノートはリンクを押したとき作る）
function idPopup(n) {
  const v = lastView; if (!v || !v.dom.isConnected) return;
  const text = v.state.doc.toString(), used = new Set(L.tokens(text).filter(t => t.k === 'ref').map(t => t.id));
  const freeIn = id => { while (get(n.s, id) || used.has(id)) id = L.sibling(id); return id; };
  const opts = [{ k: 'b', name: '分岐', id: freeIn(L.child(n.id)) }, { k: 'h', name: '並列', id: freeIn(L.sibling(n.id)) }];
  const head = v.state.selection.main.head, c = v.coordsAtPos(head) || v.dom.getBoundingClientRect();
  const pop = document.createElement('div'); pop.id = 'idpop'; let sel = 0;
  const draw = () => { pop.innerHTML = opts.map((o, i) => `<div class="${i === sel ? 'on' : ''}" data-i="${i}"><kbd>${o.k}</kbd> ${o.name} <b>:${esc(o.id)}</b></div>`).join(''); };
  const close = () => { pop.remove(); document.removeEventListener('keydown', key, true); document.removeEventListener('mousedown', out, true); v.focus(); };
  const pick = i => { const o = opts[i], at = v.state.selection.main.head, ins = ':' + o.id; close(); v.dispatch({ changes: { from: at, insert: ins }, selection: { anchor: at + ins.length } }); };
  const key = ev => {
    ev.preventDefault(); ev.stopPropagation();
    if (ev.key === 'Escape') return close();
    if (ev.key === 'Enter') return pick(sel);
    if (['ArrowDown', 'ArrowRight'].includes(ev.key)) { sel = (sel + 1) % opts.length; return draw(); }
    if (['ArrowUp', 'ArrowLeft'].includes(ev.key)) { sel = (sel + opts.length - 1) % opts.length; return draw(); }
    const i = opts.findIndex(o => o.k === ev.key.toLowerCase()); if (i >= 0) return pick(i);
  };
  const out = ev => { if (!pop.contains(ev.target)) close(); };
  pop.onmousedown = ev => { const d = ev.target.closest('[data-i]'); if (d) { ev.preventDefault(); pick(+d.dataset.i); } };
  draw(); document.body.append(pop);
  pop.style.left = Math.min(c.left, innerWidth - 190) + 'px'; pop.style.top = Math.min((c.bottom || 0) + 4, innerHeight - 90) + 'px';
  document.addEventListener('keydown', key, true); document.addEventListener('mousedown', out, true);
}

// ===== タブ =====
function rememberPos() {
  const t = tabs[active];
  if (t && t.k === 'note' && lastView && lastView.dom.isConnected) t.pos = lastView.state.selection.main.head;
}
// 今のタブに開く（Ctrl+クリックなら新しいタブ）。keep なら今のタブを描き直すだけ
// 履歴: タブごとに「戻る」「進む」を持つ。同じタブで別のページへ移るとき、前のページを積む
const desc = t => { const { back, fwd, pos, ...d } = t; return d; };
function place(t, keep) {
  if (keep && tabs[active]) return tabs[active];
  rememberPos();
  if (bgOpen) { tabs.push(t); newTab = false; return t; }                        // 背景で新しいタブ: 今のページは動かない
  if (newTab || active < 0 || !tabs[active]) { tabs.push(t); active = tabs.length - 1; }
  else {
    const old = tabs[active];
    if (!sameTab(old, t)) { t.back = [...(old.back || []), desc(old)].slice(-60); t.fwd = []; } else { t.back = old.back; t.fwd = old.fwd; }
    tabs[active] = t;
  }
  newTab = false;
  return t;
}
const sameTab = (a, b) => a && b && a.k === b.k && a.s === b.s && a.id === b.id && a.date === b.date && a.topic === b.topic && a.name === b.name;
// 戻る・進む
function go(dir) {
  const t = tabs[active]; if (!t) return;
  const from = dir < 0 ? (t.back || []) : (t.fwd || []); if (!from.length) return;
  rememberPos();
  const target = { ...from[from.length - 1] }, rest = from.slice(0, -1);
  const mine = desc(t);
  target.back = dir < 0 ? rest : [...(t.back || []), mine];
  target.fwd = dir < 0 ? [...(t.fwd || []), mine] : rest;
  tabs[active] = target; show(active);
}
$('#nav-back').onclick = () => go(-1);
$('#nav-fwd').onclick = () => go(1);
function renderNav() {
  const t = tabs[active], b = $('#nav-back'), f = $('#nav-fwd'); if (!b) return;
  b.disabled = !(t && (t.back || []).length); f.disabled = !(t && (t.fwd || []).length);
}
function show(i) {
  rememberPos();
  active = Math.max(-1, Math.min(i, tabs.length - 1));
  const t = tabs[active];
  if (!t || t.k === 'empty') { cur = t || null; $('#pane').innerHTML = '<div class="none">左から選ぶか、「＋ 新規」で書き始めます。<br>Ctrl+クリックで新しいタブに開きます。</div>'; renderTabs(); return renderList(); }
  if (t.k === 'note') openNote(t.s, t.id, null, true); else if (t.k === 'diary') openDiary(t.date, true, t.kind); else if (t.k === 'chat') Chat.open(t.topic, true); else if (t.k === 'graph') openGraph(true); else if (t.k === 'mandala') openMandala(true); else if (t.k === 'cards') openCards(true); else if (t.k === 'similar') openSimilar(t.base, true); else if (t.k === 'export') openExport(t, true); else openTopic(t.name, t.mode, true);
}
function closeTab(i) {
  if (i < 0 || i >= tabs.length) return;
  if (i === active) rememberPos();
  tabs.splice(i, 1);
  if (active > i || active >= tabs.length) active--;
  show(active < 0 && tabs.length ? 0 : active);
}
const tabLabel = t => t.k === 'note' ? (n => `${n && icon(n) ? icon(n) + ' ' : ''}${n ? esc(titleOf(n).slice(0, 16)) : esc(t.id)}<small>${n && n.noid ? 'IDなし' : (t.s === 'p' ? '紙 ' : '') + esc(t.id)}</small>`)(get(t.s, t.id))
  : t.k === 'topic' ? `📑 ${esc(t.name)}` : t.k === 'diary' ? `📔 ${esc(t.date.slice(5))}${t.kind && t.kind !== '日記' ? ' <small>' + esc(t.kind) + '</small>' : ''}` : t.k === 'chat' ? `💬 ${esc(Chat.label(t.topic))}` : t.k === 'graph' ? '🕸 グラフ' : t.k === 'mandala' ? '❖ 曼荼羅' : t.k === 'cards' ? '🗒 カード' : t.k === 'similar' ? '≈ 似たノート' : t.k === 'export' ? '📤 エクスポート' : '新しいタブ';
function renderTabs() {
  $('#tabbar').innerHTML = tabs.map((t, i) => `<div class="tab${i === active ? ' on' : ''}" data-ti="${i}"><span>${tabLabel(t)}</span><b class="x" data-close="${i}" title="閉じる (Ctrl+W)">×</b></div>`).join('')
    + '<button class="tab-new" title="新しいタブ (Ctrl+T)">＋</button>';
  renderNav();
  try { localStorage.setItem('pkm-tabs:' + vault, JSON.stringify({ tabs: tabs.map(t => ({ ...desc(t), pos: t.pos })), active })); } catch { }
}
$('#tabbar').addEventListener('click', e => {
  const x = e.target.closest('[data-close]'); if (x) return closeTab(+x.dataset.close);
  if (e.target.closest('.tab-new')) { tabs.push({ k: 'empty' }); return show(tabs.length - 1); }
  const t = e.target.closest('[data-ti]'); if (t) show(+t.dataset.ti);
});
// タブの上でホイールを回すと、前後のタブに切り替わる
let wheelAt = 0;
$('#tabbar').addEventListener('wheel', e => {
  if (tabs.length < 2) return; e.preventDefault();
  const now = Date.now(); if (now - wheelAt < 120) return; wheelAt = now;
  const d = (e.deltaY || e.deltaX) > 0 ? 1 : -1, n = Math.max(0, Math.min(tabs.length - 1, active + d));
  if (n !== active) show(n);
}, { passive: false });
// 戻る・進むを、ホイールクリック（中クリック）すると、そのページを新しいタブで開く（今のタブは動かない）
function goNewTab(dir) {
  const t = tabs[active]; if (!t) return;
  const from = dir < 0 ? (t.back || []) : (t.fwd || []); if (!from.length) return;
  const target = { ...from[from.length - 1], back: [], fwd: [] };
  rememberPos(); tabs.push(target); show(tabs.length - 1);
}
for (const [id, dir] of [['#nav-back', -1], ['#nav-fwd', 1]]) {
  $(id).addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
  $(id).addEventListener('auxclick', e => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); goNewTab(dir); } });
}
$('#tabbar').addEventListener('auxclick', e => { const t = e.target.closest('[data-ti]'); if (t && e.button === 1) closeTab(+t.dataset.ti); });

// ===== ノート =====
function openNote(s, id, n, keep, mid) {
  const note = get(s, id); if (!note) return;
  if (bgOpen) { place({ k: 'note', s, id }, false); return; }
  cur = place({ k: 'note', s, id }, keep); mode = 'notes'; lastNote = { s, id };
  if (!inPreview) decided = { k: 'note', s, id };
  if (!$('#q').value) tab = note.noid ? 'u' : s;
  const kind = note.kind || 'text', noid = !!note.noid, text = kind === 'text', cp = '<svg class="ico" viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 011-1h9"/></svg>';
  $('#pane').innerHTML = `
    <div class="stage"><div class="col${s === 'p' || !text ? ' wide' : ''}">
      <div class="idline">
        ${noid ? '' : `<button class="cpid" data-act="copyid" title="IDをコピー">${cp}</button>`}
        <input class="idin" id="f-id" value="${noid ? '' : esc(id)}" placeholder="IDなし" title="${noid ? 'IDを入れると、整理されます' : 'ID（変えると名前も変わります）'}">
        ${noid ? '<button class="gid" data-act="giveid">IDを付ける</button>' : ''}
        ${s === 'p' ? '<span class="dt">紙</span>' : ''}${L.KINDS[kind] ? `<span class="dt">${L.KINDS[kind]}</span>` : ''}
        ${s === 'd' ? `<span class="dt">${esc(note.created)}</span>` : ''}
        <span class="grow"></span>${noid ? '' : `<button class="nb" data-act="sib" title="並列のノートを作る（同じ階層の次: ${esc(free(s, L.sibling(id)))}）">＋ 並列 <small>${esc(free(s, L.sibling(id)))}</small></button><button class="nb" data-act="chi" title="分岐のノートを作る（一つ下: ${esc(free(s, L.child(id)))}）">＋ 分岐 <small>${esc(free(s, L.child(id)))}</small></button>`}<button class="ic nm" data-act="mgn" title="右の欄を隠す・出す (Ctrl+\\)"><svg class="ico" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg></button><button class="ic nm" data-act="nmenu" title="このノートのメニュー">${'<svg class="ico" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>'}</button>
      </div>
      <input class="ntitle" id="f-title" value="${esc(note.title || '')}" placeholder="タイトル">
      ${!text ? '<div id="nbody"></div>' : s === 'p' ? `<div class="paper"><div class="pic">${note.image ? `<img src="${note.image}">` : '<button data-act="img">画像を入れる</button>'}</div><div class="ed" id="ed"></div></div>` : '<div class="ed" id="ed"></div>'}
    </div><aside class="mgn" id="margin"></aside></div>`;
  applyMgn();
  renderMeta(note);
  $('#f-title').oninput = e => { // タイトル: 打ったらすぐ一覧とタブに反映し、少し待って保存
    note.title = e.target.value; if (note.data) note.data.title = note.title || note.data.title;
    if (!text) note.body = L.deriveBody(kind, note.data);
    saveNote(note); renderList(); renderTabs();
  };
  $('#f-title').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing && lastView) { e.preventDefault(); lastView.focus(); lastView.dispatch({ selection: { anchor: 0 } }); } };
  $('#f-id').onchange = async e => {
    const v = e.target.value.trim().toLowerCase();
    if (v === (noid ? '' : id)) return;
    if (!v) { e.target.value = noid ? '' : id; return; }
    const ok = await changeId(note, v);
    if (!ok) { alert('そのIDは使えません（形が違うか、既にあります）'); e.target.value = noid ? '' : id; }
  };
  renderTabs(); renderList(); if (!$('#q').value) centerOn();   // タブの移動・リンクで開いたときも、見ているノートが一覧の真ん中に（同じタブにあるとき。検索中は動かさない）
  if (!text) { // なりきりチャット・キャンバス: ノートの中に、それぞれの画面
    if (kind === 'rp') RP.render($('#nbody'), note, mid); else CV.render($('#nbody'), note);
    return;
  }
  const view = editor($('#ed'), note.body, 'note', s, v => { note.body = v; saveNote(note); renderList(); },
    s === 'p' ? '紙の内容を文字で（テキスト化）' : '本文。続き :1a1　引用 (1) と (1):　別ノート 1a(1)　全体 1a:');
  searchMark();
  const hitAt = searchQ ? note.body.toLowerCase().indexOf(searchQ) : -1;
  if (n) { const p = L.anchorPos(note.body, n); if (p >= 0) jump(view, p); }
  else if (hitAt >= 0) view.dispatch({ effects: EditorView.scrollIntoView(hitAt, { y: 'center' }) }); // 検索から開いたら、最初の一致の所へ
  else if (keep && cur.pos != null) jump(view, Math.min(cur.pos, view.state.doc.length));
  else if (s === 'd' && !note.body && !note.title) $('#f-title').focus();
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
const refContexts = (body, id, own = 'd', target = own) => { // id（target の側）を指している所の、周辺の文章（ハイライトなし）。own は、この本文のある側。リンクだけの行は出さない
  const out = [];
  for (const t of L.tokens(body)) {
    if (t.k !== 'ref' || t.id !== id || (t.sp || own) !== target) continue;
    const ls = body.lastIndexOf('\n', t.from - 1) + 1, e0 = body.indexOf('\n', t.to), le = e0 < 0 ? body.length : e0;
    const a = Math.max(ls, t.from - 28), b = Math.min(le, t.to + 40);
    const before = body.slice(a, t.from).replace(/^[-*]\s+/, ''), after = body.slice(t.to, b);
    if (!(before + after).trim()) continue;
    out.push(`${a > ls ? '…' : ''}${esc(before)}${esc(t.text)}${esc(after)}${b < le ? '…' : ''}`);
  }
  return out;
};
function backlinks(note) { // このノートを指しているノート・日記
  const out = [];
  if (note.noid) return out;
  for (const m of notes) if (m !== note && !m.noid) { const c = refContexts(m.body, note.id, m.s, note.s); if (c.length) out.push({ m, c: c[0], more: c.length - 1 }); }   // 紙とデジタルの、どちらからのリンクも
  for (const d of diaries) { const c = refContexts(d.body, note.id, 'd', note.s); if (c.length) out.push({ d, c: c[0], more: 0 }); }
  return out;
}
const ownTopic = n => !n.noid && topicOf(n.s, n.id);   // このノートが入口のトピックIndex
function renderMeta(note) {
  const el = $('#margin'); if (!el) return;
  if (note.noid) { el.innerHTML = '<div class="hint">IDなしのノートです。<br>「IDを付ける」と、キーワードやトピックIndex、バックリンクが使えます。</div>'; return; }
  const tops = topics.map(t => ({ t, kws: L.mergeTopic(t).rows.filter(r => r[note.s].some(x => L.splitAnchor(x).id === note.id)).map(r => r.kw) })).filter(x => x.kws.length); // 自分のキーワードがあるものだけ
  const bl = backlinks(note);
  el.innerHTML =
    (note.keywords.length ? `<div class="sec"><div class="l">キーワード</div>${note.keywords.map(k => `<div class="mk" title="${esc(readings[k] || '')}"><span>${esc(k)}</span><b data-kwdel="${esc(k)}" title="外す">×</b></div>`).join('')}</div>` : '') +
    (ownTopic(note) ? `<div class="sec"><div class="l">このノートのトピックIndex</div><div class="mt"><a class="tl" style="margin-left:0" data-topic="${esc(ownTopic(note).name)}">📑 ${esc(topicLabel(ownTopic(note)))}</a></div></div>` : '') +
    (tops.length ? `<div class="sec"><div class="l">索引されているトピックIndex</div>${tops.flatMap(x => x.kws.map(kw => `<div class="mt"><span>${esc(kw)}</span><a class="tl" data-topic="${esc(x.t.name)}">${esc(topicLabel(x.t))}</a></div>`)).join('')}</div>` : '') +
    (bl.length ? `<div class="sec"><div class="l">バックリンク ${bl.length}</div>${bl.map(x => x.m
      ? `<div class="bl" data-s="${x.m.s}" data-id="${esc(x.m.id)}"><div class="bh"><b>${esc(titleOf(x.m))}</b><em>${esc(x.m.id)}</em></div><p>${x.c}</p></div>`
      : `<div class="bl" data-diary="${x.d.date}"><div class="bh"><b>${x.d.date.slice(5)}（${L.weekday(x.d.date)}）</b><em>日記</em></div><p>${x.c}</p></div>`).join('')}</div>` : '') +
    `<div class="madd"><a data-act="kwadd">＋ キーワード</a><span id="kw-wrap"></span><a data-act="tadd">＋ トピックIndexに入れる</a></div>`;
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
  for (const r of await api.diaryState()) { const d = getDiary(r.date, r.kind); if (!d) diaries.push(r); else if (!timers['dy' + r.kind + r.date] && !timers['dt' + r.kind + r.date]) Object.assign(d, r); }
}
$('#pane').addEventListener('click', async e => {
  const del = e.target.closest('[data-kwdel]');
  if (del && cur && cur.k === 'note') {
    if (!confirm(`キーワード「${del.dataset.kwdel}」をこのノートから外しますか？`)) return;
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
  if (act === 'copyid') { navigator.clipboard.writeText(note.id); return toast(`IDをコピーしました: ${note.id}`); }
  if (act === 'mgn') return toggleMgn();
  if (act === 'nmenu') return noteMenu(a, note);
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
// 右の欄（キーワード・トピックIndex・バックリンク）を隠す・出す。覚えておく
let mgnHidden = (() => { try { return localStorage.getItem('pkm-mgn-hidden') === '1'; } catch { return false; } })();
const applyMgn = () => { const st = document.querySelector('#pane .stage'); if (st) { st.classList.toggle('nomgn', mgnHidden); st.style.setProperty('--ph', $('#pane').clientHeight + 'px'); } };
window.addEventListener('resize', applyMgn);
function toggleMgn() { mgnHidden = !mgnHidden; try { localStorage.setItem('pkm-mgn-hidden', mgnHidden ? '1' : '0'); } catch { } applyMgn(); }
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === '\\' && !e.shiftKey) { e.preventDefault(); toggleMgn(); } });
// ノートのメニュー（⋯）: 並列・分岐・表・添付・ID・削除
function noteMenu(btn, note) {
  const r = btn.getBoundingClientRect(), { s, id } = note, text = (note.kind || 'text') === 'text';
  popMenu({ clientX: r.right - 190, clientY: r.bottom + 4 }, [
    ...(!note.noid ? [[`並列のノートを作る（${free(s, L.sibling(id))}）`, () => create(s, free(s, L.sibling(id)))], [`分岐のノートを作る（${free(s, L.child(id))}）`, () => create(s, free(s, L.child(id)))]] : []),
    ...(text ? [['表を入れる', () => insertTable()], ['ファイルを添付', () => pick(true, f => attach(note, f), '*')]] : []),
    ...(note.noid ? [['IDを付ける', () => giveIdDialog(note)]] : s === 'd' ? [['IDを消す（IDなしにする）', () => clearIdFlow(note)]] : []),
    ['削除', () => deleteNotes([{ s, id }]), true]
  ]);
}
// IDを消す: このノートを指すリンクは、自動でファイルへのリンクに直る
async function clearIdFlow(note) {
  const n = backlinks(note).length;
  if (!confirm(`「${titleOf(note)}」のIDを消して、IDなしにしますか？\n${n ? `このノートを指している ${n} 件のリンクは、自動で直ります。\n` : ''}子のノートのIDは、そのままです。`)) return;
  await flush(); await api.saveNote(pubNote(note));
  const old = note.id, st = await api.clearId(note.s, old); if (!st) return alert('IDを消せませんでした');
  ({ notes, topics } = st); diaries = st.diaries; records = st.records || records; readings = st.readings || readings;
  const stem = notes.find(x => x.noid && x.stem === note.stem);
  for (const t of tabs) if (t.k === 'note' && t.s === note.s && t.id === old && stem) t.id = stem.id;
  if (stem) openNote('d', stem.id, null, true); else show(Math.max(0, active));
  toast('IDを消しました');
}
// IDなしのノートを作る（kind: text / rp / canvas）。あとでIDを付けて整理する
async function createNoid(kind) {
  const data = kind === 'rp' ? RP.emptyData() : kind === 'canvas' ? CV.emptyData() : null;
  const n = await api.createNote({ kind, data, created: L.now() });
  notes.push(n); await refreshDiaries(); openNote('d', n.id);
  setTimeout(() => { const t = $('#f-title'); if (t) t.focus(); }, 30); // 作った直後は、タイトル欄から書き始める
}
$('#new').onclick = e => {
  if (mode === 'diary') return openDiary(L.todayStr());
  if (mode === 'chat') return Chat.newTopicDialog();
  const r = $('#new').getBoundingClientRect();
  popMenu({ clientX: r.left, clientY: r.bottom + 4 }, [
    ['ノート', () => createNoid('text')],
    ['🎭 なりきりチャット', () => createNoid('rp')],
    ['🗺 キャンバス', () => createNoid('canvas')],
    ['📷 スキャンを取り込む（紙）', () => $('#imp').click()]
  ]);
};

// ===== トピックIndex =====
// 「近いもの」: 同じキーワードの行・番号の近さ・リンクでつながるノート・最近使ったもの。理由も添える
const recentTopics = () => { try { return JSON.parse(localStorage.getItem('pkm-topic-recent') || '[]'); } catch { return []; } };
const rememberTopic = name => { try { localStorage.setItem('pkm-topic-recent', JSON.stringify([name, ...recentTopics().filter(x => x !== name)].slice(0, 12))); } catch { } };
function topicRank(note) {
  const out = new Map(), add = (t, n, why) => { const r = out.get(t.name) || { score: 0, why: [] }; r.score += n; if (!r.why.includes(why)) r.why.push(why); out.set(t.name, r); };
  const root = L.root(note.id), rec = recentTopics();
  const linked = new Set([...L.tokens(note.body || '').filter(x => x.k === 'ref').map(x => x.id), ...backlinks(note).map(b => b.m.id)]);
  for (const t of topics) {
    const m = L.mergeTopic(t), ids = m.rows.flatMap(r => r[note.s]);
    if (m.rows.some(r => note.keywords.includes(r.kw))) add(t, 10, 'キーワード');
    const e = t.entry;
    if (e && e.s === note.s && (e.id === note.id || note.id.startsWith(e.id) || e.id.startsWith(note.id))) add(t, 8, '親・子');
    else if (e && e.s === note.s && L.root(e.id) === root) add(t, 5, '同じ系統');
    else if (ids.some(i => L.root(i) === root)) add(t, 3, '同じ系統');
    if (ids.some(i => linked.has(i)) || (e && linked.has(e.id))) add(t, 4, '関連');
    const ri = rec.indexOf(t.name); if (ri >= 0) add(t, 3 - ri * .1, '最近');
  }
  return out;
}
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
    <div class="row"><input id="ta-name" value="${esc((note.title || firstLine(note) || '').slice(0, 20))}" placeholder="名前（例: GUI）" style="flex:1"><button id="ta-new">作る</button></div>`}`;
  $('#modal').style.display = 'flex';
  const close = () => { $('#modal').style.display = 'none'; };
  const rank = topicRank(note);
  const draw = () => {
    const q = $('#ta-q').value.trim().toLowerCase();
    const hit = t => !q || t.name.toLowerCase().includes(q) || L.mergeTopic(t).rows.some(r => r.kw.toLowerCase().includes(q));
    const sc = t => (rank.get(t.name) || { score: 0 }).score;
    const list = topics.filter(hit).sort((a, b) => sc(b) - sc(a) || a.name.localeCompare(b.name, 'ja'));
    if (sel && !list.includes(sel)) sel = null;
    if (!sel && list.length) choose(list[0], false);
    const row = t => { const r = rank.get(t.name); return `<div class="ta-row${t === sel ? ' on' : ''}" data-name="${esc(t.name)}">${esc(stripId(t.name))}${t.entry ? `<small> ${t.entry.s === 'p' ? '紙' : ''}${esc(t.entry.id)}</small>` : ''}${r ? r.why.map(w => `<em>${esc(w)}</em>`).join('') : ''}</div>`; };
    const near = list.filter(t => sc(t) > 0), rest = list.filter(t => sc(t) <= 0);
    $('#ta-list').innerHTML = (near.length ? `<div class="ta-h">近いもの</div>${near.map(row).join('')}` : '') + (rest.length ? `${near.length ? '<div class="ta-h">そのほか</div>' : ''}${rest.map(row).join('')}` : '')
      || '<div class="sub" style="padding:6px">ありません</div>';
    const on = $('#ta-list .on'); if (on) on.scrollIntoView({ block: 'nearest' });
  };
  function choose(t, redraw = true) {
    sel = t;
    const rows = L.mergeTopic(t).rows.map(r => r.kw), mine = note.keywords.filter(k => rows.includes(k));
    $('#ta-kws').innerHTML = [...mine, ...rows.filter(k => !mine.includes(k)), ...note.keywords.filter(k => !rows.includes(k))].map(k => `<option value="${esc(k)}">`).join('');
    if (mine.length && !$('#ta-kw').dataset.touched) $('#ta-kw').value = mine[0];   // 同じキーワードの行があれば、それを入れておく
    if (redraw) draw();
  }
  $('#ta-list').onclick = e => { const r = e.target.closest('[data-name]'); if (r) { choose(topics.find(t => t.name === r.dataset.name)); $('#ta-kw').focus(); } };
  $('#ta-q').oninput = draw;
  $('#ta-kw').oninput = () => { $('#ta-kw').dataset.touched = '1'; };
  $('#ta-q').onkeydown = e => {
    if (e.key === 'Enter') return $('#ta-kw').focus();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {   // 矢印で候補を選ぶ
      e.preventDefault(); const rows = [...$('#ta-list').querySelectorAll('[data-name]')], i = rows.findIndex(r => r.dataset.name === (sel && sel.name));
      const nx = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (nx) choose(topics.find(t => t.name === nx.dataset.name));
    }
  };
  $('#ta-kw').onkeydown = e => { if (e.key === 'Enter') $('#ta-ok').click(); };
  $('#ta-ok').onclick = async () => {
    const kw = $('#ta-kw').value.trim();
    if (!sel) return alert('トピックIndexを選んでください');
    if (!kw) return $('#ta-kw').focus();
    await flush();
    sel.text = L.addToTopic(L.topicText(sel), kw, note.s === L.defOf(sel) ? note.id : `${note.id}(${note.s})`);
    rememberTopic(sel.name);
    await api.saveTopic(sel); close(); renderMeta(note);
  };
  $('#ta-cancel').onclick = close;
  if ($('#ta-new')) $('#ta-new').onclick = async () => {
    const nm = $('#ta-name').value.trim();
    if (!nm) return;
    if (topics.find(t => t.name === nm)) return alert('その名前は既にあります');
    const t = { name: nm, entry: { s: note.s, id: note.id }, keyword: '', text: '' };
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
    <label class="rad" id="tn-laterw" style="display:none"><input type="checkbox" id="tn-later" checked> 紙のノートは、まだ作らない（取り込む前の番号。取り込んだら、つながります）</label>
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
    $('#tn-laterw').style.display = sp === 'p' && id && !exists ? 'flex' : 'none';
    $('#tn-note').textContent = !id ? '' : exists ? `既存のノート ${id} を入口にします` : sp === 'p' && $('#tn-later').checked ? `紙 ${id} はまだ取り込んでいません（ノートが無くても作れます）` : `新しいノート ${id} を作ります`;
    if (!nameTouched) $('#tn-name').value = k || '';
    const v = k ? idsOf(k) : null;
    $('#tn-pre').textContent = v ? (v.d.length + v.p.length >= 2 ? `${k} ${[...v.d, ...v.p.map(x => '紙' + x)].join(' ')}` + (exists && !(sp === 'd' ? v.d : v.p).includes(id) || !exists ? ` ${sp === 'p' ? '紙' : ''}${id}` : '') + `　→ ${sp === 'p' ? '紙' : ''}${id} の上に赤い点が付きます` : 'このキーワードのIDは2つ未満です') : '';
  };
  $('#tn-s').value = 'd'; $('#tn-id').value = rootFree('d');
  $('#tn-s').onchange = () => { $('#tn-id').value = rootFree($('#tn-s').value); refresh(); };
  $('#tn-kw').oninput = refresh; $('#tn-id').oninput = refresh; $('#tn-later').onchange = refresh;
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
    if (!get(sp, id) && !(sp === 'p' && $('#tn-later').checked)) notes.push(await api.saveNote({ s: sp, id, created: L.now(), keywords: k ? [k] : [], body: '' }));
    else if (get(sp, id)) await ensureKeyword(sp, id, k);
    const t = { name, entry: { s: sp, id }, keyword: k, text: v ? idsText(k, v, sp) : '' };
    if (!(await api.saveTopic(t))) return alert('保存できませんでした');
    topics.push(t); close(); renderList(); newTab = true; openTopic(name, 'edit');
  };
  $('#tn-cancel').onclick = close;
  $('#modal').onkeydown = e => { if (e.key === 'Escape') close(); };
  refresh(); $('#tn-kw').focus();
}
// mode: view（まとめて表示）| edit（デジタル欄・紙欄に書く）| conf（入口・名前を変える）
// ===== エクスポート（仮の出力。ファイルは作らない）=====
// 選んだノート（＋関連・番号の範囲）を、1つの Markdown にまとめる。プレビューで確認 → 一時タブで確認 → コピー
function exportDialog(start) {
  const keyOf = n => n.s + ':' + n.id, sel = new Set(start.filter(k => get(k[0], k.slice(2))));
  const gk = k => get(k[0], k.slice(2)), ordered = () => [...sel].map(gk).filter(Boolean).sort((a, b) => a.s.localeCompare(b.s) || (a.noid ? 1 : 0) - (b.noid ? 1 : 0) || L.cmpId(a.id, b.id));
  const idsOf = sp => notes.filter(n => n.s === sp && !n.noid).map(n => n.id).sort(L.cmpId);
  const related = (kinds) => {
    const add = new Set();
    for (const n of ordered()) {
      if (n.noid) continue;
      if (kinds.includes('out')) for (const t of L.tokens(n.body || '')) if (t.k === 'ref' && get(t.sp || n.s, t.id)) add.add((t.sp || n.s) + ':' + t.id);
      if (kinds.includes('in')) for (const m of notes) if (!m.noid && refContexts(m.body || '', n.id, m.s, n.s).length) add.add(keyOf(m));
      if (kinds.includes('kw')) for (const m of notes) if (!m.noid && m.keywords.some(k => n.keywords.includes(k))) add.add(keyOf(m));
      if (kinds.includes('topic')) for (const t of topics) { const rows = L.mergeTopic(t).rows; if (rows.some(r => r[n.s].some(x => L.splitAnchor(x).id === n.id))) for (const r of rows) for (const sp of ['d', 'p']) for (const raw of r[sp]) { const id = L.splitAnchor(raw).id; if (get(sp, id)) add.add(sp + ':' + id); } }
    }
    return add;
  };
  const draw = () => {
    const list = ordered();
    $('#ex-list').innerHTML = list.map(n => `<div class="exrow"><b>${n.noid ? 'IDなし' : (n.s === 'p' ? '紙 ' : '') + esc(n.id)}</b> ${esc(titleOf(n).slice(0, 40))}<span class="grow"></span><i data-rm="${esc(keyOf(n))}" title="外す">×</i></div>`).join('') || '<div class="sub">まだ選んでいません</div>';
    $('#ex-n').textContent = `${list.length}件`; $('#ex-open').disabled = $('#ex-copy').disabled = !list.length;
  };
  dialog(`<h3>エクスポート <small class="sub">（保存はしません。確認してコピー）</small></h3>
    <div class="exsec"><b>関連を足す</b>
      <label><input type="checkbox" class="ex-k" value="out" checked>リンク先</label><label><input type="checkbox" class="ex-k" value="in">リンク元</label>
      <label><input type="checkbox" class="ex-k" value="kw">同じキーワード</label><label><input type="checkbox" class="ex-k" value="topic">同じトピックIndex</label>
      <button id="ex-rel">足す</button></div>
    <div class="exsec"><b>番号の範囲（デジタル）</b> <input id="ex-from" placeholder="1a" size="5"> 〜 <input id="ex-to" placeholder="1a5" size="5"> <button id="ex-range">範囲を足す</button>
      <input id="ex-root" placeholder="1a" size="5" style="margin-left:14px"> <button id="ex-tree">その枝（子孫すべて）を足す</button></div>
    <div class="exsec"><b id="ex-n"></b> <span class="sub">番号順に出します。リンクは、この中を指すものだけ生かします</span></div>
    <div id="ex-list" class="exlist"></div>
    <div class="row"><button class="p" id="ex-open">一時タブで確認</button><button id="ex-copy">コピー</button><button id="ex-no">閉じる</button></div>`, close => {
    $('#ex-no').onclick = close;
    $('#ex-list').onclick = e => { const r = e.target.closest('[data-rm]'); if (r) { sel.delete(r.dataset.rm); draw(); } };
    $('#ex-rel').onclick = () => { for (const k of related([...document.querySelectorAll('.ex-k:checked')].map(c => c.value))) sel.add(k); draw(); };
    $('#ex-range').onclick = () => { const f = $('#ex-from').value.trim().toLowerCase(), t = $('#ex-to').value.trim().toLowerCase(); if (!f || !t) return; for (const id of L.fzRange(idsOf('d'), f, t)) sel.add('d:' + id); draw(); };
    $('#ex-tree').onclick = () => { const r = $('#ex-root').value.trim().toLowerCase(); if (!r) return; for (const id of L.fzSubtree(idsOf('d'), r)) sel.add('d:' + id); draw(); };
    const text = () => L.exportMd(ordered().map(n => ({ s: n.s, id: n.id, title: n.title || '', body: n.body || '', noid: n.noid })));
    $('#ex-copy').onclick = async () => { await navigator.clipboard.writeText(text()); toast(`${sel.size}件をコピーしました`); };
    $('#ex-open').onclick = () => { const t = text(), c = sel.size; close(); newTab = true; openExport({ k: 'export', text: t, count: c }); };
    draw();
  });
}
function openExport(t, keep) {
  cur = place({ k: 'export', text: t.text, count: t.count }, keep); mode = 'notes';
  $('#pane').innerHTML = `<div class="row"><h2>📤 エクスポート</h2><span class="sub">${cur.count}件・保存はされません（このタブを閉じると消えます）</span><span class="grow"></span><button class="p" id="ex-copy2">コピー</button></div>
    <textarea id="ex-text" class="extext" readonly></textarea>`;
  $('#ex-text').value = cur.text;
  $('#ex-copy2').onclick = async () => { await navigator.clipboard.writeText(cur.text); toast('コピーしました'); };
  renderTabs(); renderList();
}
// ===== カードビュー（Google Keep 風。画面いっぱいにカードだけ。保存ボタンは無く、書くたびに自動保存）=====
const keepPrefs = { f: 'all', q: '' };
const KCOL = { '': '#ffffff', red: '#fde2e0', orange: '#fdebd0', yellow: '#fff6c2', green: '#dff5e1', teal: '#d9f3f1', blue: '#dce9fd', purple: '#eadcfb', pink: '#fbdcec', gray: '#e8eaed' };
let trashCache = [];
function openCards(keep) { cur = place({ k: 'cards' }, keep); mode = 'notes'; drawCards(true); }
const kImg = n => { try { return `${vault.replace(/\/$/, '')}/${decodeURIComponent(n)}`.split('/').map(encodeURIComponent).join('/').replace(/^%2F/, '/'); } catch { return ''; } };
// 本文のカード用の表示: 画像・チェックリスト（押して切り替え）・ふつうの行
function kBody(n, limit) {
  const lines = (n.body || '').split('\n'); const out = []; let cnt = 0, imgs = 0;
  lines.forEach((ln, i) => {
    if (!ln.trim() || ln.trim() === (n.title || '')) return;
    if (limit && cnt >= limit) return;
    const im = ln.match(/^!\[[^\]]*\]\(([^)\s]+)\)/), ck = ln.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (im && /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(im[1])) { if (imgs++ < 2) out.push(`<img class="kimg" src="file://${esc(kImg(im[1]))}">`); return; }
    cnt++;
    if (ck) out.push(`<label class="kck${/[xX]/.test(ck[2]) ? ' done' : ''}"><input type="checkbox" data-kck="${i}"${/[xX]/.test(ck[2]) ? ' checked' : ''}> <span>${esc(ck[3])}</span></label>`);
    else out.push(`<div class="kl">${esc(ln.replace(/^#+\s*/, ''))}</div>`);
  });
  return out.join('') || '<span class="sub">（本文なし）</span>';
}
function drawCards(full) {
  const q = keepPrefs.q.trim().toLowerCase(), f = keepPrefs.f;
  if (f === 'trash') { api.trashList().then(l => { trashCache = l; if (cur && cur.k === 'cards' && keepPrefs.f === 'trash') drawBoard(); }); }
  if (full || !$('.keep')) {
    $('#pane').innerHTML = `<div class="keep"><div class="ktop"><input class="ksearch" id="k-q" placeholder="カードを探す" value="${esc(keepPrefs.q)}">
      ${[['all', '🗒 すべて'], ['d', '💻'], ['p', '📜'], ['u', '📥'], ['arch', '🗄'], ['trash', '🗑']].map(([k, l]) => `<span class="kchip" data-kf="${k}" title="${{ all: 'すべて', d: 'デジタル', p: '紙', u: 'IDなし', arch: 'アーカイブ', trash: 'ごみ箱' }[k]}">${l}</span>`).join('')}
      <select id="k-sort"><option value="fz"${sortBy === 'fz' ? ' selected' : ''}>番号順</option><option value="created"${sortBy === 'created' ? ' selected' : ''}>作成順</option><option value="updated"${sortBy === 'updated' ? ' selected' : ''}>更新順</option></select><span class="kchip" id="k-dir"></span></div>
      <div class="kadd" id="k-add"><input class="kt" id="k-t" placeholder="タイトル"><input id="k-b1" placeholder="メモを入力…"><textarea id="k-b" placeholder="メモを入力…"></textarea><div class="ktools"><span data-ka="check" title="チェックリスト">☑</span><span data-ka="img" title="画像">🖼</span></div></div>
      <div class="kboard" id="k-board"></div><div id="kover" hidden></div></div>`;
    renderTabs(); renderList();
  }
  document.querySelectorAll('.keep [data-kf]').forEach(c => c.classList.toggle('on', c.dataset.kf === f));
  $('#k-dir').textContent = sortDir === 'asc' ? '↑' : '↓';
  drawBoard();
}
function drawBoard() {
  const q = keepPrefs.q.trim().toLowerCase(), f = keepPrefs.f;
  if (f === 'trash') {
    const l = trashCache.filter(t => !q || [t.title, t.body, t.id].join('\n').toLowerCase().includes(q));
    $('#k-board').innerHTML = l.map(t => `<div class="kcard" style="background:#f6f6f8"><div class="kh">${esc(t.title || t.body.split('\n')[0] || '（無題）')}</div><div class="kb"><div class="kl">${esc(t.body.slice(0, 160))}</div></div><div class="km"><span>${esc(t.deleted)}</span><button class="mini" data-krestore="${esc(t.file)}">戻す</button></div></div>`).join('') || '<div class="none">ごみ箱は空です</div>';
    return;
  }
  let list = notes.filter(n => f === 'arch' ? n.archived : !n.archived && (f === 'all' || (f === 'd' ? n.s === 'd' && !n.noid : f === 'p' ? n.s === 'p' && !n.noid : n.noid)));
  if (q) list = list.filter(n => [n.id, n.title || '', n.body, n.keywords.join(' ')].join('\n').toLowerCase().includes(q));
  list = sortNotes(list, f === 'u' ? 'u' : 'd');
  const pinned = list.filter(n => n.pinned), rest = list.filter(n => !n.pinned);
  const card = n => {
    const long = (n.body || '').length > 260 || (n.body || '').split('\n').length > 10;
    return `<div class="kcard" data-s="${n.s}" data-id="${esc(n.id)}" style="background:${KCOL[n.color] || '#fff'}">
      <span class="kpin${n.pinned ? ' on' : ''}" data-kpin title="固定">📌</span>
      ${(n.title || firstLine(n)) ? `<div class="kh">${icon(n) ? icon(n) + ' ' : ''}${esc(titleOf(n))}</div>` : ''}<div class="kb">${kBody(n, 9)}</div>${long ? '<span class="kmore">…</span>' : ''}
      <div class="km"><span>${n.noid ? '📥' : n.s === 'p' ? '📜 ' + esc(n.id) : '💻 ' + esc(n.id)}</span>${n.keywords.map(k => `<span class="kw">${esc(k)}</span>`).join('')}</div>
      <div class="kact"><span data-kcolor title="色">🎨</span><span data-karch title="${n.archived ? 'アーカイブから戻す' : 'アーカイブ'}">🗄</span><span data-kopen title="ノートの画面で開く">↗</span><span data-kdel title="削除">🗑</span></div></div>`;
  };
  $('#k-board').innerHTML = (pinned.length ? `<div class="ksec">📌 固定</div>${pinned.map(card).join('')}${rest.length ? '<div class="ksec">その他</div>' : ''}` : '') + rest.map(card).join('') || '<div class="none">カードがありません。上の欄から、すぐ書けます</div>';
}
// カードをその場でふくらませて編集（保存ボタンは無い。書くたびに自動保存。外を押す・Esc で閉じる）
function kExpand(n, fromEl) {
  const ov = $('#kover'), r = fromEl.getBoundingClientRect(), box = $('#pane').getBoundingClientRect();
  ov.hidden = false; ov.innerHTML = `<div class="kback"></div><div class="kedit" style="background:${KCOL[n.color] || '#fff'};transform-origin:${r.left + r.width / 2 - box.left}px ${r.top - box.top}px">
    <input class="kt" id="ke-t" placeholder="タイトル" value="${esc(n.title || '')}" ${n.kind && n.kind !== 'text' ? 'disabled' : ''}>
    <textarea id="ke-b" placeholder="メモ…" ${n.kind && n.kind !== 'text' ? 'readonly' : ''}>${esc(n.body || '')}</textarea>
    <div class="klabels" id="ke-l"></div>
    <div class="ktools2"><span data-ke="pin" title="固定">📌</span><span data-ke="color" title="色">🎨</span><span data-ke="check" title="チェックリスト">☑</span><span data-ke="img" title="画像">🖼</span><span data-ke="arch" title="アーカイブ">🗄</span><span data-ke="copy" title="コピー">📋</span><span data-ke="open" title="ノートの画面で開く">↗</span><span data-ke="del" title="削除">🗑</span><span class="grow"></span><small class="sub">${n.noid ? 'IDなし' : esc(n.id)}</small></div>
    <div class="kpal" id="ke-pal" hidden>${Object.entries(KCOL).map(([k, c]) => `<i data-kc="${k}" style="background:${c}" class="${n.color === k ? 'on' : ''}"></i>`).join('')}</div></div>`;
  const ed = ov.querySelector('.kedit'), t = $('#ke-t'), b = $('#ke-b'), text = !(n.kind && n.kind !== 'text');
  const fit = () => { b.style.height = 'auto'; b.style.height = Math.min(b.scrollHeight + 4, innerHeight * 0.55) + 'px'; };
  const labels = () => { $('#ke-l').innerHTML = n.keywords.map(k => `<span class="kw">${esc(k)}${text ? `<b data-klx="${esc(k)}"> ×</b>` : ''}</span>`).join('') + (text ? '<input id="ke-kw" placeholder="＋ ラベル" size="8">' : ''); };
  const save = () => { if (text) { n.title = t.value.trim(); n.body = b.value; saveNote(n); } };
  t.oninput = save; b.oninput = () => { save(); fit(); }; fit(); labels(); (b.value ? b : t).focus();
  const close = async () => { ov.hidden = true; ov.innerHTML = ''; document.removeEventListener('keydown', onKey, true); await flush(); if (cur && cur.k === 'cards') drawBoard(); };
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  ov.onclick = async e => {
    const x = e.target; if (x.classList.contains('kback')) return close();
    const k = x.dataset.klx; if (k) { n.keywords = n.keywords.filter(y => y !== k); saveNote(n); return labels(); }
    if (x.dataset.kc !== undefined) { n.color = x.dataset.kc; saveNote(n); ed.style.background = KCOL[n.color] || '#fff'; $('#ke-pal').hidden = true; return; }
    const a = x.dataset.ke; if (!a) return;
    if (a === 'color') $('#ke-pal').hidden = !$('#ke-pal').hidden;
    if (a === 'pin') { n.pinned = !n.pinned; saveNote(n); toast(n.pinned ? '固定しました' : '固定を外しました'); }
    if (a === 'arch') { n.archived = !n.archived; saveNote(n); toast(n.archived ? 'アーカイブしました' : 'アーカイブから戻しました'); close(); }
    if (a === 'copy') { navigator.clipboard.writeText([n.title, n.body].filter(Boolean).join('\n\n')); toast('コピーしました'); }
    if (a === 'open') { await close(); openNote(n.s, n.id); }
    if (a === 'del') { await close(); await deleteNotes([{ s: n.s, id: n.id }]); if (cur && cur.k === 'cards') drawBoard(); }
    if (a === 'check' && text) { const p = b.selectionStart, at = b.value.lastIndexOf('\n', p - 1) + 1; b.value = b.value.slice(0, at) + '- [ ] ' + b.value.slice(at); b.setSelectionRange(p + 6, p + 6); save(); fit(); b.focus(); }
    if (a === 'img' && text) pick(false, async f => { const [nm] = await api.addFiles([{ name: f[0].name || 'image.png', bytes: await (await shrinkBlob(f[0])).arrayBuffer() }]); b.value += (b.value && !b.value.endsWith('\n') ? '\n' : '') + `![](${encRel(nm)})\n`; save(); fit(); });
  };
  ov.onkeydown = e => { if (e.target.id === 'ke-kw' && e.key === 'Enter' && !e.isComposing) { const v = e.target.value.trim(); if (v && !n.keywords.includes(v)) { n.keywords.push(v); saveNote(n); } labels(); $('#ke-kw').focus(); } };
  ov.addEventListener('paste', async e => { const f = [...(e.clipboardData && e.clipboardData.files || [])].find(x => x.type.startsWith('image/')); if (f && text) { e.preventDefault(); const [nm] = await api.addFiles([{ name: 'image.png', bytes: await (await shrinkBlob(f)).arrayBuffer() }]); b.value += `\n![](${encRel(nm)})\n`; save(); fit(); } });
}
const shrinkBlob = async f => f;   // 画像は、そのまま取り込む
document.addEventListener('click', async e => {
  if (!cur || cur.k !== 'cards' || !e.target.closest('.keep, #kover')) return;
  if (e.target.closest('#kover')) return;   // ふくらんだカードの中は、上の処理
  const kf = e.target.closest('[data-kf]'); if (kf) { keepPrefs.f = kf.dataset.kf; return drawCards(false); }
  if (e.target.closest('#k-dir')) { sortDir = sortDir === 'asc' ? 'desc' : 'asc'; savePrefs(); return drawCards(false); }
  const rs = e.target.closest('[data-krestore]'); if (rs) { const st = await api.trashRestore(rs.dataset.krestore); if (st) { applyState(st); toast('戻しました'); trashCache = await api.trashList(); drawBoard(); } return; }
  const add = $('#k-add');
  if (e.target.closest('#k-b1')) { add.classList.add('open'); $('#k-b').focus(); return; }
  if (add.classList.contains('open') && e.target.closest('[data-ka]')) {
    const a = e.target.closest('[data-ka]').dataset.ka, b = $('#k-b');
    if (a === 'check') { b.value += (b.value && !b.value.endsWith('\n') ? '\n' : '') + '- [ ] '; b.focus(); }
    if (a === 'img') pick(false, async f => { const [nm] = await api.addFiles([{ name: f[0].name || 'image.png', bytes: await f[0].arrayBuffer() }]); b.value += (b.value && !b.value.endsWith('\n') ? '\n' : '') + `![](${encRel(nm)})\n`; });
    return;
  }
  // 新しいメモの欄の外を押したら、書いてあれば自動で保存して閉じる（Keep と同じ。ボタンは無い）
  if (add.classList.contains('open') && !e.target.closest('#k-add')) await commitAdd();
  const c = e.target.closest('.kcard'); if (!c || !c.dataset.id) return;
  const n = get(c.dataset.s, c.dataset.id); if (!n) return;
  e.stopImmediatePropagation();
  if (e.target.closest('[data-kpin]')) { n.pinned = !n.pinned; saveNote(n); return drawBoard(); }
  if (e.target.closest('[data-karch]')) { n.archived = !n.archived; saveNote(n); toast(n.archived ? 'アーカイブしました' : 'アーカイブから戻しました'); return drawBoard(); }
  if (e.target.closest('[data-kcolor]')) { const keys = Object.keys(KCOL); n.color = keys[(keys.indexOf(n.color || '') + 1) % keys.length]; saveNote(n); return drawBoard(); }
  if (e.target.closest('[data-kdel]')) { await deleteNotes([{ s: n.s, id: n.id }]); if (cur && cur.k === 'cards') drawBoard(); return; }
  if (e.target.closest('[data-kopen]')) return openNote(n.s, n.id);
  const ck = e.target.closest('[data-kck]'); if (ck) { const ls = n.body.split('\n'), i = +ck.dataset.kck; ls[i] = ls[i].replace(/\[( |x|X)\]/, m => m === '[ ]' ? '[x]' : '[ ]'); n.body = ls.join('\n'); saveNote(n); return drawBoard(); }
  kExpand(n, c);
}, true);
async function commitAdd() {
  const add = $('#k-add'); if (!add) return; const t = $('#k-t').value.trim(), b = $('#k-b').value;
  add.classList.remove('open'); $('#k-t').value = ''; $('#k-b').value = '';
  if (!t && !b.trim()) return;
  const n = await api.createNote({ kind: 'text', body: b, title: t, created: L.now() }); notes.push(n); await refreshDiaries(); drawBoard();
}
document.addEventListener('input', e => { if (e.target.id === 'k-q') { keepPrefs.q = e.target.value; drawBoard(); } });
document.addEventListener('change', e => { if (e.target.id === 'k-sort') { sortBy = e.target.value; savePrefs(); drawBoard(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && cur && cur.k === 'cards' && $('#k-add') && $('#k-add').classList.contains('open') && $('#kover').hidden) { e.preventDefault(); commitAdd(); } });

// ===== 似たノート（新しいタブ）。本文の言葉・キーワード・リンク・同じトピックIndex。度数で上から。並べ替え・絞り込み =====
let simP = null, simSig = '';
function startSimilar() {
  const base = selMode && picked.size ? [...picked].map(k => get(k[0], k.slice(2))).filter(Boolean) : cur && cur.k === 'note' ? [get(cur.s, cur.id)].filter(Boolean) : [];
  if (!base.length) return toast('似たノートを探すノートを、開くか選んでください');
  if (selMode) { selMode = false; picked.clear(); renderList(); }
  newTab = true; openSimilar(base.map(n => ({ s: n.s, id: n.id })));
}
function simRows(st, base) {
  const sig = notes.length + ':' + notes.reduce((m, n) => n.updated > m ? n.updated : m, '') + ':' + topics.length;
  if (!simP || simSig !== sig) { simP = SM.prepare(notes, topics, L.mergeTopic); simSig = sig; }
  let rows = SM.rank(simP, notes, base, { bases: st.bases, multi: st.multi });
  const f = st.f, baseSet = new Set(base.map(n => n.s + ':' + n.id));
  rows = rows.filter(r => { const n = r.note, kind = n.noid ? 'u' : n.s;
    if (!f.kinds[kind]) return false;
    if (f.kw && !n.keywords.includes(f.kw)) return false;
    const day = (n.created || '').slice(0, 10); if (f.from && day < f.from) return false; if (f.to && day > f.to) return false;
    if (f.noDesc && base.some(b => !b.noid && !n.noid && n.s === b.s && L.fzSubtree([n.id], b.id).length)) return false;
    if (f.noLinked && base.some(b => { const l = simP.links.get(b.s + ':' + b.id) || new Set(); return l.has(n.s + ':' + n.id) || (simP.links.get(n.s + ':' + n.id) || new Set()).has(b.s + ':' + b.id); })) return false;
    return true; });
  const sg = st.dir === 'asc' ? 1 : -1, by = st.sort;
  rows.sort((a, b) => sg * (by === 'total' ? a.total - b.total : SM.BASES[by] ? a.score[by] - b.score[by] : by === 'fz' ? L.cmpId(a.note.id, b.note.id) : by === 'updated' ? (a.note.updated || '').localeCompare(b.note.updated || '') : (a.note.created || '').localeCompare(b.note.created || '')) || b.total - a.total);
  return rows;
}
function openSimilar(baseKeys, keep) {
  cur = place({ k: 'similar', base: baseKeys }, keep); mode = 'notes';
  cur.st = cur.st || { bases: { text: true, kw: true, link: true, topic: true }, multi: 'avg', sort: 'total', dir: 'desc', f: { kinds: { d: true, p: true, u: true }, kw: '', from: '', to: '', noDesc: false, noLinked: false } };
  drawSimilar(true);
}
function drawSimilar(full) {
  const st = cur.st, base = cur.base.map(b => get(b.s, b.id)).filter(Boolean); if (!base.length) return;
  const rows = simRows(st, base), allKw = [...new Set(notes.flatMap(n => n.keywords))].sort((a, b) => a.localeCompare(b, 'ja'));
  const ck = (k, on, l, attr) => `<label class="smck"><input type="checkbox" ${attr}="${k}"${on ? ' checked' : ''}> ${l}</label>`;
  const bar = `<div class="smbar"><div class="smrow"><b>基準</b> ${base.map(n => `<span class="chip ${n.s}" data-s="${n.s}" data-id="${esc(n.id)}">${esc(n.noid ? 'IDなし' : n.label || (n.s === 'p' ? '紙' : '') + n.id)} ${esc(titleOf(n).slice(0, 14))}</span>`).join('')}
      ${base.length > 1 ? `<span class="sub">複数: </span><select data-sm="multi"><option value="avg"${st.multi === 'avg' ? ' selected' : ''}>全体の平均</option><option value="any"${st.multi === 'any' ? ' selected' : ''}>どれかに似ている</option><option value="all"${st.multi === 'all' ? ' selected' : ''}>全部に似ている</option></select>` : ''}</div>
    <div class="smrow"><b>基準にする</b> ${Object.entries(SM.BASES).map(([k, l]) => ck(k, st.bases[k], l, 'data-smb')).join('')}</div>
    <div class="smrow"><b>並べ替え</b> <select data-sm="sort">${[['total', '総合の度数'], ['text', '本文の言葉'], ['kw', 'キーワード'], ['link', 'リンク'], ['topic', 'トピックIndex'], ['fz', '番号'], ['created', '作成日'], ['updated', '更新日']].map(([k, l]) => `<option value="${k}"${st.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select><button class="mini" data-sm="dir">${st.dir === 'asc' ? '↑ 昇順' : '↓ 降順'}</button></div>
    <div class="smrow"><b>絞り込み</b> ${ck('d', st.f.kinds.d, '💻', 'data-smk')}${ck('p', st.f.kinds.p, '📜', 'data-smk')}${ck('u', st.f.kinds.u, '📥', 'data-smk')}
      <select data-sm="kw"><option value="">キーワード: すべて</option>${allKw.map(k => `<option${st.f.kw === k ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select>
      <span class="sub">作成日</span><input type="date" data-sm="from" value="${st.f.from}"><span class="sub">〜</span><input type="date" data-sm="to" value="${st.f.to}">
      ${ck('noDesc', st.f.noDesc, '基準の子孫は除く', 'data-smf')}${ck('noLinked', st.f.noLinked, 'リンク済みは除く', 'data-smf')}</div></div>`;
  const list = rows.slice(0, 300).map(r => { const n = r.note; return `<div class="smrow2 item note" data-s="${n.s}" data-id="${esc(n.id)}"><div class="smtop"><b>${n.noid ? '📥' : (n.s === 'p' ? '📜 ' : '💻 ') + esc(n.id)}</b> <span class="smt">${esc(titleOf(n))}</span><span class="smp" title="総合の度数">${Math.round(r.total * 100)}%</span></div>
    <div class="smmeter"><i style="width:${Math.round(r.total * 100)}%"></i></div><div class="smre">${Object.entries(SM.BASES).filter(([k]) => st.bases[k] && r.score[k] > 0.005).map(([k, l]) => `<span class="smb smb-${k}">${l} ${Math.round(r.score[k] * 100)}%</span>`).join('')} ${r.reasons.slice(0, 3).map(x => `<span class="sub">${esc(x.t)}</span>`).join('　')}</div></div>`; }).join('');
  $('#pane').innerHTML = `<div class="similar"><h2>≈ 似たノート <small class="sub">${rows.length} 件</small></h2>${bar}<div class="smlist">${list || '<div class="none">似たノートは見つかりません。基準や絞り込みを変えてください</div>'}</div></div>`;
  renderTabs(); renderList();
}
$('#pane').addEventListener('change', e => {
  if (!cur || cur.k !== 'similar') return; const st = cur.st, t = e.target;
  if (t.dataset.smb) st.bases[t.dataset.smb] = t.checked; else if (t.dataset.smk) st.f.kinds[t.dataset.smk] = t.checked; else if (t.dataset.smf) st.f[t.dataset.smf] = t.checked;
  else if (t.dataset.sm === 'multi') st.multi = t.value; else if (t.dataset.sm === 'sort') { st.sort = t.value; st.dir = ['fz'].includes(t.value) ? 'asc' : 'desc'; } else if (t.dataset.sm === 'kw') st.f.kw = t.value;
  else if (t.dataset.sm === 'from') st.f.from = t.value; else if (t.dataset.sm === 'to') st.f.to = t.value; else return;
  drawSimilar();
});
$('#pane').addEventListener('click', e => {
  if (!cur || cur.k !== 'similar') return;
  if (e.target.dataset.sm === 'dir') { cur.st.dir = cur.st.dir === 'asc' ? 'desc' : 'asc'; return drawSimilar(); }
}, true);

// ===== 曼荼羅ビュー =====
function openMandala(keep, center) {
  cur = place({ k: 'mandala' }, keep); mode = 'notes';
  cur.m = MD.init(cur.m);
  if (center) { if (cur.m.center) cur.m.hist.push(cur.m.center); cur.m.center = center; cur.m.sel = 0; cur.m.page = 0; cur.m.fwd = []; }
  if (!cur.m.center || !get(cur.m.center.s, cur.m.center.id)) {
    const n = (lastNote && get(lastNote.s, lastNote.id) && !get(lastNote.s, lastNote.id).noid) ? get(lastNote.s, lastNote.id) : notes.filter(x => !x.noid && x.s === 'd').sort((a, b) => L.cmpId(a.id, b.id))[0];
    cur.m.center = n ? { s: n.s, id: n.id } : null;
  }
  drawMandala();
}
function drawMandala() {
  const st = cur.m;
  $('#pane').innerHTML = MD.html(notes, st, titleOf, get);
  const pv = $('#mprev'), sn = MD.selected(notes, st), n = sn && get(sn.s, sn.id);
  if (pv) pv.innerHTML = n ? `<h3>${esc((n.s === 'p' ? '紙 ' : '') + n.id)} ${esc(titleOf(n))}</h3>${esc(n.body || '')}` : '<span class="sub">空きマス。Enter か ＋ で、ここに新しいノートを作ります</span>';
  const m = $('.mandala'); if (m) m.focus({ preventScroll: true });
  renderTabs(); renderList();
}
const MPOS = [4, 0, 1, 2, 5, 8, 7, 6, 3];   // マス番号（0=中心, 1〜8）→ 3×3 の位置
function mandalaKey(e) {
  const st = cur.m; if (!st || !st.center) return false;
  const k = e.key, set = fn => { fn(); drawMandala(); return true; };
  const move = (dx, dy) => set(() => { const p = MPOS[st.sel], x = Math.max(0, Math.min(2, p % 3 + dx)), y = Math.max(0, Math.min(2, Math.floor(p / 3) + dy)); st.sel = MPOS.indexOf(y * 3 + x); });
  const recenter = c => set(() => { st.hist.push(st.center); st.fwd = []; st.center = { s: c.s, id: c.id }; st.sel = 0; st.page = 0; });
  if (['h', 'ArrowLeft'].includes(k)) return move(-1, 0);
  if (['l', 'ArrowRight'].includes(k)) return move(1, 0);
  if (['k', 'ArrowUp'].includes(k)) return move(0, -1);
  if (['j', 'ArrowDown'].includes(k)) return move(0, 1);
  if (/^[0-8]$/.test(k)) return set(() => { st.sel = +k; });
  if (k === 'Tab') return set(() => { st.sel = (st.sel + (e.shiftKey ? 8 : 1)) % 9; });
  if (k === '[' || k === ']') return set(() => { const r = MD.ring(notes, st, st.center, st.page); st.page = (st.page + (k === ']' ? 1 : r.pages - 1)) % r.pages; st.sel = 0; });
  if (k === 'Enter') { const c = MD.selected(notes, st); if (!c) { const id = (() => { let x = L.child(st.center.id); while (get(st.center.s, x)) x = L.sibling(x); return x; })(); create(st.center.s, id); return true; } if (st.sel === 0) return openNote(c.s, c.id) || true; return recenter(c); }
  if (k === ' ') { const c = MD.selected(notes, st); if (c) openNote(c.s, c.id); return true; }
  if (k === 'b' || k === 'Backspace') return set(() => { const p = st.hist.pop(); if (p) { st.fwd.push(st.center); st.center = p; st.sel = 0; st.page = 0; } });
  if (k === 'B') return set(() => { const p = st.fwd.pop(); if (p) { st.hist.push(st.center); st.center = p; st.sel = 0; st.page = 0; } });
  if (k === 'f') return set(() => { st.big = !st.big; });
  if (k === 'p') return set(() => { st.preview = !st.preview; });
  if (k === '?') { const h = $('#mhelp'); if (h) h.hidden = !h.hidden; return true; }
  if (MD.MODES[k]) return set(() => { st.mode = k; st.sel = 0; st.page = 0; });
  return false;
}
document.addEventListener('keydown', e => {
  if (!cur || cur.k !== 'mandala' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || $('#modal').style.display === 'flex') return;
  const ae = document.activeElement; if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
  if (mandalaKey(e)) e.preventDefault();
}, true);
document.addEventListener('click', e => {
  if (!cur || cur.k !== 'mandala' || !e.target.closest('.mandala')) return;
  const st = cur.m, mm = e.target.closest('[data-mm]'), c = e.target.closest('.mc');
  if (mm) { st.mode = mm.dataset.mm; st.sel = 0; st.page = 0; return drawMandala(); }
  if (e.target.closest('[data-mf]')) { st.big = !st.big; return drawMandala(); }
  if (e.target.closest('[data-mp]')) { st.preview = !st.preview; return drawMandala(); }
  if (e.target.closest('[data-mb]')) { mandalaKey({ key: 'b' }); return; }
  if (e.target.closest('[data-mq]')) { const h = $('#mhelp'); if (h) h.hidden = !h.hidden; return; }
  if (!c) return;
  e.stopImmediatePropagation();
  const i = +c.dataset.i;
  if (c.dataset.new) { create(st.center.s, c.dataset.new); return; }
  // 大きい（9×9）で周りの曼荼羅のマスを押したら、そのノートを中心に。それ以外は、まず選ぶ → もう一度で中心に
  if (c.dataset.id) {
    if (st.sel === i && !c.closest('.mbig>.mg.sub')) { if (i === 0) return openNote(c.dataset.s, c.dataset.id); st.hist.push(st.center); st.fwd = []; st.center = { s: c.dataset.s, id: c.dataset.id }; st.sel = 0; st.page = 0; return drawMandala(); }
    if (c.closest('.mbig>.mg.sub')) { st.hist.push(st.center); st.fwd = []; st.center = { s: c.dataset.s, id: c.dataset.id }; st.sel = 0; st.page = 0; return drawMandala(); }
    st.sel = i; drawMandala();
  }
}, true);
function openGraph(keep) {
  GR.unmount($('#pane'));
  cur = place({ k: 'graph' }, keep); mode = 'notes';
  cur.gs = cur.gs || {};   // Link map / Tree map・線の長さ・固定（タブに覚える）
  const rootKey = lastNote ? lastNote.s + ':' + lastNote.id : null;
  GR.mount($('#pane'), { notes, titleOf, rootKey, state: cur.gs, onOpen: (s, id) => openNote(s, id),
    onMenu: (node, e) => popMenu(e, [['開く', () => openNote(node.s, node.nid)], ['新しいタブで開く', () => { bgOpen = true; try { openNote(node.s, node.nid); } finally { bgOpen = false; } }]]) });
  renderTabs(); renderList();
}
function openTopic(name, tmode = 'view', keep) {
  const t = topics.find(x => x.name === name); if (!t) return;
  if (bgOpen) { place({ k: 'topic', name, mode: tmode }, false); return; }   // ホイールクリック: 背景の新しいタブで開く。いまのタブは動かない
  cur = place({ k: 'topic', name, mode: tmode }, keep); cur.mode = tmode; mode = 'notes';
  if (!inPreview) decided = { k: 'topic', name };
  if (!inPreview && !$('#q').value && t.entry) tab = t.entry.s === 'p' ? 'p' : 'd';   // 一覧を、そのトピックIndex のあるタブに
  const { rows, stars, refs, chats } = L.mergeTopic(t), e = t.entry;
  let body;
  if (tmode === 'edit') body = `<div class="sub">1行に「キーワード ID ID …」。ID のあとに (p) で紙、(d) でデジタル（書かなければ、入口のノートと同じ側）。(番号) でノートの中の場所（例: PKM 1a 3(p) 1g(2)）。ID の前に * を付けるとそのIDの上に赤い点（例: PKM *1 1a）。+ で始めると別のトピックIndexへの案内（例: +GUI）。「+名前 ID」なら、その ID へのリンク付きの星（例: +hoge 1）。@名前 は、チャットメモのトピックへの案内（例: @夢。メモ自体は書きません）。</div>
      <div class="ed" id="ed-t"></div>`;
  else if (tmode === 'conf') body = `<div class="conf">
      <label>名前 <input id="t-name" value="${esc(t.name)}"></label>
      <label>入口 <select id="t-s"><option value="d"${e && e.s === 'd' ? ' selected' : ''}>デジタル</option><option value="p"${e && e.s === 'p' ? ' selected' : ''}>紙</option></select>
        <input id="t-id" value="${e ? esc(e.id) : ''}" style="width:90px"></label>
      <label>点のキーワード <input id="t-kw" list="t-kws" value="${esc(t.keyword || '')}" placeholder="キーワード（空なら点なし）"><datalist id="t-kws">${globalIndex().filter(([, v]) => v.d.length + v.p.length >= 2).map(([k]) => `<option value="${esc(k)}">`).join('')}</datalist></label>
      <div class="sub">そのキーワードの ID（GUI 1 2 3 …）のうち、上の入口のIDの真上に赤い点が付きます（押すとこのトピックIndex へ）。IDが2つ以上のキーワードだけ。1つのキーワードに1つ</div>
      <div class="row"><button data-act="tsave" class="p">決定</button><button data-act="tcancel">やめる</button>
        <span class="grow"></span><button data-act="tdel" class="danger">このトピックIndexを削除</button></div></div>`;
  else body = `<table class="ti">${rows.map(r => `<tr><td>${esc(r.kw)}</td><td>${rowChips(r)}</td></tr>`).join('') || '<tr><td class="none">まだ空です。「編集」で書きます</td></tr>'}</table>
      ${stars.map(x => `<div class="star">★ ${tchip(x)}</div>`).join('')}${chats.map(x => `<div class="star">💬 <span class="chip t" data-cchat="${esc(x)}">${esc(x)}</span></div>`).join('')}${refs.map(x => `<div class="star">★ ${esc(x.label)} ${chip(x.s, x.id)}</div>`).join('')}`;
  // 逆方向（上に出す）: このトピックIndexの入口を載せている Index・このIndexを + で案内している Index（引用できるのは Index だけ）
  const back = topics.filter(o => o !== t && (L.mergeTopic(o).stars.includes(t.name) || (e && L.mergeTopic(o).rows.some(r => r[e.s].some(x => L.splitAnchor(x).id === e.id))))).sort((x, y) => x.name.localeCompare(y.name, 'ja'));
  $('#pane').innerHTML = `
    ${back.length ? `<div class="backidx">↑ ${back.map(o => tchip(o.name)).join('')}</div>` : ''}
    <div class="row">
      <h2>${esc(stripId(name))}</h2>
      <span class="sub">入口</span>${e ? chip(e.s, e.id) : '<span class="sub">なし</span>'}
      <span class="grow"></span>
      ${tmode === 'conf' ? '' : `<button data-act="tconf">入口・名前</button>
      <button data-act="tedit" class="${tmode === 'edit' ? 'p' : ''}">${tmode === 'edit' ? '完了' : '編集'}</button>`}
    </div>${body}`;
  if (tmode === 'edit') { // 1 つの欄。紙は ID(p)、デジタルは ID（入口が紙のトピックIndex なら、紙が ID、デジタルが ID(d)）
    const def = L.defOf(t), v = editor($('#ed-t'), L.topicText(t), 'topic', def, x => { t.text = x; saveTopic(t); }, `PKM 1a 3(p)`);
    v.focus();
  }
  if (tmode === 'conf') $('#t-id').focus();
  renderTabs(); renderList(); if (!$('#q').value) centerOn();   // 開いたトピックIndex の行が、一覧の真ん中に（青い枠）
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
const getDiary = (date, kind = '日記') => diaries.find(d => d.date === date && (d.kind || '日記') === kind);
const upsertDiary = r => { const d = getDiary(r.date, r.kind); if (d) { Object.assign(d, r); return d; } diaries.push(r); return r; };
const setKind = k => { curKind = k; try { localStorage.setItem('pkm-kind', k); } catch { } };
function diaryList() {
  if (!records.some(r => r.name === curKind)) setKind('日記');
  const kind = curKind, mine = diaries.filter(d => (d.kind || '日記') === kind);
  const dayRow = d => `<div class="day${cur && cur.k === 'diary' && cur.date === d.date && (cur.kind || '日記') === kind ? ' on' : ''}" data-diary="${d.date}" data-kind="${esc(kind)}"><span>${d.date.slice(8)}（${L.weekday(d.date)}）</span><small>${esc(d.title)}${d.pages.length ? ' 📷' : ''}</small></div>`;
  const tree = L.diaryTree(mine.map(d => d.date));
  if (sortDir === 'asc') { tree.reverse(); for (const g of tree) { if (g.months) { g.months.reverse(); for (const m of g.months) m.days.reverse(); } else g.days.reverse(); } }   // 昇順: 古い日から
  const grp = (label, inner, open) => `<details${open ? ' open' : ''}><summary>${label}</summary>${inner}</details>`;
  const days = ds => ds.map(x => dayRow(getDiary(x, kind))).join('');
  let first = true;
  const html = tree.map(g => {
    const open = first; first = false;
    return grp(g.label, g.months ? g.months.map((m, i) => grp(m.label, days(m.days), open && i === 0)).join('') : days(g.days), open);
  }).join('');
  const chips = records.map(r => `<span class="kchip${r.name === kind ? ' on' : ''}" data-kindpick="${esc(r.name)}">${esc(r.name)}</span>`).join('') + '<span class="kchip" data-kindmanage title="記録の種類を足す・名前を変える・まとめる・消す">＋ ⚙</span>';
  return `<div id="dlist"><div class="kinds">${chips}</div><div class="dtop"><button class="p" id="d-today">今日の${esc(kind)}</button><input type="date" id="d-pick" value="${L.todayStr()}"><button id="d-make" title="この日の${esc(kind)}を開く（無ければ作る）">開く</button></div>${sortBar(true)}${html || `<div class="none">${esc(kind)}はまだありません</div>`}</div>`;
}
$('#list').addEventListener('click', e => {
  if (e.target.id === 'd-today') openDiary(L.todayStr());
  if (e.target.id === 'd-make') { const v = $('#d-pick').value; if (L.isDate(v)) openDiary(v); }
  const kp = e.target.closest('[data-kindpick]'); if (kp) { setKind(kp.dataset.kindpick); renderList(); }
  if (e.target.closest('[data-kindmanage]')) recordsDialog();
});
// 記録の種類（日記・夢・ビジネス…）を管理する: 足す・上位・名前を変える・まとめる・消す
function recordsDialog() {
  const names = () => records.map(r => r.name);
  const draw = () => {
    $('#modal .box').innerHTML = `<h3>記録の種類</h3><div class="sub">日記のように、日ごとのノートを書く種類です。上位を決めると、その日の上位のノートの上に、下位へのリンク（DailyNotes）が並びます。上位を変えても、もう作った日は変わりません（これから作る日だけ）。</div>
      <table class="ti">${records.map(r => `<tr><td><b>${esc(r.name)}</b></td><td>${r.name === '日記' ? '<span class="sub">いつもある</span>' : `上位 <select data-rpar="${esc(r.name)}"><option value="">なし</option>${names().filter(n => n !== r.name).map(n => `<option${r.parent === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
        <button class="mini" data-rren="${esc(r.name)}">名前</button><button class="mini" data-rmer="${esc(r.name)}">まとめる</button><button class="mini danger" data-rdel="${esc(r.name)}">消す</button>`}</td></tr>`).join('')}</table>
      <div class="row"><input id="r-new" placeholder="新しい種類（例: 夢）" style="flex:1"><button class="p" id="r-add">足す</button></div><div class="row"><button id="r-close">閉じる</button></div>`;
    $('#modal').style.display = 'flex';
  };
  draw();
  const apply = async (op, ...a) => { await flush(); const r = await api.recordOp(op, ...a); if (r === false) { alert('できませんでした（名前が使えない・すでにある・輪になる、など）'); return false; } const st = await api.state(); applyState(st); diaries = st.diaries; records = st.records; return true; };
  $('#modal').onclick = async e => {
    const t = e.target;
    if (t.id === 'r-close') { $('#modal').style.display = 'none'; return renderList(); }
    if (t.id === 'r-add') { const n = $('#r-new').value.trim(); if (n && await apply('addRecord', n)) draw(); return; }
    if (t.dataset.rren) { const to = prompt(`「${t.dataset.rren}」の新しい名前（その種類の日のノートも、まとめて変わります）`, t.dataset.rren); if (to && to.trim() !== t.dataset.rren && await apply('renameRecord', t.dataset.rren, to)) { if (curKind === t.dataset.rren) setKind(to.trim()); draw(); } return; }
    if (t.dataset.rmer) { const into = prompt(`「${t.dataset.rmer}」を、どの種類にまとめますか？（${names().filter(n => n !== t.dataset.rmer).join('・')}）\\n同じ日のノートは、時刻の順にまざります。`, ''); if (into && names().includes(into) && await apply('mergeRecords', t.dataset.rmer, into)) { if (curKind === t.dataset.rmer) setKind(into); draw(); } return; }
    if (t.dataset.rdel) { const n = diaries.filter(d => d.kind === t.dataset.rdel).length; if (confirm(`「${t.dataset.rdel}」を消しますか？\\n${n} 日分のノートも、ごみ箱（.trash）に移ります。`) && await apply('deleteRecord', t.dataset.rdel)) { if (curKind === t.dataset.rdel) setKind('日記'); draw(); } return; }
  };
  $('#modal').onchange = async e => { const p = e.target.dataset.rpar; if (p !== undefined) await apply('setRecordParent', p, e.target.value); };
  $('#modal').onkeydown = e => { if (e.key === 'Escape') { $('#modal').style.display = 'none'; renderList(); } };
}
async function openDiary(date, keep, kind) {
  kind = kind || (cur && cur.k === 'diary' && keep ? cur.kind : curKind) || '日記';
  if (bgOpen) { place({ k: 'diary', date, kind }, false); return; }
  let d = getDiary(date, kind);
  if (!d || !keep) { // 開くとき、その日に作ったノートで足りないリンクを足す。無い日は作る
    await flush();
    const r = await api.openDiary(date, kind); if (!r) return;
    d = upsertDiary(r);
  }
  setKind(kind); Chat.dayBaseline(kind, date, d.body);
  cur = place({ k: 'diary', date, kind }, keep); mode = 'diary';
  const mine = diaries.filter(x => (x.kind || '日記') === kind).map(x => x.date).sort(), idx = mine.indexOf(date);
  const lower = (d.lower || []).map(k => `<span class="chip t" data-dkind="${esc(k)}">${esc(k)}</span>`).join('');
  $('#pane').innerHTML = `
    <div class="row">
      <span class="sp d">${esc(kind)}</span>
      <h2 style="margin:0">${date}（${L.weekday(date)}）</h2>
      <input class="kw" id="d-title" style="flex:1;min-width:140px;margin:0" value="${esc(d.title)}" placeholder="タイトル（任意）　例: 旅の話">
      <button data-act="dprev" title="前の${esc(kind)}">←</button><button data-act="dnext" title="次の${esc(kind)}">→</button>
      <button data-act="table" title="表を入れる">▦ 表</button>
      <button data-act="attach" title="ファイルを添付（ドラッグや貼り付けでも）">📎 添付</button>
      <button data-act="ddel" class="danger">削除</button>
    </div>
    ${kind !== '日記' ? `<div class="row sub">上位 <select id="d-par"><option value="">なし（日記の下）</option>${records.filter(r => r.name !== kind && r.name !== '日記').map(r => `<option${d.parent === r.name ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select><span class="sub">この日だけの上位。これから作る日の初期値は、記録の種類（＋ ⚙）で決めます</span></div>` : ''}
    ${lower ? `<div class="row"><span class="sub">DailyNotes</span>${lower}</div>` : ''}
    <div class="ed" id="ed"></div>`;
  const key = kind + date;
  const view = editor($('#ed'), d.body, 'note', 'd', v => { d.body = v; later('dy' + key, () => api.saveDiary({ date, kind, body: d.body }).then(() => Chat.dayEdited(kind, date, d.body))); },
    kind === '日記' ? '今日のこと。書いたノートのリンクは、下の「今日のノート」に自動で入ります' : `今日の${kind}`);
  $('#d-title').oninput = e => { d.title = e.target.value; later('dt' + key, () => api.saveDiary({ date, kind, title: d.title, body: d.body }).then(() => { renderList(); renderTabs(); })); renderList(); };
  const par = $('#d-par'); if (par) par.onchange = async () => { await flush(); const r = await api.recordOp('setDayParent', kind, date, par.value); if (r) { upsertDiary(r); const st = await api.state(); applyState(st); diaries = st.diaries; openDiary(date, true, kind); } else alert('その上位にはできません（輪になります）'); };
  renderTabs(); renderList();
  // 自由に書く部分（最初の「## 」より前）にカーソル。節で始まる日記は、その前に空行を足して書く場所を作る
  if (/^## /.test(view.state.doc.toString())) view.dispatch({ changes: { from: 0, insert: '\n\n\n' } }); // 本文は onChange で d.body に入る（上下に空行）
  const text = view.state.doc.toString(), h2 = text.search(/^## /m), at = h2 > 0 ? h2 - 2 : text.length; // 見出しの前の、真ん中の空行
  if (cur.pos != null && keep) view.dispatch({ selection: { anchor: Math.min(cur.pos, view.state.doc.length) } });
  else { view.dispatch({ selection: { anchor: at } }); view.focus(); }
}
$('#pane').addEventListener('click', e => { const k = e.target.closest('[data-dkind]'); if (k && cur && cur.k === 'diary') openDiary(cur.date, false, k.dataset.dkind); });
async function diaryAct(act) {
  const kind = cur.kind || '日記', d = getDiary(cur.date, kind), dates = diaries.filter(x => (x.kind || '日記') === kind).map(x => x.date).sort(), i = dates.indexOf(cur.date);
  if (act === 'dprev' && i > 0) openDiary(dates[i - 1], false, kind);
  if (act === 'dnext' && i < dates.length - 1) openDiary(dates[i + 1], false, kind);
  if (act === 'ddel') {
    if (!confirm(`${cur.date} の${kind}を削除しますか？（ファイルは .trash に移ります。紙の日記の画像は残ります）`)) return;
    await flush(); await api.deleteDiary(cur.date, kind);
    diaries = diaries.filter(x => x !== d);
    for (let k = tabs.length - 1; k >= 0; k--) if (tabs[k].k === 'diary' && tabs[k].date === cur.date && (tabs[k].kind || '日記') === kind) { tabs.splice(k, 1); if (active >= k) active--; }
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
// 初めて起動したとき: 保存先（vault）を選ぶ。既存のフォルダを開く／新しく作る
function firstRun(st) {
  dialog(`<h3>ようこそ。YuriiNote の保存先を選びます</h3>
    <div class="sub">ノートは、普通のフォルダ（vault）に、md ファイルとして入ります。あとで、右上の 📁 からも変えられます。フォルダごと別の PC にコピーしても、全部そのまま使えます。</div>
    ${st.found.length ? `<div class="sub">見つかった vault（押すと、これを開きます）</div>${st.found.map(p => `<div class="row"><button data-vp="${esc(p)}" style="flex:1;text-align:left">📁 ${esc(p)}</button></div>`).join('')}` : ''}
    <div class="row"><span>言語 / Language</span><select id="fr-lang"><option value="en">English</option><option value="ja">日本語</option></select></div>
    <div class="row"><button class="p" data-vp="${esc(st.suggest)}" style="flex:1">✨ 新しく作る（${esc(st.suggest)}）</button></div>
    <div class="row"><button id="vp-pick" style="flex:1">📂 フォルダを選ぶ（既存の vault を開く・新しい場所に作る）</button></div>`, close => {
    $('#modal').onkeydown = null;
    $('#fr-lang').onchange = e => { pendingLang = e.target.value; setLang(pendingLang); };
    $('#modal .box').onclick = async e => { const b = e.target.closest('[data-vp]'); if (!b) return; const r = await api.useVault(b.dataset.vp); if (r) { close(); loaded(r); } };
    $('#vp-pick').onclick = async () => { const r = await api.chooseVault(); if (r) { close(); loaded(r); } };
  });
}
function loaded(st) {
  if (st && st.firstRun) return firstRun(st);
  loadSettings(st);
  if (pendingLang) { settings.lang = pendingLang; pendingLang = null; saveSettings(); }
  ({ notes, topics, vault } = st); readings = st.readings || {}; diaries = st.diaries || []; records = st.records || records; Chat.init(st.docs || {}); RP.init(st.docs || {}); PI.init(st.docs || {}); cur = null; tabs = []; active = -1; refreshFiles();
  $('#vault').textContent = '📁 ' + vault.split('/').pop(); $('#vault').title = vault + '\n（Brave では Index.md を開くと全部たどれます）';
  try {
    const saved = JSON.parse(localStorage.getItem('pkm-tabs:' + vault) || 'null');
    if (saved) {
      tabs = saved.tabs.filter(t => t.k === 'empty' || (t.k === 'note' && get(t.s, t.id)) || (t.k === 'topic' && topics.find(x => x.name === t.name)) || (t.k === 'diary' && getDiary(t.date, t.kind)) || t.k === 'chat' || t.k === 'graph' || t.k === 'mandala' || t.k === 'cards' || (t.k === 'similar' && (t.base || []).every(b => get(b.s, b.id))));
      tabs.forEach(t => { if (t.k === 'topic') t.mode = 'view'; });
      active = Math.min(saved.active, tabs.length - 1);
    }
  } catch { tabs = []; active = -1; }
  show(active);
}
// 右上の「⋯」: 更新を確認（押したときだけ。自動では確認も更新もしない）・ショートカット・バージョン
$('#more').onclick = () => {   // 「⋯」: USB での取り込みと、設定だけ。ほかは、全部、設定に
  const r = $('#more').getBoundingClientRect();
  popMenu({ clientX: r.right - 190, clientY: r.bottom + 4 }, [
    ['スマホのメモを取り込む…（USB）', phoneImport],
    ['設定…', settingsDialog]
  ]);
};

// ===== 設定（vault の中の K_settings.json に。vault を別の PC に写しても、同じ見た目・同じ設定）=====
const DEFAULT_SETTINGS = { lang: 'en', theme: 'light', accent: '#3b5bdb', scale: 100, bodySize: 16, uiFont: '', bodyFont: 'default', bodyFontCustom: '', dayStart: 5 };
let settings = { ...DEFAULT_SETTINGS };
const ACCENTS = ['#3b5bdb', '#0b7285', '#2f9e44', '#e67700', '#c0392b', '#a61e4d', '#7048e8', '#495057'];
const BODY_FONTS = { default: '', serif: '"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif', mono: 'ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace' };
const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
function applySettings() {
  const r = document.documentElement, s = settings;
  r.style.setProperty('--acc', s.accent);
  document.body.style.zoom = String((s.scale || 100) / 100);
  r.style.setProperty('--bodysize', (s.bodySize || 16) + 'px');
  if (s.uiFont) r.style.setProperty('--uifont', s.uiFont); else r.style.removeProperty('--uifont');
  const bf = s.bodyFont === 'custom' ? s.bodyFontCustom : BODY_FONTS[s.bodyFont] || '';
  if (bf) r.style.setProperty('--bodyfont', bf); else r.style.removeProperty('--bodyfont');
  r.classList.toggle('dark', s.theme === 'dark' || (s.theme === 'auto' && darkMq.matches));
  if (applyLang) applyLang(s.lang);
}
darkMq.addEventListener('change', () => { if (settings.theme === 'auto') applySettings(); });
const applyLang = setLang;   // 言語の切り替え（src/i18n.js）
setLang('en');
const saveSettings = () => { applySettings(); api.saveDoc('K_settings', settings); };
function loadSettings(st) { settings = { ...DEFAULT_SETTINGS, ...((st.docs || {})['K_settings'] || {}) }; applySettings(); }
function settingsDialog() {
  const sw = settings;
  dialog(`<div class="sdlg"><h3>⚙ 設定</h3>
    <div class="sec"><b>言語・保存先</b>
      <div class="srow"><span>言語</span><select id="s-lang"><option value="en"${sw.lang === 'en' ? ' selected' : ''}>English</option><option value="ja"${sw.lang === 'ja' ? ' selected' : ''}>日本語</option></select></div>
      <div class="srow"><span>保存先（vault）</span><code style="flex:1;word-break:break-all">${esc(vault)}</code><button id="s-vault">変える…</button></div>
      <div class="srow"><span>日付が変わる時刻</span><input type="number" id="s-day" min="0" max="12" value="${sw.dayStart}" style="width:60px"> 時</div></div>
    <div class="sec"><b>見た目</b>
      <div class="srow"><span>テーマ</span>${[['light', '明るい'], ['dark', '暗い'], ['auto', 'OS に合わせる']].map(([k, l]) => `<label><input type="radio" name="s-theme" value="${k}"${sw.theme === k ? ' checked' : ''}> ${l}</label>`).join('')}</div>
      <div class="srow"><span>アクセントの色</span>${ACCENTS.map(c => `<i class="sw${sw.accent.toLowerCase() === c ? ' on' : ''}" data-sw="${c}" style="background:${c}"></i>`).join('')}<input type="color" id="s-acc" value="${esc(sw.accent)}" title="好きな色"></div>
      <div class="srow"><span>画面全体の大きさ</span><input type="range" id="s-scale" min="80" max="150" step="5" value="${sw.scale}"><output id="s-scale-o">${sw.scale}%</output></div>
      <div class="srow"><span>本文の文字の大きさ</span><input type="range" id="s-body" min="12" max="28" step="1" value="${sw.bodySize}"><output id="s-body-o">${sw.bodySize}px</output></div>
      <div class="srow"><span>画面の文字（フォント）</span><input type="text" id="s-uifont" placeholder="空なら OS の標準。例: Noto Sans JP" value="${esc(sw.uiFont)}" style="flex:1"></div>
      <div class="srow"><span>本文のフォント</span><select id="s-bf"><option value="default"${sw.bodyFont === 'default' ? ' selected' : ''}>画面と同じ</option><option value="serif"${sw.bodyFont === 'serif' ? ' selected' : ''}>明朝</option><option value="mono"${sw.bodyFont === 'mono' ? ' selected' : ''}>等幅</option><option value="custom"${sw.bodyFont === 'custom' ? ' selected' : ''}>好きな名前</option></select><input type="text" id="s-bfc" placeholder="フォント名" value="${esc(sw.bodyFontCustom)}" style="flex:1"></div></div>
    <div class="sec"><b>スマホ</b><div class="srow"><button id="s-phone">スマホにアプリを入れる…（USB）</button></div></div>
    <div class="sec"><b>アプリ</b><div class="srow"><span id="s-ver" class="sub"></span><button id="s-upd">更新を確認</button><button id="s-short">ショートカットを作る</button><button id="s-gh">GitHub を開く</button></div></div>
    <div class="row"><span class="grow"></span><button class="p" id="s-close">閉じる</button></div></div>`, close => {
    const set = (k, v) => { settings[k] = v; saveSettings(); };
    api.appInfo().then(i => { $('#s-ver').textContent = 'YuriiNote ' + i.version; $('#s-upd').onclick = () => checkUpdate(i); $('#s-short').style.display = i.platform === 'win32' ? 'none' : ''; });
    $('#s-close').onclick = close; $('#modal').onkeydown = e => { if (e.key === 'Escape') close(); };
    $('#s-lang').onchange = e => { set('lang', e.target.value); close(); settingsDialog(); };
    $('#s-vault').onclick = async () => { const st = await api.chooseVault(); if (st) { close(); loaded(st); } };
    $('#s-day').onchange = e => set('dayStart', Math.max(0, Math.min(12, +e.target.value || 0)));
    document.querySelectorAll('input[name=s-theme]').forEach(r => r.onchange = () => set('theme', r.value));
    document.querySelectorAll('[data-sw]').forEach(i => i.onclick = () => { set('accent', i.dataset.sw); document.querySelectorAll('[data-sw]').forEach(x => x.classList.toggle('on', x === i)); $('#s-acc').value = i.dataset.sw; });
    $('#s-acc').oninput = e => { set('accent', e.target.value); document.querySelectorAll('[data-sw]').forEach(x => x.classList.remove('on')); };
    $('#s-scale').oninput = e => { $('#s-scale-o').textContent = e.target.value + '%'; set('scale', +e.target.value); };
    $('#s-body').oninput = e => { $('#s-body-o').textContent = e.target.value + 'px'; set('bodySize', +e.target.value); };
    $('#s-uifont').onchange = e => set('uiFont', e.target.value.trim());
    $('#s-bf').onchange = e => set('bodyFont', e.target.value); $('#s-bfc').onchange = e => { settings.bodyFont = 'custom'; $('#s-bf').value = 'custom'; set('bodyFontCustom', e.target.value.trim()); };
    $('#s-phone').onclick = phoneInstall; $('#s-gh').onclick = () => api.openUrl('https://github.com/Yurii7812/YuriiNote');
    $('#s-short').onclick = async () => toast(await api.installShortcuts());
  });
}
// スマホにアプリを入れる（USB でつないだスマホに、adb で）
api.onPhoneMsg(m => toast(m));
async function phoneInstall() {
  if (!confirm('スマホを USB ケーブルでつないで、「USBデバッグ」をオンにしてから、OK を押してください。\nスマホに YuriiKasten のメモのアプリを入れます。')) return;
  toast('入れています…');
  const r = await api.phoneInstall();
  alert(r.message);
}
// スマホのメモを取り込む（USB）。メモは「未整理」へ。日記・記録のトピックは、その日のノートへ。番号つきのスキャンは、紙のノートへ
async function phoneImport() {
  toast('スマホのメモを読んでいます…');
  const r = await api.phoneImport();
  if (r.ok) { Chat.init(r.state.docs || {}); applyState(r.state); diaries = r.state.diaries; records = r.state.records || records; refreshFiles(); if (mode === 'diary') renderList(); }
  alert(r.message);
}
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
window.__pkm = { get tabs() { return tabs; }, scan: startScan, get diaries() { return diaries; }, get mode() { return mode; }, get cur() { return cur; }, get notes() { return notes; }, get topics() { return topics; }, get view() { return lastView; } };

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
    ? `<span>${picked.size}件を選択</span><span class="grow"></span><button id="sel-all">全部</button><button id="sel-sim" ${picked.size ? '' : 'disabled'} title="選んだノートに似たノートを探す">≈ 似たノート</button><button id="sel-exp" ${picked.size ? '' : 'disabled'} title="選んだノートを、1つの Markdown にまとめる（保存はしない。確認してコピー）">📤 エクスポート</button><button id="sel-del" class="danger" ${picked.size ? '' : 'disabled'}>削除</button><button id="sel-end">やめる</button>`
    : '<button id="sel-start" title="複数のノートを選んで、まとめて削除します">☑ 選択</button>';
  bar.style.display = (tab === 'i' || mode !== 'notes') && !$('#q').value ? 'none' : 'flex';
}
$('#selbar').addEventListener('click', e => {
  const id = e.target.id;
  if (id === 'sel-start') { selMode = true; picked.clear(); lastPick = null; renderList(); }
  if (id === 'sel-end') { selMode = false; picked.clear(); renderList(); }
  if (id === 'sel-all') { visibleRows().forEach(r => picked.add(r.dataset.s + ':' + r.dataset.id)); renderList(); }
  if (id === 'sel-exp') exportDialog([...picked]);
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
  filesCache = await api.filesInfo(); if (tab === 'f' && !$('#q').value) renderList();
  if (!note) toast(`${names.length} 件を取り込みました。タイトルを付けておくと探しやすくなります`);
  const view = lastView;
  if (!view || !view.dom.isConnected || !cur || !['note', 'diary'].includes(cur.k)) return;
  const head = view.state.selection.main.head, at = view.state.doc.lineAt(head);
  const md = (head === at.from ? '' : '\n') + names.map((n, i) => PIC.test(n) ? `![](${encRel(n)})` : `[${(list[i].name || n).replace(/[\[\]]/g, '')}](${encRel(n)})`).join('\n') + '\n';
  view.dispatch({ changes: { from: head, insert: md }, selection: { anchor: head + md.length } }); view.focus();
}
const curNote = () => cur && cur.k === 'note' ? get(cur.s, cur.id) : cur && cur.k === 'diary' ? getDiary(cur.date, cur.kind) : null;
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

// 保存側の状態（ノート・日記・読み・紙のIndex）を、画面に反映する
function applyState(st) { ({ notes, topics } = st); diaries = st.diaries || diaries; records = st.records || records; readings = st.readings || readings; PI.apply(st); renderList(); }
// チャット・なりきり・キャンバスの部品に、アプリの機能を渡す
Object.assign(ctx, {
  api, later, flush, place, renderTabs, openLink, applyState, readings: () => readings, lastNote: () => lastNote,
 renderList, pick, get, free, refreshDiaries, records: () => records, openNote, openDiary, getDiary,
  setCur: c => { cur = c; }, setMode: m => { mode = m; }, cur: () => cur, notes: () => notes, vault: () => vault,
  touchNote: n => saveNote(n),
  touchDiary: d => later('dy' + (d.kind || '日記') + d.date, () => api.saveDiary({ date: d.date, kind: d.kind || '日記', body: d.body })),
  openDiaryData: async date => { await flush(); const r = await api.openDiary(date, '日記'); if (r) upsertDiary(r); }
});
