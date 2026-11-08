// グラフビュー: Trilium Notes の「Note Map」（Link map / Tree map）を、そのまま写したもの。
//   ライブラリ force-graph（canvas）・力の設定・ノードの大きさ・ラベルを出す条件・ホバーで周りだけ濃く・矢印・ズームの部品まで Trilium と同じ。
//   Link map = リンク（:ID）の図 ／ Tree map = 番号の親子（1 → 1a → 1a1）の図。
import ForceGraph from 'force-graph';
import L from '../lib.js';

// ----- Trilium の rendering.ts の定数 -----
const TICKS_UNTIL_DAMPED = 60, LONE_NOTE_ZOOM = 4, ZOOM_ANIMATION_MS = 250, NODE_RADIUS_RATIO = 0.8, DAMPING_MAX_NOTES = 30, ANCHOR_RING_PX = 2;
const DIMMED_ALPHA = 0.15, HOVER_FADE_MS = 160, LINK_WIDTH = 0.4, HIGHLIGHT_LINK_WIDTH = 3;
const ARROW_LENGTH_PX = 10, ARROW_WIDTH_RATIO = 0.72, ARROW_SWEEP = 0.28, ARROW_ROUNDING = 0.12;
const LABEL_FONT_PX = 11, LINK_LABEL_FONT_PX = 8, LABEL_ZOOM_SHARE = 0.25, MAX_LABEL_WIDTH_EMS = 12, LABEL_SHADOW = { blur: 4, drop: 1 };
const MAX_NOTES_THRESHOLD = 1000, ZOOM_STEP = 1.25;

// ----- utils.ts -----
const toChannels = c => { const m = c.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i); return m ? m.slice(1, 4).map(x => parseInt(x, 16)) : null; };
export function mixColors(from, to, ratio) {
  const a = toChannels(from), b = toChannels(to); if (!a || !b) return to;
  return '#' + a.map((c, i) => Math.round(c + (b[i] - c) * ratio).toString(16).padStart(2, '0')).join('');
}
export function withAlpha(color, alpha) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  return color + Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
}
const rgb2hex = rgb => '#' + (rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/) || []).slice(1).map(n => parseInt(n, 10).toString(16).padStart(2, '0')).join('');
export function getHopDistances(anchor, links) {
  const nb = new Map(), endOf = e => typeof e === 'object' ? e.id : e;
  const join = (f, t) => { if (typeof f !== 'string' || typeof t !== 'string') return; nb.set(f, [...(nb.get(f) || []), t]); };
  for (const l of links) { const s = endOf(l.source), t = endOf(l.target); join(s, t); join(t, s); }
  const dist = new Map(); if (!nb.has(anchor)) return dist; dist.set(anchor, 0);
  for (let fr = [anchor], d = 1; fr.length; d++) { const nx = []; for (const k of fr) for (const m of nb.get(k) || []) if (!dist.has(m)) { dist.set(m, d); nx.push(m); } fr = nx; }
  return dist;
}

