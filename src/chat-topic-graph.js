// チャットメモのトピックだけを表示する。ノート用グラフの設定や表示対象とは独立。
import ForceGraph from 'force-graph';
import Relations from '../chat-relations.js';

export function unmount(host) {
  if (host && host._topicGraphCleanup) host._topicGraphCleanup();
}
export function mount(host, { topics, messages, onOpen, createGraph = el => new ForceGraph(el) }) {
  unmount(host);
  const data = Relations.topicGraphData(topics, messages);
  host.innerHTML = '<div class="ctg-toolbar"><span class="sub">上位 → 下位・線の数字はメモ件数。トピックを押すとメモを開きます。</span><span class="grow"></span><button data-ctg="out" aria-label="縮小">−</button><button data-ctg="in" aria-label="拡大">＋</button><button data-ctg="fit">全体表示</button></div><div class="ctg-canvas"></div>';
  const canvas = host.querySelector('.ctg-canvas');
  if (!data.nodes.length) { canvas.innerHTML = '<div class="none">トピックがまだありません。</div>'; return; }
  const graph = createGraph(canvas);
  const color = getComputedStyle(host).getPropertyValue('--acc').trim() || '#3b5bdb';
  const fg = getComputedStyle(host).getPropertyValue('--fg').trim() || '#2b2d33';
  const bg = getComputedStyle(host).getPropertyValue('--bg').trim() || '#ffffff';
  const fit = () => graph.zoomToFit(250, 60);
  let fitOnce = true, destroyed = false;
  graph.backgroundColor(bg).cooldownTicks(120)
    .nodeId('id').nodeRelSize(1).nodeVal(n => (5 + Math.min(5, Math.sqrt(n.count))) ** 2).nodeLabel(n => { const el = document.createElement('span'); el.textContent = `${n.name}（${n.count} 件）`; return el; })
    .nodeCanvasObject((n, ctx, scale) => {
      const radius = 5 + Math.min(5, Math.sqrt(n.count));
      ctx.beginPath(); ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill();
      ctx.font = `${12 / scale}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = fg;
      ctx.fillText(`${n.name}（${n.count}）`, n.x, n.y + radius + 3 / scale);
    })
    .nodePointerAreaPaint((n, color, ctx) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(n.x, n.y, 10, 0, 2 * Math.PI); ctx.fill(); })
    .linkColor(() => '#8893a5').linkWidth(1.2).linkDirectionalArrowLength(7).linkDirectionalArrowRelPos(1)
    .linkCanvasObject((l, ctx, scale) => {
      if (typeof l.source !== 'object' || typeof l.target !== 'object') return;
      const x = (l.source.x + l.target.x) / 2, y = (l.source.y + l.target.y) / 2;
      ctx.font = `${11 / scale}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const width = ctx.measureText(String(l.count)).width + 6 / scale;
      ctx.fillStyle = bg; ctx.fillRect(x - width / 2, y - 7 / scale, width, 14 / scale);
      ctx.fillStyle = fg; ctx.fillText(String(l.count), x, y);
    }).linkCanvasObjectMode(() => 'after')
    .onNodeClick(n => { unmount(host); onOpen(n.name); })
    .onEngineStop(() => { if (fitOnce && !destroyed) { fitOnce = false; fit(); } });
  graph.d3Force('charge')?.strength(-180);
  graph.d3Force('link')?.distance(110);
  const resize = () => { const r = canvas.getBoundingClientRect(); if (r.width && r.height) graph.width(r.width).height(r.height); };
  resize();
  const ro = new ResizeObserver(resize); ro.observe(canvas);
  const click = e => { const b = e.target.closest('[data-ctg]'); if (!b) return; if (b.dataset.ctg === 'fit') fit(); else graph.zoom(graph.zoom() * (b.dataset.ctg === 'in' ? 1.25 : .8), 200); };
  host.addEventListener('click', click);
  // 別のノートやタブへ移動しても、描画ループ・監視を残さない。
  const observer = new MutationObserver(() => { if (!host.isConnected) unmount(host); });
  observer.observe(document.body, { childList: true, subtree: true });
  host._topicGraphCleanup = () => {
    if (destroyed) return; destroyed = true;
    ro.disconnect(); observer.disconnect(); host.removeEventListener('click', click);
    graph._destructor(); host._topicGraphCleanup = null;
  };
  graph.graphData(data);
}
