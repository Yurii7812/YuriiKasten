// キャンバス（Obsidian のキャンバス風）。テキスト・ノートの引用・画像のカードを、矢印の線でつなぐ
// 保存: V_<名前>.json  { title, nodes:[{id,x,y,w,h,type,text|s,nid|file}], edges:[{id,from,fromSide,to,toSide,label,arrow}], view:{x,y,z} }
import { ctx, $, esc, uid, vaultUrl, renderMd, mdClick, popMenu, toast, dialog } from './shared.js';
import L from '../lib.js';

let docs = {}, cur = null;
let sel = null;                 // { kind:'node'|'edge', id }
let drag = null;                // 操作中: pan / move / resize / connect
const SIDES = ['top', 'right', 'bottom', 'left'];
const PIC = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

export function init(d) { docs = {}; for (const [k, v] of Object.entries(d)) if (k.startsWith('V_')) docs[k] = v; }
export const has = key => !!docs[key];
export const titleOf = key => (docs[key] && docs[key].title) || key.slice(2);
const cv = () => docs[cur];
const save = () => ctx.later('doc:' + cur, () => ctx.api.saveDoc(cur, docs[cur]));
const keyOf = t => 'V_' + L.fileName(t);
const node = id => cv().nodes.find(n => n.id === id);
const edge = id => cv().edges.find(e => e.id === id);

// ===== 左の一覧 =====
export function listHtml() {
  const list = Object.entries(docs).sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0));
  return `<div id="vlist"><div class="dtop"><button class="p" id="cv-new">＋ 新しいキャンバス</button></div>`
    + (list.map(([k, c]) => `<div class="item${cur === k && ctx.cur() && ctx.cur().k === 'canvas' ? ' on' : ''}" data-cv="${esc(k)}"><span class="ci">🗺</span><b style="color:var(--fg)">${esc(c.title)}</b><small>${c.nodes.length}</small></div>`).join('')
      || '<div class="none">キャンバスはまだありません</div>') + '</div>';
}
export function newCanvas() {
  let title = 'キャンバス', n = 1; while (docs[keyOf(title)]) title = `キャンバス-${++n}`;
  const key = keyOf(title); docs[key] = { title, created: Date.now(), updated: Date.now(), nodes: [], edges: [], view: { x: 60, y: 60, z: 1 } };
  cur = key; save(); open(key);
}

