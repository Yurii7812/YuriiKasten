// 曼荼羅ビュー（Gnosis の曼荼羅に合わせる）: 真ん中のノートの周りに、つながったノートを 8 つ。
//   3×3（1つの曼荼羅）と 9×9（周りの 8 つがそれぞれ曼荼羅）。空きマスを押すと、その場で新しいノートを作る。
//   動き: h j k l / 矢印でマス・1〜8 でそのマス・Enter で中心にする・Tab / S-Tab で順に・[ ] で前後の曼荼羅（9 つ以上あるとき）
//         b / ⌫ で戻る・Shift+b で戻るを戻す・f で 9×9 ⇔ 3×3・p で右のノートを隠す・Space でノートへ・? で案内
//   モード: a 全体 / i 索引だけ / d 親子だけ / c 近いグループ（同じ系統）/ v 外向き（リンク先）/ w 近さ順 / D 配下だけ
import { esc } from './shared.js';
import L from '../lib.js';

export const MODES = { a: '全体', i: '索引', d: '親子', c: '近いグループ', v: '外向き', w: '近さ順', D: '配下' };
const RING = [0, 1, 2, 5, 8, 7, 6, 3];   // 8 マスの並び（左上から時計回り）
const KIND = { p: '親', c: '子', s: '並列', l: 'リンク', b: '被リンク', k: '索引', g: '系統' };

// 中心 c（{s,id}）のまわりに並べるノート（種類つき）。notes: [{s,id,keywords,body,noid,...}]
export function entries(notes, c, mode) {
  const real = notes.filter(n => !n.noid), by = new Map(real.map(n => [n.s + ':' + n.id, n]));
  const key = n => n.s + ':' + n.id, me = by.get(c.s + ':' + c.id);
  if (!me) return [];
  const has = x => by.has(c.s + ':' + x), seen = new Set([key(me)]), out = [];
  const add = (n, kind) => { if (n && !seen.has(key(n))) { seen.add(key(n)); out.push({ s: n.s, id: n.id, kind }); } };
  const parent = L.parentIn(me.id, has), pn = parent && by.get(c.s + ':' + parent);
  const kids = real.filter(n => n.s === c.s && L.parentIn(n.id, has) === me.id).sort((a, b) => L.cmpId(a.id, b.id));
  const sibs = real.filter(n => n.s === c.s && n !== me && L.parentIn(n.id, has) === parent).sort((a, b) => L.cmpId(a.id, b.id));
  const refs = [...new Set(L.tokens(me.body || '').filter(t => t.k === 'ref' && !((t.sp || me.s) === me.s && t.id === me.id)).map(t => (t.sp || me.s) + ':' + t.id))].map(k => by.get(k)).filter(Boolean);
  const backs = real.filter(n => n !== me && L.tokens(n.body || '').some(t => t.k === 'ref' && t.id === me.id && (t.sp || n.s) === me.s));   // 紙とデジタルの間のリンクも
  const kw = real.filter(n => n !== me && (n.keywords || []).some(k => (me.keywords || []).includes(k)));
  const group = real.filter(n => n !== me && n.s === c.s && L.root(n.id) === L.root(me.id)).sort((a, b) => Math.abs(L.tok(a.id).length - L.tok(me.id).length) - Math.abs(L.tok(b.id).length - L.tok(me.id).length) || L.cmpId(a.id, b.id));
  const subtree = real.filter(n => n.s === c.s && n !== me && L.fzSubtree([n.id], me.id).length).sort((a, b) => L.cmpId(a.id, b.id));
  if (mode === 'i') kw.forEach(n => add(n, 'k'));
  else if (mode === 'd') { add(pn, 'p'); kids.forEach(n => add(n, 'c')); }
  else if (mode === 'c') group.forEach(n => add(n, 'g'));
  else if (mode === 'v') refs.forEach(n => add(n, 'l'));
  else if (mode === 'D') subtree.forEach(n => add(n, L.tok(n.id).length === L.tok(me.id).length + 1 ? 'c' : 'g'));
  else if (mode === 'w') { // 近さ順: 親・子・リンク・並列・被リンク・索引・同じ系統
    add(pn, 'p'); kids.forEach(n => add(n, 'c')); refs.forEach(n => add(n, 'l')); sibs.forEach(n => add(n, 's')); backs.forEach(n => add(n, 'b')); kw.forEach(n => add(n, 'k')); group.forEach(n => add(n, 'g'));
  } else { // 全体: 親・子・リンク・被リンク・並列・索引
    add(pn, 'p'); kids.forEach(n => add(n, 'c')); refs.forEach(n => add(n, 'l')); backs.forEach(n => add(n, 'b')); sibs.forEach(n => add(n, 's')); kw.forEach(n => add(n, 'k'));
  }
  return out;
}

// state: { center:{s,id}, sel:0..8（0=中心, 1〜8=周り）, mode, big, page, hist:[], fwd:[], preview:bool }
export function init(saved) { return { center: null, sel: 0, mode: 'a', big: false, page: 0, hist: [], fwd: [], preview: true, ...(saved || {}) }; }

export function ring(notes, st, c, page) {
  const all = entries(notes, c, st.mode), pages = Math.max(1, Math.ceil(all.length / 8));
  return { cells: all.slice(page * 8, page * 8 + 8), pages, total: all.length };
}

