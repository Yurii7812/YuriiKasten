// なりきりチャット。一人二役（役は何人でも）。役はライブラリに保存して呼び出せる。1つの会話 = 1つのファイル
// なりきりチャットは、ふつうのノート（kind: 'rp'）。会話のデータはノートの中（note.data）。役のライブラリだけ K_roles.json
import { ctx, $, esc, hm, uid, vaultUrl, renderMd, mdClick, popMenu, toast, dialog } from './shared.js';
import L from '../lib.js';

let note = null;           // 開いているなりきりチャットのノート。note.data = { title, cast:[{id,name,icon}], messages:[...] }
let roles = [];            // ライブラリ [{id,name,icon:{emoji|file}}]
let speaker = null;        // 話す役の id
let draftQuote = null;     // 次に送る発言に付ける引用
let draftReply = null;     // 次に送る発言が返信する発言の id
let draft = '';
const PALETTE = ['#2456c8', '#c0392b', '#2e8b57', '#b8860b', '#8e44ad', '#16a085', '#d35400', '#566573'];

export function init(docs) { roles = (docs['K_roles'] && docs['K_roles'].roles) || []; }
// 会話を書き換えたら、本文（検索や Markdown 用の文字）も作り直して、ノートとして保存する
const save = () => { note.body = L.deriveBody('rp', note.data); ctx.touchNote(note); };
export const emptyData = () => ({ title: '会話', cast: [], messages: [] });
const saveRoles = () => ctx.later('doc:K', () => ctx.api.saveDoc('K_roles', { roles }));
const conv = () => note.data;
const colorOf = id => PALETTE[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

// 役のアイコン（絵文字 / 画像 / 頭文字の丸）
function avatar(r, size = 34) {
  const st = `width:${size}px;height:${size}px;font-size:${Math.round(size * .55)}px`;
  if (r.icon && r.icon.file) return `<img class="av" style="${st}" src="${new URL(encodeURI(r.icon.file), vaultUrl()).href}">`;
  if (r.icon && r.icon.emoji) return `<span class="av" style="${st};background:#eef1f7">${esc(r.icon.emoji)}</span>`;
  return `<span class="av" style="${st};background:${colorOf(r.id)};color:#fff">${esc([...r.name][0] || '?')}</span>`;
}
const PIC = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

// ===== ノートの中の画面 =====
// container に、なりきりチャットを描く（ノートの上の欄は、ふつうのノートと同じ）
export function render(container, n, mid) {
  note = n; if (!n.data || !n.data.cast) n.data = { ...emptyData(), ...(n.data || {}) };
  draftQuote = null; draftReply = null; draft = '';
  const c = conv(); if (!speaker || !c.cast.some(r => r.id === speaker)) speaker = c.cast[0] && c.cast[0].id;
  container.innerHTML = '<div class="chat rp" id="rp-root"></div>'; drawRoot();
  if (mid) setTimeout(() => { const el = document.querySelector(`[data-mid="${mid}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); } }, 50);
}
function drawRoot() {
  const c = conv();
  $('#rp-root').innerHTML = `
      <div class="row chat-head">
        <span class="cast">${c.cast.map(r => `<span class="castchip" data-role="${r.id}" title="${esc(r.name)}">${avatar(r, 26)}<small>${esc(r.name)}</small></span>`).join('')}</span>
        <button data-r="addrole">＋ 役</button><button data-r="roles">役の一覧</button>
      </div>
      <div id="c-msgs"></div>
      <div id="rp-quote"></div>
      <div id="rp-mention" class="mnlist"></div>
      <div class="rp-speakers" id="rp-sp"></div>
      <div class="c-compose"><button data-r="quote" title="ノートや、ほかの会話を引用する">❝ 引用</button><button data-r="attach" title="画像などを付ける">📎</button>
        <textarea id="c-in" rows="1" placeholder="発言を書く（Enter で送る、Shift+Enter で改行、Tab で話す役を切り替え）"></textarea><button class="p" data-r="send">送る</button></div>`;
  paint(); speakers(); quoteBar();
  const inp = $('#c-in'); inp.value = draft; fit(inp);   // 開いただけでは入力欄に入らない（一覧のキー操作を邪魔しない）。クリックか i キーで入る
}
function fit(inp) { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 180) + 'px'; inp.style.overflowY = inp.scrollHeight > 180 ? 'auto' : 'hidden'; }
function speakers() {
  const el = $('#rp-sp'); if (!el) return;
  const c = conv();
  el.innerHTML = c.cast.length ? c.cast.map(r => `<span class="spk${r.id === speaker ? ' on' : ''}" data-spk="${r.id}">${avatar(r, 22)}${esc(r.name)}</span>`).join('') : '<span class="sub">「＋ 役」で、話す役を加えてください</span>';
}
function quoteBar() {
  const el = $('#rp-quote'); if (!el) return;
  const rm = draftReply && conv().messages.find(x => x.id === draftReply), rr = rm && (conv().cast.find(x => x.id === rm.role) || { name: rm.name || '?' });
  el.innerHTML = (draftQuote ? `<div class="qrow"><span>❝ ${esc(quoteTitle(draftQuote))}を引用して送る</span><b data-r="noquote">×</b></div>` : '')
    + (rm ? `<div class="qrow"><span>↩ ${esc(rr.name)} の発言に返信: ${esc((rm.text || '').split('\n')[0].slice(0, 30))}</span><b data-r="noreply">×</b></div>` : '');
  el.style.display = draftQuote || rm ? 'block' : 'none';
}
const quoteTitle = q => q.kind === 'note' ? `${q.s === 'p' ? '紙' : ''}ノート ${q.id}` : `会話「${q.title}」の発言`;
function quoteCard(q) {
  if (q.kind === 'note') {
    const n = ctx.get(q.s, q.id), body = n ? n.body.trim().slice(0, 220) : '（ノートがありません）';
    return `<div class="qcard" data-qnote="${q.s}:${esc(q.id)}"><div class="qh">${q.s === 'p' ? '紙 ' : ''}ノート ${esc(q.id)}</div><div class="md">${renderMd(body)}</div></div>`;
  }
  return `<div class="qcard" data-qrp="${q.s || 'd'}:${esc(q.nid || '')}" data-qmid="${q.mid}"><div class="qh">会話「${esc(q.title)}」 — ${esc(q.name)}</div><div class="md">${renderMd(q.text)}</div></div>`;
}
function paint() {
  const box = $('#c-msgs'); if (!box) return;
  const c = conv();
  box.innerHTML = c.messages.length ? c.messages.map(m => {
    const r = c.cast.find(x => x.id === m.role) || { id: m.role, name: m.name || '?', icon: null };
    const right = r.id === speaker;                       // いま話す役が右、ほかは左
    const rp = m.reply && c.messages.find(x => x.id === m.reply), rpr = rp && (c.cast.find(x => x.id === rp.role) || { name: rp.name || '?' });
    return `<div class="rmsg${right ? ' right' : ''}" data-mid="${m.id}">${avatar(r)}<div class="rbody"><div class="b-meta"><b>${esc(r.name)}</b> ${hm(m.t)} <span class="rpl" data-reply="${m.id}" title="この発言に返信">↩</span></div>
      <div class="bub rb">${m.reply ? `<div class="rreply" data-goto="${m.reply}">↩ ${rp ? `${esc(rpr.name)}: ${esc((rp.text || '').split('\n')[0].slice(0, 40))}` : '（消された発言）'}</div>` : ''}${m.quote ? quoteCard(m.quote) : ''}${m.text ? `<div class="b-body md">${renderMd(m.text)}</div>` : ''}</div></div></div>`;
  }).join('') : '<div class="none">役を決めて、発言を書いてみましょう。Q&A・議論・相談のどれにも使えます</div>';
  decorateMentions(box);
  box.scrollTop = box.scrollHeight;
}
// 本文の @役名 を、目立たせる
function decorateMentions(box) {
  const names = conv().cast.map(r => r.name).filter(Boolean).sort((a, b) => b.length - a.length); if (!names.length) return;
  const re = new RegExp('@(' + names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g');
  for (const body of box.querySelectorAll('.b-body')) {
    const w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT), hits = [];
    for (let t = w.nextNode(); t; t = w.nextNode()) if (re.test(t.nodeValue) && !t.parentElement.closest('a,code')) hits.push(t); 
    for (const t of hits) {
      const f = document.createDocumentFragment(); let last = 0; re.lastIndex = 0; let m;
      while ((m = re.exec(t.nodeValue))) { f.append(t.nodeValue.slice(last, m.index)); const sp = document.createElement('span'); sp.className = 'mention'; sp.textContent = m[0]; f.append(sp); last = m.index + m[0].length; }
      f.append(t.nodeValue.slice(last)); t.replaceWith(f);
    }
  }
}

// ===== 送る =====
function send() {
  const inp = $('#c-in'), text = inp.value.trim(), c = conv();
  if (!text && !draftQuote && !draftReply) return;
  if (!speaker) return alert('話す役がいません。「＋ 役」で加えてください');
  const m = { id: uid(), role: speaker, t: Date.now(), text };
  if (draftQuote) { m.quote = draftQuote; draftQuote = null; }
  if (draftReply) { m.reply = draftReply; draftReply = null; }
  c.messages.push(m); c.updated = m.t; save();
  inp.value = ''; draft = ''; fit(inp); paint(); quoteBar(); ctx.renderList();
}
function setSpeaker(id) {          // 話す役を変えると、左右が入れ替わる（その役から見た会話）
  speaker = id; speakers();
  const box = $('#c-msgs'), top = box ? box.scrollTop : 0; paint(); if (box) box.scrollTop = top;
}
function cycle(dir) {
  const c = conv(); if (c.cast.length < 2) return;
  const i = c.cast.findIndex(r => r.id === speaker);
  setSpeaker(c.cast[(i + dir + c.cast.length) % c.cast.length].id);
}

// ===== 会話を作る・役 =====
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
      if (!speaker && c.cast[0]) speaker = c.cast[0].id; save(); close(); drawRoot();
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
        for (const n2 of ctx.notes().filter(x => x.kind === 'rp' && x !== note && x.data)) for (const m of n2.data.messages) {
          if (!m.text || (q && !(m.text + n2.data.title).toLowerCase().includes(q))) continue;
          rows.push(`<div class="ta-row" data-k="${n2.s}:${esc(n2.id)}" data-m="${m.id}"><b>${esc(n2.data.title)}</b> <small>${esc((n2.data.cast.find(r => r.id === m.role) || {}).name || '')}: ${esc(m.text.split('\n')[0].slice(0, 40))}</small></div>`);
        }
        box.innerHTML = rows.slice(0, 80).join('') || '<div class="sub" style="padding:6px">ありません</div>';
      }
    };
    $('#q-note').onclick = () => { kind = 'note'; draw(); }; $('#q-rp').onclick = () => { kind = 'rp'; draw(); };
    $('#q-q').oninput = draw; $('#q-no').onclick = close; $('#q-q').focus(); draw();
    $('#q-list').onclick = e => {
      const r = e.target.closest('.ta-row'); if (!r) return;
      if (r.dataset.id) draftQuote = { kind: 'note', s: r.dataset.s, id: r.dataset.id };
      else { const [s2, ...i2] = r.dataset.k.split(':'), n2 = ctx.get(s2, i2.join(':')), c2 = n2.data, m = c2.messages.find(x => x.id === r.dataset.m); draftQuote = { kind: 'rp', s: s2, nid: n2.id, title: c2.title, mid: m.id, name: (c2.cast.find(x => x.id === m.role) || {}).name || '', text: m.text }; }
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
      const href = `${note.stem}.md#${m.id}`; // この会話（ノート）の、その発言へ
      n.body = (n.body.trimEnd() ? n.body.trimEnd() + '\n\n' : '') + `> **${r.name}**: ` + m.text.split('\n').join('\n> ') + `\n> [↩ ${c.title}](${href})\n`;
      ctx.touchNote(n); close(); toast(`ノート ${id} に引用しました`);
    };
  });
}

// ===== 操作 =====
function menuFor(e, el) {
  const m = conv().messages.find(x => x.id === el.dataset.mid); if (!m) return;
  popMenu(e, [
    ['返信する', () => { draftReply = m.id; quoteBar(); $('#c-in').focus(); }],
    ['書き直す', () => editMsg(el, m)],
    ...(m.text ? [['ノートに引用する', () => quoteToNote(m)], ['コピー', () => navigator.clipboard.writeText(m.text)]] : []),
    ['消す', () => { if (!confirm('この発言を消しますか？')) return; conv().messages = conv().messages.filter(x => x !== m); save(); paint(); ctx.renderList(); }, true]
  ]);
}
function editMsg(el, m) {
  const body = el.querySelector('.bub');
  body.innerHTML = `<textarea class="b-edit"></textarea><div class="row"><button class="p" data-ok>保存</button><button data-no>やめる</button></div>`;
  const ta = body.querySelector('textarea'); ta.value = m.text; ta.style.height = Math.max(60, ta.scrollHeight) + 'px'; ta.focus();
  body.querySelector('[data-ok]').onclick = () => { m.text = ta.value.trim(); save(); paint(); };
  body.querySelector('[data-no]').onclick = () => paint();
}
export async function attach(files) {
  const list = []; for (const f of files) list.push({ name: f.name || 'image.png', bytes: await f.arrayBuffer() });
  const names = await ctx.api.addFiles(list), inp = $('#c-in'); if (!inp) return;
  const enc = n => n.replace(/[\s()<>%#?\\]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
  inp.value += (inp.value && !inp.value.endsWith('\n') ? '\n' : '') + names.map((n, i) => PIC.test(n) ? `![](${enc(n)})` : `[${(list[i].name || n).replace(/[\[\]]/g, '')}](${enc(n)})`).join('\n') + '\n';
  draft = inp.value; fit(inp); inp.focus();
}
document.addEventListener('click', e => {
  const pane = e.target.closest('.chat.rp'); if (!pane) return;
  const a = e.target.closest('[data-r]');
  if (a) {
    const k = a.dataset.r;
    if (k === 'send') send(); if (k === 'quote') quoteDialog(); if (k === 'attach') ctx.pick(true, attach, '*');
    if (k === 'noquote') { draftQuote = null; quoteBar(); }
    if (k === 'noreply') { draftReply = null; quoteBar(); }
    if (k === 'addrole') addRoleDialog();
    if (k === 'roles') rolesDialog();
    return;
  }
  const sp = e.target.closest('[data-spk]'); if (sp) { setSpeaker(sp.dataset.spk); $('#c-in').focus(); return; }
  const gt = e.target.closest('[data-goto]'); if (gt) { const el = document.querySelector(`.chat.rp [data-mid="${gt.dataset.goto}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1500); } return; }
  const mn = e.target.closest('[data-mention]'); if (mn) { pickMention(mn.dataset.mention); return; }
  const rb = e.target.closest('[data-reply]'); if (rb) { draftReply = rb.dataset.reply; quoteBar(); $('#c-in').focus(); return; }
  const ch = e.target.closest('[data-role]'); if (ch) { const r = roles.find(x => x.id === ch.dataset.role) || conv().cast.find(x => x.id === ch.dataset.role); if (r) roleDialog(r, nr => { const c = conv(); const i = c.cast.findIndex(x => x.id === nr.id); if (i >= 0) c.cast[i] = snapshot(nr); save(); drawRoot(); }); return; }
  const qn = e.target.closest('[data-qnote]'); if (qn) { const [s, ...id] = qn.dataset.qnote.split(':'); if (ctx.get(s, id.join(':'))) ctx.openNote(s, id.join(':')); return; }
  const qr = e.target.closest('[data-qrp]'); if (qr) { const [s2, ...i2] = qr.dataset.qrp.split(':'); if (ctx.get(s2, i2.join(':'))) ctx.openNote(s2, i2.join(':'), null, false, qr.dataset.qmid); return; }
  mdClick(e);
});
document.addEventListener('contextmenu', e => {
  const el = e.target.closest('.chat.rp .rmsg'); if (!el || e.target.closest('textarea')) return;
  e.preventDefault(); menuFor(e, el);
});
// @ で役を指名する（候補が出る。Tab / Enter / 押して決める）
let mentionOn = [];
function mentionList() {
  const inp = $('#c-in'), box = $('#rp-mention'); if (!inp) return;
  const before = inp.value.slice(0, inp.selectionStart), m = before.match(/@([^\s@]*)$/);
  mentionOn = m ? conv().cast.filter(r => r.name.startsWith(m[1])) : [];
  if (!box) return;
  box.innerHTML = mentionOn.map((r, i) => `<div class="mn${i === 0 ? ' on' : ''}" data-mention="${esc(r.name)}">${avatar(r, 22)} @${esc(r.name)}</div>`).join(''); box.style.display = mentionOn.length ? 'block' : 'none';
}
function pickMention(name) {
  const inp = $('#c-in'), pos = inp.selectionStart, before = inp.value.slice(0, pos).replace(/@([^\s@]*)$/, '@' + name + ' ');
  inp.value = before + inp.value.slice(pos); inp.selectionStart = inp.selectionEnd = before.length; draft = inp.value; mentionList(); inp.focus(); fit(inp);
}
document.addEventListener('input', e => {
  if (e.target.id === 'c-in' && e.target.closest('.chat.rp')) { draft = e.target.value; fit(e.target); mentionList(); }
});
document.addEventListener('keydown', e => {
  if (!e.target.closest || !e.target.closest('.chat.rp')) return;
  if (e.target.id === 'c-in') {
    if (mentionOn.length && (e.key === 'Tab' || (e.key === 'Enter' && !e.isComposing))) { e.preventDefault(); pickMention(mentionOn[0].name); return; }
    if (e.key === 'Escape' && mentionOn.length) { mentionOn = []; mentionList(); }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    else if (e.key === 'Tab') { e.preventDefault(); cycle(e.shiftKey ? -1 : 1); }
  }
});
