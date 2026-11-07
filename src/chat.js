// チャットメモ（apk 風）。トピックごとに「吹き出し1つ = 1ノート（あとからIDを付ける）」か「全体で1つのノート」
// 保存: C_チャット.json（吹き出しと設定）。全体型は D_<ID>.md、日記トピックは今日の日記に書く
import { ctx, $, esc, pad, hm, uid, renderMd, mdClick, popMenu, toast, dialog } from './shared.js';
import L from '../lib.js';

let doc = { topics: [], messages: [], converted: {}, trash: [] };
let view = '*';        // '*' 全部表示 / '' 未選択 / '__diary' 日記 / トピック名
let replyTo = null;    // 続けて書く先（吹き出しのid）
let ctxFrom = null;    // 文脈をつなぐ元（相手をこれから選ぶ）
let draft = '';
const DIARY = '__diary';

export function init(docs) {
  const d = docs['C_チャット'] || {};
  doc = { topics: d.topics || [], messages: d.messages || [], converted: d.converted || {}, trash: d.trash || [] };
}
const save = () => ctx.later('doc:C', () => ctx.api.saveDoc('C_チャット', doc));
const topic = name => doc.topics.find(t => t.name === name);
const msg = id => doc.messages.find(m => m.id === id);
const isBubble = name => name === '*' || name === '' || (topic(name) && topic(name).type === 'bubble');
const countOf = name => name === '*' ? doc.messages.length : doc.messages.filter(m => m.topic === name).length;

// ===== 左の一覧 =====
export function listHtml() {
  const row = (name, label, n, icon) => `<div class="item${ctx.cur() && ctx.cur().k === 'chat' && ctx.cur().topic === name ? ' on' : ''}" data-chat="${esc(name)}"><span class="ci">${icon}</span><b style="color:var(--fg)">${esc(label)}</b>${n !== null ? `<small>${n}</small>` : ''}</div>`;
  return `<div id="clist"><div class="dtop"><button class="p" id="c-new">＋ トピック</button></div>`
    + row('*', '全部表示', countOf('*'), '💬') + row('', 'トピック未選択', countOf(''), '📥') + row(DIARY, '日記', null, '📔')
    + doc.topics.map(t => row(t.name, t.name, t.type === 'bubble' ? countOf(t.name) : null, t.type === 'bubble' ? '💬' : '📄')).join('') + '</div>';
}

