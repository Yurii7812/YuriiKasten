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

// ===== 配置（見やすさのため、4 通り）=====
//   tree: 番号の枝を左→右の木に（兄弟は縦に並ぶ）／ radial: 同じ木を、放射状に／ cluster: トピックIndex ごとの塊／ force: 自由（力学）
//   木に入らないもの（キーワード・チャットメモのトピック・つながりの無いノート）は、右の列・下の列に整列
export function layoutMode(nodes, edges, mode, grpOf) {
  if (mode === 'force') return layout(nodes, edges, 1400, 900);
  if (mode === 'cluster') return layoutCluster(nodes, edges, grpOf || (() => ''));
  const keys = new Set(nodes.map(n => n.key)), kids = new Map(), hasPar = new Set();
  for (const e of edges) if (e.t === 'tree' && keys.has(e.a) && keys.has(e.b) && !hasPar.has(e.b) && e.a !== e.b) { if (!kids.has(e.a)) kids.set(e.a, []); kids.get(e.a).push(e.b); hasPar.add(e.b); }
  const inTree = n => kids.has(n.key) || hasPar.has(n.key), sortKey = k => k.replace(/^[A-Z]:/, '');
  const roots = nodes.filter(n => inTree(n) && !hasPar.has(n.key)).sort((a, b) => (a.topic ? 0 : 1) - (b.topic ? 0 : 1) || L.cmpId(sortKey(a.key).split(':').pop(), sortKey(b.key).split(':').pop()));
  const pos = new Map(), seen = new Set(); let leaf = 0, maxDepth = 0;
  const walk = (k, d) => {
    seen.add(k); maxDepth = Math.max(maxDepth, d);
    const cs = (kids.get(k) || []).filter(c => !seen.has(c)).sort((a, b) => L.cmpId(a.split(':').pop(), b.split(':').pop()));
    if (!cs.length) { pos.set(k, [d, leaf++]); return; }
    for (const c of cs) walk(c, d + 1);
    const ys = cs.map(c => pos.get(c)[1]); pos.set(k, [d, (Math.min(...ys) + Math.max(...ys)) / 2]);
  };
  roots.forEach(r => { walk(r.key, 0); leaf += .6; });
  const out = new Map(), DX = 210, DY = 62, R0 = 120;
  const total = Math.max(1, leaf);
  for (const [k, [d, y]] of pos) out.set(k, mode === 'radial' ? (() => { const a = (y / total) * Math.PI * 2 - Math.PI / 2, r = R0 + d * 150; return [Math.cos(a) * r, Math.sin(a) * r]; })() : [d * DX, y * DY]);
  // 木に入らないもの
  const rest = nodes.filter(n => !out.has(n.key)), nbr = new Map(); for (const e of edges) { (nbr.get(e.a) || nbr.set(e.a, []).get(e.a)).push(e.b); (nbr.get(e.b) || nbr.set(e.b, []).get(e.b)).push(e.a); }
  const ys = k => { const v = (nbr.get(k) || []).map(m => pos.get(m)).filter(Boolean); return v.length ? v.reduce((a, p) => a + p[1], 0) / v.length : 0; };
  const side = rest.filter(n => (nbr.get(n.key) || []).some(m => out.has(m))).sort((a, b) => ys(a.key) - ys(b.key));
  const free = rest.filter(n => !side.includes(n));
  if (mode === 'radial') {
    const R = R0 + (maxDepth + 1.4) * 150; side.forEach((n, i) => { const a = (i / Math.max(1, side.length)) * Math.PI * 2 - Math.PI / 2; out.set(n.key, [Math.cos(a) * R, Math.sin(a) * R]); });
    free.forEach((n, i) => out.set(n.key, [(i % 8) * 120 - 420, R + 140 + Math.floor(i / 8) * 70]));
  } else {
    const X = (maxDepth + 1.2) * DX; let last = -1e9; side.forEach(n => { const y = Math.max(ys(n.key) * DY, last + 44); last = y; out.set(n.key, [X, y]); });
    free.forEach((n, i) => out.set(n.key, [(i % 6) * 190, (total + 1.5) * DY + Math.floor(i / 6) * 56]));
  }
  return out;
}
function layoutCluster(nodes, edges, grpOf) {
  const g = new Map(); for (const n of nodes) { const k = grpOf(n) || '~'; (g.get(k) || g.set(k, []).get(k)).push(n); }
  const groups = [...g.entries()].sort((a, b) => b[1].length - a[1].length), out = new Map(), cols = Math.max(1, Math.ceil(Math.sqrt(groups.length)));
  const cell = groups.map(([, ns]) => 170 + Math.sqrt(ns.length) * 95); let x = 0, y = 0, rowH = 0;
  groups.forEach(([, ns], i) => {
    const size = cell[i], keys = new Set(ns.map(n => n.key)), es = edges.filter(e => keys.has(e.a) && keys.has(e.b));
    const P = ns.length > 1 ? layout(ns, es, size, size) : new Map([[ns[0].key, [size / 2, size / 2]]]);
    const ps = [...P.values()], mx = Math.min(...ps.map(p => p[0])), my = Math.min(...ps.map(p => p[1])), wx = Math.max(...ps.map(p => p[0])) - mx || 1, wy = Math.max(...ps.map(p => p[1])) - my || 1, sc = Math.min(1.2, (size - 40) / Math.max(wx, wy));
    for (const n of ns) { const p = P.get(n.key); out.set(n.key, [x + 20 + (p[0] - mx) * sc, y + 20 + (p[1] - my) * sc]); }
    rowH = Math.max(rowH, size + 40); x += size + 40; if ((i + 1) % cols === 0) { x = 0; y += rowH; rowH = 0; }
  });
  return out;
}

