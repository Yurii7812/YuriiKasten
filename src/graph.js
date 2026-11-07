// グラフ表示: ノート＝丸、番号の親子＝灰の線、:ID のリンク＝青い矢印、キーワード＝赤い点。
// 位置は計算して固定（毎回同じ並び）。ドラッグで動かし、ホイールで拡大縮小。丸を押すとそのノートを開く
import { esc } from './shared.js';
import L from '../lib.js';

export function layout(nodes, edges, W, H) {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const P = new Map(nodes.map(n => [n.key, [W / 2 + (rnd() - .5) * W * .6, H / 2 + (rnd() - .5) * H * .6]]));
  const keys = nodes.map(n => n.key), N = keys.length, iters = N > 400 ? 120 : N > 150 ? 300 : 700;
  const rep = 26000 * Math.max(1, Math.sqrt(N / 15));
  for (let it = 0; it < iters; it++) {
    const F = new Map(keys.map(k => [k, [0, 0]]));
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const a = P.get(keys[i]), b = P.get(keys[j]), dx = a[0] - b[0], dy = a[1] - b[1], d = Math.hypot(dx, dy) + .1;
      if (d > 600) continue;
      const f = rep / (d * d), fa = F.get(keys[i]), fb = F.get(keys[j]);
      fa[0] += dx / d * f; fa[1] += dy / d * f; fb[0] -= dx / d * f; fb[1] -= dy / d * f;
    }
    for (const e of edges) {
      const a = P.get(e.a), b = P.get(e.b), dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) + .1, f = (d - (e.t === 'kw' ? 150 : 130)) * .02;
      const fa = F.get(e.a), fb = F.get(e.b); fa[0] += dx / d * f; fa[1] += dy / d * f; fb[0] -= dx / d * f; fb[1] -= dy / d * f;
    }
    for (const k of keys) { const p = P.get(k), f = F.get(k); f[0] += (W / 2 - p[0]) * .004; f[1] += (H / 2 - p[1]) * .004; p[0] += Math.max(-8, Math.min(8, f[0])); p[1] += Math.max(-8, Math.min(8, f[1])); }
  }
  return P;
}

// notes: [{s,id,title,body,keywords,noid}]
export function build(notes, titleOf, topics, mergeTopic, topicLabel) {
  const real = notes.filter(n => !n.noid), has = new Set(real.map(n => n.s + ':' + n.id));
  const nodes = real.map(n => ({ key: n.s + ':' + n.id, s: n.s, id: n.id, label: titleOf(n) })), edges = [];
  for (const n of real) {
    const p = L.parentIn(n.id, x => has.has(n.s + ':' + x)); if (p) edges.push({ a: n.s + ':' + p, b: n.s + ':' + n.id, t: 'tree' });
    const seen = new Set();
    for (const t of L.tokens(n.body || '')) if (t.k === 'ref' && t.id !== n.id && has.has(n.s + ':' + t.id) && !seen.has(t.id)) { seen.add(t.id); edges.push({ a: n.s + ':' + n.id, b: n.s + ':' + t.id, t: 'link' }); }
  }
  // キーワード: ノートに付いたもの＋トピックIndexの行にあるもの（1つのノートだけでも描く）
  const kw = new Map(), add = (k, key) => { if (!kw.has(k)) kw.set(k, new Set()); if (key) kw.get(k).add(key); };
  for (const n of real) for (const k of n.keywords || []) add(k, n.s + ':' + n.id);
  // トピックIndex: 入口のノートにつながり、行のキーワードがぶら下がる。+ の案内は Index から Index への矢印
  const tkey = new Map();
  for (const t of topics || []) {
    const key = 'T:' + t.name; tkey.set(t.name, key); nodes.push({ key, topic: t.name, label: topicLabel ? topicLabel(t) : t.name });
    if (t.entry && has.has(t.entry.s + ':' + t.entry.id)) edges.push({ a: key, b: t.entry.s + ':' + t.entry.id, t: 'tree' });
  }
  for (const t of topics || []) {
    const key = tkey.get(t.name), { rows, stars } = mergeTopic(t);
    for (const r of rows) { if (!r.kw) continue; add(r.kw); edges.push({ a: key, b: 'K:' + r.kw, t: 'kw' }); for (const sp of ['d', 'p']) for (const id of r[sp]) add(r.kw, sp + ':' + id); }
    for (const st of stars) if (tkey.has(st)) edges.push({ a: key, b: tkey.get(st), t: 'link' });
  }
  for (const [k, v] of kw) { nodes.push({ key: 'K:' + k, kw: k, label: k }); for (const x of v) if (has.has(x)) edges.push({ a: 'K:' + k, b: x, t: 'kw' }); }
  return { nodes, edges };
}