// ----- rendering.ts の関数 -----
export const getFadedAlpha = focus => DIMMED_ALPHA + (1 - DIMMED_ALPHA) * Math.min(1, 1 + focus);
export const getLabelFontSize = (px, zoom) => px * zoom ** LABEL_ZOOM_SHARE / zoom;
export const isLabelDrawn = (size, zoom) => zoom > 2 || (zoom > 1 && size > 6) || (zoom > 0.3 && size > 10);
export function truncateLabel(title, fontSize, measure) {
  const max = MAX_LABEL_WIDTH_EMS * fontSize; if (measure(title) <= max) return title;
  let label = title; while (label.length > 1 && measure(label + '…') > max) label = label.slice(0, -1);
  return label + '…';
}
export function getArrowOutline(s, t, targetRadius, length) {
  const ll = Math.hypot(t.x - s.x, t.y - s.y); if (ll < targetRadius + length) return null;
  const ax = (t.x - s.x) / ll, ay = (t.y - s.y) / ll, tipX = t.x - ax * targetRadius, tipY = t.y - ay * targetRadius, baseX = tipX - ax * length, baseY = tipY - ay * length, hw = length * ARROW_WIDTH_RATIO / 2;
  return [[tipX, tipY], [baseX - ay * hw, baseY + ax * hw], [baseX + ax * length * ARROW_SWEEP, baseY + ay * length * ARROW_SWEEP], [baseX + ay * hw, baseY - ax * hw]];
}
function traceRoundedPath(ctx, pts, radius) {
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], [sx, sy] = mid(pts[pts.length - 1], pts[0]);
  ctx.beginPath(); ctx.moveTo(sx, sy);
  for (let i = 0; i < pts.length; i++) { const c = pts[i], [tx, ty] = mid(c, pts[(i + 1) % pts.length]); ctx.arcTo(c[0], c[1], tx, ty, radius); }
  ctx.closePath();
}
function createFade(elements, getTarget) {
  const starts = new Map(); let startedAt = 0;
  const get = el => { const target = getTarget(el), from = starts.get(el) ?? target, p = Math.min(1, (performance.now() - startedAt) / HOVER_FADE_MS); return from + (target - from) * p; };
  return { get, restart() { for (const el of elements) starts.set(el, get(el)); startedAt = performance.now(); } };
}
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ----- データ（Trilium の data.ts / note_map API 相当）-----
// notes: [{s,id,keywords,body,noid,color}]  link map の辺 = :ID のリンク（紙とデジタルの間も）／ tree map の辺 = 番号の親子
export function loadNotesAndRelations(notes, titleOf, mapType) {
  const real = notes.filter(n => !n.noid), has = new Set(real.map(n => n.s + ':' + n.id));
  const nodes = real.map(n => ({ id: n.s + ':' + n.id, s: n.s, nid: n.id, name: (n.s === 'p' ? '紙 ' : '') + n.id + ' ' + titleOf(n), color: n.color || null, type: n.s })), links = [];
  const sizes = {};
  if (mapType === 'tree') {
    const cnt = {};
    for (const n of real) { const p = L.parentIn(n.id, x => has.has(n.s + ':' + x)); if (p) links.push({ id: `${n.s}:${p}-${n.s}:${n.id}`, source: n.s + ':' + p, target: n.s + ':' + n.id, name: '' }); }
    const kids = new Map(); for (const l of links) (kids.get(l.source) || kids.set(l.source, []).get(l.source)).push(l.target);
    const desc = k => (kids.get(k) || []).reduce((a, c) => a + 1 + desc(c), 0);
    for (const n of nodes) cnt[n.id] = desc(n.id);
    for (const n of nodes) { sizes[n.id] = 4; if (cnt[n.id] > 0) sizes[n.id] += 1 + Math.round(Math.log(cnt[n.id]) / Math.log(1.5)); }
  } else {
    const inc = {}, seenKey = new Set();
    for (const n of real) for (const t of L.tokens(n.body || '')) {
      const k = (t.sp || n.s) + ':' + t.id, me = n.s + ':' + n.id, key = me + '-' + k;
      if (t.k === 'ref' && k !== me && has.has(k) && !seenKey.has(key)) { seenKey.add(key); links.push({ id: key, source: me, target: k, name: '' }); inc[k] = 1 + (inc[k] || 0); }
    }
    for (const n of nodes) { sizes[n.id] = 4; if (n.id in inc) sizes[n.id] += Math.min(Math.pow(inc[n.id], 0.5), 15); }
  }
  return { nodes, links, noteIdToSizeMap: sizes };
}