// ===== 表示するもの =====
// 全体型・日記は、ノート（日記）の本文を、空行で区切った塊を吹き出しとして見せる
function backend() {
  if (view === DIARY) {
    const d = ctx.getDiary(L.todayStr());
    if (!d) return null;
    return { name: '今日の日記', stamp: true, get: () => d.body, set: b => { d.body = b; ctx.touchDiary(d); }, diary: true, open: () => ctx.openDiary(d.date) };
  }
  const t = topic(view);
  if (t && t.type === 'whole') {
    const n = ctx.get('d', t.entry && t.entry.id); if (!n) return null;
    return { name: t.name, stamp: t.stamp, get: () => n.body, set: b => { n.body = b; ctx.touchNote(n); }, open: () => ctx.openNote('d', n.id) };
  }
  return null;
}
// 本文を「自由に書く部分の塊」と「## の節（日記のみ）」に分ける
function parts(body, diary) {
  let rest = '', free = body || '';
  if (diary) { const i = free.search(/^## /m); if (i >= 0) { rest = free.slice(i); free = free.slice(0, i); } }
  return { list: free.split(/\n{2,}/).map(s => s.replace(/^\n+|\n+$/g, '')).filter(Boolean), rest };
}
const join = (list, rest) => list.join('\n\n') + (rest ? (list.length ? '\n\n' : '\n\n\n') + rest : '');
const stampRe = /^(\d{2}:\d{2}) ([\s\S]*)$/;

function entries() {
  const be = backend();
  if (be) return parts(be.get(), be.diary).list.map((text, i) => {
    const m = text.match(stampRe);
    return { kind: 'line', i, time: m ? m[1] : '', text: m ? m[2] : text };
  });
  const list = doc.messages.filter(m => view === '*' || m.topic === view).sort((a, b) => a.t - b.t);
  // 続けて書いたものは、親の下に字下げして並べる
  const ordered = [], seen = new Set(), kids = m => list.filter(x => x.parent === m.id);
  const place = (m, depth) => { if (seen.has(m.id)) return; seen.add(m.id); ordered.push({ kind: 'msg', m, depth }); kids(m).forEach(k => place(k, depth + 1)); };
  list.filter(m => !m.parent || !list.some(x => x.id === m.parent)).forEach(m => place(m, 0));
  list.forEach(m => place(m, 0));
  return ordered;
}

// ===== 画面 =====
export function open(name, keep) {
  view = name; replyTo = null; ctxFrom = null; draft = '';
  ctx.setCur(ctx.place({ k: 'chat', topic: name }, keep)); ctx.setMode('chat');
  const go = () => { render(); ctx.renderTabs(); ctx.renderList(); };
  if (name === DIARY) ctx.openDiaryData(L.todayStr()).then(go); else go();
}
export const label = name => name === '*' ? '全部' : name === '' ? '未選択' : name === DIARY ? '日記' : name;

function render() {
  const t = topic(view), be = backend();
  const title = view === '*' ? '全部表示' : view === '' ? 'トピック未選択' : view === DIARY ? '日記（今日）' : view;
  $('#pane').innerHTML = `
    <div class="chat">
      <div class="row chat-head">
        <h2 style="margin:0">${esc(title)}</h2>
        <span class="sub">${view === '*' ? '書いたものは「未選択」に入ります' : t ? (t.type === 'whole' ? '全体で1つのノート' : '吹き出し1つ = 1つのノート（あとでIDを付ける）') : view === DIARY ? '今日の日記の本文に、時刻つきで入ります' : ''}</span>
        <span class="grow"></span>
        ${be ? '<button data-c="openbe">ノートを開く</button>' : ''}
        ${t ? '<button data-c="conf">⚙ 設定</button>' : ''}
      </div>
      <div id="c-msgs"></div>
      <div id="c-banner"></div>
      <div class="c-compose"><button data-c="attach" title="ファイルや画像を付ける">📎</button>
        <textarea id="c-in" rows="1" placeholder="書く（Enter で送る、Shift+Enter で改行）"></textarea><button class="p" data-c="send">送る</button></div>
    </div>`;
  paint(); banner();
  const inp = $('#c-in'); inp.value = draft; fit(inp); inp.focus();
}
function fit(inp) { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 180) + 'px'; inp.style.overflowY = inp.scrollHeight > 180 ? 'auto' : 'hidden'; }
function banner() {
  const b = $('#c-banner'); if (!b) return;
  b.innerHTML = replyTo && msg(replyTo) ? `<span>↳ 続けて書く: ${esc(msg(replyTo).text.split('\n')[0].slice(0, 30))}</span><b data-c="cancel">×</b>`
    : ctxFrom ? '<span>文脈につなぐ: つなぐ相手の吹き出しを押してください</span><b data-c="cancel">×</b>' : '';
  b.style.display = b.innerHTML ? 'flex' : 'none';
}
function paint() {
  const box = $('#c-msgs'); if (!box) return;
  const list = entries(), showTopic = view === '*';
  box.innerHTML = list.length ? list.map((e, k) => {
    if (e.kind === 'line') return `<div class="bub" data-i="${e.i}"><div class="b-meta">${e.time}</div><div class="b-body md">${renderMd(e.text)}</div></div>`;
    const m = e.m, ctxs = (m.ctx || []).map(id => msg(id) ? `<span class="ctxchip" data-goto="${id}">↩ ${esc(msg(id).text.split('\n')[0].slice(0, 14))}</span>` : doc.converted[id] ? `<span class="ctxchip">↩ ノート ${esc(doc.converted[id])}</span>` : '').join('');
    return `<div class="bub${ctxFrom ? ' pick' : ''}" data-m="${m.id}" style="margin-left:${Math.min(e.depth, 4) * 26}px">
      <div class="b-meta">${e.depth ? '↳ ' : ''}${hm(m.t)}${showTopic && m.topic ? ` · ${esc(m.topic)}` : ''}${ctxs}</div>
      <div class="b-body md">${renderMd(m.text)}</div></div>`;
  }).join('') : '<div class="none">まだありません。下の欄に書くと、ここに並びます</div>';
  box.scrollTop = box.scrollHeight;
}

// ===== 送る =====
function send() {
  const inp = $('#c-in'), text = inp.value.trim(); if (!text) return;
  const be = backend(), now = Date.now();
  if (be) {
    const p = parts(be.get(), be.diary), stamp = be.stamp !== false;
    p.list.push((stamp ? hm(now) + ' ' : '') + text.replace(/\n{2,}/g, '\n'));
    be.set(join(p.list, p.rest));
  } else {
    doc.messages.push({ id: uid(), topic: view === '*' ? '' : view, t: now, text, parent: replyTo, ctx: [] });
    save();
  }
  inp.value = ''; draft = ''; replyTo = null; fit(inp); paint(); banner(); ctx.renderList();
}

// ===== 吹き出しの操作 =====
function menuFor(e, bub) {
  const be = backend();
  if (bub.dataset.m) {
    const m = msg(bub.dataset.m);
    popMenu(e, [
      ['続けて書く', () => { replyTo = m.id; ctxFrom = null; banner(); $('#c-in').focus(); }],
      ['文脈につなぐ', () => { ctxFrom = m.id; replyTo = null; banner(); paint(); }],
      ['IDを指定してノートにする', () => assignDialog(m)],
      ['書き直す', () => editMsg(bub, m)],
      ['トピックを変える', () => moveDialog(m)],
      ['コピー', () => navigator.clipboard.writeText(m.text)],
      ['消す', () => removeMsg(m), true]
    ]);
  } else if (bub.dataset.i !== undefined && be) {
    const i = +bub.dataset.i;
    popMenu(e, [
      ['書き直す', () => editLine(bub, i)],
      ['コピー', () => navigator.clipboard.writeText(entries()[i].text)],
      ['消す', () => removeLine(i), true]
    ]);
  }
}
function editBox(bub, text, onSave) {
  const body = bub.querySelector('.b-body');
  body.innerHTML = `<textarea class="b-edit"></textarea><div class="row"><button class="p" data-ok>保存</button><button data-no>やめる</button></div>`;
  const ta = body.querySelector('textarea'); ta.value = text; ta.style.height = Math.max(60, ta.scrollHeight) + 'px'; ta.focus();
  body.querySelector('[data-ok]').onclick = () => onSave(ta.value.trim());
  body.querySelector('[data-no]').onclick = () => paint();
}
function editMsg(bub, m) { editBox(bub, m.text, v => { if (v) { m.text = v; save(); } paint(); }); }
function editLine(bub, i) {
  const be = backend(), p = parts(be.get(), be.diary), e = entries()[i];
  editBox(bub, e.text, v => {
    if (v) p.list[i] = (e.time ? e.time + ' ' : '') + v.replace(/\n{2,}/g, '\n'); else p.list.splice(i, 1);
    be.set(join(p.list, p.rest)); paint();
  });
}
function removeLine(i) {
  const be = backend(), p = parts(be.get(), be.diary); p.list.splice(i, 1); be.set(join(p.list, p.rest)); paint();
}
function removeMsg(m) {
  if (!confirm('この吹き出しを消しますか？（復元用に残しておきます）')) return;
  doc.messages = doc.messages.filter(x => x !== m); doc.trash.push({ ...m, deleted: Date.now() });
  for (const k of doc.messages) { if (k.parent === m.id) k.parent = null; k.ctx = (k.ctx || []).filter(id => id !== m.id); }
  save(); paint(); ctx.renderList();
}
function moveDialog(m) {
  const names = ['', ...doc.topics.filter(t => t.type === 'bubble').map(t => t.name)];
  dialog(`<h3>トピックを変える</h3>${names.map(n => `<button class="m-add" data-t="${esc(n)}">${n === '' ? 'トピック未選択' : esc(n)}</button>`).join('')}<div class="row"><button id="mv-no">やめる</button></div>`, close => {
    $('#modal .box').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { m.topic = b.dataset.t; save(); close(); paint(); ctx.renderList(); } };
    $('#mv-no').onclick = close;
  });
}

