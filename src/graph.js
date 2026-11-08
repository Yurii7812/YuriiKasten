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

// ----- 検索（Obsidian の検索窓に近い書き方）-----
//   空白 = かつ ／ OR ／ -除外 ／ "語句" ／ id:1a（番号の頭）・kw:キーワード・topic:トピックIndex名・tag:（= kw:）・path:（= id:）・line:（本文のみ）・file:（題のみ）
export function parseQuery(q) {
  const toks = []; const re = /(-?)(?:(\w+):)?(?:"([^"]*)"|(\S+))/g; let m;
  while ((m = re.exec(q || ''))) { const word = m[3] ?? m[4]; if (word === 'OR' && !m[1] && !m[2]) { toks.push({ or: true }); continue; } toks.push({ neg: !!m[1], key: (m[2] || '').toLowerCase(), word: word.toLowerCase() }); }
  const groups = [[]]; for (const t of toks) { if (t.or) groups.push([]); else groups[groups.length - 1].push(t); }
  return groups.filter(g => g.length);
}
const has1 = (txt, w) => String(txt || '').toLowerCase().includes(w);
function tokMatch(n, t) {
  const kws = n.kws || [], tops = n.tops || [];
  let r;
  switch (t.key) {
    case 'id': case 'path': r = String(n.nid || '').toLowerCase().startsWith(t.word) || (n.s === 'p' ? 'p' : 'd') + ':' + String(n.nid || '').toLowerCase() === t.word; break;
    case 'kw': case 'tag': r = kws.some(k => has1(k, t.word.replace(/^#/, ''))); break;
    case 'topic': case 'index': r = tops.some(k => has1(k, t.word)); break;
    case 'file': r = has1(n.name, t.word); break;
    case 'line': case 'content': r = has1(n.body, t.word); break;
    case 'type': r = (t.word === 'paper' || t.word === '紙') ? n.s === 'p' : (t.word === 'topic' ? n.kind === 'topic' : t.word === 'keyword' ? n.kind === 'kw' : n.s === 'd'); break;
    default: r = has1(n.name, t.word) || has1(n.body, t.word) || kws.some(k => has1(k, t.word)) || tops.some(k => has1(k, t.word));
  }
  return t.neg ? !r : r;
}
export const matches = (n, groups) => !groups.length || groups.some(g => g.every(t => tokMatch(n, t)));

// ----- データ（Trilium の data.ts / note_map API 相当 ＋ Obsidian のフィルター）-----
// notes: [{s,id,keywords,body,noid,color}]  link map の辺 = :ID のリンク（紙とデジタルの間も）／ tree map の辺 = 番号の親子
export function loadNotesAndRelations(notes, titleOf, mapType, opt = {}) {
  const real = notes.filter(n => !n.noid), has = new Set(real.map(n => n.s + ':' + n.id)), byKey = new Map(real.map(n => [n.s + ':' + n.id, n]));
  const topicsOf = new Map(); for (const t of opt.topics || []) { const add = k => { if (!topicsOf.has(k)) topicsOf.set(k, []); if (!topicsOf.get(k).includes(t.name)) topicsOf.get(k).push(t.name); }; if (t.entry) add(t.entry.s + ':' + t.entry.id); for (const r of opt.mergeTopic(t).rows) for (const sp of ['d', 'p']) for (const id of r[sp]) add(sp + ':' + L.splitAnchor(id).id); }
  let nodes = real.filter(n => opt.paper !== false || n.s !== 'p').map(n => { const k = n.s + ':' + n.id; return { id: k, s: n.s, nid: n.id, kind: 'note', name: (n.s === 'p' ? '紙 ' : '') + n.id + ' ' + titleOf(n), color: n.color || null, body: n.body || '', kws: n.keywords || [], tops: topicsOf.get(k) || [] }; });
  const keep = new Set(nodes.map(n => n.id)); let links = [];
  const addLink = (a, b) => { if (keep.has(a) && keep.has(b)) links.push({ id: a + '-' + b, source: a, target: b, name: '' }); };
  if (mapType === 'tree') { for (const n of real) { const p = L.parentIn(n.id, x => has.has(n.s + ':' + x)); if (p) addLink(n.s + ':' + p, n.s + ':' + n.id); } }
  else {
    const seen = new Set();
    for (const n of real) for (const t of L.tokens(n.body || '')) { const k = (t.sp || n.s) + ':' + t.id, me = n.s + ':' + n.id, key = me + '-' + k; if (t.k === 'ref' && k !== me && has.has(k) && !seen.has(key)) { seen.add(key); addLink(me, k); } }
  }
  // 検索（フィルター）: 当たったノートだけ
  const qg = parseQuery(opt.query); if (qg.length) { const ok = new Set(nodes.filter(n => matches(n, qg)).map(n => n.id)); nodes = nodes.filter(n => ok.has(n.id)); keep.clear(); nodes.forEach(n => keep.add(n.id)); links = links.filter(l => keep.has(l.source) && keep.has(l.target)); }
  // トピックIndex・キーワードのノード（Obsidian の「タグ」に当たる）
  const add = (id, kind, name) => { if (!keep.has(id)) { keep.add(id); nodes.push({ id, kind, name, color: null, body: '', kws: [], tops: [] }); } };
  if (opt.showTopics) for (const t of opt.topics || []) { const tid = 'T:' + t.name; const rows = opt.mergeTopic(t).rows; const ents = []; if (t.entry && keep.has(t.entry.s + ':' + t.entry.id)) ents.push(t.entry.s + ':' + t.entry.id); for (const r of rows) for (const sp of ['d', 'p']) for (const id of r[sp]) { const k = sp + ':' + L.splitAnchor(id).id; if (keep.has(k)) ents.push(k); } if (!ents.length) continue; add(tid, 'topic', t.name); for (const e of new Set(ents)) links.push({ id: tid + '-' + e, source: tid, target: e, name: '' }); }
  if (opt.showKw) { const kn = new Map(); for (const n of nodes) if (n.kind === 'note') for (const k of n.kws) (kn.get(k) || kn.set(k, []).get(k)).push(n.id); for (const [k, ids] of kn) { if (ids.length < 2) continue; add('K:' + k, 'kw', k); for (const e of ids) links.push({ id: 'K:' + k + '-' + e, source: 'K:' + k, target: e, name: '' }); } }
  if (opt.orphans === false) { const used = new Set(links.flatMap(l => [l.source, l.target])); nodes = nodes.filter(n => used.has(n.id)); }
  // 大きさ（Trilium）
  const sizes = {};
  if (mapType === 'tree') { const kids = new Map(); for (const l of links) (kids.get(l.source) || kids.set(l.source, []).get(l.source)).push(l.target); const desc = k => (kids.get(k) || []).reduce((a, c) => a + 1 + desc(c), 0); for (const n of nodes) { sizes[n.id] = 4; const c = desc(n.id); if (c > 0) sizes[n.id] += 1 + Math.round(Math.log(c) / Math.log(1.5)); } }
  else { const inc = {}; for (const l of links) inc[l.target] = 1 + (inc[l.target] || 0); for (const n of nodes) { sizes[n.id] = 4; if (n.id in inc) sizes[n.id] += Math.min(Math.pow(inc[n.id], 0.5), 15); } }
  return { nodes: nodes.filter(n => n.id in sizes), links: links.filter(l => keep.has(l.source) && keep.has(l.target)), noteIdToSizeMap: sizes };
}

const DEF = () => ({ mapType: 'link', f: { q: '', kw: false, topics: false, orphans: true, paper: true }, groups: [], d: { arrows: true, fade: .5, nodeSize: 1, linkW: 1 }, force: { center: .2, repel: null, link: null, dist: 40 }, fixNodes: false, dock: false, tab: 'set', open: { f: true, g: true, d: true, c: true }, sel: null });
const GROUP_COLORS = ['#e03131', '#f08c00', '#2f9e44', '#1c7ed6', '#7048e8', '#d6336c'];

export function mount(box, o) {
  const st = o.state; { const d = DEF(); for (const k in d) if (st[k] === undefined) st[k] = d[k]; for (const k of ['f', 'd', 'force', 'open']) st[k] = { ...d[k], ...st[k] }; }
  box.innerHTML = '<div class="note-map-widget"><div class="nm-style"><span class="nm-bg"></span><span class="nm-anchor"></span><span class="nm-anchor-icon"></span></div><div class="note-map-container"></div><aside class="nm-dock"><div class="nm-tabs"><button data-tab="set">設定</button><button data-tab="note">ノート</button></div><div class="nm-set"></div><div class="nm-note"></div></aside></div>';
  const wrap = box.querySelector('.note-map-widget'), container = box.querySelector('.note-map-container'), styleEl = box.querySelector('.nm-style'), noteEl = box.querySelector('.nm-note'), setEl = box.querySelector('.nm-set'), dockTabs = box.querySelector('.nm-tabs');
  const data = loadNotesAndRelations(o.notes, o.titleOf, st.mapType, { query: st.f.q, showKw: st.f.kw, showTopics: st.f.topics, orphans: st.f.orphans, paper: st.f.paper, topics: o.topics, mergeTopic: o.mergeTopic });
  const remount = (focusSel) => { teardown(); mount(box, o); if (focusSel) { const e = box.querySelector(focusSel); if (e) { e.focus(); try { e.setSelectionRange(e.value.length, e.value.length); } catch { } } } };
  if (data.nodes.length > MAX_NOTES_THRESHOLD && !st.bypass) { wrap.innerHTML = `<div class="none">ノートが ${data.nodes.length} 件あります。多すぎると重くなります。<br><button class="p" id="nm-any" style="margin-top:10px">それでも表示</button></div>`; wrap.querySelector('#nm-any').onclick = () => { st.bypass = true; mount(box, o); }; return; }
  const cs = getComputedStyle(container), colorOf = sel => { const e = styleEl.querySelector(sel); return e ? rgb2hex(getComputedStyle(e).color) : ''; };
  const dark = document.documentElement.classList.contains('dark');
  const cssData = { fontFamily: cs.fontFamily, textColor: rgb2hex(cs.color) || '#23262d', mutedTextColor: rgb2hex(getComputedStyle(styleEl).color) || '#6a6f7d', backgroundColor: colorOf('.nm-bg') || '#ffffff', anchorColor: colorOf('.nm-anchor') || '#3b5bdb', anchorIconColor: colorOf('.nm-anchor-icon') || '#ffffff' };
  const graph = new ForceGraph(container), mapRootId = st.root && data.nodes.some(n => n.id === st.root) ? st.root : (o.rootKey && data.nodes.some(n => n.id === o.rootKey) ? o.rootKey : null);
  const fitSize = () => { const r = container.getBoundingClientRect(); if (r.width && r.height) graph.width(r.width).height(r.height); }; fitSize();
  const groups = st.groups.map(g => ({ ...g, pq: parseQuery(g.query) }));

  // ---- 描画（Trilium の rendering.ts ＋ Obsidian の表示設定）----
  let hoverNode = null, neighbours = new Set(), highlightLinks = new Set(), zoomLevel = 1, fadeTimer;
  const labelsById = new Map(), base = data.noteIdToSizeMap, S = id => (base[id] || 4) * st.d.nodeSize, hop = getHopDistances(mapRootId || '', data.links);
  let highlightColor = cssData.textColor;
  const inNeighbourhood = n => !hoverNode || n === hoverNode || neighbours.has(n);
  const nodeFocus = createFade(data.nodes, n => hoverNode && !inNeighbourhood(n) ? -1 : 0), linkFocus = createFade(data.links, l => !hoverNode ? 0 : highlightLinks.has(l) ? 1 : -1);
  const colorResolver = document.createElement('canvas').getContext('2d');
  const normalizeColor = c => { if (!colorResolver) return c; colorResolver.fillStyle = '#000000'; colorResolver.fillStyle = c; return typeof colorResolver.fillStyle === 'string' ? colorResolver.fillStyle : c; };
  const getNodeColors = n => { const g = groups.find(x => x.pq.length && matches(n, x.pq)); const base = g ? g.color : n.kind === 'kw' ? '#c0392b' : n.color || cssData.anchorColor; return { fill: base, icon: cssData.backgroundColor }; };
  const keepPainting = () => { graph.autoPauseRedraw(false); clearTimeout(fadeTimer); fadeTimer = setTimeout(() => graph.autoPauseRedraw(true), HOVER_FADE_MS + 100); };
  function setHovered(node) {
    nodeFocus.restart(); linkFocus.restart(); keepPainting(); hoverNode = node; neighbours = new Set(); highlightLinks = new Set(); if (!node) return;
    highlightColor = normalizeColor(getNodeColors(node).fill);
    for (const l of data.links) { const { source: s, target: t } = l; if (typeof s !== 'object' || typeof t !== 'object') continue; if (s.id === node.id) { neighbours.add(t); highlightLinks.add(l); } else if (t.id === node.id) { neighbours.add(s); highlightLinks.add(l); } }
  }
  const getLinkColor = l => { const f = linkFocus.get(l), lit = Math.max(0, f), c = lit <= 0 ? cssData.mutedTextColor : lit >= 1 ? highlightColor : mixColors(cssData.mutedTextColor, highlightColor, lit); return withAlpha(c, getFadedAlpha(f)); };
  const castShadow = ctx => { ctx.shadowColor = dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)'; ctx.shadowBlur = LABEL_SHADOW.blur; ctx.shadowOffsetY = LABEL_SHADOW.drop; };
  const labelOn = (id, node) => st.d.fade >= 1 || node === hoverNode || id === st.sel || zoomLevel > 3 * (1 - st.d.fade) || (zoomLevel > .3 && S(id) > 10 && st.d.fade > .3);   // Obsidian の「文字の消える閾値」
  function paintNode(node, color, ctx) {
    const { x, y } = node; if (x === undefined || y === undefined) return;
    const size = S(node.id), radius = size * NODE_RADIUS_RATIO;
    ctx.fillStyle = color; ctx.beginPath(); if (node.kind === 'topic') ctx.rect(x - radius, y - radius, radius * 2, radius * 2); else ctx.arc(x, y, radius, 0, 2 * Math.PI, false); ctx.fill();
    if (node.id === mapRootId || node.id === st.sel) { const w = ANCHOR_RING_PX / zoomLevel; ctx.strokeStyle = node.id === st.sel ? cssData.textColor : cssData.anchorIconColor; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(x, y, radius + w / 2, 0, 2 * Math.PI, false); ctx.stroke(); }
    if (!labelOn(node.id, node)) return;
    const fs = getLabelFontSize(LABEL_FONT_PX, zoomLevel);
    ctx.save(); castShadow(ctx); ctx.fillStyle = cssData.textColor; ctx.font = `${fs}px ${cssData.fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let label = labelsById.get(node.id); if (label === undefined) { label = truncateLabel(node.name, fs, t => ctx.measureText(t).width); labelsById.set(node.id, label); }
    ctx.fillText(label, x, y + radius + fs); ctx.restore();
  }
  function paintArrow(link, s, t, ctx) {
    const length = getLabelFontSize(ARROW_LENGTH_PX, zoomLevel), out = getArrowOutline({ x: s.x ?? 0, y: s.y ?? 0 }, { x: t.x ?? 0, y: t.y ?? 0 }, S(t.id) * NODE_RADIUS_RATIO, length); if (!out) return;
    ctx.save(); traceRoundedPath(ctx, out, length * ARROW_ROUNDING); ctx.fillStyle = getLinkColor(link); ctx.fill(); ctx.restore();
  }
  graph.d3AlphaDecay(0.01).d3VelocityDecay(0.08).maxZoom(7).warmupTicks(30)
    .nodeCanvasObject((node, ctx) => { ctx.save(); ctx.globalAlpha = getFadedAlpha(nodeFocus.get(node)); paintNode(node, getNodeColors(node).fill, ctx); ctx.restore(); })
    .onNodeHover(n => setHovered(n ?? null))
    .nodePointerAreaPaint((node, color, ctx) => { if (!node.id) return; ctx.fillStyle = color; ctx.beginPath(); if (node.x !== undefined && node.y !== undefined) ctx.arc(node.x, node.y, S(node.id), 0, 2 * Math.PI, false); ctx.fill(); })
    .nodeLabel(node => labelOn(node.id, null) && labelsById.get(node.id) === node.name ? '' : escapeHtml(node.name))
    .onZoom(z => { zoomLevel = z.k; zoomState(z.k); });
  graph.linkWidth(l => (LINK_WIDTH + (HIGHLIGHT_LINK_WIDTH - LINK_WIDTH) * Math.max(0, linkFocus.get(l))) * st.d.linkW).linkColor(l => getLinkColor(l)).linkDirectionalArrowLength(0);
  graph.linkLabel(l => { const { source: s, target: t } = l; return typeof s !== 'object' || typeof t !== 'object' ? '' : `${escapeHtml(s.name)} → ${escapeHtml(t.name)}`; })
    .linkCanvasObject((l, ctx) => { const { source: s, target: t } = l; if (st.d.arrows && typeof s === 'object' && typeof t === 'object' && s.x !== undefined && t.x !== undefined) paintArrow(l, s, t, ctx); }).linkCanvasObjectMode(() => 'after');
  // ---- 力（Obsidian の Forces）----
  const ratio = data.nodes.length / Math.max(1, data.links.length), charge0 = Math.min(-3, -20 / Math.pow(ratio, 1.5));
  if (st.force.repel === null) st.force.repel = Math.round(-charge0 * 10) / 10;
  const gravity = Object.assign(alpha => { for (const n of data.nodes) { if (n.x === undefined) continue; n.vx -= n.x * st.force.center * .35 * alpha; n.vy -= n.y * st.force.center * .35 * alpha; } }, { initialize() { } });   // 中心へ引く力: 原点に向けて、遠いほど強く引く
  const applyForces = () => { graph.d3Force('gravity', gravity); graph.d3Force('center')?.strength(0); graph.d3Force('charge')?.strength(-st.force.repel); graph.d3Force('charge')?.distanceMax(1000); if (st.force.link !== null) graph.d3Force('link')?.strength(st.force.link); graph.d3Force('link')?.distance(st.force.dist); };
  applyForces();
  // ---- 枠合わせ（Trilium の setupFraming）----
  const idOf = e => typeof e === 'object' ? e.id : e, framedIds = mapRootId ? new Set(hop.keys()) : (() => { const q = new Set(); for (const l of data.links) { q.add(idOf(l.source)); q.add(idOf(l.target)); } return q; })();
  const framesSubset = framedIds.size > 1, nodeFilter = framesSubset ? n => framedIds.has(n.id) : undefined, padding = 30, fitted = framesSubset ? framedIds.size : data.nodes.length;
  let framing = true; const release = () => { framing = false; }, lo = { capture: true, passive: true };
  container.addEventListener('wheel', release, lo); container.addEventListener('pointerdown', release, lo);
  const fit = d => { graph.zoomToFit(d, padding, nodeFilter); if (fitted <= 1) graph.zoom(LONE_NOTE_ZOOM, d); };
  let ticks = 0; graph.onEngineTick(() => { if (!container.isConnected) { teardown(); return; } if (framing) fit(0); if (++ticks === TICKS_UNTIL_DAMPED && framedIds.size < DAMPING_MAX_NOTES) graph.d3VelocityDecay(0.4); });
  // ---- 操作: 1 回押す = 横にノート／ 2 回押す = ノートを開く ----
  let lastClick = { id: null, t: 0 };
  graph.onNodeClick(node => { if (!node.id) return; const now = Date.now(); if (lastClick.id === node.id && now - lastClick.t < 400 && node.kind === 'note') { o.onOpen(node.s, node.nid, null); return; } lastClick = { id: node.id, t: now }; st.sel = node.id; showNote(); keepPainting(); })
    .onNodeRightClick((node, e) => { if (node.id && node.kind === 'note' && o.onMenu) o.onMenu(node, e); })
    .onNodeDragEnd(node => { if (st.fixNodes) { node.fx = node.x; node.fy = node.y; } else { node.fx = undefined; node.fy = undefined; } })
    .onBackgroundClick(() => { st.sel = null; showNote(); keepPainting(); });
  graph.graphData(data);
  // ---- 右の枠（設定・ノート）: 図に重ねず、図を縮めて横に並べる ----
  function setDock() { wrap.classList.toggle('nm-dock-open', !!st.dock); wrap.classList.toggle('nm-tab-note', st.tab === 'note'); dockTabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === st.tab)); const g = box.querySelector('[data-panel]'); if (g) g.classList.toggle('on', !!st.dock); setTimeout(fitSize, 30); }
  dockTabs.onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { st.tab = b.dataset.tab; setDock(); } };
  // ---- 横のノート ----
  function showNote() {
    const n = st.sel && data.nodes.find(x => x.id === st.sel);
    if (n) { st.dock = true; st.tab = 'note'; }
    setDock();
    if (!n) { noteEl.innerHTML = '<div class="sub" style="padding:6px">ノードを押すと、ここに内容が出ます。2回押すと、ノートを開きます。</div>'; return; }
    const nb = id => data.links.filter(l => idOf(l.source) === id || idOf(l.target) === id).map(l => idOf(l.source) === id ? idOf(l.target) : idOf(l.source)), by = new Map(data.nodes.map(x => [x.id, x]));
    const outs = data.links.filter(l => idOf(l.source) === n.id).map(l => idOf(l.target)), ins = data.links.filter(l => idOf(l.target) === n.id).map(l => idOf(l.source));
    const pill = id => `<span class="nm-pill" data-id="${esc(id)}">${esc((by.get(id) || {}).name || id)}</span>`;
    if (n.kind !== 'note') { noteEl.innerHTML = `<h3>${n.kind === 'topic' ? '📑 ' : '# '}${esc(n.name)}</h3><div class="sub">${n.kind === 'topic' ? 'トピックIndex' : 'キーワード'}</div><div class="nm-rel">つながっているノート</div>${[...new Set(nb(n.id))].map(pill).join('')}${n.kind === 'topic' ? '<div class="nm-btn"><button data-open-topic class="p">開く</button></div>' : ''}`; noteEl.querySelector('[data-open-topic]')?.addEventListener('click', () => o.onOpen(null, null, null, n.name)); }
    else { const note = o.get(n.s, n.nid), title = (note && note.title) || n.name.replace(/^紙 /, '').replace(/^\S+\s/, ''); noteEl.innerHTML = `<div class="nm-ntitle"><span class="nm-nid">${n.s === 'p' ? '紙 ' : ''}${esc(n.nid)}</span><b>${esc(title)}</b><button data-open class="nm-open" title="ノートを開く">↗</button></div><div class="nm-body md">${note ? o.renderMd(note.body || '') : ''}</div>${n.kws.length ? `<div class="nm-kws">${n.kws.map(esc).join(' ')}</div>` : ''}${outs.length || ins.length ? `<div class="nm-links">${outs.length ? `<div class="nm-rel">リンク先</div>${outs.map(pill).join('')}` : ''}${ins.length ? `<div class="nm-rel">被リンク</div>${ins.map(pill).join('')}` : ''}</div>` : ''}`; noteEl.querySelector('[data-open]')?.addEventListener('click', () => o.onOpen(n.s, n.nid, null)); }
    noteEl.querySelectorAll('.nm-pill').forEach(p => p.onclick = () => { st.sel = p.dataset.id; showNote(); keepPainting(); });
  }
  const esc = x => escapeHtml(x);
  // ---- 画面の部品 ----
  const ctl = (cls, html) => { const d = document.createElement('div'); d.className = 'nm-ctl ' + cls; d.innerHTML = html; wrap.append(d); return d; };
  const mt = ctl('nm-tl', `<button data-mt="link" title="Link map" class="${st.mapType === 'link' ? 'on' : ''}">🕸</button><button data-mt="tree" title="Tree map" class="${st.mapType === 'tree' ? 'on' : ''}">🌳</button><button data-panel title="設定・ノートの枠を出す／しまう">⚙</button>`);
  const bl = ctl('nm-bl', `<button data-fix title="ノードを固定（ドラッグした位置に）" class="${st.fixNodes ? 'on' : ''}">🔒</button><button data-anim title="アニメーション（配置をやり直す）">▶</button>`);
  const br = ctl('nm-br', '<button data-zo title="縮小">－</button><button data-zi title="拡大">＋</button><button data-fit title="全体を表示">⌖</button>');
  const zoomState = k => { br.querySelector('[data-zi]').disabled = !(k < graph.maxZoom()); br.querySelector('[data-zo]').disabled = !(k > graph.minZoom()); };
  mt.onclick = e => { const b = e.target.closest('[data-mt]'); if (b && b.dataset.mt !== st.mapType) { st.mapType = b.dataset.mt; remount(); } if (e.target.closest('[data-panel]')) { st.dock = !st.dock; if (st.dock && !st.sel) st.tab = 'set'; setDock(); } };
  bl.onclick = e => { if (e.target.closest('[data-fix]')) { st.fixNodes = !st.fixNodes; e.target.closest('[data-fix]').classList.toggle('on', st.fixNodes); } if (e.target.closest('[data-anim]')) { framing = true; data.nodes.forEach(n => { n.fx = n.fy = undefined; }); graph.d3ReheatSimulation(); } };
  br.onclick = e => { if (e.target.closest('[data-zi]')) { release(); graph.zoom(graph.zoom() * ZOOM_STEP, ZOOM_ANIMATION_MS); } if (e.target.closest('[data-zo]')) { release(); graph.zoom(graph.zoom() / ZOOM_STEP, ZOOM_ANIMATION_MS); } if (e.target.closest('[data-fit]')) { release(); fit(ZOOM_ANIMATION_MS); } };
  // 設定の枠（Obsidian: Filters / Groups / Display / Forces）
  const slider = (key, label, min, max, step, val) => `<div class="nm-row"><span>${label}</span><input type="range" data-s="${key}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
  const tog = (key, label, on) => `<div class="nm-row"><span>${label}</span><label class="nm-sw"><input type="checkbox" data-t="${key}" ${on ? 'checked' : ''}><i></i></label></div>`;
  const sec = (k, title, body) => `<details data-sec="${k}" ${st.open[k] ? 'open' : ''}><summary>${title}</summary>${body}</details>`;
  const panel = document.createElement('div'); panel.className = 'nm-panel';
  panel.innerHTML = sec('f', 'フィルター', `<input class="nm-q" data-q placeholder="ノートを検索（例: id:1a  kw:GUI  -下書き  topic:PKM）" value="${esc(st.f.q)}">${tog('f.kw', 'キーワード', st.f.kw)}${tog('f.topics', 'トピックIndex', st.f.topics)}${tog('f.paper', '紙のノート', st.f.paper)}${tog('f.orphans', 'つながりの無いノート', st.f.orphans)}`)
    + sec('g', 'グループ（検索で色分け）', `<div data-groups>${st.groups.map((g, i) => `<div class="nm-g"><input type="color" data-gc="${i}" value="${g.color}"><input data-gq="${i}" value="${esc(g.query)}" placeholder="検索（例: kw:GUI）"><button data-gx="${i}" title="消す">×</button></div>`).join('')}</div><button class="nm-add" data-gadd>新しいグループ</button>`)
    + sec('d', '表示', `${tog('d.arrows', '矢印', st.d.arrows)}${slider('d.fade', '文字の消える閾値', 0, 1, .05, st.d.fade)}${slider('d.nodeSize', 'ノードの大きさ', .3, 3, .1, st.d.nodeSize)}${slider('d.linkW', '線の太さ', .3, 4, .1, st.d.linkW)}`)
    + sec('c', '力', `${slider('force.center', '中心へ引く力', 0, 1, .01, st.force.center)}${slider('force.repel', '反発する力', 0, 60, .5, st.force.repel)}${slider('force.link', '線で引く力', 0, 1, .01, st.force.link ?? .5)}${slider('force.dist', '線の長さ', 1, 200, 1, st.force.dist)}`);
  setEl.append(panel);
  const setPath = (path, v) => { const [a, b] = path.split('.'); st[a][b] = v; };
  panel.addEventListener('toggle', e => { const d = e.target.closest('details'); if (d) st.open[d.dataset.sec] = d.open; }, true);
  panel.addEventListener('input', e => {
    const t = e.target; clearTimeout(panel._t);
    if (t.dataset.q !== undefined) { st.f.q = t.value; panel._t = setTimeout(() => remount('[data-q]'), 350); return; }
    if (t.dataset.gc !== undefined) { st.groups[+t.dataset.gc].color = t.value; groups[+t.dataset.gc].color = t.value; keepPainting(); return; }
    if (t.dataset.gq !== undefined) { st.groups[+t.dataset.gq].query = t.value; groups[+t.dataset.gq] = { ...st.groups[+t.dataset.gq], pq: parseQuery(t.value) }; keepPainting(); return; }
    if (t.dataset.s) { setPath(t.dataset.s, +t.value); if (t.dataset.s.startsWith('force.')) { applyForces(); graph.d3ReheatSimulation(); framing = false; clearTimeout(panel._f); panel._f = setTimeout(() => fit(500), 700); } keepPainting(); labelsById.clear(); }
  });
  panel.addEventListener('change', e => { const t = e.target; if (t.dataset.t) { setPath(t.dataset.t, t.checked); if (t.dataset.t.startsWith('f.')) remount(); else keepPainting(); } });
  panel.addEventListener('click', e => {
    if (e.target.closest('[data-gadd]')) { st.groups.push({ query: '', color: GROUP_COLORS[st.groups.length % GROUP_COLORS.length] }); remount(); return; }
    const x = e.target.closest('[data-gx]'); if (x) { st.groups.splice(+x.dataset.gx, 1); remount(); }
  });
  const ro = new ResizeObserver(fitSize); ro.observe(wrap);
  showNote(); setDock(); applyForces();
  function teardown() { clearTimeout(fadeTimer); clearTimeout(panel._t); ro.disconnect(); container.removeEventListener('wheel', release, lo); container.removeEventListener('pointerdown', release, lo); try { graph._destructor(); } catch { } container.replaceChildren(); }
  box._gtear = teardown; box._graph = graph;
}
export const unmount = box => { if (box && box._gtear) { box._gtear(); box._gtear = null; } };
