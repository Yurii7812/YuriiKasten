// なりきりチャット。一人二役（役は何人でも）。役はライブラリに保存して呼び出せる。1つの会話 = 1つのファイル
// 保存: R_<題>.json（会話）、K_roles.json（役のライブラリ）
import { ctx, $, esc, hm, uid, vaultUrl, renderMd, mdClick, popMenu, toast, dialog } from './shared.js';
import L from '../lib.js';

let convs = {};            // 'R_題' → { title, created, cast:[{id,name,icon}], messages:[...] }
let roles = [];            // ライブラリ [{id,name,icon:{emoji|file}}]
let cur = null;            // 開いている会話のキー
let speaker = null;        // 話す役の id
let draftQuote = null;     // 次に送る発言に付ける引用
let draft = '';
const PALETTE = ['#2456c8', '#c0392b', '#2e8b57', '#b8860b', '#8e44ad', '#16a085', '#d35400', '#566573'];

export function init(docs) {
  convs = {}; roles = (docs['K_roles'] && docs['K_roles'].roles) || [];
  for (const [k, v] of Object.entries(docs)) if (k.startsWith('R_')) convs[k] = v;
}
const save = key => ctx.later('doc:' + key, () => ctx.api.saveDoc(key, convs[key]));
const saveRoles = () => ctx.later('doc:K', () => ctx.api.saveDoc('K_roles', { roles }));
const conv = () => convs[cur];
const keyOf = title => 'R_' + L.fileName(title);
const colorOf = id => PALETTE[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
export const has = key => !!convs[key];
export const titleOf = key => (convs[key] && convs[key].title) || key.slice(2);

// 役のアイコン（絵文字 / 画像 / 頭文字の丸）
function avatar(r, size = 34) {
  const st = `width:${size}px;height:${size}px;font-size:${Math.round(size * .55)}px`;
  if (r.icon && r.icon.file) return `<img class="av" style="${st}" src="${new URL(encodeURI(r.icon.file), vaultUrl()).href}">`;
  if (r.icon && r.icon.emoji) return `<span class="av" style="${st};background:#eef1f7">${esc(r.icon.emoji)}</span>`;
  return `<span class="av" style="${st};background:${colorOf(r.id)};color:#fff">${esc([...r.name][0] || '?')}</span>`;
}
const PIC = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

// ===== 左の一覧 =====
export function listHtml() {
  const list = Object.entries(convs).sort((a, b) => (b[1].updated || b[1].created || 0) - (a[1].updated || a[1].created || 0));
  return `<div id="rlist"><div class="dtop"><button class="p" id="rp-new">＋ 新しい会話</button><button id="rp-roles">役の一覧</button></div>`
    + (list.map(([k, c]) => `<div class="item${cur === k && ctx.cur() && ctx.cur().k === 'rp' ? ' on' : ''}" data-rp="${esc(k)}"><span class="ci">🎭</span><b style="color:var(--fg)">${esc(c.title)}</b><small>${c.messages.length}</small></div>`).join('')
      || '<div class="none">会話はまだありません</div>') + '</div>';
}

// ===== 画面 =====
export function open(key, keep, mid) {
  if (!convs[key]) return;
  cur = key; draftQuote = null; draft = '';
  const c = conv(); if (!speaker || !c.cast.some(r => r.id === speaker)) speaker = c.cast[0] && c.cast[0].id;
  ctx.setCur(ctx.place({ k: 'rp', key }, keep)); ctx.setMode('rp');
  render(); ctx.renderTabs(); ctx.renderList();
  if (mid) setTimeout(() => { const el = document.querySelector(`[data-mid="${mid}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); } }, 50);
}
function render() {
  const c = conv();
  $('#pane').innerHTML = `
    <div class="chat rp">
      <div class="row chat-head">
        <input id="rp-title" class="kw" style="font-size:18px;font-weight:700;width:min(380px,50%);margin:0" value="${esc(c.title)}" title="会話の題">
        <span class="cast">${c.cast.map(r => `<span class="castchip" data-role="${r.id}" title="${esc(r.name)}">${avatar(r, 26)}<small>${esc(r.name)}</small></span>`).join('')}</span>
        <button data-r="addrole">＋ 役</button>
        <span class="grow"></span>
        <button data-r="del" class="danger">消す</button>
      </div>
      <div id="c-msgs"></div>
      <div id="rp-quote"></div>
      <div class="rp-speakers" id="rp-sp"></div>
      <div class="c-compose"><button data-r="quote" title="ノートや、ほかの会話を引用する">❝ 引用</button><button data-r="attach" title="画像などを付ける">📎</button>
        <textarea id="c-in" rows="1" placeholder="発言を書く（Enter で送る、Shift+Enter で改行、Tab で話す役を切り替え）"></textarea><button class="p" data-r="send">送る</button></div>
    </div>`;
  paint(); speakers(); quoteBar();
  const inp = $('#c-in'); inp.value = draft; fit(inp); inp.focus();
}
function fit(inp) { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 180) + 'px'; inp.style.overflowY = inp.scrollHeight > 180 ? 'auto' : 'hidden'; }
function speakers() {
  const el = $('#rp-sp'); if (!el) return;
  const c = conv();
  el.innerHTML = c.cast.length ? c.cast.map(r => `<span class="spk${r.id === speaker ? ' on' : ''}" data-spk="${r.id}">${avatar(r, 22)}${esc(r.name)}</span>`).join('') : '<span class="sub">「＋ 役」で、話す役を加えてください</span>';
}
function quoteBar() {
  const el = $('#rp-quote'); if (!el) return;
  el.innerHTML = draftQuote ? `<span>❝ ${esc(quoteTitle(draftQuote))}を引用して送る</span><b data-r="noquote">×</b>` : '';
  el.style.display = draftQuote ? 'flex' : 'none';
}
const quoteTitle = q => q.kind === 'note' ? `${q.s === 'p' ? '紙' : ''}ノート ${q.id}` : `会話「${q.title}」の発言`;
function quoteCard(q) {
  if (q.kind === 'note') {
    const n = ctx.get(q.s, q.id), body = n ? n.body.trim().slice(0, 220) : '（ノートがありません）';
    return `<div class="qcard" data-qnote="${q.s}:${esc(q.id)}"><div class="qh">${q.s === 'p' ? '紙 ' : ''}ノート ${esc(q.id)}</div><div class="md">${renderMd(body)}</div></div>`;
  }
  return `<div class="qcard" data-qrp="${esc(q.key)}" data-qmid="${q.mid}"><div class="qh">会話「${esc(q.title)}」 — ${esc(q.name)}</div><div class="md">${renderMd(q.text)}</div></div>`;
}
function paint() {
  const box = $('#c-msgs'); if (!box) return;
  const c = conv();
  box.innerHTML = c.messages.length ? c.messages.map(m => {
    const r = c.cast.find(x => x.id === m.role) || { id: m.role, name: m.name || '?', icon: null };
    const right = c.cast[0] && c.cast[0].id === r.id;
    return `<div class="rmsg${right ? ' right' : ''}" data-mid="${m.id}">${avatar(r)}<div class="rbody"><div class="b-meta"><b>${esc(r.name)}</b> ${hm(m.t)}</div>
      <div class="bub rb">${m.quote ? quoteCard(m.quote) : ''}${m.text ? `<div class="b-body md">${renderMd(m.text)}</div>` : ''}</div></div></div>`;
  }).join('') : '<div class="none">役を決めて、発言を書いてみましょう。Q&A・議論・相談のどれにも使えます</div>';
  box.scrollTop = box.scrollHeight;
}

// ===== 送る =====
function send() {
  const inp = $('#c-in'), text = inp.value.trim(), c = conv();
  if (!text && !draftQuote) return;
  if (!speaker) return alert('話す役がいません。「＋ 役」で加えてください');
  const m = { id: uid(), role: speaker, t: Date.now(), text };
  if (draftQuote) { m.quote = draftQuote; draftQuote = null; }
  c.messages.push(m); c.updated = m.t; save(cur);
  inp.value = ''; draft = ''; fit(inp); paint(); quoteBar(); ctx.renderList();
}
function cycle(dir) {
  const c = conv(); if (c.cast.length < 2) return;
  const i = c.cast.findIndex(r => r.id === speaker);
  speaker = c.cast[(i + dir + c.cast.length) % c.cast.length].id; speakers();
}

// ===== 会話を作る・役 =====
export function newDialog() {
  dialog(`<h3>新しい会話</h3><div class="sub">題</div><input id="nc-title" placeholder="例: 孔子と議論">
    <div class="sub">登場する役（あとから足せます）</div><div id="nc-roles" class="rolepick">${rolePickHtml([])}</div>
    <div class="row"><button class="p" id="nc-ok">作る</button><button id="nc-no">やめる</button></div>`, close => {
    $('#nc-title').focus(); $('#nc-no').onclick = close;
    wireRolePick('#nc-roles');
    $('#nc-ok').onclick = () => {
      let title = $('#nc-title').value.trim() || '会話'; const base = title; let n = 1;
      while (convs[keyOf(title)]) title = `${base}-${++n}`;
      const cast = [...document.querySelectorAll('#nc-roles input:checked')].map(i => snapshot(roles.find(r => r.id === i.value)));
      const key = keyOf(title); convs[key] = { title, created: Date.now(), cast, messages: [] }; save(key);
      speaker = cast[0] && cast[0].id; close(); open(key);
    };
  });
}
const snapshot = r => ({ id: r.id, name: r.name, icon: r.icon || null });
function rolePickHtml(chosen) {
  return (roles.map(r => `<label class="rp-opt"><input type="checkbox" value="${r.id}" ${chosen.includes(r.id) ? 'checked' : ''}>${avatar(r, 26)} ${esc(r.name)}</label>`).join('') || '<div class="sub">保存した役がまだありません</div>')
    + '<button type="button" class="mini" data-newrole>＋ 新しい役を作る</button>';
}
function wireRolePick(sel) {
  $(sel).onclick = e => {
    if (!e.target.closest('[data-newrole]')) return;
    const checked = [...$(sel).querySelectorAll('input:checked')].map(i => i.value);
    roleDialog(null, r => { $(sel).innerHTML = rolePickHtml([...checked, r.id]); wireRolePick(sel); });
  };
}
// 役を作る・直す（名前・絵文字か画像）
function roleDialog(role, done) {
  const r = role ? { ...role, icon: role.icon ? { ...role.icon } : null } : { id: uid(), name: '', icon: null };
  dialog(`<h3>${role ? '役を直す' : '新しい役'}</h3><div class="sub">名前</div><input id="ro-name" value="${esc(r.name)}" placeholder="例: 孔子 / 先生 / 未来の自分">
    <div class="sub">アイコン（絵文字を1つ入れるか、画像を選ぶ。決めなければ名前の頭文字）</div>
    <div class="row"><input id="ro-emoji" style="width:80px" value="${esc((r.icon && r.icon.emoji) || '')}" placeholder="🙂"><button id="ro-img">画像を選ぶ</button><span id="ro-prev">${avatar(r, 36)}</span><button id="ro-clear" class="mini">アイコンをやめる</button></div>
    <div class="row"><button class="p" id="ro-ok">保存</button><button id="ro-no">やめる</button></div>`, close => {
    const prev = () => { $('#ro-prev').innerHTML = avatar({ ...r, name: $('#ro-name').value || '?' }, 36); };
    $('#ro-name').focus(); $('#ro-no').onclick = close; $('#ro-name').oninput = prev;
    $('#ro-emoji').oninput = e => { const v = [...e.target.value.trim()][0] || ''; r.icon = v ? { emoji: v } : null; prev(); };
    $('#ro-clear').onclick = () => { r.icon = null; $('#ro-emoji').value = ''; prev(); };
    $('#ro-img').onclick = () => ctx.pick(false, async fs => { const f = fs[0]; if (!PIC.test(f.name || 'x.png')) return; const [name] = await ctx.api.addFiles([{ name: f.name, bytes: await f.arrayBuffer() }]); r.icon = { file: name }; $('#ro-emoji').value = ''; prev(); }, 'image/*');
    $('#ro-ok').onclick = () => {
      const name = $('#ro-name').value.trim(); if (!name) return;
      r.name = name; const i = roles.findIndex(x => x.id === r.id);
      if (i >= 0) roles[i] = r; else roles.push(r);
      saveRoles(); close(); done && done(r);
    };
  });
}
export function rolesDialog() {
  const draw = () => {
    $('#modal .box').innerHTML = `<h3>役の一覧</h3><div class="sub">保存した役。会話に何人でも呼び出せます</div>
      ${roles.map(r => `<div class="rolerow">${avatar(r, 30)}<b>${esc(r.name)}</b><span class="grow"></span><button data-edit="${r.id}">直す</button><button data-del="${r.id}" class="danger">消す</button></div>`).join('') || '<div class="sub">まだありません</div>'}
      <div class="row"><button class="p" id="rl-new">＋ 新しい役</button><button id="rl-close">閉じる</button></div>`;
    $('#rl-close').onclick = () => { $('#modal').style.display = 'none'; };
    $('#rl-new').onclick = () => roleDialog(null, () => rolesDialog());
    $('#modal .box').onclick = e => {
      const ed = e.target.closest('[data-edit]'), de = e.target.closest('[data-del]');
      if (ed) roleDialog(roles.find(r => r.id === ed.dataset.edit), () => rolesDialog());
      if (de && confirm('この役をライブラリから消しますか？（作った会話の中の役は残ります）')) { roles = roles.filter(r => r.id !== de.dataset.del); saveRoles(); draw(); }
    };
  };
  $('#modal').style.display = 'flex'; $('#modal').onkeydown = e => { if (e.key === 'Escape') $('#modal').style.display = 'none'; }; draw();
}
function addRoleDialog() {
  const c = conv(), pick = roles.filter(r => !c.cast.some(x => x.id === r.id)); // まだ会話にいない役だけ
  const html = () => (pick.map(r => `<label class="rp-opt"><input type="checkbox" value="${r.id}">${avatar(r, 26)} ${esc(r.name)}</label>`).join('') || '<div class="sub">加えられる保存済みの役がありません</div>')
    + '<button type="button" class="mini" data-newrole>＋ 新しい役を作る</button>';
  dialog(`<h3>役を加える</h3><div class="sub">保存した役から選ぶ（何人でも）</div><div id="ar-roles" class="rolepick">${html()}</div>
    <div class="row"><button class="p" id="ar-ok">加える</button><button id="ar-no">やめる</button></div>`, close => {
    $('#ar-no').onclick = close;
    $('#ar-roles').onclick = e => {
      if (!e.target.closest('[data-newrole]')) return;
      roleDialog(null, r => { pick.push(r); addRoleDialog(); document.querySelector(`#ar-roles input[value="${r.id}"]`).checked = true; });
    };
    $('#ar-ok').onclick = () => {
      for (const i of document.querySelectorAll('#ar-roles input:checked')) { const r = roles.find(x => x.id === i.value); if (r && !c.cast.some(x => x.id === r.id)) c.cast.push(snapshot(r)); }
      if (!speaker && c.cast[0]) speaker = c.cast[0].id; save(cur); close(); render();
    };
  });
}

// ===== 引用 =====
function quoteDialog() {
  dialog(`<h3>引用する</h3><div class="row"><button class="p" id="q-note">ノート</button><button id="q-rp">ほかの会話</button></div>
    <input id="q-q" placeholder="さがす（ID・本文）"><div id="q-list" class="ta-list"></div><div class="row"><button id="q-no">やめる</button></div>`, close => {
    let kind = 'note';
    const draw = () => {
      const q = $('#q-q').value.trim().toLowerCase(), box = $('#q-list');
      if (kind === 'note') {
        const ns = ctx.notes().filter(n => !q || (n.id + '\n' + n.body).toLowerCase().includes(q)).sort((a, b) => a.s.localeCompare(b.s) || L.cmpId(a.id, b.id)).slice(0, 60);
        box.innerHTML = ns.map(n => `<div class="ta-row" data-s="${n.s}" data-id="${esc(n.id)}"><b>${n.s === 'p' ? '紙 ' : ''}${esc(n.id)}</b> <small>${esc(n.body.split('\n').find(x => x.trim()) || '').slice(0, 40)}</small></div>`).join('') || '<div class="sub" style="padding:6px">ありません</div>';
      } else {
        const rows = [];
        for (const [k, c2] of Object.entries(convs)) for (const m of c2.messages) {
          if (k === cur || !m.text || (q && !(m.text + c2.title).toLowerCase().includes(q))) continue;
          rows.push(`<div class="ta-row" data-k="${esc(k)}" data-m="${m.id}"><b>${esc(c2.title)}</b> <small>${esc((c2.cast.find(r => r.id === m.role) || {}).name || '')}: ${esc(m.text.split('\n')[0].slice(0, 40))}</small></div>`);
        }
        box.innerHTML = rows.slice(0, 80).join('') || '<div class="sub" style="padding:6px">ありません</div>';
      }
    };
    $('#q-note').onclick = () => { kind = 'note'; draw(); }; $('#q-rp').onclick = () => { kind = 'rp'; draw(); };
    $('#q-q').oninput = draw; $('#q-no').onclick = close; $('#q-q').focus(); draw();
    $('#q-list').onclick = e => {
      const r = e.target.closest('.ta-row'); if (!r) return;
      if (r.dataset.id) draftQuote = { kind: 'note', s: r.dataset.s, id: r.dataset.id };
      else { const c2 = convs[r.dataset.k], m = c2.messages.find(x => x.id === r.dataset.m); draftQuote = { kind: 'rp', key: r.dataset.k, title: c2.title, mid: m.id, name: (c2.cast.find(x => x.id === m.role) || {}).name || '', text: m.text }; }
      close(); quoteBar(); $('#c-in').focus();
    };
  });
}
// 発言をノートに引用する（元の会話へのリンクつき）
function quoteToNote(m) {
  const c = conv(), r = c.cast.find(x => x.id === m.role) || { name: '?' };
  const last = ctx.lastNote && ctx.lastNote();
  dialog(`<h3>この発言をノートに引用</h3><div class="sub">${esc(r.name)}: ${esc(m.text.split('\n')[0].slice(0, 40))}</div>
    <div class="row"><select id="qn-s"><option value="d">デジタル</option><option value="p">紙</option></select><input id="qn-id" style="width:110px" value="${esc(last ? last.id : '')}" placeholder="ノートのID"></div>
    <div class="row"><button class="p" id="qn-ok">引用する</button><button id="qn-no">やめる</button></div>`, close => {
    if (last) $('#qn-s').value = last.s; $('#qn-no').onclick = close; $('#qn-id').focus();
    $('#qn-ok').onclick = () => {
      const s = $('#qn-s').value, id = $('#qn-id').value.trim().toLowerCase(), n = ctx.get(s, id);
      if (!n) return alert('そのノートがありません');
      const href = `R_${encodeURIComponent(L.fileName(c.title)).replace(/[()]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase())}.json#${m.id}`;
      n.body = (n.body.trimEnd() ? n.body.trimEnd() + '\n\n' : '') + `> **${r.name}**: ` + m.text.split('\n').join('\n> ') + `\n> [↩ ${c.title}](${href})\n`;
      ctx.touchNote(n); close(); toast(`ノート ${id} に引用しました`);
    };
  });
}

// ===== 操作 =====
function menuFor(e, el) {
  const m = conv().messages.find(x => x.id === el.dataset.mid); if (!m) return;
  popMenu(e, [
    ['書き直す', () => editMsg(el, m)],
    ...(m.text ? [['ノートに引用する', () => quoteToNote(m)], ['コピー', () => navigator.clipboard.writeText(m.text)]] : []),
    ['消す', () => { if (!confirm('この発言を消しますか？')) return; conv().messages = conv().messages.filter(x => x !== m); save(cur); paint(); ctx.renderList(); }, true]
  ]);
}
function editMsg(el, m) {
  const body = el.querySelector('.bub');
  body.innerHTML = `<textarea class="b-edit"></textarea><div class="row"><button class="p" data-ok>保存</button><button data-no>やめる</button></div>`;
  const ta = body.querySelector('textarea'); ta.value = m.text; ta.style.height = Math.max(60, ta.scrollHeight) + 'px'; ta.focus();
  body.querySelector('[data-ok]').onclick = () => { m.text = ta.value.trim(); save(cur); paint(); };
  body.querySelector('[data-no]').onclick = () => paint();
}
export async function attach(files) {
  const list = []; for (const f of files) list.push({ name: f.name || 'image.png', bytes: await f.arrayBuffer() });
  const names = await ctx.api.addFiles(list), inp = $('#c-in'); if (!inp) return;
  const enc = n => n.replace(/[\s()<>%#?\\]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
  inp.value += (inp.value && !inp.value.endsWith('\n') ? '\n' : '') + names.map(n => PIC.test(n) ? `![](${enc(n)})` : `[${n.replace(/[\[\]]/g, '')}](${enc(n)})`).join('\n') + '\n';
  draft = inp.value; fit(inp); inp.focus();
}
function rename(title) {
  title = title.trim(); const c = conv(); if (!title || title === c.title) return;
  let t = title, n = 1; while (convs[keyOf(t)] && keyOf(t) !== cur) t = `${title}-${++n}`;
  const old = cur, key = keyOf(t); c.title = t;
  if (key !== old) { convs[key] = c; delete convs[old]; cur = key; ctx.api.saveDoc(key, c); ctx.api.deleteDoc(old); ctx.renameTab(old, key); }
  else save(cur);
  ctx.renderTabs(); ctx.renderList();
}

document.addEventListener('click', e => {
  const pane = e.target.closest('.chat.rp'); if (!pane) return;
  const a = e.target.closest('[data-r]');
  if (a) {
    const k = a.dataset.r;
    if (k === 'send') send(); if (k === 'quote') quoteDialog(); if (k === 'attach') ctx.pick(true, attach, '*');
    if (k === 'noquote') { draftQuote = null; quoteBar(); }
    if (k === 'addrole') addRoleDialog();
    if (k === 'del' && confirm(`会話「${conv().title}」を消しますか？（ファイルは .trash に移ります）`)) { ctx.api.deleteDoc(cur); delete convs[cur]; ctx.closeKind('rp', cur); }
    return;
  }
  const sp = e.target.closest('[data-spk]'); if (sp) { speaker = sp.dataset.spk; speakers(); $('#c-in').focus(); return; }
  const ch = e.target.closest('[data-role]'); if (ch) { const r = roles.find(x => x.id === ch.dataset.role) || conv().cast.find(x => x.id === ch.dataset.role); if (r) roleDialog(r, nr => { const c = conv(); const i = c.cast.findIndex(x => x.id === nr.id); if (i >= 0) c.cast[i] = snapshot(nr); save(cur); render(); }); return; }
  const qn = e.target.closest('[data-qnote]'); if (qn) { const [s, ...id] = qn.dataset.qnote.split(':'); if (ctx.get(s, id.join(':'))) ctx.openNote(s, id.join(':')); return; }
  const qr = e.target.closest('[data-qrp]'); if (qr && convs[qr.dataset.qrp]) { open(qr.dataset.qrp, false, qr.dataset.qmid); return; }
  mdClick(e);
});
document.addEventListener('contextmenu', e => {
  const el = e.target.closest('.chat.rp .rmsg'); if (!el || e.target.closest('textarea')) return;
  e.preventDefault(); menuFor(e, el);
});
document.addEventListener('input', e => {
  if (e.target.id === 'c-in' && e.target.closest('.chat.rp')) { draft = e.target.value; fit(e.target); }
});
document.addEventListener('change', e => { if (e.target.id === 'rp-title') rename(e.target.value); });
document.addEventListener('keydown', e => {
  if (!e.target.closest || !e.target.closest('.chat.rp')) return;
  if (e.target.id === 'c-in') {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    else if (e.key === 'Tab') { e.preventDefault(); cycle(e.shiftKey ? -1 : 1); }
  }
});