// ===== IDを指定してノートにする（子の吹き出しも一緒に）=====
function assignDialog(m) {
  const rootFree = () => { const r = ctx.notes().filter(n => n.s === 'd' && /^\d+$/.test(n.id)).map(n => +n.id); return ctx.free('d', String((r.length ? Math.max(...r) : 0) + 1)); };
  const kids = doc.messages.filter(x => x.parent === m.id).length;
  dialog(`<h3>ノートにする</h3>
    <div class="sub">この吹き出しをデジタルノートにします。${kids ? '続けて書いた吹き出しも、一緒にノートになります。' : ''}ノートになった吹き出しは、チャットから消えます。</div>
    <label class="rad"><input type="radio" name="as" value="id" checked> このノートのID <input id="as-id" style="width:100px" value="${esc(rootFree())}"></label>
    <label class="rad"><input type="radio" name="as" value="parent"> 親のノートのID（分岐として付ける） <input id="as-parent" style="width:100px" placeholder="例: 1a"></label>
    <div class="row"><button class="p" id="as-ok">ノートにする</button><button id="as-no">やめる</button></div>`, close => {
    $('#as-id').onfocus = () => { document.querySelector('input[value=id]').checked = true; };
    $('#as-parent').onfocus = () => { document.querySelector('input[value=parent]').checked = true; };
    $('#as-no').onclick = close;
    $('#as-ok').onclick = async () => {
      let id;
      if (document.querySelector('input[name=as]:checked').value === 'parent') {
        const p = $('#as-parent').value.trim().toLowerCase();
        if (!ctx.get('d', p)) return alert(`デジタルのノート ${p || '（空）'} がありません`);
        id = ctx.free('d', L.child(p));
      } else {
        id = $('#as-id').value.trim().toLowerCase();
        if (!L.isId(id)) return alert('IDの形が違います（例: 12 や 3a）');
        if (ctx.get('d', id)) return alert(`ノート ${id} は既にあります`);
      }
      close(); await convert(m, id);
    };
  });
}
async function convert(m, id) {
  const used = new Set([id]), subtree = [], map = {};
  const kidsOf = x => doc.messages.filter(k => k.parent === x.id).sort((a, b) => a.t - b.t);
  const freeId = base => { let x = base; while (ctx.get('d', x) || used.has(x)) x = L.sibling(x); used.add(x); return x; };
  const walk = (x, nid) => { subtree.push({ m: x, id: nid }); map[x.id] = nid; let prev = null; for (const k of kidsOf(x)) { prev = freeId(prev ? L.sibling(prev) : L.child(nid)); walk(k, prev); } };
  walk(m, id);
  for (const { m: x, id: nid } of subtree) { // 文脈でつないだ相手が、もうノートなら :ID のリンクにする
    const links = (x.ctx || []).map(c => map[c] || doc.converted[c]).filter(Boolean).map(n => `:${n}`);
    const body = x.text + (links.length ? '\n\n' + links.join('\n') : '');
    const note = await ctx.api.saveNote({ s: 'd', id: nid, created: L.now(new Date(x.t)), keywords: [], body });
    if (!ctx.get('d', nid)) ctx.notes().push(note);
    doc.converted[x.id] = nid;
  }
  const gone = new Set(subtree.map(s => s.m.id));
  doc.messages = doc.messages.filter(x => !gone.has(x.id));
  save(); await ctx.refreshDiaries();
  toast(subtree.length > 1 ? `ノート ${id} と、続きの ${subtree.length - 1} 件をノートにしました` : `ノート ${id} にしました`);
  paint(); ctx.renderList();
}