const short = (t, n) => (t || '').length > n ? t.slice(0, n - 1) + '…' : t || '';
function cell(n, titleOf, get, cls, idx, free) {
  if (!n) return `<div class="mc empty ${cls}" data-i="${idx}"${free ? ` data-new="${esc(free)}"` : ''}><span class="mn">${idx || ''}</span>${free ? `<span class="plus">＋</span>` : ''}</div>`;
  const note = get(n.s, n.id);
  return `<div class="mc ${cls}${n.kind ? ' k-' + n.kind : ''}" data-s="${n.s}" data-id="${esc(n.id)}" data-i="${idx}"><span class="mn">${idx || ''}</span><b>${n.s === 'p' ? '紙' : ''}${esc(n.id)}</b><span class="mt">${esc(short(note ? titleOf(note) : '', cls.includes('sm') ? 8 : 16))}</span>${n.kind ? `<i>${KIND[n.kind]}</i>` : ''}</div>`;
}

// 1つの 3×3
function grid(notes, st, c, page, titleOf, get, cls, selIdx, nextFree, dim) {
  const { cells } = ring(notes, st, c, page), me = { s: c.s, id: c.id, kind: '' };
  const slots = Array(9).fill(null); slots[4] = me; RING.forEach((pos, i) => { slots[pos] = cells[i] || null; });
  const idxOf = pos => pos === 4 ? 0 : RING.indexOf(pos) + 1;
  return `<div class="mg${dim ? ' dim' : ''}">` + slots.map((n, pos) => cell(n, titleOf, get, cls + (pos === 4 ? ' ctr' : '') + (selIdx === idxOf(pos) ? ' sel' : ''), idxOf(pos), !n && pos !== 4 ? nextFree(c) : '')).join('') + '</div>';
}

export function html(notes, st, titleOf, get) {
  const c = st.center; if (!c || !get(c.s, c.id)) return '<div class="none">ノートがありません</div>';
  const nextFree = base => { // 空きマスで作る新しいID: 中心の子（分岐）。使われていなければ
    let id = L.child(base.id); while (get(base.s, id)) id = L.sibling(id); return id;
  };
  const r = ring(notes, st, c, st.page), cells = r.cells;
  const head = `<div class="mhead"><b>${esc(c.s === 'p' ? '紙 ' : '')}${esc(c.id)}</b> ${esc(titleOf(get(c.s, c.id)))} <span class="sub">${MODES[st.mode]} · ${r.total} 件${r.pages > 1 ? ` · ${st.page + 1}/${r.pages} ページ（[ ] で切り替え）` : ''}</span></div>`;
  const bar = `<div class="mbar">${Object.entries(MODES).map(([k, v]) => `<button data-mm="${k}" class="${st.mode === k ? 'on' : ''}"><kbd>${k}</kbd>${v}</button>`).join('')}<span class="grow"></span><button data-mf title="3×3 と 9×9 を切り替え (f)"><kbd>f</kbd>${st.big ? '3×3' : '9×9'}</button><button data-mp title="右のノートを隠す・出す (p)"><kbd>p</kbd>プレビュー</button><button data-mb title="戻る (b)">←</button><button data-mq title="案内 (?)">?</button></div>`;
  let board;
  if (!st.big) board = grid(notes, st, c, st.page, titleOf, get, 'lg', st.sel, nextFree, false);
  else { // 9×9: 真ん中の 3×3 が中心の曼荼羅。周りの 8 つは、それぞれのノートを中心にした曼荼羅
    const blocks = Array(9).fill(null); blocks[4] = grid(notes, st, c, st.page, titleOf, get, 'sm', st.sel === 0 ? 0 : -1, nextFree, false);
    RING.forEach((pos, i) => { const n = cells[i]; blocks[pos] = n ? grid(notes, { ...st }, n, 0, titleOf, get, 'sm', -1, nextFree, false).replace('class="mg"', `class="mg sub${st.sel === i + 1 ? ' selb' : ''}"`) : `<div class="mg none-b" data-i="${i + 1}"></div>`; });
    board = `<div class="mbig">${blocks.join('')}</div>`;
  }
  return `<div class="mandala${st.big ? ' big' : ''}" tabindex="0">${head}${bar}<div class="mbody"><div class="mboard">${board}</div>${st.preview ? '<div class="mprev" id="mprev"></div>' : ''}</div><div class="mhelp" id="mhelp" hidden>${helpHtml()}</div></div>`;
}

const helpHtml = () => `<b>曼荼羅の操作</b><br>h j k l / 矢印: マスを動く　1〜8: そのマス　0: 中心　Enter: 中心にする　Tab / S-Tab: 順に　[ ]: 前後の曼荼羅<br>
b / ⌫: 戻る　B: 戻るを戻す　f: 9×9 ⇔ 3×3　p: 右のノートを隠す・出す　Space: ノートを開く　＋のマス: 新しい分岐のノートを作る<br>
モード: a 全体 / i 索引 / d 親子 / c 近いグループ / v 外向き / w 近さ順 / D 配下　　? で閉じる`;

// 選んでいるマスのノート（0=中心）
export function selected(notes, st) {
  if (!st.center) return null;
  if (st.sel === 0) return { s: st.center.s, id: st.center.id };
  return ring(notes, st, st.center, st.page).cells[st.sel - 1] || null;
}
