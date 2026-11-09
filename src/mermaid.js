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

export async function renderMermaidIn(root = document) {
  if (!root) return;
  init();
  for (const box of root.querySelectorAll('.mermaid-diagram:not([data-mermaid-status])')) {
    box.dataset.mermaidStatus = 'loading';
    const source = box.querySelector('.mermaid-source')?.textContent || '';
    const dest = box.querySelector('.mermaid-output');
    if (!dest || !source.trim()) {
      box.dataset.mermaidStatus = 'error';
      if (dest) dest.textContent = 'Mermaidの内容がありません';
      continue;
    }
    try {
      // DOM未接続でレンダリングすると寸法計算が失敗するため、画面への挿入後だけ開始。
      if (!box.isConnected) { delete box.dataset.mermaidStatus; continue; }
      const {svg, bindFunctions} = await mermaid.render('yurii-mermaid-' + (++serial), source);
      if (!box.isConnected) continue;
      dest.innerHTML = svg;  // securityLevel=strictによって生成されたSVGのみ
      bindFunctions?.(dest);
      box.dataset.mermaidStatus = 'ready';
    } catch (error) {
      box.dataset.mermaidStatus = 'error';
      dest.textContent = 'Mermaid構文エラー：' + (error?.message || String(error));
      box.querySelector('.mermaid-source').hidden = false;
    }
  }
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
