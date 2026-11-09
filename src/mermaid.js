// MarkdownとCodeMirrorで共通のMermaid図。オフラインのnpm依存で描画する。
// 生HTMLは使わせずsecurityLevel=strictでサニタイズする。
import mermaid from 'mermaid';

const escapeHtml = text => String(text || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let initialized = false, serial = 0;
function init() {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: 'default',
    flowchart: { htmlLabels: false, useMaxWidth: true },
    maxTextSize: 60000
  });
  initialized = true;
}
export const mermaidPlaceholder = code =>
  '<div class="mermaid-diagram"><div class="mermaid-output" role="img" aria-label="Mermaid図">図を描画しています…</div>' +
  '<pre class="mermaid-source" hidden>' + escapeHtml(code) + '</pre></div>';

let renderQueue = Promise.resolve();
async function drawOne(box) {
  if (!box.isConnected || box.dataset.mermaidStatus) return;
  box.dataset.mermaidStatus = 'loading';
  const source = box.querySelector('.mermaid-source')?.textContent || '';
  const dest = box.querySelector('.mermaid-output');
  if (!dest || !source.trim()) {
    box.dataset.mermaidStatus = 'error';
    if (dest) dest.textContent = 'Mermaidの内容がありません';
    return;
  }
  try {
    init();
    // Mermaidが内部的に同じ一時DOMを使うため、描画は必ず逐次実行。
    const result = await mermaid.render('yurii-mermaid-' + (++serial), source);
    if (!box.isConnected) return;
    dest.innerHTML = result.svg;
    result.bindFunctions?.(dest);
    box.dataset.mermaidStatus = 'ready';
  } catch (error) {
    if (!box.isConnected) return;
    box.dataset.mermaidStatus = 'error';
    const reason = error?.message || String(error);
    dest.textContent = 'Mermaid構文エラー：' + reason;
    box.querySelector('.mermaid-source').hidden = false;
  }
}
export function renderMermaidIn(root = document) {
  if (!root) return renderQueue;
  const boxes = [];
  if (root.matches?.('.mermaid-diagram:not([data-mermaid-status])')) boxes.push(root);
  boxes.push(...root.querySelectorAll('.mermaid-diagram:not([data-mermaid-status])'));
  for (const box of boxes) {
    if (!box.isConnected || box.dataset.mermaidStatus) continue;
    // 二重スケジュールを防止し、失敗時は元ソースと理由を表示する。
    box.dataset.mermaidStatus = 'queued';
    renderQueue = renderQueue.catch(() => {}).then(() => { delete box.dataset.mermaidStatus; return drawOne(box); });
  }
  return renderQueue;
}
export function installMermaidObserver() {
  if (!document.body || document.body.dataset.mermaidObserver) return;
  document.body.dataset.mermaidObserver = 'installed';
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; void renderMermaidIn(document); });
  };
  const observer = new MutationObserver(records => {
    if (records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches?.('.mermaid-diagram') || n.querySelector?.('.mermaid-diagram'))))) schedule();
  });
  observer.observe(document.body, {childList:true,subtree:true});
  schedule();
}
