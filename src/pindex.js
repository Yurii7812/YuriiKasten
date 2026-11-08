// 紙のIndex（グローバルIndexのカード）の並べ替え道具。左のアイコン列の 🗂
//  ・キーワード・よみ・ID を書いて足す。ID はまだ取り込んでいない紙のものでもよい（取り込まれたら本 Index に自動でマージ）
//  ・書いている途中から、並び順のどこに入るかが見える（点線の行）。入る場所の前後が、そのまま見える
//  ・検索は「キーワードだけ」。絞り込んだ行を押すと、絞り込みが外れて、その場所に飛ぶ（前後のカードが見える）
import { ctx, $, esc } from './shared.js';
import L from '../lib.js';

let pend = [];            // まだ紙のノートが無いもの [{ kw, reading, ids }]
let flashKw = null;       // 飛んだ先の行
let sugTimer = null;

export function init(docs) { pend = (docs['K_paperindex'] && docs['K_paperindex'].entries) || []; }
export const apply = st => { pend = (st.docs && st.docs['K_paperindex'] && st.docs['K_paperindex'].entries) || []; };

const sortKey = r => r.reading || r.kw;
const cmp = (a, b) => L.byReading(x => x)(a, b); // 読み（無ければキーワード）で、あいうえお順。英数は最後
// 行: キーワードごとに、紙のノートがあるID（ノートのキーワード）と、まだ無いID（取り込み前）
function rows() {
  const m = new Map(), R = ctx.readings();
  const row = kw => { if (!m.has(kw)) m.set(kw, { kw, reading: R[kw] || '', have: [], wait: [] }); return m.get(kw); };
  for (const n of ctx.notes()) if (n.s === 'p') for (const k of n.keywords) row(k).have.push(n.id);
  for (const e of pend) { const r = row(e.kw); if (!r.reading) r.reading = e.reading || ''; r.wait.push(...e.ids); }
  const list = [...m.values()];
  for (const r of list) { r.have.sort(L.cmpId); r.wait.sort(L.cmpId); }
  return list.sort((a, b) => cmp(sortKey(a), sortKey(b)));
}


export function html() {
  return `<div id="pi">
    <div class="pi-form">
      <input id="pi-kw" placeholder="キーワード" autocomplete="off"><input id="pi-rd" placeholder="よみ（自動）" autocomplete="off">
      <input id="pi-ids" placeholder="ID　例: 12 12a" autocomplete="off"><button class="p" id="pi-add">追加</button>
    </div>
    <div class="pi-find"><input id="pi-q" placeholder="さがす（キーワードだけ）" autocomplete="off"></div>
    <div id="pi-rows"></div></div>`;
}
const chip = (id, exists, kw) => `<span class="pid${exists ? '' : ' wait'}" title="${exists ? '紙のノートがあります' : 'まだ取り込んでいません'}">${esc(id)}<i data-pdel="${esc(kw)}" data-pid="${esc(id)}">×</i></span>`;