export function html(notes, titleOf, topics, mergeTopic, topicLabel) {
  const { nodes, edges } = build(notes, titleOf, topics, mergeTopic, topicLabel);
  if (!nodes.some(n => !n.kw && !n.topic)) return '<div class="none">まだ番号のあるノートがありません</div>';
  const W = 1400, H = 900, P = layout(nodes, edges, W, H), deg = new Map(nodes.map(n => [n.key, 0]));
  for (const e of edges) { deg.set(e.a, deg.get(e.a) + 1); deg.set(e.b, deg.get(e.b) + 1); }
  const xs = [...P.values()].map(p => p[0]), ys = [...P.values()].map(p => p[1]);
  const x0 = Math.min(...xs) - 120, y0 = Math.min(...ys) - 90, w = Math.max(...xs) - Math.min(...xs) + 240, h = Math.max(...ys) - Math.min(...ys) + 200;
  const col = { tree: '#9aa3bd', link: '#3b5bdb', kw: '#e3b3ad' };
  const lines = edges.map(e => { const a = P.get(e.a), b = P.get(e.b); return `<line x1="${a[0].toFixed(0)}" y1="${a[1].toFixed(0)}" x2="${b[0].toFixed(0)}" y2="${b[1].toFixed(0)}" stroke="${col[e.t]}" stroke-width="${e.t === 'kw' ? 1.3 : 2}"${e.t === 'kw' ? ' stroke-dasharray="5 4"' : ''}${e.t === 'link' ? ' marker-end="url(#gar)"' : ''}/>`; }).join('');
  const dots = nodes.map(n => {
    const [x, y] = P.get(n.key).map(v => v.toFixed(0));
    if (n.topic) return `<g class="gt" data-topic="${esc(n.topic)}"><rect x="${+x - 15}" y="${+y - 15}" width="30" height="30" rx="8" fill="#e8edff" stroke="#3b5bdb" stroke-width="2.4"/><text x="${x}" y="${+y + 5}" text-anchor="middle" font-size="14">📑</text><text x="${x}" y="${+y + 34}" text-anchor="middle" font-size="13" font-weight="700" fill="#3b5bdb">${esc(n.label.slice(0, 18))}</text></g>`;
    if (n.kw) return `<g class="gk"><circle cx="${x}" cy="${y}" r="9" fill="#c0392b"/><text x="${x}" y="${+y + 27}" text-anchor="middle" font-size="13" font-weight="700" fill="#c0392b">${esc(n.kw)}</text></g>`;
    const r = 9 + deg.get(n.key) * 2.2, st = n.s === 'p' ? '#2f9e44' : '#3b5bdb';
    return `<g class="gn" data-s="${n.s}" data-id="${esc(n.id)}"><circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${st}" stroke-width="2.2"/><text x="${x}" y="${+y + 4}" text-anchor="middle" font-size="11" fill="#8b909c">${esc(n.id)}</text><text x="${x}" y="${+y + r + 17}" text-anchor="middle" font-size="13" font-weight="500" fill="#2b2d33">${esc(n.label.slice(0, 18))}</text></g>`;
  }).join('');
  return `<div class="graph"><div class="glegend"><span><i class="c"></i>ノート（大きいほどつながりが多い）</span><span><i class="c p"></i>紙</span><span><i class="l g"></i>番号の親子</span><span><i class="l"></i>リンク</span><span><i class="d"></i>キーワード</span><span><i class="t"></i>トピックIndex</span><span class="hint">ドラッグで動かす／ホイールで拡大・縮小</span></div>
  <svg id="gsvg" viewBox="${x0} ${y0} ${w} ${h}" data-vb="${x0} ${y0} ${w} ${h}"><defs><marker id="gar" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="#3b5bdb"/></marker></defs>${lines}${dots}</svg></div>`;
}

// ドラッグ・ホイール
export function attach(svg, onOpen) {
  if (!svg) return;
  let vb = svg.dataset.vb.split(' ').map(Number), drag = null, moved = false;
  const set = () => svg.setAttribute('viewBox', vb.join(' '));
  svg.addEventListener('wheel', e => {
    e.preventDefault(); const r = svg.getBoundingClientRect(), f = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const mx = vb[0] + (e.clientX - r.left) / r.width * vb[2], my = vb[1] + (e.clientY - r.top) / r.height * vb[3];
    vb = [mx - (mx - vb[0]) * f, my - (my - vb[1]) * f, vb[2] * f, vb[3] * f]; set();
  }, { passive: false });
  svg.addEventListener('mousedown', e => e.preventDefault());   // ダブルクリック・ドラッグで文字が選択されない
  svg.addEventListener('pointerdown', e => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, vb: [...vb] }; moved = false; });
  window.addEventListener('pointermove', e => {
    if (!drag || !svg.isConnected) return; const r = svg.getBoundingClientRect(), dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    vb = [drag.vb[0] - dx / r.width * drag.vb[2], drag.vb[1] - dy / r.height * drag.vb[3], drag.vb[2], drag.vb[3]]; set();
  });
  window.addEventListener('pointerup', () => { drag = null; });
  svg.addEventListener('click', e => { if (moved) return; const g = e.target.closest('.gn'), t = e.target.closest('.gt'); if (g) onOpen(g.dataset.s, g.dataset.id, e); else if (t) onOpen(null, null, e, t.dataset.topic); });
}