export function mount(box, o) {
  const st = o.state; st.mapType = st.mapType || 'link'; st.linkDistance = st.linkDistance || 40; st.fixNodes = !!st.fixNodes;
  box.innerHTML = '<div class="note-map-widget"><div class="nm-style"><span class="nm-bg"></span><span class="nm-anchor"></span><span class="nm-anchor-icon"></span></div><div class="note-map-container"></div></div>';
  const wrap = box.querySelector('.note-map-widget'), container = box.querySelector('.note-map-container'), styleEl = box.querySelector('.nm-style');
  const data = loadNotesAndRelations(o.notes, o.titleOf, st.mapType);
  if (!data.nodes.length) { wrap.innerHTML = '<div class="none">まだ番号のあるノートがありません</div>'; return; }
  if (data.nodes.length > MAX_NOTES_THRESHOLD && !st.bypass) {
    wrap.innerHTML = `<div class="none">ノートが ${data.nodes.length} 件あります。多すぎると重くなります。<br><button class="p" id="nm-any" style="margin-top:10px">それでも表示</button></div>`;
    wrap.querySelector('#nm-any').onclick = () => { st.bypass = true; mount(box, o); }; return;
  }
  // Trilium の getCssData: canvas は CSS を知らないので、色は要素に塗って読み取る
  const cs = getComputedStyle(container), colorOf = sel => { const e = styleEl.querySelector(sel); return e ? rgb2hex(getComputedStyle(e).color) : ''; };
  const dark = document.documentElement.classList.contains('dark');
  const cssData = { fontFamily: cs.fontFamily, textColor: rgb2hex(cs.color) || '#23262d', mutedTextColor: rgb2hex(getComputedStyle(styleEl).color) || '#6a6f7d', backgroundColor: colorOf('.nm-bg') || '#ffffff', anchorColor: colorOf('.nm-anchor') || '#3b5bdb', anchorIconColor: colorOf('.nm-anchor-icon') || '#ffffff' };
  const graph = new ForceGraph(container), mapRootId = st.root && data.nodes.some(n => n.id === st.root) ? st.root : (o.rootKey && data.nodes.some(n => n.id === o.rootKey) ? o.rootKey : null);
  const rect = box.getBoundingClientRect(); if (rect.width && rect.height) graph.width(rect.width).height(rect.height);

  // ---- setupRendering ----
  let hoverNode = null, neighbours = new Set(), highlightLinks = new Set(), zoomLevel = 1, fadeTimer;
  const labelsById = new Map(), sizeOf = data.noteIdToSizeMap, hop = getHopDistances(mapRootId || '', data.links);
  let highlightColor = cssData.textColor;
  const inNeighbourhood = n => !hoverNode || n === hoverNode || neighbours.has(n);
  const nodeFocus = createFade(data.nodes, n => hoverNode && !inNeighbourhood(n) ? -1 : 0);
  const linkFocus = createFade(data.links, l => !hoverNode ? 0 : highlightLinks.has(l) ? 1 : -1);
  const colorResolver = document.createElement('canvas').getContext('2d');
  const normalizeColor = c => { if (!colorResolver) return c; colorResolver.fillStyle = '#000000'; colorResolver.fillStyle = c; return typeof colorResolver.fillStyle === 'string' ? colorResolver.fillStyle : c; };
  const getNodeColors = n => ({ fill: n.color || cssData.anchorColor, icon: n.color ? cssData.backgroundColor : cssData.anchorIconColor });
  const keepPainting = () => { graph.autoPauseRedraw(false); clearTimeout(fadeTimer); fadeTimer = setTimeout(() => graph.autoPauseRedraw(true), HOVER_FADE_MS + 100); };
  function setHovered(node) {
    nodeFocus.restart(); linkFocus.restart(); keepPainting(); hoverNode = node;
    if (!node) { neighbours = new Set(); highlightLinks = new Set(); return; }
    highlightColor = normalizeColor(getNodeColors(node).fill); neighbours = new Set(); highlightLinks = new Set();
    for (const l of data.links) { const { source: s, target: t } = l; if (typeof s !== 'object' || typeof t !== 'object') continue; if (s.id === node.id) { neighbours.add(t); highlightLinks.add(l); } else if (t.id === node.id) { neighbours.add(s); highlightLinks.add(l); } }
  }
  const getLinkColor = l => { const f = linkFocus.get(l), lit = Math.max(0, f), c = lit <= 0 ? cssData.mutedTextColor : lit >= 1 ? highlightColor : mixColors(cssData.mutedTextColor, highlightColor, lit); return withAlpha(c, getFadedAlpha(f)); };
  const castShadow = ctx => { ctx.shadowColor = dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)'; ctx.shadowBlur = LABEL_SHADOW.blur; ctx.shadowOffsetY = LABEL_SHADOW.drop; };
  function paintNode(node, color, ctx) {
    const { x, y } = node; if (x === undefined || y === undefined) return;
    const size = sizeOf[node.id], radius = size * NODE_RADIUS_RATIO;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, 2 * Math.PI, false); ctx.fill();
    if (node.id === mapRootId) { const w = ANCHOR_RING_PX / zoomLevel; ctx.strokeStyle = cssData.anchorIconColor; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(x, y, radius + w / 2, 0, 2 * Math.PI, false); ctx.stroke(); }
    if (!isLabelDrawn(size, zoomLevel)) return;
    const fs = getLabelFontSize(LABEL_FONT_PX, zoomLevel);
    ctx.save(); castShadow(ctx); ctx.fillStyle = cssData.textColor; ctx.font = `${fs}px ${cssData.fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let label = labelsById.get(node.id); if (label === undefined) { label = truncateLabel(node.name, fs, t => ctx.measureText(t).width); labelsById.set(node.id, label); }
    ctx.fillText(label, x, y + radius + fs); ctx.restore();
  }
  function paintArrow(link, s, t, ctx) {
    const length = getLabelFontSize(ARROW_LENGTH_PX, zoomLevel), out = getArrowOutline({ x: s.x ?? 0, y: s.y ?? 0 }, { x: t.x ?? 0, y: t.y ?? 0 }, sizeOf[t.id] * NODE_RADIUS_RATIO, length); if (!out) return;
    ctx.save(); traceRoundedPath(ctx, out, length * ARROW_ROUNDING); ctx.fillStyle = getLinkColor(link); ctx.fill(); ctx.restore();
  }
  function paintLink(link, ctx) {
    const { source: s, target: t } = link; if (typeof s !== 'object' || typeof t !== 'object') return;
    if (s.x !== undefined && s.y !== undefined && t.x !== undefined && t.y !== undefined) paintArrow(link, s, t, ctx);
    if (zoomLevel < 5 || !link.name) return;
    const fs = getLabelFontSize(LINK_LABEL_FONT_PX, zoomLevel); ctx.font = `${fs}px ${cssData.fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = cssData.mutedTextColor;
    if (s.x !== undefined && s.y !== undefined && t.x !== undefined && t.y !== undefined) {
      ctx.save(); ctx.translate((s.x + t.x) / 2, (s.y + t.y) / 2); let angle = Math.atan2(s.y - t.y, s.x - t.x), moveY = fs * 0.7;
      if (angle < -Math.PI / 2 || angle > Math.PI / 2) { angle += Math.PI; moveY = -moveY; }
      castShadow(ctx); ctx.rotate(angle); ctx.fillText(link.name, 0, moveY); ctx.restore();
    }
  }
  graph.d3AlphaDecay(0.01).d3VelocityDecay(0.08).maxZoom(7).warmupTicks(30)
    .nodeCanvasObject((node, ctx) => { ctx.save(); ctx.globalAlpha = getFadedAlpha(nodeFocus.get(node)); paintNode(node, getNodeColors(node).fill, ctx); ctx.restore(); })
    .onNodeHover(n => setHovered(n ?? null))
    .nodePointerAreaPaint((node, color, ctx) => { if (!node.id) return; ctx.fillStyle = color; ctx.beginPath(); if (node.x !== undefined && node.y !== undefined) ctx.arc(node.x, node.y, sizeOf[node.id], 0, 2 * Math.PI, false); ctx.fill(); })
    .nodeLabel(node => (isLabelDrawn(sizeOf[node.id], zoomLevel) && labelsById.get(node.id) === node.name) ? '' : escapeHtml(node.name))
    .onZoom(z => { zoomLevel = z.k; zoomState(z.k); });
  graph.linkWidth(l => LINK_WIDTH + (HIGHLIGHT_LINK_WIDTH - LINK_WIDTH) * Math.max(0, linkFocus.get(l))).linkColor(l => getLinkColor(l)).linkDirectionalArrowLength(0);
  graph.linkLabel(l => { const { source: s, target: t } = l; return typeof s !== 'object' || typeof t !== 'object' ? escapeHtml(l.name) : `${escapeHtml(s.name)} → ${escapeHtml(t.name)}`; })
    .linkCanvasObject((l, ctx) => paintLink(l, ctx)).linkCanvasObjectMode(() => 'after');
  const ratio = data.nodes.length / Math.max(1, data.links.length), magnified = Math.pow(ratio, 1.5), charge = -20 / magnified;
  graph.d3Force('center')?.strength(0.2); graph.d3Force('charge')?.strength(Math.min(-3, charge)); graph.d3Force('charge')?.distanceMax(1000);

  // ---- setupFraming ----
  const framedIds = mapRootId ? new Set(hop.keys()) : (() => { const s = new Set(), idOf = e => typeof e === 'object' ? e.id : e; for (const l of data.links) { s.add(idOf(l.source)); s.add(idOf(l.target)); } return s; })();
  const framesSubset = framedIds.size > 1, nodeFilter = framesSubset ? n => framedIds.has(n.id) : undefined, padding = 30, fitted = framesSubset ? framedIds.size : data.nodes.length;
  let framing = true; const release = () => { framing = false; }, lo = { capture: true, passive: true };
  container.addEventListener('wheel', release, lo); container.addEventListener('pointerdown', release, lo);
  const fit = d => { graph.zoomToFit(d, padding, nodeFilter); if (fitted <= 1) graph.zoom(LONE_NOTE_ZOOM, d); };
  let ticks = 0; graph.onEngineTick(() => { if (!container.isConnected) { teardown(); return; } if (framing) fit(0); if (++ticks === TICKS_UNTIL_DAMPED && framedIds.size < DAMPING_MAX_NOTES) graph.d3VelocityDecay(0.4); });

  // ---- 操作 ----
  graph.onNodeClick(node => { if (node.id) o.onOpen(node.s, node.nid, null); })
    .onNodeRightClick((node, e) => { if (node.id && o.onMenu) o.onMenu(node, e); })
    .onNodeDragEnd(node => { if (st.fixNodes) { node.fx = node.x; node.fy = node.y; } else { node.fx = undefined; node.fy = undefined; } });
  graph.d3Force('link')?.distance(st.linkDistance);
  graph.graphData(data);
  // ---- 画面の部品（Trilium の OverlayControlGroup）----
  const ctl = (cls, html) => { const d = document.createElement('div'); d.className = 'nm-ctl ' + cls; d.innerHTML = html; wrap.append(d); return d; };
  const mt = ctl('nm-tl', `<button data-mt="link" title="Link map" class="${st.mapType === 'link' ? 'on' : ''}">🕸</button><button data-mt="tree" title="Tree map" class="${st.mapType === 'tree' ? 'on' : ''}">🌳</button>`);
  const bl = ctl('nm-bl', `<button data-fix title="ノードを固定（ドラッグした位置に）" class="${st.fixNodes ? 'on' : ''}">🔒</button><input type="range" min="1" max="100" value="${st.linkDistance}" title="線の長さ" class="nm-slider">`);
  const br = ctl('nm-br', '<button data-zo title="縮小">－</button><button data-zi title="拡大">＋</button><button data-fit title="全体を表示">⌖</button>');
  const zoomState = k => { br.querySelector('[data-zi]').disabled = !(k < graph.maxZoom()); br.querySelector('[data-zo]').disabled = !(k > graph.minZoom()); };
  mt.onclick = e => { const b = e.target.closest('[data-mt]'); if (b && b.dataset.mt !== st.mapType) { st.mapType = b.dataset.mt; teardown(); mount(box, o); } };
  bl.querySelector('[data-fix]').onclick = e => { st.fixNodes = !st.fixNodes; e.currentTarget.classList.toggle('on', st.fixNodes); };
  bl.querySelector('input').oninput = e => { st.linkDistance = +e.target.value; graph.d3Force('link')?.distance(st.linkDistance); graph.graphData(data); };
  br.onclick = e => { if (e.target.closest('[data-zi]')) { release(); graph.zoom(graph.zoom() * ZOOM_STEP, ZOOM_ANIMATION_MS); } if (e.target.closest('[data-zo]')) { release(); graph.zoom(graph.zoom() / ZOOM_STEP, ZOOM_ANIMATION_MS); } if (e.target.closest('[data-fit]')) { release(); fit(ZOOM_ANIMATION_MS); } };
  const ro = new ResizeObserver(() => { const r = box.getBoundingClientRect(); if (r.width && r.height) graph.width(r.width).height(r.height); }); ro.observe(box);
  function teardown() { clearTimeout(fadeTimer); ro.disconnect(); container.removeEventListener('wheel', release, lo); container.removeEventListener('pointerdown', release, lo); try { graph._destructor(); } catch { } container.replaceChildren(); }
  box._gtear = teardown;
}
export const unmount = box => { if (box && box._gtear) { box._gtear(); box._gtear = null; } };