// 一覧を描く。入る位置の点線の行（preview）と、絞り込み・飛んだ先の印も、ここで
export function draw() {
  const box = $('#pi-rows'); if (!box) return;
  const q = ($('#pi-q') || {}).value ? $('#pi-q').value.trim().toLowerCase() : '', hq = L.toHira(q);
  let list = rows();
  if (q) list = list.filter(r => r.kw.toLowerCase().includes(q) || (r.reading || '').includes(hq)); // キーワードだけ
  // 書いている途中のものが入る位置
  const kw = ($('#pi-kw') || {}).value ? $('#pi-kw').value.trim() : '', rd = ($('#pi-rd') || {}).value ? L.toHira($('#pi-rd').value.trim()) : '';
  let at = -1;
  if (kw && !q) { const key = rd || kw; at = list.findIndex(r => cmp(sortKey(r), key) > 0); if (at < 0) at = list.length; }
  const out = []; let group = null;
  const header = key => { const g = L.kanaRow(key); if (g !== group) { group = g; out.push(`<div class="pg">${g}</div>`); } };
  const rowHtml = r => `<div class="pr${flashKw === r.kw ? ' flash' : ''}${q ? ' hit' : ''}" data-kw="${esc(r.kw)}"><div class="pk"><b>${esc(r.kw)}</b><small>${esc(r.reading)}</small></div><div class="pids">${[...r.have.map(i => chip(i, true, r.kw)), ...r.wait.map(i => chip(i, false, r.kw))].join('')}</div></div>`;
  list.forEach((r, i) => {
    if (i === at) { header(rd || kw); out.push(`<div class="pr prev" id="pi-prev"><b>${esc(kw)}</b><small>${esc(rd)}</small><span>← ここに入ります</span></div>`); }
    header(sortKey(r)); out.push(rowHtml(r));
  });
  if (at === list.length) { header(rd || kw); out.push(`<div class="pr prev" id="pi-prev"><b>${esc(kw)}</b><small>${esc(rd)}</small><span>← ここに入ります</span></div>`); }
  box.innerHTML = out.join('') || '<div class="none">紙のIndexはまだありません。上のキーワードとIDを書いて、追加します</div>';
  if (at >= 0) { const p = $('#pi-prev'); if (p) p.scrollIntoView({ block: 'center' }); }          // 入る場所を見せる
  else if (flashKw) { const f = box.querySelector('.pr.flash'); if (f) f.scrollIntoView({ block: 'center' }); }
}
// 絞り込んだ行を押した → 絞り込みを外して、その場所へ飛ぶ（前後のカードが見える）
function jump(kw) {
  const q = $('#pi-q'); q.value = ''; flashKw = kw; draw();
  setTimeout(() => { flashKw = null; const f = document.querySelector('#pi-rows .pr.flash'); if (f) f.classList.remove('flash'); }, 2200);
}
async function add() {
  const kw = $('#pi-kw').value.trim(), ids = $('#pi-ids').value.split(/[\s,、，]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!kw) return $('#pi-kw').focus();
  const bad = ids.filter(i => !L.isId(L.splitAnchor(i).id)); if (bad.length) return alert(`IDの形が違います: ${bad.join(' ')}\n（例: 12 や 3a や 3a(1)）`);
  let rd = L.toHira($('#pi-rd').value.trim()); if (!rd) rd = await ctx.api.suggest(kw);
  await ctx.flush();
  const st = await ctx.api.addPaperIndex({ kw, reading: rd, ids });
  if (!st) return;
  ctx.applyState(st);
  flashKw = kw; $('#pi-kw').value = ''; $('#pi-rd').value = ''; $('#pi-ids').value = ''; draw();
  setTimeout(() => { flashKw = null; const f = document.querySelector('#pi-rows .pr.flash'); if (f) f.classList.remove('flash'); }, 2200);
  $('#pi-kw').focus();
}

document.addEventListener('input', e => {
  if (e.target.id === 'pi-q') return draw();
  if (e.target.id === 'pi-kw') { // よみの候補を、自動で入れる（直していなければ）
    clearTimeout(sugTimer);
    sugTimer = setTimeout(async () => { const rd = $('#pi-rd'); if (!rd || rd.dataset.touched) return; const k = e.target.value.trim(); rd.value = k ? await ctx.api.suggest(k) : ''; draw(); }, 220);
    draw();
  }
  if (e.target.id === 'pi-rd') { e.target.dataset.touched = e.target.value ? '1' : ''; draw(); }
});
document.addEventListener('keydown', e => {
  if (e.target.id === 'pi-q' && e.key === 'Escape') { e.target.value = ''; e.target.blur(); draw(); return; }                  // 検索から離れる
  if (['pi-kw', 'pi-rd', 'pi-ids'].includes(e.target.id) && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); }
  if (['pi-kw', 'pi-rd', 'pi-ids'].includes(e.target.id) && e.key === 'Escape') { e.target.blur(); }
});
document.addEventListener('click', async e => {
  if (e.target.id === 'pi-add') return add();
  const del = e.target.closest('[data-pdel]');
  if (del) { // IDを外す
    if (!confirm(`紙のIndexから「${del.dataset.pdel}」の ${del.dataset.pid} を外しますか？`)) return;
    const st = await ctx.api.removePaperIndex({ kw: del.dataset.pdel, id: del.dataset.pid }); if (st) { ctx.applyState(st); draw(); } return;
  }
  const row = e.target.closest('#pi-rows .pr[data-kw]');
  if (row && $('#pi-q') && $('#pi-q').value.trim()) jump(row.dataset.kw);                                                     // 絞り込み中に押した → その場所へ
});
