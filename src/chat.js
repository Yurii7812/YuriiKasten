// チャットメモ（LINE のようにすぐ書ける）。1件以上を「ノート化」しても元メモは残る。ノート化は本文コピーではなく、元メモ参照のノート。
// 保存: C_チャット.json（正）。日ごとの md（C_2026-11-08.md）を、見る用に自動で書き出す（store.js）。日記トピックのメモは、日記にも時刻つきの行で入る
// 返信・引用は @（メンション）。チャットメモの中に、別のメモ・ノートを入れる。ノートからチャットメモへは、出典のリンク（C_日付.md#m-メモID）
import { ctx, $, esc, pad, hm, uid, renderMd, mdClick, popMenu, toast, dialog } from './shared.js';
import L from '../lib.js';
import Relations from '../chat-relations.js';
import TopicPrefs from '../chat-topic-preferences.js';
import MemoGroup from '../memo-group.js';
import TopicNav from '../chat-topic-navigation.js';
import MigrateRoleplay from '../migrate-roleplay.js';
import * as TopicGraph from './chat-topic-graph.js';

let doc = { topics: [], messages: [], converted: {}, trash: [], noted: {} };
let graphOpen = false;
let view = '*';        // '*' すべて / '' 未選択 / 日記 / トピック名
let viewMode = 'all';  // all（日付の見出しで区切って、続けて）| day（1日ずつ）
let day = '';          // day のときの日付
let sel = null;        // 選んでいるメモの id（ノートにする・引用する）。null = 選択中ではない
let lastSel = null;
let cq = '', tq = '';
let childFilter = new Set(); // 下位トピックによる絞り込み（OR）
let upperFilter = new Set(); // 上位トピックによる絞り込み（OR）
const FUNNEL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4-2v-4z"/></svg>';   // 絞り込みの印（文字のかわり）
let filterOpen = false;      // 絞り込みの欄を開いているか（描き直しても保つ）
let lastTopicSelection = null;
let speakerView = 'self'; // 選択中のキャラは右。「選択なし」なら全員右
let roleLibrary = [];
let replyBrowse = null; // トピックを移動しても書き込み元と下書き・返信対象を維持
let sourceIds = null; // 出典リンクを開いている間だけ、ノートにしたメモIDだけを表示する
let noteReplyTos = []; // ノートへの返信。stemを保存するのでFolgezettel IDの再指定に追随する
let replyTos = [];            // 返信しているメモの id（いくつでも。WhatsApp のように、入力欄の上に引用を出す）
let editCtx = null;          // 編集中のメモ { m, reps, redraw }（↩ を押すと、そのメモの返信先に足される）
let redit = null;            // 「返信先を編集」中のメモの id（押さなくても、返信先を足す・外す）
let pickReply = null;        // 編集中に「返信先を選ぶ」ときの、選んだ id を受け取る関数          // 返信しているメモの id（WhatsApp のように、入力欄の上に引用を出す）         // チャットメモの中の検索・トピックの検索
let draft = '';
// 書きかけ（送る前の文章）は、トピックごとに覚える。ほかの画面・トピックへ移っても、アプリを閉じても消えない
const drafts = new Map(), DRAFT_KEY = 'pkm-chat-drafts';
(function loadDrafts() { try { const o = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); for (const k in o) if (o[k]) drafts.set(k, o[k]); } catch { } })();
const persistDrafts = () => { try { const o = {}; drafts.forEach((v, k) => { if (v) o[k] = v; }); localStorage.setItem(DRAFT_KEY, JSON.stringify(o)); } catch { } };
let editingId = null, editText = '', editBackup = null;   // 下の入力欄で、メモを直している途中（Enter で完了・Esc でやめる）
const setDraft = v => { if (editingId) { editText = v; return; } draft = v; if (v) drafts.set(view, v); else drafts.delete(view); persistDrafts(); };
draft = drafts.get(view) || '';
const DIARY = '日記';
const recKinds = () => (ctx.records ? ctx.records() : []).map(r => r.name).filter(n => n !== DIARY);   // 夢などの時系列記録の種類（日記と同じように使える）
// ===== 日のノート ⇄ チャットメモ =====
// 日のノートの「時刻 本文」は、空行がなくても時刻ごとに別メモとして扱う。
// 時刻の後に続く（時刻のない）行は、そのメモの複数行の本文とみなす。
// それ以外の手書き文章は従来どおり空行ごとに分ける。
const AUTO = /^(#{1,6}\s.*|[-*]\s+:?[0-9a-z]+.*|\d{2}:\d{2}\s*)$/;
const blocks = b => {
  const out = []; let buf = [];
  const flush = () => { const text = buf.join('\n').trim(); if (text && text.split('\n').some(l => !AUTO.test(l.trim()))) out.push(text); buf = []; };
  for (const line of (b || '').split('\n')) {
    if (!line.trim() || AUTO.test(line.trim())) { flush(); continue; }
    if (/^\d{2}:\d{2}\s+/.test(line)) flush();
    buf.push(line);
  }
  flush(); return out;
};
export function dayBaseline(kind, date, body) {   // 日のノートを開いたとき: いまの中身を「同期済み」とする（古い日の中身を、まとめてメモにしない）
  if (!isRec(kind)) return; const k = kind + '|' + date, mr = doc.mirror[k] || (doc.mirror[k] = { blocks: [], map: [] });
  const b = blocks(body); if (b.join('\n\n') !== mr.blocks.join('\n\n')) { mr.blocks = b; save(); }
}
export function dayEdited(kind, date, body) {
  if (!isRec(kind)) return; const k = kind + '|' + date, mr = doc.mirror[k];
  if (!mr) return dayBaseline(kind, date, body);
  const now = blocks(body), prev = new Set(mr.blocks), cur = new Set(now);
  const added = now.filter(b => !prev.has(b)), removed = mr.blocks.filter(b => !cur.has(b));
  if (!added.length && !removed.length) return;
  const t0 = Date.now(); let touched = false;
  added.forEach((b, i) => {
    if (mr.map.some(x => x.blk === b)) return;   // すでに同期済みの同一メモだけを除外。文章に追記した場合は編集として扱う
    const ent = removed[i] && mr.map.find(x => x.blk === removed[i]), memo = ent && msg(ent.memo);
    if (memo) { const stamped = /^\d{2}:\d{2}\s/.test(ent.blk); memo.text = stamped ? b.replace(/^\d{2}:\d{2}\s+/, '') : b; memo.edited = t0; ent.blk = b; }
    else { const m = { id: uid(), topic: kind, t: t0 + i, text: b, src: 'day' }; doc.messages.push(m); mr.map.push({ blk: b, memo: m.id }); }
    touched = true;
  });
  mr.blocks = now; save();
  if (touched) { if (view === kind || view === '*') paint(); ctx.renderList(); }
}
// チャットメモの編集・削除を日記にも反映。前後に空行がなくても該当メモだけを置換する。
// 日記・時系列記録に入るメモ: 所属がその記録、または上位トピックにその記録を持つもの（日記を上位にしたメモも、日記に入る）
const recKindsOf = m => [...new Set([m.topic, ...(m.ups || [])])].filter(k => k && isRec(k));
async function memoToDay(m, oldText, del) { for (const kind of recKindsOf(m)) await memoToDayKind(m, kind, oldText, del); }
async function memoToDayKind(m, kind, oldText, del) {
  if (!ctx.getDiary) return;
  let found = null;
  for (const [k, mr] of Object.entries(doc.mirror)) {
    if (!k.startsWith(kind + '|')) continue;
    const ent = mr.map.find(x => x.memo === m.id);
    if (ent) { found = { k, mr, ent }; break; }
  }
  const date = found ? found.k.split('|')[1] : L.dayOf(L.now(new Date(m.t)));
  const d = ctx.getDiary(date, kind); if (!d) return;
  const flat = t => (t || '').replace(/\n{2,}/g, '\n').trim();
  const old = d.body || '';
  const candidates = [...new Set([found && found.ent.blk, `${hm(m.t)} ${flat(oldText)}`, flat(oldText)].filter(Boolean))];
  let at = -1, selected = '';
  for (const candidate of candidates) {
    // 前後が行境界である完全一致だけを対象にする
    const hits = []; let pos = 0;
    while ((pos = old.indexOf(candidate, pos)) >= 0) {
      const end = pos + candidate.length;
      if ((pos === 0 || old[pos - 1] === '\n') && (end === old.length || old[end] === '\n')) hits.push(pos);
      pos++;
    }
    if (hits.length) {
      const duplicates = found ? found.mr.map.filter(x => x.blk === candidate) : [];
      const n = found ? duplicates.findIndex(x => x.memo === m.id) : 0;
      at = hits[Math.max(0, Math.min(n, hits.length - 1))];
      selected = candidate; break;
    }
  }
  if (at < 0) return;
  const pre = (selected.match(/^\d{2}:\d{2}\s+/) || [''])[0];
  const next = pre + flat(m.text);
  let body = old.slice(0, at) + (del ? '' : next) + old.slice(at + selected.length);
  // 削除で残る改行を1つだけ除く。ほかのメモや節の空行は維持
  if (del) {
    const before = old.slice(0, at), after = old.slice(at + selected.length);
    body = before + (before.endsWith('\n') && after.startsWith('\n') ? after.slice(1) : after);
  }
  body = body.replace(/^\n+|\n+$/g, '');
  d.body = body; await ctx.api.saveDiary({ date, kind: kind, body });
  const k = kind + '|' + date, mr = doc.mirror[k] || (doc.mirror[k] = { blocks: [], map: [] });
  mr.blocks = blocks(body);
  if (found && del) mr.map = mr.map.filter(x => x !== found.ent);
  else if (found) found.ent.blk = next;
  save(); await ctx.refreshDiaries();
  const current = ctx.cur();
  if (current && current.k === 'diary' && current.date === date && current.kind === kind) ctx.openDiary(date, true, kind);
}
const FRAGMENT = '断片メモ';   // 標準のトピック（日記と同じように、いつもある）
const isRec = n => n === DIARY || recKinds().includes(n);
// トピック名が使えない理由（使えるなら ''）。「使えません」だけにせず、何が重なっているかを言う
const FIXED_NAMES = { '*': 'すべて', '全部': 'すべて', '全部表示': 'すべて', 'すべて': 'すべて', 'トピック未選択': '未所属', '未所属': '未所属' };
const nameProblem = (name, current = '') => {
  if (!name) return '名前を入れてください';
  if (name === current) return '';
  if (FIXED_NAMES[name]) return `「${FIXED_NAMES[name]}」は、決まった表示の名前なので、トピックには使えません`;
  if (name === DIARY) return '「日記」は、日記の名前なので、トピックには使えません';
  if (recKinds().includes(name)) return `「${name}」と同じ名前の時系列記録があります`;
  if (topic(name)) return `「${name}」と同じ名前のトピックが、すでにあります（左の一覧から選べます）`;
  return '';
};

export function init(docs) {
  const d = docs['C_チャット'] || {};
  doc = { _rev: d._rev || 0, topics: d.topics || [], messages: d.messages || [], converted: d.converted || {}, trash: d.trash || [], noted: d.noted || {}, mirror: d.mirror || {}, upperByTopic: d.upperByTopic || {}, target: { topic: (d.target && d.target.topic) || '', ups: (d.target && d.target.ups) || [] }, viewMode: d.viewMode === 'day' ? 'day' : 'all', selfName: d.selfName || '私', importedRp: d.importedRp || {} };
  if (!doc.topics.some(t => t.name === FRAGMENT)) doc.topics.push({ name: FRAGMENT, type: 'bubble', stamp: true, entry: null });   // 断片メモは標準
  roleLibrary = ((docs['K_roles'] || {}).roles || []).map(r => ({ ...r }));
  speakerView = 'self';
  TopicPrefs.init(doc);
  viewMode = doc.viewMode;
  refreshMemoNotePreviews();
}
// 一度だけ旧なりきりチャットを取り込み、元データは保管する。
export function migrateLegacyRoleplay() {
  const r=MigrateRoleplay.migrate(doc,ctx.notes(),roleLibrary);
  if(!r.migrated.length) return [];
  roleLibrary=r.roles;
  ctx.later('doc:K_roles',()=>ctx.api.saveDoc('K_roles',{roles:roleLibrary}));
  save();
  return r.migrated;
}
export const isImportedRoleplay = n => !!(n && n.kind==='rp' && doc.importedRp && doc.importedRp[n.stem]);
const refreshMemoNotePreviews = () => {
  // 本文の正本を複製しない。検索用の表示文字列のみ元メモの最新状態に同期する。
  if (!ctx.notes) return;
  for (const n of ctx.notes()) if (n.kind === 'memo-group') n.body = MemoGroup.body(n.data, doc);
};
const save = () => { refreshMemoNotePreviews(); ctx.later('doc:C', async () => {
  const r = await ctx.api.saveDoc('C_チャット', doc);
  if (r && r.rev) doc._rev = r.rev;
  if (r && r.merged) {   // 画面が古かった（ほかで増えたメモがあった）: 足し合わせた中身を読み直す
    const st = await ctx.api.state(); init(st.docs);
    if (ctx.cur() && ctx.cur().k === 'chat') render();
    ctx.renderList(); toast('ほかで増えたメモを、取り込みました');
  }
}); };
const topic = name => doc.topics.find(t => t.name === name);
const msg = id => doc.messages.find(m => m.id === id);
// トピックは並列（フォルダではない）。メモは所属トピック1つと、複数の上位トピックを持てる。保存形式は topic / ups のまま。
const upsOf = m => m.ups || [];
const inView = Relations.inTopic;
const countOf = name => name === '*' ? doc.messages.length : doc.messages.filter(m => inView(m, name)).length;
// 最近使った順（トピックとしても、上としても）。「過去にそこで使った上」を、先に
function lastUseMap() { const mp = new Map(); for (const m of doc.messages) for (const n of new Set([m.topic, ...upsOf(m)])) if (n && (mp.get(n) || 0) < m.t) mp.set(n, m.t); return mp; }
function recentNames(near, exclude = []) {
  const lu = lastUseMap(), co = new Map();
  if (near !== undefined) for (const m of doc.messages) { if (m.topic === near) for (const u of upsOf(m)) co.set(u, Math.max(co.get(u) || 0, m.t)); for (const u of upsOf(m)) if (u === near && m.topic) co.set(m.topic, Math.max(co.get(m.topic) || 0, m.t)); }
  const names = [...new Set([...doc.topics.map(t => t.name), ...recKinds(), DIARY, ...lu.keys()])].filter(n => n && !exclude.includes(n));
  return names.sort((x, y) => ((co.get(y) || 0) > 0) - ((co.get(x) || 0) > 0) || (lu.get(y) || 0) - (lu.get(x) || 0) || x.localeCompare(y, 'ja'));
}
const dayOfMsg = m => L.dayOf(L.now(new Date(m.t)));
const dayFile = d => `C_${d}.md`;
const first = t => esc((t || '').split('\n')[0].slice(0, 30));

// ===== 左の一覧 =====
export function listHtml() {
  const on = name => ctx.cur() && ctx.cur().k === 'chat' && ctx.cur().topic === name;
  const row = (name, label, n, icon) => `<div class="item${on(name) ? ' on' : ''}" data-chat="${esc(name)}"><span class="ci">${icon}</span><b style="color:var(--fg);font-weight:400">${esc(label)}</b>${n === null ? '' : `<small>${n}</small>`}</div>`;
  const q = tq.trim().toLowerCase(), lu = lastUseMap();
  // 先頭に固定: すべて・日記・断片メモ・未所属。そのあとは、時系列記録とトピックを「最近使った順」
  const std = [{ name: '*', label: 'すべて', n: countOf('*'), icon: '🗂️' }, { name: DIARY, label: '日記', n: countOf(DIARY), icon: '📔' },
    { name: FRAGMENT, label: FRAGMENT, n: countOf(FRAGMENT), icon: '🧩' }, { name: '', label: '未所属', n: doc.messages.filter(m => !m.topic).length, icon: '📥' }];
  const stdNames = new Set(std.map(x => x.name)), seen = new Set();
  const rest = [...recKinds().map(k => ({ name: k, label: k, n: countOf(k), icon: '📔' })),
    ...doc.topics.filter(t => !isRec(t.name)).map(t => ({ name: t.name, label: t.name, n: t.type === 'bubble' ? countOf(t.name) : null, icon: t.type === 'bubble' ? '💬' : '📄' }))]
    .filter(x => x.name && !stdNames.has(x.name) && !seen.has(x.name) && seen.add(x.name))
    .sort((x, y) => (lu.get(y.name) || 0) - (lu.get(x.name) || 0));
  const hit = x => !q || x.label.toLowerCase().includes(q), stdShown = std.filter(hit), restShown = rest.filter(hit);
  return `<div id="clist"><div class="dtop"><input id="c-tq" class="ctq" placeholder="🔎 トピックを探す" value="${esc(tq)}"><button class="p" id="c-new" title="トピックを作る">＋</button><button id="c-topic-graph" title="トピックグラフ">🕸</button></div><div id="c-newrow" class="c-newrow" style="display:none"><input id="c-newname" placeholder="新しいトピックの名前（Enter で作る・Esc でやめる）" autocomplete="off"><button class="p" id="c-newok" title="作る">作る</button><button id="c-newopt" title="時系列記録にするなど、くわしい設定">⚙️</button></div>`
    + stdShown.map(t => row(t.name, t.label, t.n, t.icon)).join('') + (stdShown.length && restShown.length ? '<div class="csep"></div>' : '') + restShown.map(t => row(t.name, t.label, t.n, t.icon)).join('') + '</div>';
}

// ===== 表示するもの =====
// 全体型のトピックは、ノートの本文を、空行で区切った塊を吹き出しとして見せる
function backend() {
  const t = topic(view);
  if (t && t.type === 'whole') {
    const n = ctx.get('d', t.entry && t.entry.id); if (!n) return null;
    return { name: t.name, stamp: t.stamp, get: () => n.body, set: b => { n.body = b; ctx.touchNote(n); }, open: () => ctx.openNote('d', n.id) };
  }
  return null;
}
const parts = body => (body || '').split(/\n{2,}/).map(s => s.replace(/^\n+|\n+$/g, '')).filter(Boolean);
const stampRe = /^(\d{2}:\d{2}) ([\s\S]*)$/;
const dayOfMsg_ = m => L.dayOf(L.now(new Date(m.t)));

function filteredMessages() {
  let list = doc.messages.filter(m => inView(m, view) && (!sourceIds || sourceIds.has(m.id))).sort((a, b) => a.t - b.t);
  if (childFilter.size || upperFilter.size) list = TopicNav.filter(doc.messages.filter(m=>!sourceIds || sourceIds.has(m.id)), view, [...upperFilter], [...childFilter]).sort((a,b)=>a.t-b.t);
  if (cq) { const q = cq.toLowerCase(); list = list.filter(m => (m.text || '').toLowerCase().includes(q)); }   // チャットメモの中の検索
  return list;
}

function entries() {
  const be = backend();
  if (be) return parts(be.get()).map((text, i) => { const m = text.match(stampRe); return { kind: 'line', i, time: m ? m[1] : '', text: m ? m[2] : text }; });
  let list = filteredMessages();
  if (viewMode === 'day') { if (!day) day = list.length ? dayOfMsg_(list[list.length - 1]) : L.todayStr(); list = list.filter(m => dayOfMsg_(m) === day); }
  return list.map(m => ({ kind: 'msg', m }));
}

// ===== 画面 =====
export function open(name, keep, savedSourceIds, savedGraph) {
  if (editingId) cancelEdit();
  graphOpen = !!savedGraph;
  childFilter = new Set(); upperFilter = new Set(); lastTopicSelection = null;
  if (!replyBrowse) { if (draft) drafts.set(view, draft); else drafts.delete(view); persistDrafts(); }   // いまの書きかけを、そのトピックに残す
  view = name; sourceIds = keep && Array.isArray(savedSourceIds) ? new Set(savedSourceIds) : null; sel = null;
  if (!replyBrowse) draft = drafts.get(name) || '';
  if (!replyBrowse) TopicPrefs.open(doc, name); save();   // 所属トピックごとに最後の上位トピックを復元。「全部」は未選択として扱う
  ctx.setCur(ctx.place({ k: 'chat', topic: name, topicGraph: graphOpen }, keep)); ctx.setMode('chat');
  render(); ctx.renderTabs(); ctx.renderList();
}
// ノート化した元メモのIDを、日時順で返す（旧リンクの救済用）
export const memosForNote = stem => {
  const timeOf = id => { const m = msg(id) || doc.trash.find(x => x.id === id); return m ? m.t : 0; };
  return Object.keys(doc.noted).filter(id => (doc.noted[id] || []).includes(stem)).sort((a, b) => timeOf(a) - timeOf(b));
};
// 出典として選ばれたメモだけを表示する。間にあった未選択のメモは表示しない。
export function gotoSource(ids) {
  graphOpen = false;
  childFilter = new Set(); upperFilter = new Set();
  sourceIds = new Set(ids.filter(Boolean));
  if (!sourceIds.size) return toast('元のチャットメモが指定されていません');
  view = '*'; viewMode = 'all'; day = ''; cq = ''; sel = null;
  ctx.setCur(ctx.place({ k: 'chat', topic: '*', sourceMemoIds: [...sourceIds] }, false)); ctx.setMode('chat');
  render(); ctx.renderTabs(); ctx.renderList();
  const missing = [...sourceIds].filter(id => !msg(id)).length;
  if (missing) toast(`${missing} 件の元メモが見つかりません（削除された可能性があります）`);
}
// このメモ（ノートの出典リンクから）へ飛ぶ
export const graphData = () => ({ topics: doc.topics, messages: doc.messages, noted: doc.noted });   // グラフビューに渡す
export const searchMemos = q => doc.messages.filter(m => (m.text || '').toLowerCase().includes(q)).sort((a, b) => b.t - a.t);   // 検索結果に出す
// 条件に合う本文のチャットメモ（ファイルが使われているメモを探すときなど）
export const memosMatching = test => doc.messages.filter(m => test(m.text || ''));
export function gotoMemo(id) {
  graphOpen = false;
  const m = msg(id); if (!m) return toast('そのチャットメモは、もうありません');
  childFilter = new Set(); cq = '';
  sourceIds = null; childFilter.clear(); upperFilter.clear(); view = '*'; viewMode = 'all'; day = '';
  ctx.setCur(ctx.place({ k: 'chat', topic: '*' }, false)); ctx.setMode('chat'); render(); ctx.renderTabs(); ctx.renderList();
  const el = document.querySelector(`[data-m="${id}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1800); }
}
export const label = name => name === '*' ? '全部' : name === '' ? '未選択' : name;

export function openTopicGraph() {
  if (!ctx.cur() || ctx.cur().k !== 'chat') open('*');
  graphOpen = true;
  ctx.cur().topicGraph = true;
  render(); ctx.renderTabs();
}
function render() {
  TopicGraph.unmount($('#c-topic-graph-view'));
  if (graphOpen) {
    $('#pane').innerHTML = `<div class="chat memo c-topic-graph"><div class="row chat-head"><h2>チャットメモのトピック</h2><span class="grow"></span><button data-c="topic-graph-close">← メモに戻る</button></div><div id="c-topic-graph-view"></div></div>`;
    TopicGraph.mount($('#c-topic-graph-view'), {
      topics: [...doc.topics, DIARY, ...recKinds()], messages: doc.messages,
      onOpen: name => open(name),
    });
    return;
  }
  const t = topic(view), be = backend();
  const title = sourceIds ? '元のチャットメモ' : view === '*' ? 'すべて' : view === '' ? '未所属' : view;
  $('#pane').innerHTML = `
    <div class="chat memo">
      <div class="row chat-head">
        <h2 style="margin:0">${esc(title)}</h2>
        <span class="grow"></span>
        ${sourceIds ? '<button data-c="source-clear">フィルター解除・すべて</button>' : ''}
        <div id="c-children" class="c-children"></div>
        <details class="chat-tools chat-view-menu"><summary title="表示・操作（検索・日ごと・キャラ・設定）">⋮</summary>
          <div class="chat-tools-menu wide">
            <span class="sub">${sourceIds ? `ノート化した ${sourceIds.size} 件だけを表示` : isRec(view) ? '日記にも、時刻つきの行で入ります' : view === '*' ? '書いたものは「未選択」に入ります' : t && t.type === 'whole' ? '全体で1つのノート' : ''}</span>
            <input id="c-search" class="csearch" placeholder="このチャットメモの中を検索" value="${esc(cq)}">
            ${sourceIds ? '' : be ? '' : `<span class="vseg"><button data-c="vall" class="${viewMode === 'all' ? 'on' : ''}">全部</button><button data-c="vday" class="${viewMode === 'day' ? 'on' : ''}">日ごと</button></span>
            ${viewMode === 'day' ? `<button data-c="dprev" title="前の日">←</button><input type="date" id="c-day" value="${esc(day || L.todayStr())}"><button data-c="dnext" title="次の日">→</button>` : '<input type="date" id="c-jump" title="日付を入れると、その日へ">'}
            `}
            <label class="c-speaker-label">表示・投稿キャラ <select id="c-speaker"><option value="self"${speakerView==='self'?' selected':''}>${esc(doc.selfName)}</option>${roleLibrary.filter(r => !r.archived).map(r => '<option value="'+esc(r.id)+'"'+(speakerView===r.id?' selected':'')+'>'+esc(r.name)+'</option>').join('')}<option value="none"${speakerView==='none'?' selected':''}>選択なし（全員右）</option></select></label>

            <button data-c="topic-graph">🕸 トピックグラフ</button>
            <button data-c="roles">キャラクター管理</button>
            ${be ? '<button data-c="openbe">ノートを開く</button>' : ''}
            ${t || (isRec(view) && view !== DIARY) ? '<button data-c="conf">⚙ 設定</button>' : ''}
          </div>
        </details>
      </div>
      <div id="c-msgs"></div>
      <div id="c-selbar"></div>
      <div id="c-redit" class="c-redit" style="display:none"></div>
      <div id="c-target" class="c-target" ${sourceIds ? 'style="display:none"' : ''}></div>
      <div id="c-reply" class="c-reply" style="display:none"></div>
      ${sourceIds ? '' : `<div class="c-compose"><div id="c-mention" class="rp-mention" style="display:none"></div>
        <textarea id="c-in" rows="1" placeholder="書く（Enter で送る・Shift+Enter で改行）" title="@ で、別のメモやノートを入れられます"></textarea>
        <div class="c-tools"><button data-c="find-reply" id="c-find-reply" class="${replyBrowse ? 'on' : ''}" title="${replyBrowse ? '探すをやめる' : '返信先を探す'}">${replyBrowse ? '✕' : '🔍'}</button><button data-tg="up" title="上位トピックを追加">↑</button><button data-c="attach" title="ファイルや画像を付ける">📎</button></div></div>`}
    </div>`;
  paint(true); selbar(); showReply(); showTarget();
  // 上の帯の「絞り込み」と「表示・操作」は、どちらか一方だけ開く（開いたら、もう一方を閉じる）
  const headEl = document.querySelector('#pane .chat-head');
  if (headEl && !headEl.dataset.oneOpen) {
    headEl.dataset.oneOpen = '1';
    headEl.addEventListener('toggle', e => {
      const d = e.target;
      if (d.tagName === 'DETAILS' && d.open) headEl.querySelectorAll('details').forEach(o => { if (o !== d) o.open = false; });
    }, true);
  }
  // 画面の外を押すと、上の帯で開いている「絞り込み」「表示・操作」を閉じる
  if (!document.body.dataset.headOutsideClose) {
    document.body.dataset.headOutsideClose = '1';
    document.addEventListener('pointerdown', e => {
      document.querySelectorAll('#pane .chat-head details[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
    }, true);
  }
  const inp = $('#c-in'); if (inp) { inp.value = editingId ? editText : draft; fit(inp); inp.focus(); }
}
function fit(inp) { const big = inp.id === 'c-in', min = big ? 40 : 0, max = 180; inp.style.height = 'auto'; inp.style.height = Math.max(min, Math.min(inp.scrollHeight, max)) + 'px'; inp.style.overflowY = inp.scrollHeight > max ? 'auto' : 'hidden'; }
const wk = d => `${d}（${L.weekday(d)}）`;
const noteLabel = stem => { const n = ctx.notes().find(x => x.stem === stem); return n ? (n.noid ? 'IDなし' : n.id) : null; };
// 本文: メンション（[@…](memo:ID)）は、押すとそのメモへ
const body = text => renderMd(text);
const firstLine = t => (t || '').replace(/\[@[^\]]*\]\(memo:[^)]*\)\s*/g, '').split('\n').find(x => x.trim()) || '';
// 返信のメモに、元のメモを引用として出す（押すと、元のメモへ）
export const repliesOf = Relations.repliesOf;   // 返信先（いくつでも。昔の 1 つだけの形も読む）
const quoteHtml = m => (m.noteReplies || []).map(ref=>{ const n=ctx.notes().find(x=>x.stem===ref.stem) || ctx.get(ref.s,ref.id); return '<div class="b-quote b-note-quote" data-reply-note="'+esc(n?.stem||ref.stem)+'"><b>↩ ノート '+esc(n?.id||ref.id)+'</b><span>'+esc((n?.title||n?.body||'（ノートなし）').slice(0,90))+'</span></div>'; }).join('') + repliesOf(m).map(id => { const o = msg(id); return o ? `<div class="b-quote" data-qm="${esc(o.id)}"><b>${esc(o.topic ? o.topic + ' ・ ' : '')}${hm(o.t)}</b><span>${esc(firstLine(o.text).slice(0, 80))}</span></div>` : '<div class="b-quote gone"><span>（消されたメモ）</span></div>'; }).join('');
// 入力欄の上の「返信先」
// 書き込み先: 所属トピックと上位トピック（複数可）。変更しない限り次のメモにも引き継ぐ。
const topicLabel = n => n === '' ? '未所属' : n === DIARY ? '日記' : n;
// 「↩ 探す」: 別のトピックを見ながら返信先を探す状態。もう一度押す・Esc でやめられる
function updateFindBtn() { const b = $('#c-find-reply'); if (!b) return; b.textContent = replyBrowse ? '✕' : '🔍'; b.title = replyBrowse ? '探すをやめる' : '返信先を探す'; b.classList.toggle('on', !!replyBrowse); }
function cancelBrowse() { replyBrowse = null; updateFindBtn(); toast('返信先を探すのをやめました'); }
// 「↩ 探す」: メモ・ノートを文字で探して、返信先に足す（複数選べる。選んだものは入力欄の上に並び、×で外せる）
function replyPicker(anchor) {
  document.querySelectorAll('.tgpick').forEach(x => x.remove());
  const box = document.createElement('div'); box.className = 'tgpick rppick';
  box.innerHTML = '<input class="tgs" placeholder="返信先を探す（メモ・ノートの文字、ID）"><div class="tgl"></div><div class="row" style="margin:6px 0 0"><span class="sub rp-n"></span><span class="grow"></span><button type="button" class="rp-browse" title="左のトピック一覧で別のトピックを開きながら、メモの ↩ を押して選びます">トピックを見ながら探す</button><button type="button" class="p rp-done">完了</button></div>';
  const inp = box.querySelector('.tgs'), list = box.querySelector('.tgl');
  const noteTitle = n => esc((n.title || (n.body || '').split('\n').find(x => x.trim()) || '').replace(/^#+\s*/, '').slice(0, 26));
  const draw = () => {
    const q = inp.value.trim().toLowerCase();
    const memos = doc.messages.filter(x => !q || (x.text || '').toLowerCase().includes(q)).sort((a, b) => b.t - a.t).slice(0, q ? 20 : 8);
    const notes = ctx.notes().filter(n => n.stem && (!q || (n.id || '').toLowerCase().includes(q) || (n.title || '').toLowerCase().includes(q) || (n.body || '').toLowerCase().includes(q))).slice(0, q ? 20 : 6);
    const onM = id => replyTos.includes(id), onN = stem => noteReplyTos.some(x => x.stem === stem);
    list.innerHTML = memos.map(m => `<div class="tgi${onM(m.id) ? ' on' : ''}" data-rm="${esc(m.id)}">${onM(m.id) ? '☑ ' : '☐ '}💬 ${first(m.text)} <small>${hm(m.t)}</small></div>`).join('')
      + notes.map(n => `<div class="tgi${onN(n.stem) ? ' on' : ''}" data-rn="${esc(n.stem)}">${onN(n.stem) ? '☑ ' : '☐ '}📝 ${n.noid ? '' : esc(n.id) + ' '}${noteTitle(n)}</div>`).join('')
      || '<div class="sub" style="padding:6px">見つかりません</div>';
    box.querySelector('.rp-n').textContent = (replyTos.length + noteReplyTos.length) ? `${replyTos.length + noteReplyTos.length} 件を返信先に` : '';
  };
  list.addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]'), rn = e.target.closest('[data-rn]');
    if (rm) { const id = rm.dataset.rm; if (replyTos.includes(id)) replyTos = replyTos.filter(x => x !== id); else replyTos.push(id); }
    else if (rn) { const note = ctx.notes().find(n => n.stem === rn.dataset.rn); if (!note) return; if (noteReplyTos.some(x => x.stem === note.stem)) noteReplyTos = noteReplyTos.filter(x => x.stem !== note.stem); else noteReplyTos.push({ s: note.s, id: note.id, stem: note.stem }); }
    else return;
    showReply(); draw(); inp.focus();
  });
  const close = () => { box.remove(); document.removeEventListener('mousedown', away, true); const i = $('#c-in'); if (i) i.focus(); };
  const away = e => { if (!box.contains(e.target) && !anchor.contains(e.target)) { box.remove(); document.removeEventListener('mousedown', away, true); } };
  box.querySelector('.rp-done').onclick = close;
  // トピックを行き来しながら探す（書きかけと書き込み先は、そのまま）。見つけたメモの ↩ を押すと、返信先に足されて戻る
  box.querySelector('.rp-browse').onclick = () => {
    box.remove(); document.removeEventListener('mousedown', away, true);
    replyBrowse = { topic: doc.target.topic, ups: [...doc.target.ups] }; updateFindBtn();
    toast('返信先を探し中：別のトピックのメモの ↩ を押す（やめるには Esc）');
  };
  inp.addEventListener('input', draw);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); const f = list.querySelector('[data-rm],[data-rn]'); if (f) f.click(); }
  });
  draw();
  const r = anchor.getBoundingClientRect(); box.style.width = '360px'; box.style.left = Math.max(8, Math.min(r.left, innerWidth - 380)) + 'px'; box.style.bottom = Math.max(8, innerHeight - r.top + 6) + 'px';
  document.body.append(box); setTimeout(() => document.addEventListener('mousedown', away, true), 0); inp.focus();
}
function showTarget() {
  const el = $('#c-target'); if (!el) return; const t = doc.target;
  // 入力欄の上は「↑ 上位トピック名」だけ（所属は上の見出しで分かる）。上位が無いときは、何も出さない。名前を押すと外れる
  el.innerHTML = t.ups.length ? `<span class="tg-l">↑</span>${t.ups.map(u => `<span class="tg tg-up" data-tgx="${esc(u)}" title="外す">${esc(u)} ×</span>`).join('')}` : '';
  el.style.display = t.ups.length ? '' : 'none';
}
// 選ぶ窓（探せる。最近使った順。「上」は、そこで過去に使ったものが先）。multi は、押すごとに入れる・外す
function openPicker(anchor, { multi, selected, near, exclude = [], extra = [], onPick }) {
  document.querySelectorAll('.tgpick').forEach(x => x.remove());
  const box = document.createElement('div'); box.className = 'tgpick';
  const sel = new Set(selected), names = [...extra, ...recentNames(near, exclude)];
  const draw = q => { box.querySelector('.tgl').innerHTML = names.filter(n => !q || topicLabel(n).toLowerCase().includes(q)).map(n => `<div class="tgi${sel.has(n) ? ' on' : ''}" data-n="${esc(n)}">${multi ? (sel.has(n) ? '☑ ' : '☐ ') : ''}${esc(topicLabel(n))}</div>`).join('') || '<div class="sub" style="padding:6px">なし</div>'; };
  box.innerHTML = '<input class="tgs" placeholder="探す"><div class="tgl"></div>' + (multi ? '<button class="tgnew" type="button">＋ 新しいトピック</button><div class="tgcreate" style="display:none;gap:4px;margin-top:6px"><input class="tgname" placeholder="新しいトピック名" style="min-width:0;flex:1"><button class="tgmake">作る</button><button class="tgcancel">×</button></div><button class="p tgok">決定</button>' : ''); draw('');
  const r = anchor.getBoundingClientRect(); box.style.left = Math.max(8, Math.min(r.left, innerWidth - 270)) + 'px'; box.style.bottom = Math.max(8, innerHeight - r.top + 6) + 'px'; document.body.append(box);
  const close = () => { box.remove(); document.removeEventListener('mousedown', away, true); }, away = e => { if (!box.contains(e.target)) close(); };
  setTimeout(() => document.addEventListener('mousedown', away, true), 0);
  box.querySelector('.tgs').addEventListener('input', e => draw(e.target.value.trim().toLowerCase())); box.querySelector('.tgs').focus();
  box.querySelector('.tgl').addEventListener('click', e => { const it = e.target.closest('[data-n]'); if (!it) return; const n = it.dataset.n; if (multi) { if (sel.has(n)) sel.delete(n); else sel.add(n); draw(box.querySelector('.tgs').value.trim().toLowerCase()); } else { close(); onPick(n); } });
  if (multi) {
    const form = box.querySelector('.tgcreate'), nameIn = box.querySelector('.tgname');
    box.querySelector('.tgnew').onclick = () => { form.style.display = form.style.display === 'none' ? 'flex' : 'none'; if (form.style.display !== 'none') nameIn.focus(); };
    box.querySelector('.tgcancel').onclick = () => { form.style.display = 'none'; };
    const make = () => {
      const name = nameIn.value.trim();
      const bad = nameProblem(name) || (names.includes(name) ? `「${name}」と同じ名前が、すでにあります` : ''); if (bad) return alert(bad);
      doc.topics.push({ name, type: 'bubble', stamp: true, entry: null });
      names.unshift(name); sel.add(name); save(); ctx.renderList();
      nameIn.value = ''; form.style.display = 'none'; box.querySelector('.tgs').value = ''; draw('');
    };
    box.querySelector('.tgmake').onclick = make;
    nameIn.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); make(); } };
  }
  const ok = box.querySelector('.tgok'); if (ok) ok.onclick = () => { close(); onPick([...sel]); };
}
const actorName = id => id && id !== 'self' ? (roleLibrary.find(r=>r.id===id)?.name || '不明なキャラ') : doc.selfName;
function showReply() {
  const el = $('#c-reply'); if (!el) return; const os = replyTos.map(id => msg(id)).filter(Boolean); replyTos = os.map(o => o.id);
  if (!os.length && !noteReplyTos.length && !editingId) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const targets=noteReplyTos.map(r=>({ref:r,n:ctx.notes().find(n=>n.stem===r.stem)}));
  const em = editingId && msg(editingId);
  el.style.display = ''; el.innerHTML = '<div class="rq-list">' +
    (em ? '<div class="rq rq-edit"><b>✎ 編集中（Enter で完了・Esc でやめる）</b><span>'+esc(firstLine(em.text).slice(0,100))+'</span><button data-c="edit-cancel" title="編集をやめる">×</button></div>' : '') +
    os.map(o => '<div class="rq"><b>'+esc(o.topic ? o.topic + ' ・ ' : '')+hm(o.t)+'</b><span>'+esc(firstLine(o.text).slice(0,120))+'</span><button data-c="rcancel" data-id="'+esc(o.id)+'">×</button></div>').join('') +
    targets.map(x=>'<div class="rq"><b>ノートへ返信</b><span>'+esc(x.n?.title || x.ref.id || '（元ノートなし）')+'</span><button data-c="cancel-note-reply" data-stem="'+esc(x.ref.stem)+'">×</button></div>').join('') + '</div>';
}
// ↩ を押したとき: 編集中のメモがあれば、その返信先に。「返信先を編集」中なら、そのメモに。なければ、送るメモの返信先に（いくつでも）
export function startReply(id) {
  if (editCtx) { if (id !== editCtx.m.id && !editCtx.reps.includes(id)) editCtx.reps.push(id); editCtx.redraw(); return; }
  if (redit) { toggleReplyOf(redit, id); return; }
  if (replyBrowse) {doc.target={topic:replyBrowse.topic,ups:[...replyBrowse.ups]};replyBrowse=null;updateFindBtn();}
  if (!replyTos.includes(id)) replyTos.push(id); showReply(); showTarget(); const i = $('#c-in'); if (i) i.focus();
}
// その日のチャットメモを、チャットメモの画面で（「すべて」の日ごと表示）。日記の「今日のチャットメモ一覧」から
export function openDay(date) { viewMode = 'day'; day = date; doc.viewMode = 'day'; open('*'); }
export function replyToNote(note) {
  if(!note || !note.stem) return;
  if(!noteReplyTos.some(x=>x.stem===note.stem))
    noteReplyTos.push({s:note.s,id:note.id,stem:note.stem});
  // ノートから開くときは、最後の所属トピックを引き継ぐ。
  const dest=doc.target.topic || '';
  open(dest);
  showReply();
}
export function noteBacklinks(note) {
  return doc.messages.filter(m => (m.noteReplies || []).some(r=>r.stem===note.stem || (r.s===note.s && r.id===note.id)));
}
function toggleReplyOf(mid, id) {
  const m = msg(mid); if (!m || id === mid) return; const reps = repliesOf(m).slice(), at = reps.indexOf(id);
  if (at >= 0) reps.splice(at, 1); else reps.push(id);
  m.replies = reps; delete m.reply; m.edited = Date.now(); save(); showRedit(); paint();
}
function showRedit() {
  const el = $('#c-redit'); if (!el) return; const m = redit && msg(redit);
  if (!m) { el.style.display = 'none'; el.innerHTML = ''; redit = null; return; }
  const os = repliesOf(m);
  el.style.display = ''; el.innerHTML = `<b>返信先の編集</b>　「${esc(firstLine(m.text).slice(0, 16))}」: ${os.map(id => { const o = msg(id); return `<span class="b-chip" data-rdel="${esc(id)}" title="外す">↩ ${esc(o ? firstLine(o.text).slice(0, 16) : '（消されたメモ）')} ×</span>`; }).join('') || '<span class="sub">なし</span>'}　<span class="sub">返信先にするメモの ↩ か、メモそのものを押すと足せます（もう一度で外れます）</span><button class="p" data-c="rdone">完了</button>`;
}
export function startReplyEdit(id) { redit = id; showRedit(); }
function showChildren() {
  const box = $('#c-children'); if (!box) return;
  const hidden = !!sourceIds || !!backend() || view === '*' || view === '';
  box.hidden = hidden;
  if (hidden) { box.innerHTML = ''; return; }
  const relations = TopicNav.candidates(doc.messages,view);
  const section = (label,kind,items,selected) => '<div class="c-filter-row"><span class="sub">' + label + '</span>' +
    items.map(r => '<button type="button" class="' + (selected.has(r.name) ? 'on' : '') + '" data-topic-filter="' + kind +
      '" data-filter-name="' + esc(r.name) + '" aria-pressed="' + selected.has(r.name) + '">' + esc(r.name) + ' ' + r.count + '</button>').join('') +
    '<button type="button" data-add-topic-filter="' + kind + '" title="トピックを探して追加">＋</button></div>';
  const chosen = [...new Set([...upperFilter, ...childFilter])];
  const names = chosen.map(esc).join('・');
  box.innerHTML = '<details class="c-filter"' + (filterOpen ? ' open' : '') + '>' +
    '<summary title="絞り込み（上位・下位トピック）">' + FUNNEL + (chosen.length ? '<span class="c-filter-count">' + chosen.length + '</span><span class="c-filter-now">' + names + '</span>' : '') + '</summary>' +
    '<div class="c-filter-body">' +
    section('上位トピック','upper',relations.upper,upperFilter) +
    section('下位トピック','lower',relations.lower,childFilter) +
    '<div class="c-filter-controls">' +
    '<button data-filter-clear>絞り込み解除</button>' +
    '<button class="p" data-filter-jump ' + (chosen.length ? '' : 'disabled') + '>選択先へ移動' + (chosen.length===1 ? '：'+esc(chosen[0]) : '') + '</button></div>' +
    '</div></details>';
  if (!box.dataset.bound) {
    box.dataset.bound = '1';
    box.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('details.c-filter')) filterOpen = e.target.open; }, true);
  }
}
function toggleTopicFilter(kind,name) {
  const set = kind === 'upper' ? upperFilter : childFilter;
  if (set.has(name)) set.delete(name); else { set.add(name); lastTopicSelection = name; }
  const chosen = [...upperFilter,...childFilter];
  if (!chosen.includes(lastTopicSelection)) lastTopicSelection = chosen[chosen.length-1] || null;
  // 選択した条件は次のメモの書き込み先にも反映する。ただし所属と上位はメモごとの属性で固定階層ではない。
  if (kind === 'upper') {
    TopicPrefs.open(doc,view);
    TopicPrefs.selectUpper(doc,[...upperFilter]);
  } else if (childFilter.size === 1) {
    const child = [...childFilter][0];
    TopicPrefs.open(doc,child);
    TopicPrefs.selectUpper(doc,[...new Set([view,...doc.target.ups])]);
  } else if (!childFilter.size) TopicPrefs.open(doc,view);
  save(); showTarget(); paint();
}
function selectFilterDestination() {
  const choices = [...new Set([...upperFilter,...childFilter])];
  if (!choices.length) return;
  if (choices.length === 1) return open(choices[0]);
  dialog('<h3>移動先を選ぶ</h3><div class="idex-choose-target">' +
    choices.map(name => '<button data-fjump="' + esc(name) + '">' + esc(name) + '</button>').join('') +
    '</div>', close => {
      $('#modal .box').onclick = e => {
        const b = e.target.closest('[data-fjump]'); if (b) { const name=b.dataset.fjump; close(); open(name); }
      };
    });
}
function addTopicFilter(kind,anchor) {
  const selected = kind === 'upper' ? upperFilter : childFilter;
  openPicker(anchor,{ multi:true, selected:[...selected], near:view, exclude:[view],
    onPick: list => {
      if(kind==='upper') upperFilter=new Set(list); else childFilter=new Set(list);
      lastTopicSelection=list[list.length-1] || null;
      if(kind==='upper') { TopicPrefs.open(doc,view); TopicPrefs.selectUpper(doc,list); }
      else if(kind==='lower' && list.length===1) { TopicPrefs.open(doc,list[0]); TopicPrefs.selectUpper(doc,[view,...doc.target.ups]); }
      save(); showTarget(); paint();
    }});
}

function paint(toBottom) {
  showChildren();
  const box = $('#c-msgs'); if (!box) return; const keepTop = box.scrollTop;
  const list = entries(), showTopic = view === '*'; let lastDay = '';
  box.innerHTML = list.length ? list.map(e => {
    if (e.kind === 'line') return `<div class="bub" data-i="${e.i}"><div class="b-body md">${body(e.text)}</div><div class="b-foot"><span class="b-left"></span><span class="b-time">${e.time}</span></div></div>`;
    const m = e.m, d = dayOfMsg_(m), head = viewMode === 'all' && d !== lastDay ? `<div class="dsep">${wk(d)}</div>` : ''; lastDay = d;
    const tags = (doc.noted[m.id] || []).map(st => ({ st, label: noteLabel(st) })).filter(x => x.label).map(x => `<span class="ntag" data-stem="${esc(x.st)}" title="ノート化されたメモを開く">📝 ${esc(x.label)}</span>`).join('');
    const picked = sel && sel.has(m.id);
    const rk = recKindsOf(m)[0], dayLink = rk ? `<span class="gday" data-gday="${esc(rk)}|${dayOfMsg_(m)}" title="その日のノートを開く">📔 ${esc(rk === DIARY ? '日記' : rk)}</span>` : '';
    return `${head}<div class="bub${m.actor && speakerView !== 'none' && m.actor !== speakerView ? ' other-speaker' : ''}${sel ? ' pick' : ''}${picked ? ' picked' : ''}" data-m="${m.id}">
      <div class="b-meta">${esc(actorName(m.actor))}</div>${quoteHtml(m)}<div class="b-body md">${body(m.text)}</div>
      <div class="b-foot"><span class="b-left">${sel ? `<input type="checkbox" class="bck" ${picked ? 'checked' : ''}> ` : ''}${m.topic && !dayLink && (showTopic || m.topic !== view) ? `<span class="b-tp" data-goto="${esc(m.topic)}">${esc(m.topic)}</span> ` : ''}${upsOf(m).filter(u => u !== view).map(u => `<span class="b-up" data-goto="${esc(u)}">↑${esc(u)}</span>`).join(' ')}${dayLink}${tags ? ' ' + tags : ''}</span><span class="b-time">${hm(m.t)}</span></div><span class="b-rep" data-rep="${m.id}" title="返信">↩</span><span class="b-rep b-rep-e" data-redit-btn="${m.id}" title="返信先を編集（足す・外す）">⇆</span></div>`;
  }).join('') : '<div class="none">まだありません。下の欄に書くと、ここに並びます</div>';
  box.scrollTop = toBottom ? box.scrollHeight : keepTop;   // 編集・選択をやめても、見ていた場所にとどまる（開いたとき・送ったときだけ、いちばん下へ）
}
function selbar() {
  const b = $('#c-selbar'); if (!b) return;
  b.innerHTML = sel ? `<span>${sel.size} 件選択</span><span class="grow"></span><button data-c="selall">全部</button><button data-c="selclear" title="選択を全部外す" ${sel.size ? '' : 'disabled'}>解除</button><button data-c="selcopy" ${sel.size ? '' : 'disabled'}>コピー</button><button data-c="selmove" title="所属・上位トピックを変える" ${sel.size ? '' : 'disabled'}>トピック</button><button data-c="selspeaker" title="話した人を変える" ${sel.size ? '' : 'disabled'}>話者</button><button data-c="seldel" class="danger" ${sel.size ? '' : 'disabled'}>消す</button><button class="p" data-c="tonote" ${sel.size ? '' : 'disabled'}>ノート化</button><button data-c="selno">やめる</button>` : '';
  b.style.display = sel ? 'flex' : 'none';
}

// ===== 送る =====
// 送ったメモの URL に、ページの題を自動でつける（毎回自分で表示名を打たなくていいように）。題が取れなければ、そのまま
import UrlLinks from '../url-links.js';
let bareNext = false;   // Ctrl+Shift+V で貼った（裸で入れる）: 次に送るメモは、題をつけない
document.addEventListener('keydown', e => { if (e.target && e.target.id === 'c-in' && (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key || '').toLowerCase() === 'v') bareNext = true; });
async function titleMemo(m) {
  if (bareNext) { bareNext = false; return; }
  const before = m.text;
  const after = await UrlLinks.withUrlTitles(before, u => ctx.api.urlTitle(u));
  if (after !== before && m.text === before && msg(m.id)) { m.text = after; save(); paint(); }
}
function send() {
  const inp = $('#c-in'), text = inp.value.trim(); if (!text) return;
  const be = backend(), now = Date.now();
  if (be) {
    const list = parts(be.get()); list.push((be.stamp !== false ? hm(now) + ' ' : '') + text.replace(/\n{2,}/g, '\n')); be.set(list.join('\n\n'));
  } else {
    const m = { id: uid(), topic: doc.target.topic, t: now, text, actor: speakerView === 'none' ? 'self' : speakerView };
    const upsT = doc.target.ups.filter(u => u && u !== doc.target.topic); if (upsT.length) m.ups = [...upsT];
    const rs = replyTos.filter(id => msg(id)); if (rs.length) m.replies = rs; replyTos = [];
    if (noteReplyTos.length) m.noteReplies=noteReplyTos.map(x=>({...x})); noteReplyTos=[];
    doc.messages.push(m); if (replyBrowse) { replyBrowse=null; updateFindBtn(); } save();
    titleMemo(m);   // 裸の URL は、ページの題つきのリンクに（送ったあと、取れたものから）
    for (const kind of recKindsOf(m)) {   // 日記・時系列記録の、その日のノートにも（時刻つきの行）。日記を上位にしたメモも入る
      const date = L.dayOf(L.now(new Date(now))), line = `${hm(now)} ${text.replace(/\n{2,}/g, '\n')}`;
      ctx.api.appendToDay(kind, date, line).then(d => { const k = kind + '|' + date, mr = doc.mirror[k] || (doc.mirror[k] = { blocks: [], map: [] }); mr.blocks = blocks(d && d.body != null ? d.body : line); mr.map.push({ blk: line, part: text.replace(/\n{2,}/g, '\n'), memo: m.id }); save(); ctx.refreshDiaries(); });
    }   // 日記の行にも（片方向。あとで日記を直しても、メモは変わらない）
  }
  inp.value = ''; setDraft(''); fit(inp); mentionOff(); showReply(); paint(true); ctx.renderList();
}

// ===== @ で、別のメモ・ノートを入れる =====
let mn = [];
let mtx = null;   // いま @ の候補を出している入力欄と、その候補の枠（送る欄・編集中の欄）
function mentionOff() { mn = []; const b = mtx ? mtx.box : $('#c-mention'); if (b) b.style.display = 'none'; }
function mentionList(inp0, box0) {
  if (inp0) mtx = { inp: inp0, box: box0 }; else mtx = { inp: $('#c-in'), box: $('#c-mention') };
  const inp = mtx.inp, box = mtx.box; if (!inp || !box) return;
  const before = inp.value.slice(0, inp.selectionStart), m = before.match(/@([^\s@]{0,20})$/);
  if (!m) return mentionOff();
  const q = m[1].toLowerCase();
  const memos = doc.messages.filter(x => !q || x.text.toLowerCase().includes(q)).sort((a, b) => b.t - a.t).slice(0, 5).map(x => ({ kind: 'memo', m: x }));
  const notes = ctx.notes().filter(n => !n.noid && (!q || n.id.includes(q) || (n.title || '').toLowerCase().includes(q) || (n.body || '').toLowerCase().includes(q))).slice(0, 4).map(n => ({ kind: 'note', n }));
  mn = [...memos, ...notes];
  box.innerHTML = mn.map((x, i) => `<div class="mn${i === 0 ? ' on' : ''}" data-mn="${i}">${x.kind === 'memo' ? `💬 ${first(x.m.text)} <small>${hm(x.m.t)}</small>` : `📝 ${esc(x.n.id)} ${esc((x.n.title || x.n.body.split('\n')[0] || '').slice(0, 24))}`}</div>`).join('');
  box.style.display = mn.length ? 'block' : 'none';
}
function pickMention(i) {
  const x = mn[i]; if (!x) return;
  const inp = mtx ? mtx.inp : $('#c-in'), pos = inp.selectionStart, tok = x.kind === 'memo' ? `[@${(x.m.text.split('\n')[0] || '').replace(/[\[\]()]/g, '').slice(0, 14)}](memo:${x.m.id}) ` : `:${x.n.id} `;
  const before = inp.value.slice(0, pos).replace(/@([^\s@]{0,20})$/, tok);
  inp.value = before + inp.value.slice(pos); inp.selectionStart = inp.selectionEnd = before.length; if (inp.id === 'c-in') setDraft(inp.value); mentionOff(); inp.focus(); if (inp.id === 'c-in') fit(inp); else inp.dispatchEvent(new Event('input'));
}

// ===== メモの操作 =====
function menuFor(e, bub) {
  const be = backend();
  if (bub.dataset.m) {
    const m = msg(bub.dataset.m);
    popMenu(e, [
      ['☑ 選択', () => { sel = new Set([m.id]); lastSel = m.id; paint(); selbar(); }],
      ['📝 ノート化', () => toNoteDialog([m])],
      ['✎ 編集', () => editMsg(bub, m)],
      ['🏷 トピックを変える', () => moveDialog(m)],
      ['🗣 話した人を変える', () => speakerDialog([m])],
      ['📋 コピー', () => navigator.clipboard.writeText(m.text)],
      ['🗑 消す', () => removeMsg(m), true]
    ]);
  } else if (bub.dataset.i !== undefined && be) {
    const i = +bub.dataset.i;
    popMenu(e, [['✎ 書き直す', () => editLine(bub, i)], ['📋 コピー', () => navigator.clipboard.writeText(entries()[i].text)], ['🗑 消す', () => removeLine(i), true]]);
  }
}
function editBox(bub, text, onSave, m) {
  const b = bub.querySelector('.b-body');
  b.innerHTML = `<div class="b-chips"></div><textarea class="b-edit"></textarea><div class="rp-mention b-emn" style="display:none"></div><div class="row"><button class="p" data-ok>完了</button><button data-no>やめる</button></div>`;
  const ta = b.querySelector('textarea'), chips = b.querySelector('.b-chips'), mbox = b.querySelector('.b-emn'); ta.value = text; ta.style.height = Math.max(60, ta.scrollHeight) + 'px'; ta.focus();
  const reps = m ? repliesOf(m).slice() : [];
  const MEN = /\[@([^\]]*)\]\(memo:([^)\s]+)\)/g;
  const drawChips = () => {   // 返信先（いくつでも）・メンションを、×で外せる印にする（返信先は、別のメモの ↩ や「＋ 返信先を追加」で足せる）
    const ms = [...ta.value.matchAll(MEN)];
    chips.innerHTML = reps.map(id => { const o = msg(id); return `<span class="b-chip b-rep2" data-crep="${esc(id)}" title="返信先を外す">↩ ${esc(o ? firstLine(o.text).slice(0, 18) : '（消されたメモ）')} ×</span>`; }).join('') + '<span class="b-chip" data-cpick>↩ ＋ 返信先を追加</span>' + (pickReply ? '<span class="b-chip on">返信先にするメモを押してください（Esc でやめる）</span>' : '') + ms.map((x, i) => `<span class="b-chip" data-cm="${i}" title="このメンションを外す">@${esc(x[1])} ×</span>`).join('');
  };
  if (m) editCtx = { m, reps, redraw: drawChips };
  b.addEventListener('click', e => {
    const cr = e.target.closest('[data-crep]'); if (cr) { const i = reps.indexOf(cr.dataset.crep); if (i >= 0) reps.splice(i, 1); drawChips(); return; }
    if (e.target.closest('[data-cpick]')) { pickReply = id => { if (id !== (m && m.id) && !reps.includes(id)) reps.push(id); pickReply = null; drawChips(); }; drawChips(); return; }
    const c = e.target.closest('[data-cm]'); if (c) { let k = 0; ta.value = ta.value.replace(MEN, t => (k++ === +c.dataset.cm ? '' : t)).replace(/ {2,}/g, ' '); drawChips(); ta.focus(); }
  });
  ta.addEventListener('input', () => { drawChips(); mentionList(ta, mbox); });
  ta.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape' && mn.length) { e.stopPropagation(); mentionOff(); return; }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); e.stopPropagation();
      if (mn.length) pickMention(0); else b.querySelector('[data-ok]').click();
    }
  });
  mbox.addEventListener('mousedown', e => { const it = e.target.closest('[data-mn]'); if (it) { e.preventDefault(); pickMention(+it.dataset.mn); } });
  drawChips();
  b.querySelector('[data-ok]').onclick = () => { mentionOff(); pickReply = null; editCtx = null; onSave(ta.value.trim(), reps); };
  b.querySelector('[data-no]').onclick = () => { mentionOff(); pickReply = null; editCtx = null; paint(); };
}
// 編集: そのメモの文章を、下のいつもの入力欄に出して直す。Enter で完了・Esc（または ×）でやめる。返信先も同じ欄で足したり外したりできる
function editMsg(bub, m) { startEdit(m); }
function startEdit(m) {
  if (editingId) cancelEdit();
  const inp = $('#c-in'); if (!inp) return;
  editBackup = { replyTos: replyTos.slice(), noteReplyTos: noteReplyTos.map(x => ({ ...x })) };
  editingId = m.id; editText = m.text;
  replyTos = repliesOf(m).filter(id => id !== m.id); noteReplyTos = (m.noteReplies || []).map(x => ({ ...x }));
  inp.value = m.text; fit(inp); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
  showReply();
}
function endEdit() {
  editingId = null; editText = '';
  replyTos = editBackup ? editBackup.replyTos : []; noteReplyTos = editBackup ? editBackup.noteReplyTos : []; editBackup = null;
  const inp = $('#c-in'); if (inp) { inp.value = draft; fit(inp); }
  showReply();
}
function cancelEdit() { if (editingId) endEdit(); }
function finishEdit() {
  const inp = $('#c-in'), m = msg(editingId); if (!inp) return;
  if (!m) return cancelEdit();
  const v = inp.value.trim();
  if (!v) { toast('空にはできません（消すときは、メモを右クリック →「消す」）'); return; }
  const old = m.text; m.text = v;
  if (replyTos.length) m.replies = replyTos.slice(); else delete m.replies;
  delete m.reply;
  if (noteReplyTos.length) m.noteReplies = noteReplyTos.map(x => ({ ...x })); else delete m.noteReplies;
  m.edited = Date.now();   // スマホと共有するとき、新しい方が勝つ
  endEdit(); save(); memoToDay(m, old, false); paint(); ctx.renderList();
}   // edited: スマホと共有するとき、新しい方が勝つ
function editLine(bub, i) {
  const be = backend(), list = parts(be.get()), e = entries()[i];
  editBox(bub, e.text, v => { if (v) list[i] = (e.time ? e.time + ' ' : '') + v.replace(/\n{2,}/g, '\n'); else list.splice(i, 1); be.set(list.join('\n\n')); paint(); });
}
function removeLine(i) { const be = backend(), list = parts(be.get()); list.splice(i, 1); be.set(list.join('\n\n')); paint(); }
function removeMsg(m) {
  if (!confirm('このメモを消しますか？（復元用に残しておきます。ノートにしたものは、残ります）')) return;
  doc.messages = doc.messages.filter(x => x !== m); doc.trash.push({ ...m, deleted: Date.now() });
  save(); memoToDay(m, m.text, true); paint(); ctx.renderList();
}
// トピック（下）と上を、変える。1 件でも、選んだ複数でも
function moveDialog(m) { setTopicsDialog([m]); }
// 話した人（キャラ）を変える。1 件でも、複数選択でも。「自分」と、役のライブラリのキャラから選ぶ
function speakerDialog(ms) {
  const one = ms.length === 1 ? ms[0] : null;
  const people = [{ id: 'self', name: doc.selfName, icon: null }, ...roleLibrary.filter(r => !r.archived)];
  let chosenId = one ? (one.actor || 'self') : null;   // 複数のときは、選ぶまで変えない
  dialog(`<h3>${ms.length > 1 ? ms.length + ' 件の' : ''}話した人を変える</h3>
    <div class="sub">${one ? '今は: ' + esc(actorName(one.actor)) : '選んだメモの話した人を、まとめて変えます'}</div>
    <div id="sp-list" style="display:flex;flex-direction:column;gap:4px;margin:8px 0;max-height:320px;overflow:auto"></div>
    <div class="row"><button class="p" id="sp-ok" disabled>変える</button><button id="sp-no">やめる</button></div>`, close => {
    const draw = () => {
      $('#sp-list').innerHTML = people.map(p => `<div class="sdi${chosenId === p.id ? ' on' : ''}" data-p="${esc(p.id)}">${chosenId === p.id ? '● ' : '○ '}${p.icon && p.icon.emoji ? esc(p.icon.emoji) + ' ' : ''}${esc(p.name || 'キャラクター')}</div>`).join('');
      $('#sp-ok').disabled = chosenId === null;
    };
    draw();
    $('#sp-list').onclick = e => { const it = e.target.closest('[data-p]'); if (it) { chosenId = it.dataset.p; draw(); } };
    $('#sp-no').onclick = close;
    $('#sp-ok').onclick = () => {
      if (chosenId === null) return;
      for (const m of ms) m.actor = chosenId;   // 'self' は自分（書くときと同じ形）
      close(); save(); paint(); ctx.renderList();
      toast(`${ms.length} 件の話した人を「${actorName(chosenId)}」にしました`);
    };
  });
}
function setTopicsDialog(ms) {
  const one = ms.length === 1 ? ms[0] : null;
  let topicSel = one ? one.topic : null, upsSel = new Set(one ? upsOf(one) : []), upsTouched = !!one;
  const names = recentNames(one ? one.topic : undefined);
  const pendingTopics = [];
  dialog(`<h3>${ms.length > 1 ? ms.length + ' 件の' : ''}所属・上位トピックを変える</h3><input id="sd-q" placeholder="トピックを探す" style="width:100%;margin-bottom:6px"><div class="sd-cols"><div><div class="sub">所属トピック</div><div id="sd-t" class="sd-list"></div><div class="row" style="gap:4px;margin-top:6px"><input id="sd-new-t" style="min-width:0;flex:1" placeholder="新しい所属トピック"><button id="sd-create-t" type="button">＋ 作る</button></div></div><div><div class="sub">上位トピック（いくつでも）</div><div id="sd-u" class="sd-list"></div><div class="row" style="gap:4px;margin-top:6px"><input id="sd-new-u" style="min-width:0;flex:1" placeholder="新しい上位トピック"><button id="sd-create-u" type="button">＋ 作る</button></div></div></div><div class="row"><button class="p" id="sd-ok">決定</button><button id="sd-no">やめる</button></div>`, close => {
    const draw = () => {
      const q = $('#sd-q').value.trim().toLowerCase(), f = n => !q || topicLabel(n).toLowerCase().includes(q);
      $('#sd-t').innerHTML = ['', ...names].filter(f).map(n => `<div class="sdi${topicSel === n ? ' on' : ''}" data-t="${esc(n)}">${esc(topicLabel(n))}</div>`).join('');
      $('#sd-u').innerHTML = names.filter(f).map(n => `<div class="sdi${upsSel.has(n) ? ' on' : ''}" data-u="${esc(n)}">${upsSel.has(n) ? '☑ ' : '☐ '}${esc(topicLabel(n))}</div>`).join('');
    };
    draw(); $('#sd-q').oninput = draw; $('#sd-q').focus();
    // 所属・上位の選択画面内で作成し、作ったトピックを即座に選択する。
    const create = kind => {
      const input = $('#sd-new-' + kind), name = input.value.trim();
      { const bad = nameProblem(name); if (bad) return alert(bad); }
      doc.topics.push({ name, type: 'bubble', stamp: true, entry: null });
      names.unshift(name);
      if (kind === 't') topicSel = name;
      else { upsSel.add(name); upsTouched = true; }
      input.value = ''; $('#sd-q').value = ''; draw();
    };
    for (const kind of ['t', 'u']) {
      $('#sd-create-' + kind).onclick = () => create(kind);
      $('#sd-new-' + kind).onkeydown = e => {
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); create(kind); }
      };
    }
    $('#modal .box').onclick = e => { const t = e.target.closest('[data-t]'), u = e.target.closest('[data-u]'); if (t) { topicSel = t.dataset.t; draw(); } if (u) { upsTouched = true; if (upsSel.has(u.dataset.u)) upsSel.delete(u.dataset.u); else upsSel.add(u.dataset.u); draw(); } };
    $('#sd-no').onclick = close;
    $('#sd-ok').onclick = () => { doc.topics.push(...pendingTopics); const now = Date.now(); for (const m of ms) { if (topicSel !== null) m.topic = topicSel; if (upsTouched) { const list = [...upsSel].filter(x => x !== m.topic); if (list.length) m.ups = list; else delete m.ups; } m.edited = now; } save(); close(); paint(); showTarget(); ctx.renderList(); };
  });
}

// ===== 選んだメモを、ノートにする / ノートに引用する =====
const chosen = () => [...sel].map(msg).filter(Boolean).sort((a, b) => a.t - b.t);
const range = ms => { const f = ms[0], l = ms[ms.length - 1], d1 = dayOfMsg_(f), d2 = dayOfMsg_(l); return `${d1} ${hm(f.t)}${ms.length > 1 ? '〜' + (d1 === d2 ? '' : d2 + ' ') + hm(l.t) : ''}`; };
const source = m => `[${dayOfMsg_(m)} ${hm(m.t)}](${dayFile(dayOfMsg_(m))}#m-${m.id})`;
// ノート化: チャットメモ1件でも複数件でも、実体は一つのノートとしてID・索引で管理。
// 元のメモ本文をノートにコピーせず、メモの内部IDだけを記録する。
function toNoteDialog(explicitMemos) {
  const ms = explicitMemos || chosen(); if (!ms.length) return;
  const rootFree = () => { const r = ctx.notes().filter(n => n.s === 'd' && /^\d+$/.test(n.id)).map(n => +n.id); return ctx.free('d', String((r.length ? Math.max(...r) : 0) + 1)); };
  dialog(`<h3>${ms.length} 件のメモをノート化</h3>
    <div class="sub">元のチャットメモは残り、専用のノート画面にそのまま表示されます。内容のコピーは作りません。</div>
    <label>タイトル <input id="as-title" style="width:100%" placeholder="例: ヘーゲルの君主制論" value="${esc(firstLine(ms[0].text).slice(0, 45))}"></label>
    <label class="rad"><input type="radio" name="as" value="noid" checked> IDなし（あとで付ける）</label>
    <label class="rad"><input type="radio" name="as" value="id"> IDを付ける <input id="as-id" style="width:100px" value="${esc(rootFree())}"></label>
    <label class="rad"><input type="radio" name="as" value="parent"> 親ノートのID（分岐として付ける） <input id="as-parent" style="width:100px" placeholder="例: 1a"></label>
    <button type="button" id="as-explore">索引・本文を検索してIDを探す</button>
    <div class="row"><button class="p" id="as-ok">ノート化</button><button id="as-no">やめる</button></div>`, close => {
    $('#as-id').onfocus = () => { document.querySelector('input[name=as][value=id]').checked = true; };
    $('#as-parent').onfocus = () => { document.querySelector('input[name=as][value=parent]').checked = true; };
    $('#as-no').onclick = close;
    $('#as-explore').onclick = () => ctx.exploreId(id => { $('#as-id').value = id; document.querySelector('input[name=as][value=id]').checked = true; });
    $('#as-ok').onclick = async () => {
      const kind = document.querySelector('input[name=as]:checked').value; let id = null;
      if (kind === 'parent') {
        const p = $('#as-parent').value.trim().toLowerCase();
        if (!ctx.get('d', p)) return alert(`デジタルのノート ${p || '（空）'} がありません`);
        id = ctx.free('d', L.child(p));
      } else if (kind === 'id') {
        id = $('#as-id').value.trim().toLowerCase();
        if (!L.isId(id) || /^\d{8,}$/.test(id)) return alert('IDの形が違います（例: 12 や 3a）');
        if (ctx.get('d', id)) return alert(`ノート ${id} は既にあります`);
      }
      const title = $('#as-title').value.trim();
      // 失敗したときは画面を閉じずに再試行できるようにする。
      const note = await makeMemoGroup(ms, id, title);
      if (note) close();
    };
  });
}
async function makeMemoGroup(ms, id, title) {
  const data = { memoIds: ms.map(m => m.id) };
  await ctx.flush(); // 生成時点で元のメモの保存を先に完了させる
  const note = await ctx.api.createNote({ kind: 'memo-group', ...(id ? { id } : {}), data,
    title, created: L.now(), keywords: [] });
  if (!note || !note.stem) { alert('ノート化できませんでした'); return null; }
  if (!ctx.get('d', note.id)) ctx.notes().push(note);
  for (const m of ms) doc.noted[m.id] = [...new Set([...(doc.noted[m.id] || []), note.stem])];
  sel = null; save(); await ctx.refreshDiaries(); ctx.renderList(); ctx.openNote('d', note.id);
  toast('ノート化しました（元のチャットメモはそのまま残ります）');
  return note;
}

// ノート化されたノートの中央画面。各吹き出しは C_チャット.json の実際のメモを読む。
// 右側の索引・子・バックリンクは通常のノート画面が描画する。
let mgCur = null;   // いま見ているノート化メモ（キャラを変えたとき、描き直す）
// ノートの上の 1 行に入れる、表示するキャラの選択（案A）
export function memoGroupSpeakerHtml() {
  return `<select class="mgspk" data-mg-speaker title="表示するキャラ"><option value="self"${speakerView==='self'?' selected':''}>${esc(doc.selfName)}</option>${roleLibrary.map(r=>'<option value="'+esc(r.id)+'"'+(speakerView===r.id?' selected':'')+'>'+esc(r.name)+'</option>').join('')}<option value="none"${speakerView==='none'?' selected':''}>選択なし</option></select>`;
}
document.addEventListener('change', e => { if (e.target.matches && e.target.matches('[data-mg-speaker]') && mgCur) { speakerView = e.target.value; renderMemoGroup(mgCur.el, mgCur.note); } });
export function renderMemoGroup(el, note) {
  mgCur = { el, note };
  const rows = MemoGroup.entries(note.data, doc);
  el.innerHTML = `<div class="chat memo memo-note">
    <div class="memo-note-messages">${rows.map(({ id, memo: m }) => m
      ? `<div class="bub${m.actor && speakerView!=='none' && m.actor!==speakerView ? ' other-speaker' : ''}" data-source-memo="${esc(id)}">
          <div class="b-meta">${esc(actorName(m.actor))}</div>${quoteHtml(m)}
          <div class="b-body md">${body(m.text)}</div>
          <div class="b-foot"><span class="b-left">${m.topic ? esc(m.topic) : '未所属'}${upsOf(m).length ? '　↑ ' + upsOf(m).map(esc).join('、') : ''}</span><span class="b-time">${esc(MemoGroup.at(m.t))}</span></div>
          <button class="memo-note-source" data-source-memo-open="${esc(id)}" title="元のメモを開く">↗</button>
        </div>`
      : `<div class="bub missing">元のチャットメモ ${esc(id)} は見つかりません</div>`).join('')}</div>
  </div>`;
  el.onclick = e => {
    const noteRef=e.target.closest('[data-reply-note]'); if(noteRef){const n=ctx.notes().find(n=>n.stem===noteRef.dataset.replyNote);if(n)ctx.openNote(n.s,n.id);return;}
    const q = e.target.closest('[data-qm]');
    if (q) return gotoMemo(q.dataset.qm);
    const origin = e.target.closest('[data-source-memo-open]');
    if (origin) return gotoMemo(origin.dataset.sourceMemoOpen);
    if (mdClick(e)) return;
  };
}

// キャラクターを共有ライブラリで管理（旧なりきりチャットのK_rolesを引き継ぐ）。
function charactersDialog() {
  // 役のIDは発言に保存されているため、名前変更時もIDを維持する。
  // 「一覧から非表示」にしても歴史上の発言者は消さない。
  const row = r => '<div class="row c-role-entry" data-role-id="'+esc(r.id)+'">' +
    '<input class="c-role-name" value="'+esc(r.name)+'" aria-label="キャラクター名" style="flex:1;min-width:100px">' +
    '<label><input type="checkbox" class="c-role-archived"'+(r.archived?' checked':'')+'> 一覧から非表示</label></div>';
  dialog('<h3>キャラクター</h3>' +
    '<label>「私」の名前 <input id="c-self-name" value="'+esc(doc.selfName)+'"></label>' +
    '<div class="sub">キャラクターの名前変更は過去の発言にも反映。非表示にしても発言は残ります。</div>' +
    '<div class="c-role-list">'+roleLibrary.map(row).join('')+'</div>' +
    '<label>新しいキャラクター <input id="c-role-new" placeholder="名前"></label>' +
    '<div class="row"><button class="p" id="c-roles-save">保存</button><button id="c-roles-cancel">やめる</button></div>', close => {
    $('#c-roles-cancel').onclick = close;
    $('#c-roles-save').onclick = () => {
      const changes = new Map([...document.querySelectorAll('.c-role-list [data-role-id]')].map(el => [el.dataset.roleId, {
        name: el.querySelector('.c-role-name').value.trim(),
        archived: el.querySelector('.c-role-archived').checked
      }]));
      roleLibrary = roleLibrary.map(r => {
        const update = changes.get(r.id);
        return update ? { ...r, name: update.name || r.name, archived: update.archived } : r;
      });
      const newRole = $('#c-role-new').value.trim();
      if (newRole) roleLibrary.push({ id: uid(), name: newRole, icon: null });
      doc.selfName = $('#c-self-name').value.trim() || '私';
      if (speakerView !== 'none' && speakerView !== 'self' &&
          !roleLibrary.some(r => r.id === speakerView && !r.archived)) speakerView = 'self';
      ctx.later('doc:K_roles', () => ctx.api.saveDoc('K_roles', { roles: roleLibrary }));
      save(); close(); render();
    };
  });
}
// ===== トピックを作る・設定 =====
// 一覧の「＋」: 名前の入力を出して、Enter で作る（1 件ずつのメモのトピック）
export function toggleNewTopicRow() {
  const row = $('#c-newrow'); if (!row) return;
  const on = row.style.display === 'none'; row.style.display = on ? 'flex' : 'none';
  if (on) { const i = $('#c-newname'); i.value = ''; i.focus(); }
}
export function createTopicInline() {
  const i = $('#c-newname'); if (!i) return; const name = i.value.trim();
  if (!name) return i.focus();
  const bad = nameProblem(name); if (bad) return alert(bad);
  doc.topics.push({ name, type: 'bubble', stamp: true, entry: null }); save(); ctx.renderList(); open(name);
}
export function newTopicDialog() {
  const rootFree = () => { const r = ctx.notes().filter(n => n.s === 'd' && /^\d+$/.test(n.id)).map(n => +n.id); return ctx.free('d', String((r.length ? Math.max(...r) : 0) + 1)); };
  dialog(`<h3>トピックを作る</h3>
    <div class="sub">名前</div><input id="tp-name" placeholder="例: アイデア">
    <label class="rad"><input type="checkbox" id="tp-rec"> 時系列記録にする（日記のように、日ごとのノートに時刻つきで入る。例: 夢）</label>
    <div id="tp-recopt" style="display:none"><div class="sub">上位（この日のノートが、上位の日のノートの下に並びます）</div><div id="tp-ups">${(ctx.records ? ctx.records() : []).map(r => `<span class="rchip" data-tu="${esc(r.name)}">${esc(r.name === DIARY ? '日記' : r.name)}</span>`).join('')}</div></div>
    <div class="row"><button class="p" id="tp-ok">作る</button><button id="tp-no">やめる</button></div>`, close => {
    $('#tp-name').focus(); $('#tp-no').onclick = close;
    $('#tp-ups').onclick = e => { const x = e.target.closest('[data-tu]'); if (x) x.classList.toggle('on'); };
    $('#tp-rec').onchange = e => { $('#tp-recopt').style.display = e.target.checked ? '' : 'none'; };
    $('#tp-ok').onclick = async () => {
      const name = $('#tp-name').value.trim();
      if (!name) return; { const bad = nameProblem(name); if (bad) return alert(bad); }
      if ($('#tp-rec').checked) {   // 時系列記録（日記の仲間）として作る
        const r = await ctx.api.recordOp('addRecord', name, [...document.querySelectorAll('#tp-ups .on')].map(x => x.dataset.tu).filter(u => u !== DIARY));
        if (r === false) return alert(`「${name}」は、時系列記録の名前としては使えません（同じ名前の記録・トピックがあるか、決まった名前です）`);
        ctx.applyState(await ctx.api.state()); close(); ctx.renderList(); return open(name);
      }
      const t = { name, type: 'bubble', stamp: true, entry: null };   // 新しいトピックは、1 件ずつのメモ（旧い「全体型」は、あるものだけ残す）
      doc.topics.push(t); save(); close(); open(name);
    };
  });
}
const parentSelect = (id, cur, self) => `<select id="${id}"><option value="">なし（日記の下）</option>${recKinds().filter(k => k !== self).map(k => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select>`;
function recConfDialog() {
  const kind = view, rr = (ctx.records ? ctx.records() : []).find(r => r.name === kind) || {}, ups = new Set(rr.parents || (rr.parent ? [rr.parent] : []));
  dialog(`<h3>時系列記録「${esc(kind)}」の設定</h3>
    <div class="sub">上位（いくつでも。これから作る日の初期値。もう作った日は変わりません）</div><div id="rc-ups">${(ctx.records ? ctx.records() : []).filter(r => r.name !== kind).map(r => `<span class="rchip${ups.has(r.name) ? ' on' : ''}" data-rc="${esc(r.name)}">${esc(r.name === DIARY ? '日記' : r.name)}</span>`).join('')}</div>
    <div class="row"><button class="p" id="rc-ok">決定</button><button id="rc-no">やめる</button></div>`, close => {
    $('#rc-no').onclick = close;
    $('#rc-ups').onclick = e => { const x = e.target.closest('[data-rc]'); if (!x) return; if (ups.has(x.dataset.rc)) ups.delete(x.dataset.rc); else ups.add(x.dataset.rc); x.classList.toggle('on'); };
    $('#rc-ok').onclick = async () => {
      const r = await ctx.api.recordOp('setRecordParent', kind, [...ups].filter(u => u !== DIARY));
      if (r === false) return alert('その上位にはできません（輪になります）');
      ctx.applyState(await ctx.api.state()); close(); paint();
    };
  });
}
function confDialog() {
  if (!topic(view) && isRec(view)) return recConfDialog();
  const t = topic(view), n = countOf(view);
  dialog(`<h3>トピックの設定</h3>
    <div class="sub">名前</div><input id="cf-name" value="${esc(t.name)}">
    ${t.type === 'whole' ? `<div class="sub">全体型（ノート ${esc(t.entry && t.entry.id)}）</div>
    <label class="rad"><input type="checkbox" id="cf-stamp" ${t.stamp ? 'checked' : ''}> 時刻（HH:MM）を付ける（全体型の行）</label>` : ''}
    <div class="row"><button class="p" id="cf-ok">決定</button><button id="cf-no">やめる</button><span class="grow"></span><button class="danger" id="cf-del">このトピックを消す</button></div>`, close => {
    $('#cf-no').onclick = close;
    $('#cf-ok').onclick = () => {
      const name = $('#cf-name').value.trim();
      if (!name) return; if (t.name === FRAGMENT && name !== FRAGMENT) return alert('「断片メモ」は標準のトピックなので、名前は変えられません');
      { const bad = nameProblem(name, t.name); if (bad) return alert(bad); }
      for (const m of doc.messages) if (m.topic === t.name) m.topic = name;
      for (const m of doc.messages) { if (m.ups && m.ups.includes(t.name)) m.ups = m.ups.map(u => u === t.name ? name : u); }
      if (name !== t.name) TopicPrefs.rename(doc, t.name, name);
      t.name = name; if ($('#cf-stamp')) t.stamp = $('#cf-stamp').checked; save(); close(); open(name, true);
    };
    $('#cf-del').onclick = () => {
      if (t.name === FRAGMENT) return alert('「断片メモ」は標準のトピックなので、消せません');
      if (!confirm(`トピック「${t.name}」を消しますか？${t.type === 'bubble' ? '（中のメモは「トピック未選択」に移ります）' : '（ノートは残ります）'}`)) return;
      for (const m of doc.messages) if (m.topic === t.name) m.topic = '';
      for (const m of doc.messages) if (m.ups) m.ups = m.ups.filter(u => u !== t.name);
      TopicPrefs.remove(doc, t.name);
      doc.topics = doc.topics.filter(x => x !== t); save(); close(); open('*', true);
    };
  });
}

// ===== 添付 =====
const PIC = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const encRel = n => n.replace(/[\s()<>%#?\\]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
export async function attach(files) {
  const list = []; for (const f of files) list.push({ name: f.name || 'image.png', bytes: await f.arrayBuffer() });
  const names = await ctx.api.addFiles(list), inp = $('#c-in'); if (!inp) return;
  inp.value += (inp.value && !inp.value.endsWith('\n') ? '\n' : '') + names.map((n, i) => PIC.test(n) ? `![](${encRel(n)})` : `[${(list[i].name || n).replace(/[\[\]]/g, '')}](${encRel(n)})`).join('\n') + '\n';
  setDraft(inp.value); fit(inp); inp.focus();
}

// ===== イベント =====
document.addEventListener('click', e => {
  const pane = e.target.closest('.chat'); if (!pane || pane.classList.contains('rp')) return; // なりきりは roleplay.js
  if (sel && e.target.closest('#c-msgs .bub[data-m]')) {
    const bub=e.target.closest('#c-msgs .bub[data-m]'), id=bub.dataset.m, ids=entries().filter(x=>x.kind==='msg').map(x=>x.m.id);
    if (e.shiftKey && lastSel && ids.includes(lastSel)) {const a=ids.indexOf(lastSel),b=ids.indexOf(id); for(const x of ids.slice(Math.min(a,b),Math.max(a,b)+1))sel.add(x);}
    else {sel.has(id)?sel.delete(id):sel.add(id);lastSel=id;}
    const box=$('#c-msgs'), top=box.scrollTop;paint();box.scrollTop=top;selbar();return;
  }
  const filter=e.target.closest('[data-topic-filter]');
  if(filter) {toggleTopicFilter(filter.dataset.topicFilter,filter.dataset.filterName);return;}
  const addFilter=e.target.closest('[data-add-topic-filter]');
  if(addFilter) {addTopicFilter(addFilter.dataset.addTopicFilter,addFilter);return;}
  if(e.target.closest('[data-filter-jump]')) {selectFilterDestination();return;}
  if(e.target.closest('[data-filter-clear]')) {upperFilter.clear();childFilter.clear();lastTopicSelection=null;TopicPrefs.open(doc,view);save();showTarget();paint();return;}
  const cf = e.target.closest('[data-child], [data-child-all]');
  if (cf) {
    if (cf.hasAttribute('data-child-all')) childFilter.clear();
    else { const n = cf.dataset.child; childFilter.has(n) ? childFilter.delete(n) : childFilter.add(n); }
    sel = null; lastSel = null; paint(); selbar(); return;
  }
  const mnx = e.target.closest('[data-mn]'); if (mnx) return pickMention(+mnx.dataset.mn);
  const c = e.target.closest('[data-c]');
  if (c) {
    const a = c.dataset.c;
    if (a === 'topic-graph') { openTopicGraph(); return; }
    if (a === 'topic-graph-close') { graphOpen = false; ctx.cur().topicGraph = false; render(); ctx.renderTabs(); return; }
    if (a === 'send') { if (editingId) finishEdit(); else send(); }
    if (a === 'edit-cancel') cancelEdit();
    if (a === 'vall' || a === 'vday') { viewMode = a === 'vday' ? 'day' : 'all'; doc.viewMode = viewMode; if (viewMode === 'day') day = ''; save(); render(); }
    if (a === 'dprev' || a === 'dnext') { const ds = [...new Set(filteredMessages().map(dayOfMsg_))].sort(), i = ds.indexOf(day || L.todayStr()); const n = ds[a === 'dprev' ? (i < 0 ? ds.length - 1 : i - 1) : i + 1]; if (n) { day = n; render(); } }
    if (a === 'attach') ctx.pick(true, attach, '*');
    if (a === 'find-reply') { if (replyBrowse) return cancelBrowse(); replyPicker(e.target.closest('button')); return; }
    if (a === 'roles') {charactersDialog();return;}
    if (a === 'conf') confDialog();
    if (a === 'openbe') backend().open();
    if (a === 'select') { sel = sel ? null : new Set(); lastSel = null; paint(); selbar(); }
    if (a === 'rcancel') { const id = e.target.closest('[data-id]') && e.target.closest('[data-id]').dataset.id; replyTos = id ? replyTos.filter(x => x !== id) : []; showReply(); }
    if (a === 'cancel-note-reply') {const stem=e.target.dataset.stem;noteReplyTos=noteReplyTos.filter(x=>x.stem!==stem);showReply();}
    if (a === 'rdone') { redit = null; showRedit(); }
    if (a === 'selno') { sel = null; paint(); selbar(); }
    if (a === 'source-clear') {
      sourceIds = null;
      const current = ctx.cur(); if (current && current.k === 'chat') delete current.sourceMemoIds;
      render(); ctx.renderTabs(); return;
    }
    if (a === 'selspeaker') { const ms = [...sel].map(id => msg(id)).filter(Boolean); if (ms.length) speakerDialog(ms); return; }
    if (a === 'selmove') { const ms = [...sel].map(id => msg(id)).filter(Boolean); if (ms.length) setTopicsDialog(ms); return; }
    if (a === 'seldel') { const ids = [...sel]; if (!ids.length || !confirm(`${ids.length} 件のメモを消しますか？（復元用に残しておきます。ノートにしたものは、残ります）`)) return; for (const id of ids) { const m = msg(id); if (!m) continue; doc.messages = doc.messages.filter(x => x !== m); doc.trash.push({ ...m, deleted: Date.now() }); memoToDay(m, m.text, true); } sel = null; save(); paint(); selbar(); ctx.renderList(); }
    if (a === 'selclear') { sel = new Set(); lastSel = null; paint(); selbar(); }   // 選択を全部外す（選ぶ状態は続く）
    if (a === 'selcopy') { const text = entries().filter(x => x.kind === 'msg' && sel.has(x.m.id)).map(x => x.m.text).join('\n\n'); navigator.clipboard.writeText(text).then(() => toast(`${sel.size} 件をコピーしました`)); }
    if (a === 'selall') { sel = new Set(entries().filter(x => x.kind === 'msg').map(x => x.m.id)); paint(); selbar(); }
    if (a === 'tonote') toNoteDialog();
    return;
  }
  const tg = e.target.closest('[data-tg]'); if (tg) {
    openPicker(tg, { multi: true, selected: doc.target.ups, near: doc.target.topic, exclude: [doc.target.topic], onPick: list => { TopicPrefs.selectUpper(doc, list); save(); showTarget(); } });
    return;
  }
  const tgx = e.target.closest('[data-tgx]'); if (tgx) { TopicPrefs.selectUpper(doc, doc.target.ups.filter(u => u !== tgx.dataset.tgx)); save(); showTarget(); return; }
  const gt = e.target.closest('[data-goto]'); if (gt) { open(gt.dataset.goto); return; }
  const rdel = e.target.closest('[data-rdel]'); if (rdel && redit) { toggleReplyOf(redit, rdel.dataset.rdel); return; }
  const nreply=e.target.closest('[data-reply-note]');
  if(nreply) { const n=ctx.notes().find(n=>n.stem===nreply.dataset.replyNote); if(n) ctx.openNote(n.s,n.id);return; }
  if (redit) { const bb = e.target.closest('.bub[data-m]'); if (bb && bb.dataset.m !== redit) { e.preventDefault(); e.stopPropagation(); toggleReplyOf(redit, bb.dataset.m); return; } }
  if (pickReply) { const bb = e.target.closest('.bub[data-m]'); if (bb && !bb.querySelector('.b-edit')) { e.preventDefault(); e.stopPropagation(); pickReply(bb.dataset.m); return; } }
  const reb = e.target.closest('[data-redit-btn]'); if (reb) { startReplyEdit(reb.dataset.reditBtn); return; }
  const rp = e.target.closest('[data-rep]'); if (rp) { startReply(rp.dataset.rep); return; }
  const qm = e.target.closest('[data-qm]'); if (qm) { const id = qm.dataset.qm, el = document.querySelector(`#c-msgs [data-m="${id}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1800); } else gotoMemo(id); return; }
  const gd = e.target.closest('[data-gday]'); if (gd) { const [kind, date] = gd.dataset.gday.split('|'); ctx.setMode('diary'); ctx.openDiary(date, false, kind); return; }
  const nt = e.target.closest('.ntag'); if (nt) { const n = ctx.notes().find(x => x.stem === nt.dataset.stem); if (n) ctx.openNote(n.s, n.id); return; }
  const ment = e.target.closest('a[data-file^="memo:"]'); if (ment) { e.preventDefault(); const el = document.querySelector(`[data-m="${ment.dataset.file.slice(5)}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1800); } else gotoMemo(ment.dataset.file.slice(5)); return; }
  if (mdClick(e)) return;
  const bub = e.target.closest('.bub[data-m]');
  if (bub && sel) { // 選ぶ: クリックで入れる・外す。Shift+クリックで範囲
    const id = bub.dataset.m, ids = entries().filter(x => x.kind === 'msg').map(x => x.m.id);
    if (e.shiftKey && lastSel && ids.includes(lastSel)) { const a = ids.indexOf(lastSel), b = ids.indexOf(id); for (const x of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) sel.add(x); }
    else { sel.has(id) ? sel.delete(id) : sel.add(id); lastSel = id; }
    const box = $('#c-msgs'), top = box.scrollTop; paint(); box.scrollTop = top; selbar();
  }
});
document.addEventListener('mousedown', e => { if (sel && e.shiftKey && e.target.closest && e.target.closest('#c-msgs')) { e.preventDefault(); const g = window.getSelection(); if (g) g.removeAllRanges(); } });   // Shift+クリックで、文字が青く選択されない
document.addEventListener('change', e => {
  if (e.target.id === 'c-speaker') { speakerView=e.target.value; paint(); return; }
  if (e.target.id === 'c-day' && e.target.value) { day = e.target.value; render(); }
  if (e.target.id === 'c-jump' && e.target.value) { // その日へ（すべての中で）
    const d = e.target.value, el = [...document.querySelectorAll('#c-msgs .dsep')].find(x => x.textContent.startsWith(d)) || [...document.querySelectorAll('#c-msgs .dsep')].reverse().find(x => x.textContent.slice(0, 10) <= d);
    if (el) el.scrollIntoView({ block: 'start' }); else toast('その日のメモはありません');
  }
});
document.addEventListener('contextmenu', e => {
  const bub = e.target.closest('.chat:not(.rp) .bub'); if (!bub || e.target.closest('textarea')) return;
  e.preventDefault(); menuFor(e, bub);
});
export function toggleGroup() { }   // 昔の入れ子は、やめた（トピックは並列）
document.addEventListener('input', e => {
  if (e.target.id === 'c-search') { cq = e.target.value; paint(); return; }
  if (e.target.id === 'c-tq') { tq = e.target.value; const pos = e.target.selectionStart; ctx.renderList(); const n = document.getElementById('c-tq'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } return; }
});
document.addEventListener('input', e => { if (e.target.id === 'c-in' && !e.target.closest('.rp')) { setDraft(e.target.value); fit(e.target); mentionList(); } });
document.addEventListener('keydown', e => {   // 一覧の「＋」の入力: Enter で作る・Esc でやめる
  if (e.target.id === 'c-newname') {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); createTopicInline(); }
    if (e.key === 'Escape') { e.preventDefault(); toggleNewTopicRow(); }
  }
});
document.addEventListener('keydown', e => {
  if (e.target.id === 'c-in' && !e.target.closest('.rp')) {
    if (mn.length && !e.isComposing && e.keyCode !== 229 && (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey))) { e.preventDefault(); return pickMention(0); }
    if (e.key === 'Escape' && mn.length) { mentionOff(); return; }
    if (e.key === 'Escape' && editingId) { e.preventDefault(); cancelEdit(); return; }
    if (e.key === 'Escape' && (replyTos.length || noteReplyTos.length)) { e.preventDefault(); replyTos = []; noteReplyTos=[]; showReply(); }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); if (editingId) finishEdit(); else send(); }
  }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !ctx.cur() || ctx.cur().k !== 'chat') return;
  if (replyBrowse && !document.querySelector('#modal[style*="flex"], .tgpick, .b-edit')) { e.preventDefault(); cancelBrowse(); return; }
  if (pickReply) { pickReply = null; const eb = document.querySelector('.b-edit'); if (eb) eb.dispatchEvent(new Event('input')); return; }
  if (document.querySelector('#modal[style*="flex"], .tgpick, .b-edit, .idex-cover')) return;
  if (e.target.closest && e.target.closest('input, textarea, [contenteditable]') && e.target.id !== 'c-in') return;
  if (e.target.id === 'c-in' && mn.length) return;
  if (e.target.id === 'c-in' && (replyTos.length || noteReplyTos.length)) return;
  if (sel) { e.preventDefault(); sel = null; lastSel = null; paint(); selbar(); }
}, true);   // Esc: 返信・候補を優先し、次に複数選択を解除
