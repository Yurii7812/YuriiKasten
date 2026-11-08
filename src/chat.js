// チャットメモ（LINE のようにすぐ書ける）。メモはノートにならない。ノートにするのは、選んだもの（範囲・複数）だけ。ノートにしても、メモは残る（「ノート 1a」の印）
// 保存: C_チャット.json（正）。日ごとの md（C_2026-11-08.md）を、見る用に自動で書き出す（store.js）。日記トピックのメモは、日記にも時刻つきの行で入る
// 返信・引用は @（メンション）。チャットメモの中に、別のメモ・ノートを入れる。ノートからチャットメモへは、出典のリンク（C_日付.md#m-メモID）
import { ctx, $, esc, pad, hm, uid, renderMd, mdClick, popMenu, toast, dialog } from './shared.js';
import L from '../lib.js';

let doc = { topics: [], messages: [], converted: {}, trash: [], noted: {} };
let view = '*';        // '*' 全部表示 / '' 未選択 / 日記 / トピック名
let viewMode = 'all';  // all（日付の見出しで区切って、続けて）| day（1日ずつ）
let day = '';          // day のときの日付
let sel = null;        // 選んでいるメモの id（ノートにする・引用する）。null = 選択中ではない
let lastSel = null;
let draft = '';
const DIARY = '日記';

export function init(docs) {
  const d = docs['C_チャット'] || {};
  doc = { topics: d.topics || [], messages: d.messages || [], converted: d.converted || {}, trash: d.trash || [], noted: d.noted || {}, viewMode: d.viewMode === 'day' ? 'day' : 'all' };
  viewMode = doc.viewMode;
}
const save = () => ctx.later('doc:C', () => ctx.api.saveDoc('C_チャット', doc));
const topic = name => doc.topics.find(t => t.name === name);
const msg = id => doc.messages.find(m => m.id === id);
const countOf = name => name === '*' ? doc.messages.length : doc.messages.filter(m => m.topic === name).length;
const dayOfMsg = m => L.dayOf(L.now(new Date(m.t)));
const dayFile = d => `C_${d}.md`;
const first = t => esc((t || '').split('\n')[0].slice(0, 30));