// ===== 画面 =====
export function open(key, keep) {
  if (!docs[key]) return;
  cur = key; sel = null; drag = null;
  ctx.setCur(ctx.place({ k: 'canvas', key }, keep)); ctx.setMode('canvas');
  $('#pane').innerHTML = `
    <div class="cvbox">
      <div class="row cv-bar">
        <input id="cv-title" class="kw" style="font-size:16px;font-weight:700;width:240px;margin:0" value="${esc(cv().title)}">
        <button data-v="text">＋ テキスト</button><button data-v="note">＋ ノート</button><button data-v="image">＋ 画像</button>
        <span class="grow"></span><button data-v="zout" title="縮小">−</button><span id="cv-zoom" class="sub"></span><button data-v="zin" title="拡大">＋</button><button data-v="fit">全体</button>
        <button data-v="del" class="danger">消す</button>
      </div>
      <div id="cv-wrap"><div id="cv-world"><svg id="cv-svg" width="1" height="1"></svg><div id="cv-cards"></div></div>
        <div id="cv-hint">背景をダブルクリック: テキストカード　／　辺の●からドラッグ: 線　／　Ctrl+ホイール: 拡大縮小　／　Delete: 消す</div></div>
    </div>`;
  drawAll(); applyView(); ctx.renderTabs(); ctx.renderList();
}
function applyView() {
  const v = cv().view, w = $('#cv-world'); if (!w) return;
  w.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.z})`;
  $('#cv-zoom').textContent = Math.round(v.z * 100) + '%';
}
function drawAll() { drawCards(); drawEdges(); }
function cardHtml(n) {
  let inner;
  if (n.type === 'image') inner = `<img draggable="false" src="${new URL(encodeURI(n.file), vaultUrl()).href}">`;
  else if (n.type === 'note') {
    const note = ctx.get(n.s, n.nid);
    inner = `<div class="cv-nh" data-open="${n.s}:${esc(n.nid)}" title="ノートを開く">${n.s === 'p' ? '紙 ' : ''}ノート ${esc(n.nid)}</div><div class="cv-body md">${note ? renderMd(note.body.slice(0, 1200)) : '（ノートがありません）'}</div>`;
  } else inner = `<div class="cv-body md">${n.text ? renderMd(n.text) : '<span class="sub">ダブルクリックで書く</span>'}</div>`;
  const on = sel && sel.kind === 'node' && sel.id === n.id;
  return `<div class="cv-card ${n.type}${on ? ' sel' : ''}" data-n="${n.id}" style="left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${n.h}px">${inner}<i class="cv-rs"></i>${SIDES.map(s => `<i class="cv-h ${s}" data-side="${s}"></i>`).join('')}</div>`;
}
function drawCards() { $('#cv-cards').innerHTML = cv().nodes.map(cardHtml).join(''); }
const anchor = (n, side) => side === 'top' ? [n.x + n.w / 2, n.y] : side === 'bottom' ? [n.x + n.w / 2, n.y + n.h] : side === 'left' ? [n.x, n.y + n.h / 2] : [n.x + n.w, n.y + n.h / 2];
const normal = side => side === 'top' ? [0, -1] : side === 'bottom' ? [0, 1] : side === 'left' ? [-1, 0] : [1, 0];
function path(a, as, b, bs) {
  const k = Math.max(50, Math.hypot(a[0] - b[0], a[1] - b[1]) * .35), na = normal(as), nb = normal(bs);
  return `M${a[0]},${a[1]} C${a[0] + na[0] * k},${a[1] + na[1] * k} ${b[0] + nb[0] * k},${b[1] + nb[1] * k} ${b[0]},${b[1]}`;
}
function drawEdges() {
  const svg = $('#cv-svg'); if (!svg) return;
  let h = '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6b7a99"/></marker><marker id="arrs" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#2456c8"/></marker></defs>';
  for (const e of cv().edges) {
    const a = node(e.from), b = node(e.to); if (!a || !b) continue;
    const pa = anchor(a, e.fromSide), pb = anchor(b, e.toSide), d = path(pa, e.fromSide, pb, e.toSide), on = sel && sel.kind === 'edge' && sel.id === e.id;
    h += `<g data-e="${e.id}"><path d="${d}" class="cv-hit"/><path d="${d}" class="cv-edge${on ? ' sel' : ''}" ${e.arrow !== false ? `marker-end="url(#${on ? 'arrs' : 'arr'})"` : ''}/>`;
    if (e.label) h += `<text x="${(pa[0] + pb[0]) / 2}" y="${(pa[1] + pb[1]) / 2 - 6}" class="cv-label" text-anchor="middle">${esc(e.label)}</text>`;
    h += '</g>';
  }
  if (drag && drag.t === 'connect' && drag.to) { const a = node(drag.from); h += `<path d="${path(anchor(a, drag.side), drag.side, drag.to, drag.toSide || 'left')}" class="cv-edge tmp"/>`; }
  svg.innerHTML = h;
}
// 画面の座標 → キャンバスの座標
const toWorld = (cx, cy) => { const r = $('#cv-wrap').getBoundingClientRect(), v = cv().view; return [(cx - r.left - v.x) / v.z, (cy - r.top - v.y) / v.z]; };
const center = () => { const r = $('#cv-wrap').getBoundingClientRect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); };
const nearestSide = (n, [x, y]) => { const c = [n.x + n.w / 2, n.y + n.h / 2], dx = (x - c[0]) / n.w, dy = (y - c[1]) / n.h; return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top'); };
const touch = () => { cv().updated = Date.now(); save(); };

// ===== カードを足す =====
function addNode(n, edit) {
  const node1 = { id: uid(), w: 240, h: 130, ...n }; cv().nodes.push(node1); sel = { kind: 'node', id: node1.id };
  touch(); drawAll(); if (edit) editText(node1.id); return node1;
}
function addText(at) { const [x, y] = at || center(); addNode({ type: 'text', x: Math.round(x - 120), y: Math.round(y - 40), text: '' }, true); }
function addNoteDialog(at) {
  dialog(`<h3>ノートを引用する</h3><input id="cn-q" placeholder="さがす（ID・本文）"><div id="cn-list" class="ta-list"></div><div class="row"><button id="cn-no">やめる</button></div>`, close => {
    const draw = () => {
      const q = $('#cn-q').value.trim().toLowerCase();
      const ns = ctx.notes().filter(n => !q || (n.id + '\n' + n.body).toLowerCase().includes(q)).sort((a, b) => a.s.localeCompare(b.s) || L.cmpId(a.id, b.id)).slice(0, 80);
      $('#cn-list').innerHTML = ns.map(n => `<div class="ta-row" data-s="${n.s}" data-id="${esc(n.id)}"><b>${n.s === 'p' ? '紙 ' : ''}${esc(n.id)}</b> <small>${esc(n.body.split('\n').find(x => x.trim()) || '').slice(0, 40)}</small></div>`).join('') || '<div class="sub" style="padding:6px">ありません</div>';
    };
    $('#cn-q').oninput = draw; $('#cn-no').onclick = close; $('#cn-q').focus(); draw();
    $('#cn-list').onclick = e => {
      const r = e.target.closest('.ta-row'); if (!r) return;
      const [x, y] = at || center(); close();
      addNode({ type: 'note', s: r.dataset.s, nid: r.dataset.id, x: Math.round(x - 150), y: Math.round(y - 90), w: 300, h: 190 });
    };
  });
}
async function addImages(files, at) {
  let [x, y] = at || center();
  for (const f of files) {
    if (!PIC.test(f.name || 'image.png')) continue;
    const [name] = await ctx.api.addFiles([{ name: f.name || 'image.png', bytes: await f.arrayBuffer() }]);
    const dim = await new Promise(ok => { const i = new Image(); i.onload = () => ok([i.naturalWidth, i.naturalHeight]); i.onerror = () => ok([320, 200]); i.src = new URL(encodeURI(name), vaultUrl()).href; });
    const k = Math.min(1, 360 / dim[0]), w = Math.round(dim[0] * k), h = Math.round(dim[1] * k);
    addNode({ type: 'image', file: name, x: Math.round(x - w / 2), y: Math.round(y - h / 2), w, h }); x += 30; y += 30;
  }
}
export const attach = files => addImages([...files]);

// ===== テキストの編集 =====
function editText(id) {
  const n = node(id), el = document.querySelector(`.cv-card[data-n="${id}"] .cv-body`); if (!n || !el || n.type !== 'text') return;
  el.innerHTML = '<textarea class="cv-edit"></textarea>';
  const ta = el.querySelector('textarea'); ta.value = n.text || ''; ta.focus();
  const done = () => {
    n.text = ta.value.trim();
    if (!n.text && !n.keep) { cv().nodes = cv().nodes.filter(x => x !== n); cv().edges = cv().edges.filter(e => e.from !== id && e.to !== id); sel = null; }
    n.keep = true; touch(); drawAll();
  };
  ta.onblur = done; ta.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); ta.blur(); } e.stopPropagation(); };
}

// ===== 操作 =====
function removeSel() {
  if (!sel) return;
  if (sel.kind === 'node') { cv().nodes = cv().nodes.filter(n => n.id !== sel.id); cv().edges = cv().edges.filter(e => e.from !== sel.id && e.to !== sel.id); }
  else cv().edges = cv().edges.filter(e => e.id !== sel.id);
  sel = null; touch(); drawAll();
}
function edgeLabelDialog(e) {
  dialog(`<h3>線のラベル</h3><input id="el-t" value="${esc(e.label || '')}" placeholder="例: 原因 / 反論"><div class="row"><button class="p" id="el-ok">決定</button><button id="el-no">やめる</button></div>`, close => {
    $('#el-t').focus(); $('#el-no').onclick = close; $('#el-t').onkeydown = ev => { if (ev.key === 'Enter') $('#el-ok').click(); };
    $('#el-ok').onclick = () => { e.label = $('#el-t').value.trim(); close(); touch(); drawEdges(); };
  });
}
function fit() {
  const ns = cv().nodes, wrap = $('#cv-wrap').getBoundingClientRect(); if (!ns.length) { cv().view = { x: 60, y: 60, z: 1 }; return applyView(); }
  const x0 = Math.min(...ns.map(n => n.x)), y0 = Math.min(...ns.map(n => n.y)), x1 = Math.max(...ns.map(n => n.x + n.w)), y1 = Math.max(...ns.map(n => n.y + n.h));
  const z = Math.min(1.5, Math.max(.2, Math.min((wrap.width - 80) / (x1 - x0), (wrap.height - 80) / (y1 - y0))));
  cv().view = { z, x: (wrap.width - (x1 - x0) * z) / 2 - x0 * z, y: (wrap.height - (y1 - y0) * z) / 2 - y0 * z }; applyView(); save();
}
function zoomAt(f, cx, cy) {
  const v = cv().view, r = $('#cv-wrap').getBoundingClientRect(), z = Math.min(3, Math.max(.15, v.z * f)), px = cx - r.left, py = cy - r.top;
  v.x = px - (px - v.x) * z / v.z; v.y = py - (py - v.y) * z / v.z; v.z = z; applyView(); save();
}
function rename(t) {
  t = t.trim(); if (!t || t === cv().title) return;
  let name = t, n = 1; while (docs[keyOf(name)] && keyOf(name) !== cur) name = `${t}-${++n}`;
  const old = cur, key = keyOf(name), d = cv(); d.title = name;
  if (key !== old) { docs[key] = d; delete docs[old]; cur = key; ctx.api.saveDoc(key, d); ctx.api.deleteDoc(old); ctx.renameCanvasTab(old, key); } else save();
  ctx.renderTabs(); ctx.renderList();
}

document.addEventListener('mousedown', e => {
  const wrap = e.target.closest('#cv-wrap'); if (!wrap || e.button !== 0 || e.target.closest('textarea')) return;
  const h = e.target.closest('.cv-h'), rs = e.target.closest('.cv-rs'), card = e.target.closest('.cv-card'), ed = e.target.closest('[data-e]');
  const [wx, wy] = toWorld(e.clientX, e.clientY);
  if (h) { e.preventDefault(); const id = h.closest('.cv-card').dataset.n; sel = { kind: 'node', id }; drag = { t: 'connect', from: id, side: h.dataset.side, to: [wx, wy] }; return; }
  if (rs) { e.preventDefault(); const n = node(rs.closest('.cv-card').dataset.n); drag = { t: 'resize', n, sx: e.clientX, sy: e.clientY, w: n.w, h: n.h }; return; }
  if (card) {
    const n = node(card.dataset.n); sel = { kind: 'node', id: n.id };
    document.querySelectorAll('.cv-card.sel').forEach(c => c.classList.remove('sel')); card.classList.add('sel'); drawEdges();
    if (!e.target.closest('a')) { e.preventDefault(); drag = { t: 'move', n, sx: e.clientX, sy: e.clientY, x: n.x, y: n.y, moved: false }; }
    return;
  }
  if (ed) { sel = { kind: 'edge', id: ed.dataset.e }; document.querySelectorAll('.cv-card.sel').forEach(c => c.classList.remove('sel')); drawEdges(); return; }
  sel = null; document.querySelectorAll('.cv-card.sel').forEach(c => c.classList.remove('sel')); drawEdges();
  e.preventDefault(); const v = cv().view; drag = { t: 'pan', sx: e.clientX, sy: e.clientY, x: v.x, y: v.y };
});
document.addEventListener('mousemove', e => {
  if (!drag) return;
  const z = cv().view.z;
  if (drag.t === 'pan') { cv().view.x = drag.x + e.clientX - drag.sx; cv().view.y = drag.y + e.clientY - drag.sy; applyView(); }
  else if (drag.t === 'move') {
    const dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z; if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    drag.n.x = Math.round(drag.x + dx); drag.n.y = Math.round(drag.y + dy);
    const el = document.querySelector(`.cv-card[data-n="${drag.n.id}"]`); if (el) { el.style.left = drag.n.x + 'px'; el.style.top = drag.n.y + 'px'; } drawEdges();
  } else if (drag.t === 'resize') {
    drag.n.w = Math.max(80, Math.round(drag.w + (e.clientX - drag.sx) / z)); drag.n.h = Math.max(50, Math.round(drag.h + (e.clientY - drag.sy) / z));
    const el = document.querySelector(`.cv-card[data-n="${drag.n.id}"]`); if (el) { el.style.width = drag.n.w + 'px'; el.style.height = drag.n.h + 'px'; } drawEdges();
  } else if (drag.t === 'connect') {
    drag.to = toWorld(e.clientX, e.clientY); const t = document.elementFromPoint(e.clientX, e.clientY), c = t && t.closest && t.closest('.cv-card');
    const tn = c && node(c.dataset.n); drag.toSide = tn && tn.id !== drag.from ? nearestSide(tn, drag.to) : null; drawEdges();
  }
});
document.addEventListener('mouseup', e => {
  if (!drag) return; const d = drag; drag = null;
  if (d.t === 'connect') {
    const t = document.elementFromPoint(e.clientX, e.clientY), c = t && t.closest && t.closest('.cv-card'), tn = c && node(c.dataset.n);
    if (tn && tn.id !== d.from && !cv().edges.some(x => x.from === d.from && x.to === tn.id)) {
      const ed = { id: uid(), from: d.from, fromSide: d.side, to: tn.id, toSide: nearestSide(tn, toWorld(e.clientX, e.clientY)), label: '', arrow: true };
      cv().edges.push(ed); sel = { kind: 'edge', id: ed.id }; touch();
    }
    drawAll();
  } else if (d.t === 'move' || d.t === 'resize' || d.t === 'pan') save();
});
document.addEventListener('dblclick', e => {
  const wrap = e.target.closest('#cv-wrap'); if (!wrap) return;
  const card = e.target.closest('.cv-card'), ed = e.target.closest('[data-e]');
  if (card) { const n = node(card.dataset.n); if (n.type === 'text') editText(n.id); return; }
  if (ed) { edgeLabelDialog(edge(ed.dataset.e)); return; }
  addText(toWorld(e.clientX, e.clientY));
});
document.addEventListener('contextmenu', e => {
  if (!e.target.closest('#cv-wrap')) return;
  const card = e.target.closest('.cv-card'), ed = e.target.closest('[data-e]');
  if (card) {
    e.preventDefault(); const n = node(card.dataset.n); sel = { kind: 'node', id: n.id }; document.querySelectorAll('.cv-card').forEach(c => c.classList.toggle('sel', c === card));
    popMenu(e, [...(n.type === 'text' ? [['書き直す', () => editText(n.id)]] : []), ...(n.type === 'note' ? [['ノートを開く', () => ctx.get(n.s, n.nid) && ctx.openNote(n.s, n.nid)]] : []),
      ['手前に出す', () => { cv().nodes = [...cv().nodes.filter(x => x !== n), n]; touch(); drawAll(); }], ['消す', removeSel, true]]);
  } else if (ed) {
    e.preventDefault(); const x = edge(ed.dataset.e); sel = { kind: 'edge', id: x.id }; drawEdges();
    popMenu(e, [['ラベルをつける', () => edgeLabelDialog(x)], [x.arrow !== false ? '矢印をなくす' : '矢印をつける', () => { x.arrow = x.arrow === false; touch(); drawEdges(); }], ['消す', removeSel, true]]);
  }
});
document.addEventListener('wheel', e => {
  if (!e.target.closest('#cv-wrap')) return; e.preventDefault();
  if (e.ctrlKey || e.metaKey) zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
  else { const v = cv().view; v.x -= e.deltaX; v.y -= e.deltaY; applyView(); save(); }
}, { passive: false });
document.addEventListener('keydown', e => {
  if (!$('#cv-wrap') || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) || $('#modal').style.display === 'flex') return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSel(); }
  if (e.key === 'Escape') { sel = null; drawAll(); }
});
document.addEventListener('click', e => {
  if (!e.target.closest('.cvbox')) return;
  const b = e.target.closest('[data-v]');
  if (b) {
    const k = b.dataset.v;
    if (k === 'text') addText(); if (k === 'note') addNoteDialog(); if (k === 'image') ctx.pick(true, fs => addImages(fs), 'image/*');
    if (k === 'zin') { const r = $('#cv-wrap').getBoundingClientRect(); zoomAt(1.2, r.left + r.width / 2, r.top + r.height / 2); }
    if (k === 'zout') { const r = $('#cv-wrap').getBoundingClientRect(); zoomAt(1 / 1.2, r.left + r.width / 2, r.top + r.height / 2); }
    if (k === 'fit') fit();
    if (k === 'del' && confirm(`キャンバス「${cv().title}」を消しますか？（ファイルは .trash に移ります）`)) { ctx.api.deleteDoc(cur); delete docs[cur]; ctx.closeKind('canvas', cur); }
    return;
  }
  const o = e.target.closest('[data-open]'); if (o) { const [s, ...id] = o.dataset.open.split(':'); if (ctx.get(s, id.join(':'))) ctx.openNote(s, id.join(':')); return; }
  if (e.target.closest('.cv-body')) mdClick(e);
});
document.addEventListener('change', e => { if (e.target.id === 'cv-title') rename(e.target.value); });
// ドロップ・貼り付けで画像カード
export function dropImages(e) { const [x, y] = toWorld(e.clientX, e.clientY); addImages([...e.dataTransfer.files], [x, y]); }