// notes: [{s,id,title,body,keywords,noid}]
export function build(notes, titleOf, topics, mergeTopic, topicLabel) {
  const real = notes.filter(n => !n.noid), has = new Set(real.map(n => n.s + ':' + n.id));
  const nodes = real.map(n => ({ key: n.s + ':' + n.id, s: n.s, id: n.id, label: titleOf(n) })), edges = [];
  for (const n of real) {
    const p = L.parentIn(n.id, x => has.has(n.s + ':' + x)); if (p) edges.push({ a: n.s + ':' + p, b: n.s + ':' + n.id, t: 'tree' });
    const seen = new Set();
    for (const t of L.tokens(n.body || '')) { const k = (t.sp || n.s) + ':' + t.id; if (t.k === 'ref' && k !== n.s + ':' + n.id && has.has(k) && !seen.has(k)) { seen.add(k); edges.push({ a: n.s + ':' + n.id, b: k, t: 'link' }); } }   // 紙とデジタルの間のリンクも
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
    const key = tkey.get(t.name), { rows, stars, refs, chats } = mergeTopic(t);
    for (const c of chats || []) { const ck = 'C:' + c; if (!nodes.some(n => n.key === ck)) nodes.push({ key: ck, chat: c, label: c }); edges.push({ a: key, b: ck, t: 'chat' }); }   // @名前: チャットメモのトピック
    for (const r of refs || []) if (has.has(r.s + ':' + r.id)) edges.push({ a: key, b: r.s + ':' + r.id, t: 'link' });
    for (const r of rows) { if (!r.kw) continue; add(r.kw); edges.push({ a: key, b: 'K:' + r.kw, t: 'kw' }); for (const sp of ['d', 'p']) for (const id of r[sp]) add(r.kw, sp + ':' + L.splitAnchor(id).id); }
    for (const st of stars) if (tkey.has(st)) edges.push({ a: key, b: tkey.get(st), t: 'link' });
  }
  for (const [k, v] of kw) { nodes.push({ key: 'K:' + k, kw: k, label: k }); for (const x of v) if (has.has(x)) edges.push({ a: 'K:' + k, b: x, t: 'kw' }); }
  return { nodes, edges };
}