// ===== 左の一覧 =====
export function listHtml() {
  const row = (name, label, n, icon) => `<div class="item${ctx.cur() && ctx.cur().k === 'chat' && ctx.cur().topic === name ? ' on' : ''}" data-chat="${esc(name)}"><span class="ci">${icon}</span><b style="color:var(--fg);font-weight:400">${esc(label)}</b>${n === null ? '' : `<small>${n}</small>`}</div>`;
  return `<div id="clist"><div class="dtop"><button class="p" id="c-new">＋ トピック</button></div>`
    + row('*', '全部表示', countOf('*'), '💬') + row('', 'トピック未選択', countOf(''), '📥') + row(DIARY, '日記', countOf(DIARY), '📔')
    + doc.topics.filter(t => t.name !== DIARY).map(t => row(t.name, t.name, t.type === 'bubble' ? countOf(t.name) : null, t.type === 'bubble' ? '💬' : '📄')).join('') + '</div>';
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

function entries() {
  const be = backend();
  if (be) return parts(be.get()).map((text, i) => { const m = text.match(stampRe); return { kind: 'line', i, time: m ? m[1] : '', text: m ? m[2] : text }; });
  let list = doc.messages.filter(m => view === '*' || m.topic === view).sort((a, b) => a.t - b.t);
  if (viewMode === 'day') { if (!day) day = list.length ? dayOfMsg_(list[list.length - 1]) : L.todayStr(); list = list.filter(m => dayOfMsg_(m) === day); }
  return list.map(m => ({ kind: 'msg', m }));
}

// ===== 画面 =====
export function open(name, keep) {
  view = name; sel = null; draft = '';
  ctx.setCur(ctx.place({ k: 'chat', topic: name }, keep)); ctx.setMode('chat');
  render(); ctx.renderTabs(); ctx.renderList();
}
// このメモ（ノートの出典リンクから）へ飛ぶ
export function gotoMemo(id) {
  const m = msg(id); if (!m) return toast('そのチャットメモは、もうありません');
  view = '*'; viewMode = 'all'; day = '';
  ctx.setCur(ctx.place({ k: 'chat', topic: '*' }, false)); ctx.setMode('chat'); render(); ctx.renderTabs(); ctx.renderList();
  const el = document.querySelector(`[data-m="${id}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1800); }
}
export const label = name => name === '*' ? '全部' : name === '' ? '未選択' : name;

function render() {
  const t = topic(view), be = backend();
  const title = view === '*' ? '全部表示' : view === '' ? 'トピック未選択' : view;
  $('#pane').innerHTML = `
    <div class="chat memo">
      <div class="row chat-head">
        <h2 style="margin:0">${esc(title)}</h2>
        <span class="sub">${view === DIARY ? '日記にも、時刻つきの行で入ります' : view === '*' ? '書いたものは「未選択」に入ります' : t && t.type === 'whole' ? '全体で1つのノート' : ''}</span>
        <span class="grow"></span>
        ${be ? '' : `<span class="vseg"><button data-c="vall" class="${viewMode === 'all' ? 'on' : ''}">全部</button><button data-c="vday" class="${viewMode === 'day' ? 'on' : ''}">日ごと</button></span>
          ${viewMode === 'day' ? `<button data-c="dprev" title="前の日">←</button><input type="date" id="c-day" value="${esc(day || L.todayStr())}"><button data-c="dnext" title="次の日">→</button>` : '<input type="date" id="c-jump" title="日付を入れると、その日へ">'}
          <button data-c="select" title="メモを選んで、ノートにする・引用する">☑ 選ぶ</button>`}
        ${be ? '<button data-c="openbe">ノートを開く</button>' : ''}
        ${t ? '<button data-c="conf">⚙ 設定</button>' : ''}
      </div>
      <div id="c-msgs"></div>
      <div id="c-selbar"></div>
      <div class="c-compose"><div id="c-mention" class="rp-mention" style="display:none"></div><button data-c="attach" title="ファイルや画像を付ける">📎</button>
        <textarea id="c-in" rows="1" placeholder="書く（Enter で送る、Shift+Enter で改行。@ で、別のメモやノートを入れる）"></textarea><button class="p" data-c="send">送る</button></div>
    </div>`;
  paint(); selbar();
  const inp = $('#c-in'); inp.value = draft; fit(inp); inp.focus();
}
function fit(inp) { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 180) + 'px'; inp.style.overflowY = inp.scrollHeight > 180 ? 'auto' : 'hidden'; }
const wk = d => `${d}（${L.weekday(d)}）`;
const noteLabel = stem => { const n = ctx.notes().find(x => x.stem === stem); return n ? (n.noid ? 'IDなし' : n.id) : null; };
// 本文: メンション（[@…](memo:ID)）は、押すとそのメモへ
const body = text => renderMd(text);
function paint() {
  const box = $('#c-msgs'); if (!box) return;
  const list = entries(), showTopic = view === '*'; let lastDay = '';
  box.innerHTML = list.length ? list.map(e => {
    if (e.kind === 'line') return `<div class="bub" data-i="${e.i}"><div class="b-meta">${e.time}</div><div class="b-body md">${body(e.text)}</div></div>`;
    const m = e.m, d = dayOfMsg_(m), head = viewMode === 'all' && d !== lastDay ? `<div class="dsep">${wk(d)}</div>` : ''; lastDay = d;
    const tags = (doc.noted[m.id] || []).map(st => noteLabel(st)).filter(Boolean).map((l, i) => `<span class="ntag" data-stem="${esc(doc.noted[m.id][i])}" title="このメモから作ったノート">📝 ${esc(l)}</span>`).join('');
    const picked = sel && sel.has(m.id);
    return `${head}<div class="bub${sel ? ' pick' : ''}${picked ? ' picked' : ''}" data-m="${m.id}">
      <div class="b-meta">${sel ? `<input type="checkbox" class="bck" ${picked ? 'checked' : ''}> ` : ''}${hm(m.t)}${showTopic && m.topic ? ` · ${esc(m.topic)}` : ''}${tags ? ' ' + tags : ''}</div>
      <div class="b-body md">${body(m.text)}</div></div>`;
  }).join('') : '<div class="none">まだありません。下の欄に書くと、ここに並びます</div>';
  box.scrollTop = box.scrollHeight;
}
function selbar() {
  const b = $('#c-selbar'); if (!b) return;
  b.innerHTML = sel ? `<span>${sel.size} 件を選択</span><span class="grow"></span><button data-c="selall">全部</button><button class="p" data-c="tonote" ${sel.size ? '' : 'disabled'}>ノートにする</button><button data-c="toquote" ${sel.size ? '' : 'disabled'}>ノートに引用…</button><button data-c="selno">やめる</button>` : '';
  b.style.display = sel ? 'flex' : 'none';
}

// ===== 送る =====
function send() {
  const inp = $('#c-in'), text = inp.value.trim(); if (!text) return;
  const be = backend(), now = Date.now();
  if (be) {
    const list = parts(be.get()); list.push((be.stamp !== false ? hm(now) + ' ' : '') + text.replace(/\n{2,}/g, '\n')); be.set(list.join('\n\n'));
  } else {
    const m = { id: uid(), topic: view === '*' ? '' : view, t: now, text };
    doc.messages.push(m); save();
    if (m.topic === DIARY) ctx.api.appendToDay(DIARY, L.dayOf(L.now(new Date(now))), `${hm(now)} ${text.replace(/\n{2,}/g, '\n')}`).then(() => ctx.refreshDiaries());   // 日記の行にも（片方向。あとで日記を直しても、メモは変わらない）
  }
  inp.value = ''; draft = ''; fit(inp); mentionOff(); paint(); ctx.renderList();
}

// ===== @ で、別のメモ・ノートを入れる =====
let mn = [];
function mentionOff() { mn = []; const b = $('#c-mention'); if (b) b.style.display = 'none'; }
function mentionList() {
  const inp = $('#c-in'), box = $('#c-mention'); if (!inp || !box) return;
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
  const inp = $('#c-in'), pos = inp.selectionStart, tok = x.kind === 'memo' ? `[@${(x.m.text.split('\n')[0] || '').replace(/[\[\]()]/g, '').slice(0, 14)}](memo:${x.m.id}) ` : `:${x.n.id} `;
  const before = inp.value.slice(0, pos).replace(/@([^\s@]{0,20})$/, tok);
  inp.value = before + inp.value.slice(pos); inp.selectionStart = inp.selectionEnd = before.length; draft = inp.value; mentionOff(); inp.focus(); fit(inp);
}

// ===== メモの操作 =====
function menuFor(e, bub) {
  const be = backend();
  if (bub.dataset.m) {
    const m = msg(bub.dataset.m);
    popMenu(e, [
      ['返信（@ で入れる）', () => { const inp = $('#c-in'); inp.value += (inp.value && !/\s$/.test(inp.value) ? ' ' : '') + `[@${(m.text.split('\n')[0] || '').replace(/[\[\]()]/g, '').slice(0, 14)}](memo:${m.id}) `; draft = inp.value; fit(inp); inp.focus(); }],
      ['選んで、ノートにする', () => { sel = new Set([m.id]); lastSel = m.id; paint(); selbar(); }],
      ['ノートに引用…', () => quoteDialog([m])],
      ['書き直す', () => editMsg(bub, m)],
      ['トピックを変える', () => moveDialog(m)],
      ['コピー', () => navigator.clipboard.writeText(m.text)],
      ['消す', () => removeMsg(m), true]
    ]);
  } else if (bub.dataset.i !== undefined && be) {
    const i = +bub.dataset.i;
    popMenu(e, [['書き直す', () => editLine(bub, i)], ['コピー', () => navigator.clipboard.writeText(entries()[i].text)], ['消す', () => removeLine(i), true]]);
  }
}
function editBox(bub, text, onSave) {
  const b = bub.querySelector('.b-body');
  b.innerHTML = `<textarea class="b-edit"></textarea><div class="row"><button class="p" data-ok>保存</button><button data-no>やめる</button></div>`;
  const ta = b.querySelector('textarea'); ta.value = text; ta.style.height = Math.max(60, ta.scrollHeight) + 'px'; ta.focus();
  b.querySelector('[data-ok]').onclick = () => onSave(ta.value.trim());
  b.querySelector('[data-no]').onclick = () => paint();
}
function editMsg(bub, m) { editBox(bub, m.text, v => { if (v) { m.text = v; save(); } paint(); }); }
function editLine(bub, i) {
  const be = backend(), list = parts(be.get()), e = entries()[i];
  editBox(bub, e.text, v => { if (v) list[i] = (e.time ? e.time + ' ' : '') + v.replace(/\n{2,}/g, '\n'); else list.splice(i, 1); be.set(list.join('\n\n')); paint(); });
}
function removeLine(i) { const be = backend(), list = parts(be.get()); list.splice(i, 1); be.set(list.join('\n\n')); paint(); }
function removeMsg(m) {
  if (!confirm('このメモを消しますか？（復元用に残しておきます。ノートにしたものは、残ります）')) return;
  doc.messages = doc.messages.filter(x => x !== m); doc.trash.push({ ...m, deleted: Date.now() });
  save(); paint(); ctx.renderList();
}
function moveDialog(m) {
  const names = ['', DIARY, ...doc.topics.filter(t => t.type === 'bubble' && t.name !== DIARY).map(t => t.name)];
  dialog(`<h3>トピックを変える</h3>${names.map(n => `<button class="m-add" data-t="${esc(n)}">${n === '' ? 'トピック未選択' : esc(n)}</button>`).join('')}<div class="row"><button id="mv-no">やめる</button></div>`, close => {
    $('#modal .box').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { m.topic = b.dataset.t; save(); close(); paint(); ctx.renderList(); } };
    $('#mv-no').onclick = close;
  });
}

// ===== 選んだメモを、ノートにする / ノートに引用する =====
const chosen = () => [...sel].map(msg).filter(Boolean).sort((a, b) => a.t - b.t);
const range = ms => { const f = ms[0], l = ms[ms.length - 1], d1 = dayOfMsg_(f), d2 = dayOfMsg_(l); return `${d1} ${hm(f.t)}${ms.length > 1 ? '〜' + (d1 === d2 ? '' : d2 + ' ') + hm(l.t) : ''}`; };
const source = m => `[${dayOfMsg_(m)} ${hm(m.t)}](${dayFile(dayOfMsg_(m))}#m-${m.id})`;
function toNoteDialog() {
  const ms = chosen(); if (!ms.length) return;
  const rootFree = () => { const r = ctx.notes().filter(n => n.s === 'd' && /^\d+$/.test(n.id)).map(n => +n.id); return ctx.free('d', String((r.length ? Math.max(...r) : 0) + 1)); };
  dialog(`<h3>${ms.length} 件を、ノートにする</h3>
    <div class="sub">選んだメモを、1 つのノートにまとめます。メモは、チャットに残ります（「ノート …」の印が付きます）。</div>
    <label class="rad"><input type="radio" name="as" value="noid" checked> IDなしのノート（あとで整理する）</label>
    <label class="rad"><input type="radio" name="as" value="id"> このノートのID <input id="as-id" style="width:100px" value="${esc(rootFree())}"></label>
    <label class="rad"><input type="radio" name="as" value="parent"> 親のノートのID（分岐として付ける） <input id="as-parent" style="width:100px" placeholder="例: 1a"></label>
    <div class="row"><button class="p" id="as-ok">ノートにする</button><button id="as-no">やめる</button></div>`, close => {
    $('#as-id').onfocus = () => { document.querySelector('input[value=id]').checked = true; };
    $('#as-parent').onfocus = () => { document.querySelector('input[value=parent]').checked = true; };
    $('#as-no').onclick = close;
    $('#as-ok').onclick = async () => {
      const kind = document.querySelector('input[name=as]:checked').value; let id = null;
      if (kind === 'parent') { const p = $('#as-parent').value.trim().toLowerCase(); if (!ctx.get('d', p)) return alert(`デジタルのノート ${p || '（空）'} がありません`); id = ctx.free('d', L.child(p)); }
      else if (kind === 'id') { id = $('#as-id').value.trim().toLowerCase(); if (!L.isId(id)) return alert('IDの形が違います（例: 12 や 3a）'); if (ctx.get('d', id)) return alert(`ノート ${id} は既にあります`); }
      close(); await makeNote(ms, id);
    };
  });
}
async function makeNote(ms, id) {
  // 本文: 先頭に、元のチャットメモ（日付と時刻の範囲）へのリンク。そのあとに、メモの文章（コピー。あとは別物）
  const head = `元のチャットメモ: [${range(ms)}](${dayFile(dayOfMsg_(ms[0]))}#m-${ms[0].id})`;
  const bodyText = head + '\n\n' + ms.map(m => (ms.length > 1 ? `${hm(m.t)} ` : '') + m.text.replace(/\[@([^\]]*)\]\(memo:[^)\s]+\)/g, '@$1')).join('\n\n');   // メンションは、ノートでは ふつうの文字に
  const note = id ? await ctx.api.saveNote({ s: 'd', id, created: L.now(new Date(ms[0].t)), keywords: [], body: bodyText }) : await ctx.api.createNote({ kind: 'text', created: L.now(new Date(ms[0].t)), body: bodyText });
  if (!ctx.get('d', note.id)) ctx.notes().push(note);
  for (const m of ms) doc.noted[m.id] = [...new Set([...(doc.noted[m.id] || []), note.stem])];
  sel = null; save(); await ctx.refreshDiaries(); paint(); selbar(); ctx.renderList();
  toast(`${id ? 'ノート ' + id : 'IDなしのノート'} にしました`);
}
function quoteDialog(ms) {
  const last = ctx.lastNote && ctx.lastNote();
  dialog(`<h3>${ms.length} 件を、ノートに引用</h3><div class="sub">${first(ms[0].text)}${ms.length > 1 ? ' ほか' : ''}</div>
    <div class="row"><select id="qn-s"><option value="d">デジタル</option><option value="p">紙</option></select><input id="qn-id" style="width:110px" value="${esc(last ? last.id : '')}" placeholder="ノートのID"></div>
    <div class="sub">引用（> …）と、出典のリンク（日付・時刻）が、ノートの最後に入ります</div>
    <div class="row"><button class="p" id="qn-ok">引用する</button><button id="qn-no">やめる</button></div>`, close => {
    if (last) $('#qn-s').value = last.s; $('#qn-no').onclick = close; $('#qn-id').focus();
    $('#qn-ok').onclick = () => {
      const s = $('#qn-s').value, id = $('#qn-id').value.trim().toLowerCase(), n = ctx.get(s, id);
      if (!n) return alert('そのノートがありません');
      const q = ms.map(m => '> ' + m.text.split('\n').join('\n> ') + `\n> 出典: ${source(m)}`).join('\n>\n');
      n.body = (n.body.trimEnd() ? n.body.trimEnd() + '\n\n' : '') + q + '\n'; ctx.touchNote(n); close(); toast(`ノート ${id} に引用しました`);
    };
  });
}

// ===== トピックを作る・設定 =====
export function newTopicDialog() {
  const rootFree = () => { const r = ctx.notes().filter(n => n.s === 'd' && /^\d+$/.test(n.id)).map(n => +n.id); return ctx.free('d', String((r.length ? Math.max(...r) : 0) + 1)); };
  dialog(`<h3>トピックを作る</h3>
    <div class="sub">名前</div><input id="tp-name" placeholder="例: アイデア">
    <label class="rad"><input type="radio" name="tp" value="bubble" checked> メモ型 — 1 件ずつのメモ（ノートにするのは、あとで選んだものだけ）</label>
    <label class="rad"><input type="radio" name="tp" value="whole"> 全体型 — このトピック全体が 1 つのノート <input id="tp-id" style="width:90px" value="${esc(rootFree())}" title="ノートのID（無ければ作る）"></label>
    <label class="rad"><input type="checkbox" id="tp-stamp" checked> 時刻（HH:MM）を付ける（全体型の行）</label>
    <div class="row"><button class="p" id="tp-ok">作る</button><button id="tp-no">やめる</button></div>`, close => {
    $('#tp-name').focus(); $('#tp-no').onclick = close;
    $('#tp-ok').onclick = async () => {
      const name = $('#tp-name').value.trim(), type = document.querySelector('input[name=tp]:checked').value;
      if (!name) return; if (topic(name) || ['全部表示', DIARY].includes(name)) return alert('その名前は使えません');
      const t = { name, type, stamp: $('#tp-stamp').checked, entry: null };
      if (type === 'whole') {
        const id = $('#tp-id').value.trim().toLowerCase();
        if (!L.isId(id)) return alert('IDの形が違います');
        if (!ctx.get('d', id)) ctx.notes().push(await ctx.api.saveNote({ s: 'd', id, created: L.now(), keywords: [], body: '' }));
        t.entry = { id };
      }
      doc.topics.push(t); save(); close(); open(name);
    };
  });
}
function confDialog() {
  const t = topic(view), n = countOf(view);
  dialog(`<h3>トピックの設定</h3>
    <div class="sub">名前</div><input id="cf-name" value="${esc(t.name)}">
    <div class="sub">型: ${t.type === 'whole' ? `全体型（ノート ${esc(t.entry && t.entry.id)}）` : 'メモ型'}　${n ? '— 中身があるので、型は変えられません' : ''}</div>
    <label class="rad"><input type="checkbox" id="cf-stamp" ${t.stamp ? 'checked' : ''}> 時刻（HH:MM）を付ける（全体型の行）</label>
    <div class="row"><button class="p" id="cf-ok">決定</button><button id="cf-no">やめる</button><span class="grow"></span><button class="danger" id="cf-del">このトピックを消す</button></div>`, close => {
    $('#cf-no').onclick = close;
    $('#cf-ok').onclick = () => {
      const name = $('#cf-name').value.trim();
      if (!name) return; if (name !== t.name && (topic(name) || ['全部表示', DIARY].includes(name))) return alert('その名前は使えません');
      for (const m of doc.messages) if (m.topic === t.name) m.topic = name;
      t.name = name; t.stamp = $('#cf-stamp').checked; save(); close(); open(name, true);
    };
    $('#cf-del').onclick = () => {
      if (!confirm(`トピック「${t.name}」を消しますか？${t.type === 'bubble' ? '（中のメモは「トピック未選択」に移ります）' : '（ノートは残ります）'}`)) return;
      for (const m of doc.messages) if (m.topic === t.name) m.topic = '';
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
  draft = inp.value; fit(inp); inp.focus();
}

// ===== イベント =====
document.addEventListener('click', e => {
  const pane = e.target.closest('.chat'); if (!pane || pane.classList.contains('rp')) return; // なりきりは roleplay.js
  const mnx = e.target.closest('[data-mn]'); if (mnx) return pickMention(+mnx.dataset.mn);
  const c = e.target.closest('[data-c]');
  if (c) {
    const a = c.dataset.c;
    if (a === 'send') send();
    if (a === 'vall' || a === 'vday') { viewMode = a === 'vday' ? 'day' : 'all'; doc.viewMode = viewMode; if (viewMode === 'day') day = ''; save(); render(); }
    if (a === 'dprev' || a === 'dnext') { const ds = [...new Set(doc.messages.filter(m => view === '*' || m.topic === view).map(dayOfMsg_))].sort(), i = ds.indexOf(day || L.todayStr()); const n = ds[a === 'dprev' ? (i < 0 ? ds.length - 1 : i - 1) : i + 1]; if (n) { day = n; render(); } }
    if (a === 'attach') ctx.pick(true, attach, '*');
    if (a === 'conf') confDialog();
    if (a === 'openbe') backend().open();
    if (a === 'select') { sel = sel ? null : new Set(); lastSel = null; paint(); selbar(); }
    if (a === 'selno') { sel = null; paint(); selbar(); }
    if (a === 'selall') { sel = new Set(entries().filter(x => x.kind === 'msg').map(x => x.m.id)); paint(); selbar(); }
    if (a === 'tonote') toNoteDialog();
    if (a === 'toquote') quoteDialog(chosen());
    return;
  }
  const nt = e.target.closest('.ntag'); if (nt) { const n = ctx.notes().find(x => x.stem === nt.dataset.stem); if (n) ctx.openNote(n.s, n.id); return; }
  const ment = e.target.closest('a[data-file^="memo:"]'); if (ment) { e.preventDefault(); const el = document.querySelector(`[data-m="${ment.dataset.file.slice(5)}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1800); } else toast('そのメモは、いまの表示にありません（「全部表示」で探せます）'); return; }
  if (mdClick(e)) return;
  const bub = e.target.closest('.bub[data-m]');
  if (bub && sel) { // 選ぶ: クリックで入れる・外す。Shift+クリックで範囲
    const id = bub.dataset.m, ids = entries().filter(x => x.kind === 'msg').map(x => x.m.id);
    if (e.shiftKey && lastSel && ids.includes(lastSel)) { const a = ids.indexOf(lastSel), b = ids.indexOf(id); for (const x of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) sel.add(x); }
    else { sel.has(id) ? sel.delete(id) : sel.add(id); lastSel = id; }
    const box = $('#c-msgs'), top = box.scrollTop; paint(); box.scrollTop = top; selbar();
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'c-day' && e.target.value) { day = e.target.value; render(); }
  if (e.target.id === 'c-jump' && e.target.value) { // その日へ（全部表示の中で）
    const d = e.target.value, el = [...document.querySelectorAll('#c-msgs .dsep')].find(x => x.textContent.startsWith(d)) || [...document.querySelectorAll('#c-msgs .dsep')].reverse().find(x => x.textContent.slice(0, 10) <= d);
    if (el) el.scrollIntoView({ block: 'start' }); else toast('その日のメモはありません');
  }
});
document.addEventListener('contextmenu', e => {
  const bub = e.target.closest('.chat:not(.rp) .bub'); if (!bub || e.target.closest('textarea')) return;
  e.preventDefault(); menuFor(e, bub);
});
document.addEventListener('input', e => { if (e.target.id === 'c-in' && !e.target.closest('.rp')) { draft = e.target.value; fit(e.target); mentionList(); } });
document.addEventListener('keydown', e => {
  if (e.target.id === 'c-in' && !e.target.closest('.rp')) {
    if (mn.length && (e.key === 'Tab' || (e.key === 'Enter' && !e.isComposing))) { e.preventDefault(); return pickMention(0); }
    if (e.key === 'Escape' && mn.length) { mentionOff(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  }
});