// ===== トピックを作る・設定 =====
export function newTopicDialog() {
  const rootFree = () => { const r = ctx.notes().filter(n => n.s === 'd' && /^\d+$/.test(n.id)).map(n => +n.id); return ctx.free('d', String((r.length ? Math.max(...r) : 0) + 1)); };
  dialog(`<h3>トピックを作る</h3>
    <div class="sub">名前</div><input id="tp-name" placeholder="例: アイデア">
    <label class="rad"><input type="radio" name="tp" value="bubble" checked> 吹き出し型 — 1件ごとに別のノート（あとでIDを付けるまでは、ここに並ぶだけ）</label>
    <label class="rad"><input type="radio" name="tp" value="whole"> 全体型 — このトピック全体が1つのノート <input id="tp-id" style="width:90px" value="${esc(rootFree())}" title="ノートのID（無ければ作ります）"></label>
    <label class="rad"><input type="checkbox" id="tp-stamp" checked> 時刻（HH:MM）を付ける（全体型の行）</label>
    <div class="row"><button class="p" id="tp-ok">作る</button><button id="tp-no">やめる</button></div>`, close => {
    $('#tp-name').focus(); $('#tp-no').onclick = close;
    $('#tp-ok').onclick = async () => {
      const name = $('#tp-name').value.trim(), type = document.querySelector('input[name=tp]:checked').value;
      if (!name) return; if (topic(name) || ['全部表示', '日記'].includes(name)) return alert('その名前は使えません');
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
    <div class="sub">型: ${t.type === 'whole' ? `全体型（ノート ${esc(t.entry && t.entry.id)}）` : '吹き出し型'}　${n ? '— 中身があるので、型は変えられません' : ''}</div>
    ${!n && t.type === 'bubble' ? '<div class="sub">全体型にするには、一度消して作り直してください</div>' : ''}
    <label class="rad"><input type="checkbox" id="cf-stamp" ${t.stamp ? 'checked' : ''}> 時刻（HH:MM）を付ける（全体型の行）</label>
    <div class="row"><button class="p" id="cf-ok">決定</button><button id="cf-no">やめる</button><span class="grow"></span><button class="danger" id="cf-del">このトピックを消す</button></div>`, close => {
    $('#cf-no').onclick = close;
    $('#cf-ok').onclick = () => {
      const name = $('#cf-name').value.trim();
      if (!name) return; if (name !== t.name && (topic(name) || ['全部表示', '日記'].includes(name))) return alert('その名前は使えません');
      for (const m of doc.messages) if (m.topic === t.name) m.topic = name;
      t.name = name; t.stamp = $('#cf-stamp').checked; save(); close(); open(name, true);
    };
    $('#cf-del').onclick = () => {
      if (!confirm(`トピック「${t.name}」を消しますか？${t.type === 'bubble' ? '（中の吹き出しは「トピック未選択」に移ります）' : '（ノートは残ります）'}`)) return;
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
  inp.value += (inp.value && !inp.value.endsWith('\n') ? '\n' : '') + names.map(n => PIC.test(n) ? `![](${encRel(n)})` : `[${n.replace(/[\[\]]/g, '')}](${encRel(n)})`).join('\n') + '\n';
  draft = inp.value; fit(inp); inp.focus();
}

// ===== イベント =====
document.addEventListener('click', e => {
  const pane = e.target.closest('.chat'); if (!pane || pane.classList.contains('rp')) return; // なりきりは roleplay.js
  const c = e.target.closest('[data-c]');
  if (c) {
    const a = c.dataset.c;
    if (a === 'send') send();
    if (a === 'cancel') { replyTo = null; ctxFrom = null; banner(); paint(); }
    if (a === 'attach') ctx.pick(true, attach, '*');
    if (a === 'conf') confDialog();
    if (a === 'openbe') backend().open();
    return;
  }
  const go = e.target.closest('[data-goto]'); if (go) { const el = document.querySelector(`[data-m="${go.dataset.goto}"]`); if (el) el.scrollIntoView({ block: 'center' }); return; }
  if (mdClick(e)) return;
  const bub = e.target.closest('.bub[data-m]');
  if (bub && ctxFrom && bub.dataset.m !== ctxFrom) { // 文脈につなぐ
    const from = msg(ctxFrom); from.ctx = [...new Set([...(from.ctx || []), bub.dataset.m])];
    ctxFrom = null; save(); banner(); paint();
  }
});
document.addEventListener('contextmenu', e => {
  const bub = e.target.closest('.chat:not(.rp) .bub'); if (!bub || e.target.closest('textarea')) return;
  e.preventDefault(); menuFor(e, bub);
});
document.addEventListener('input', e => { if (e.target.id === 'c-in' && !e.target.closest('.rp')) { draft = e.target.value; fit(e.target); } });
document.addEventListener('keydown', e => {
  if (e.target.id === 'c-in' && !e.target.closest('.rp') && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
});