// ===== 画面（ノート・トピックIndex・キーワード・チャットメモのトピックの、つながりの図）=====
// 絞り込み（線の種類・ローカル）・ハイライト（検索・ホバー）・横にノート表示。位置は計算して固定。
const PALETTE = ['#3b5bdb', '#e67700', '#2f9e44', '#a61e4d', '#0b7285', '#7048e8', '#c92a2a', '#5c940d'];
export function mount(box, o) {
  const { nodes, edges } = build(o.notes, o.titleOf, o.topics, o.mergeTopic, o.topicLabel), st = o.state;
  Object.assign(st, { layout: 'tree', scope: 'all', sel: null, depth: 1, q: '', labels: true, size: true, hov: true, color: 'topic', on: { tree: true, link: true, kw: false, chat: true }, ...st });
  if (!nodes.some(n => !n.kw && !n.topic && !n.chat)) { box.innerHTML = '<div class="none">まだ番号のあるノートがありません</div>'; return; }
  const by = new Map(nodes.map(n => [n.key, n])), adj = new Map(nodes.map(n => [n.key, []]));
  for (const e of edges) { adj.get(e.a).push([e.b, e.t]); adj.get(e.b).push([e.a, e.t]); }
  const grp = new Map(); (o.topics || []).forEach((t, i) => { const c = PALETTE[i % PALETTE.length]; for (const r of o.mergeTopic(t).rows) for (const sp of ['d', 'p']) for (const id of r[sp]) { const k = sp + ':' + L.splitAnchor(id).id; if (!grp.has(k)) grp.set(k, c); } if (t.entry && !grp.has(t.entry.s + ':' + t.entry.id)) grp.set(t.entry.s + ':' + t.entry.id, c); });
  let P = null, shown = null, hover = null, vb = null;
  const KIND = { tree: ['番号の親子', '#9aa3bd'], link: ['リンク', '#3b5bdb'], kw: ['キーワード', '#e3b3ad'], chat: ['チャットメモのトピック', '#868e96'] };
  const visible = () => {   // いま描くノード（絞り込み）と線
    const es = edges.filter(e => st.on[e.t]);
    let set = new Set(nodes.filter(n => (st.on.chat || !n.chat) && (st.on.kw || !n.kw)).map(n => n.key));
    if (st.scope === 'local' && st.sel && by.has(st.sel)) {
      const reach = new Set([st.sel]); let fr = [st.sel];
      for (let d = 0; d < st.depth; d++) { const nx = []; for (const k of fr) for (const [m, t] of adj.get(k)) if (st.on[t] && !reach.has(m)) { reach.add(m); nx.push(m); } fr = nx; }
      set = new Set([...set].filter(k => reach.has(k)));
    }
    return { es: es.filter(e => set.has(e.a) && set.has(e.b)), set };
  };
  const groupName = n => { for (const t of o.topics || []) { if (n.topic === t.name) return t.name; if (n.s && (t.entry && n.key === t.entry.s + ':' + t.entry.id || o.mergeTopic(t).rows.some(r => r[n.s].some(x => n.s + ':' + L.splitAnchor(x).id === n.key)))) return t.name; } return n.s ? '#' + L.root(n.id) : ''; };   // トピックIndex に入っていないノートは、番号の頭（1, 2, 3…）ごとの塊
  const gmap = new Map(nodes.map(n => [n.key, groupName(n)]));
  const layoutFor = v => { const ns = nodes.filter(n => v.set.has(n.key)); return layoutMode(ns, v.es, st.scope === 'local' && st.layout !== 'cluster' ? 'radial' : st.layout, n => n.kw ? (gmap.get((adj.get(n.key).find(([m]) => gmap.get(m)) || [])[0]) || '') : n.chat ? (gmap.get((adj.get(n.key).find(([m]) => gmap.get(m)) || [])[0]) || '') : gmap.get(n.key)); };
  const colorOf = n => st.color === 'none' ? '#868e96' : st.color === 'paper' ? (n.s === 'p' ? '#2f9e44' : '#3b5bdb') : grp.get(n.key) || '#868e96';
  const toolbar = () => `<div class="gtools"><div class="seg"><button data-gs="all" class="${st.scope === 'all' ? 'on' : ''}">全体</button><button data-gs="local" class="${st.scope === 'local' ? 'on' : ''}" title="選んだノートの周りだけ">ローカル</button></div>
    ${st.scope === 'local' ? `<label>深さ <input type="range" id="g-depth" min="1" max="4" value="${st.depth}"> <b>${st.depth}</b></label>` : ''}
    <input type="search" id="g-q" placeholder="ハイライト（ID・題・本文）" value="${esc(st.q)}">
    ${Object.entries(KIND).map(([k, [l, c]]) => `<span class="gchip${st.on[k] ? '' : ' off'}" data-gk="${k}"><i style="background:${c}"></i>${l}</span>`).join('')}
    <select id="g-lay"><option value="tree"${st.layout === 'tree' ? ' selected' : ''}>配置: 木（左→右）</option><option value="radial"${st.layout === 'radial' ? ' selected' : ''}>配置: 放射</option><option value="cluster"${st.layout === 'cluster' ? ' selected' : ''}>配置: トピック別の塊</option><option value="force"${st.layout === 'force' ? ' selected' : ''}>配置: 自由（力学）</option></select>
    <span class="grow"></span>
    <label><input type="checkbox" data-gt="labels" ${st.labels ? 'checked' : ''}>ラベル</label><label><input type="checkbox" data-gt="size" ${st.size ? 'checked' : ''}>大きさ</label><label><input type="checkbox" data-gt="hov" ${st.hov ? 'checked' : ''}>ホバーで強調</label>
    <select id="g-col"><option value="topic"${st.color === 'topic' ? ' selected' : ''}>色: トピックIndex</option><option value="paper"${st.color === 'paper' ? ' selected' : ''}>色: 紙/デジタル</option><option value="none"${st.color === 'none' ? ' selected' : ''}>色: なし</option></select></div>`;
  const side = () => {
    const n = st.sel && by.get(st.sel); if (!n) return '<div class="none" style="padding:16px">ノードを押すと、ここに内容が出ます。ダブルクリックで、そのノートの周りだけに</div>';
    const rel = (h, l) => l.length ? `<div class="grel">${h}</div>${l.map(([k]) => `<span class="gpill" data-gk2="${esc(k)}">${esc(by.get(k).label.slice(0, 22))}</span>`).join('')}` : '';
    const nb = t => adj.get(n.key).filter(([, x]) => x === t);
    if (n.chat) return `<h3>💬 ${esc(n.chat)}</h3><div class="sub">チャットメモのトピック</div><div class="gb"><button data-gact="chat" class="p">チャットメモで開く</button></div>${rel('索引に書いている', nb('chat'))}`;
    if (n.topic) return `<h3>📑 ${esc(n.label)}</h3><div class="sub">トピックIndex</div><div class="gb"><button data-gact="open" class="p">開く</button><button data-gact="local">ローカル</button></div>${rel('入口・案内', nb('tree').concat(nb('link')))}${rel('キーワード', nb('kw'))}${rel('チャットメモ', nb('chat'))}`;
    if (n.kw) return `<h3>${esc(n.kw)}</h3><div class="sub">キーワード</div><div class="gb"><button data-gact="local">ローカル</button></div>${rel('ノート・トピックIndex', adj.get(n.key))}`;
    const note = o.get(n.s, n.id);
    return `<h3>${esc(n.id)} ${esc(n.label)}</h3><div class="sub">${n.s === 'p' ? '紙' : 'デジタル'}</div><div class="gb"><button data-gact="open" class="p">ノートを開く</button><button data-gact="local">ローカル</button></div><div class="gbody md">${note ? o.renderMd(note.body || '') : ''}</div>${rel('親・子', nb('tree'))}${rel('リンク', nb('link'))}${rel('キーワード', nb('kw'))}`;
  };
  const draw = (keepView) => {
    const v = visible(); shown = v; P = layoutFor(v);
    const deg = new Map(); for (const e of v.es) { deg.set(e.a, (deg.get(e.a) || 0) + 1); deg.set(e.b, (deg.get(e.b) || 0) + 1); }
    const ks = [...v.set], xs = ks.map(k => P.get(k)[0]), ys = ks.map(k => P.get(k)[1]);
    const x0 = Math.min(...xs) - 120, y0 = Math.min(...ys) - 90, w = Math.max(...xs) - Math.min(...xs) + 240, h = Math.max(...ys) - Math.min(...ys) + 200;
    if (!keepView || !vb) vb = [x0, y0, w, h];
    const curve = st.layout === 'tree' && !(st.scope === 'local');
    const lines = v.es.map((e, i) => { const a = P.get(e.a), b = P.get(e.b), dx = (b[0] - a[0]) / 2, d = curve ? `M${a[0].toFixed(0)} ${a[1].toFixed(0)}C${(a[0] + dx).toFixed(0)} ${a[1].toFixed(0)} ${(b[0] - dx).toFixed(0)} ${b[1].toFixed(0)} ${b[0].toFixed(0)} ${b[1].toFixed(0)}` : `M${a[0].toFixed(0)} ${a[1].toFixed(0)}L${b[0].toFixed(0)} ${b[1].toFixed(0)}`;
      return `<path class="ge" data-i="${i}" d="${d}" fill="none" stroke="${KIND[e.t][1]}" stroke-width="${e.t === 'kw' || e.t === 'chat' ? 1.3 : e.t === 'link' ? 1.8 : 1.6}"${e.t === 'kw' || e.t === 'chat' ? ' stroke-dasharray="5 4"' : ''}${e.t === 'link' ? ' marker-end="url(#gar)"' : ''}/>`; }).join('');
    const dots = nodes.filter(n => v.set.has(n.key)).map(n => {
      const [x, y] = P.get(n.key).map(q => q.toFixed(0)), lab = st.labels ? `<text class="gl" x="${x}" y="${+y + 30}" text-anchor="middle" font-size="12">${esc(n.label.slice(0, 16))}</text>` : '';
      if (n.chat) return `<g class="gnode" data-k="${esc(n.key)}"><rect x="${+x - 11}" y="${+y - 11}" width="22" height="22" rx="4" transform="rotate(45 ${x} ${y})" fill="#f1f3f5" stroke="#868e96" stroke-width="2.2"/><text x="${x}" y="${+y + 5}" text-anchor="middle" font-size="12">💬</text>${lab}</g>`;
      if (n.topic) return `<g class="gnode" data-k="${esc(n.key)}"><rect x="${+x - 15}" y="${+y - 15}" width="30" height="30" rx="8" fill="#e8edff" stroke="#3b5bdb" stroke-width="2.4"/><text x="${x}" y="${+y + 5}" text-anchor="middle" font-size="14">📑</text>${lab}</g>`;
      if (n.kw) return `<g class="gnode" data-k="${esc(n.key)}"><circle cx="${x}" cy="${y}" r="8" fill="#c0392b"/>${lab.replace('+30', '+26')}</g>`;
      const r = st.size ? 8 + Math.sqrt(deg.get(n.key) || 0) * 4 : 11;
      return `<g class="gnode" data-k="${esc(n.key)}"><circle cx="${x}" cy="${y}" r="${r}" fill="var(--bg,#fff)" stroke="${colorOf(n)}" stroke-width="2.6"/><text x="${x}" y="${+y + 4}" text-anchor="middle" font-size="11" fill="#8b909c">${esc(n.id)}</text>${st.labels ? `<text class="gl" x="${x}" y="${+y + r + 15}" text-anchor="middle" font-size="12">${esc(n.label.slice(0, 16))}</text>` : ''}</g>`;
    }).join('');
    box.innerHTML = `<div class="graph">${toolbar()}<div class="gmain"><svg id="gsvg" viewBox="${vb.join(' ')}"><defs><marker id="gar" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="#3b5bdb"/></marker></defs>${lines}${dots}</svg><aside class="gside">${side()}</aside></div></div>`;
    paint(); wire();
  };
  const hit = n => { const q = st.q.toLowerCase(); if (!q) return false; const note = n.s ? o.get(n.s, n.id) : null; return (n.label + ' ' + (n.id || '') + ' ' + (note ? note.body : '')).toLowerCase().includes(q); };
  const paint = () => {   // 描き直さずに、強調だけ変える
    const svg = box.querySelector('#gsvg'); if (!svg) return;
    const focus = st.hov && hover ? hover : null, nb = new Set(); if (focus) { nb.add(focus); for (const [m] of adj.get(focus)) nb.add(m); }
    const any = st.q && nodes.some(n => shown.set.has(n.key) && hit(n));
    svg.querySelectorAll('.gnode').forEach(g => { const n = by.get(g.dataset.k), dim = (focus && !nb.has(n.key)) || (any && !hit(n)); g.style.opacity = dim ? .13 : 1; g.classList.toggle('gsel', n.key === st.sel); g.classList.toggle('ghit', !!(st.q && hit(n))); });
    svg.querySelectorAll('.ge').forEach(l => { const e = shown.es[+l.dataset.i], lit = focus && (e.a === focus || e.b === focus); l.style.opacity = focus ? (lit ? 1 : .06) : any ? .2 : .85; });
  };
  const setSide = () => { const a = box.querySelector('.gside'); if (a) a.innerHTML = side(); };
  function wire() {
    const svg = box.querySelector('#gsvg'); attach(svg, vb, v => { vb = v; });
    svg.addEventListener('pointerover', e => { const g = e.target.closest('.gnode'); const k = g ? g.dataset.k : null; if (k !== hover) { hover = k; paint(); } });
    svg.addEventListener('click', e => { if (svg._moved) return; const g = e.target.closest('.gnode'); if (!g) return; st.sel = g.dataset.k; setSide(); paint(); });
    svg.addEventListener('dblclick', e => { const g = e.target.closest('.gnode'); if (!g) return; st.sel = g.dataset.k; st.scope = 'local'; draw(); });
    svg.addEventListener('auxclick', e => { const g = e.target.closest('.gnode'); if (g) open(by.get(g.dataset.k), e); });
    box.querySelector('.gtools').addEventListener('click', e => {
      const sc = e.target.closest('[data-gs]'); if (sc) { st.scope = sc.dataset.gs; if (st.scope === 'local' && !st.sel) st.sel = nodes.find(n => n.s)?.key; return draw(); }
      const k = e.target.closest('[data-gk]'); if (k) { st.on[k.dataset.gk] = !st.on[k.dataset.gk]; draw(); }
    });
    box.querySelector('.gtools').addEventListener('change', e => {
      const t = e.target; if (t.dataset.gt) { st[t.dataset.gt] = t.checked; return draw(true); }
      if (t.id === 'g-lay') { st.layout = t.value; draw(); } if (t.id === 'g-col') { st.color = t.value; draw(true); } if (t.id === 'g-depth') { st.depth = +t.value; draw(); }
    });
    box.querySelector('#g-q').addEventListener('input', e => { st.q = e.target.value.trim(); paint(); });
    box.querySelector('.gside').addEventListener('click', e => {
      const pill = e.target.closest('[data-gk2]'); if (pill) { st.sel = pill.dataset.gk2; setSide(); paint(); return; }
      const a = e.target.closest('[data-gact]'); if (!a) return; const n = by.get(st.sel);
      if (a.dataset.gact === 'local') { st.scope = 'local'; draw(); } else open(n, e);
    });
  }
  const open = (n, e) => { if (!n) return; if (n.chat) o.onChat(n.chat, e); else if (n.topic) o.onOpen(null, null, e, n.topic); else if (n.s) o.onOpen(n.s, n.id, e); };
  draw();
}

// ドラッグ・ホイール
function attach(svg, vb0, onView) {
  let vb = [...vb0], drag = null;
  const set = () => { svg.setAttribute('viewBox', vb.join(' ')); onView([...vb]); };
  svg.addEventListener('wheel', e => {
    e.preventDefault(); const r = svg.getBoundingClientRect(), f = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const mx = vb[0] + (e.clientX - r.left) / r.width * vb[2], my = vb[1] + (e.clientY - r.top) / r.height * vb[3];
    vb = [mx - (mx - vb[0]) * f, my - (my - vb[1]) * f, vb[2] * f, vb[3] * f]; set();
  }, { passive: false });
  svg.addEventListener('mousedown', e => e.preventDefault());
  svg.addEventListener('pointerdown', e => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, vb: [...vb] }; svg._moved = false; });
  const mv = e => {
    if (!drag || !svg.isConnected) return; const r = svg.getBoundingClientRect(), dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) svg._moved = true;
    vb = [drag.vb[0] - dx / r.width * drag.vb[2], drag.vb[1] - dy / r.height * drag.vb[3], drag.vb[2], drag.vb[3]]; set();
  };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', () => { drag = null; });
}
