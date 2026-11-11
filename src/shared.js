// チャット・なりきり・キャンバスで共通の部品。app.js が ctx の中身を入れる
import MarkdownIt from 'markdown-it';
import L from '../lib.js';
import { mermaidPlaceholder } from './mermaid.js';
import UrlLinks from '../url-links.js';

export const ctx = {};
export const $ = s => document.querySelector(s);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const pad = n => String(n).padStart(2, '0');
export const hm = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const vaultUrl = () => 'file://' + ctx.vault().split('/').map(encodeURIComponent).join('/') + '/';

// ===== 吹き出しなどの Markdown 表示 =====
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
const oldFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const t = tokens[idx];
  if ((t.info || '').trim().split(/\s+/)[0].toLowerCase() === 'mermaid') return mermaidPlaceholder(t.content);
  return oldFence ? oldFence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
};
// :1a や 1a: は、ノートへのリンクにする（pkm: で始まるリンク）
export function renderMd(text, options = {}) {
  let src = text || '', out = '', last = 0;
  // Mermaidの図コード内にある :1 等をノート参照に書き換えると構文が壊れるので除外。
  const fences = UrlLinks.fencedRanges(src);
  for (const t of L.tokens(src)) {
    if (t.k !== 'ref' || fences.some(([a,b]) => t.from < b && a < t.to)) continue;
    out += src.slice(last, t.from) + `[${t.text}](pkm:${t.sp || 'd'}:${t.id})`; last = t.to;
  }
  const el = document.createElement('div');
  el.innerHTML = md.render(out + src.slice(last));
  for (const i of el.querySelectorAll('img')) { // 画像は保存フォルダの中のファイル
    const s = i.getAttribute('src') || '';
    if (!/^(https?:|data:|file:|link:|memo:|note:)/.test(s) && !/^\d{14}(?:-\d+)?\.md$/.test(s)) try { i.src = new URL(s, vaultUrl()).href; } catch { }
  }
  for (const a of el.querySelectorAll('a')) {
    const h = a.getAttribute('href') || '';
    if (h.startsWith('pkm:')) a.dataset.ref = h.slice(4); else a.dataset.file = h;   // pkm:紙デジタル:ID
  }
  ctx.enhanceRendered?.(el, { ...options, text: src });
  return el.innerHTML;
}
// 表示した Markdown の中のリンクを押したとき（ノートへ飛ぶ・ファイルや外のリンクは既定のアプリで開く）
export function mdClick(e) {
  const a = e.target.closest('a'); if (!a) return false;
  e.preventDefault();
  if (a.dataset.ref) { const [sp, ...r] = a.dataset.ref.split(':'), id = r.join(':'); if (ctx.get(sp, id)) ctx.openNote(sp, id); }
  else if (a.dataset.file) ctx.openLink(a.dataset.file);
  else if (a.href) { const external=UrlLinks.externalUri(a.href); if (external) ctx.openLink(external); }
  return true;
}
// 右クリックのメニュー。items: [[名前, 関数]]
export function popMenu(e, items) {
  document.querySelectorAll('.popmenu').forEach(m => m.remove());
  const m = document.createElement('div'); m.className = 'popmenu';
  for (const [name, fn, danger] of items) {
    const b = document.createElement('div'); b.textContent = name; if (danger) b.className = 'danger';
    b.onclick = () => { m.remove(); fn(); }; m.append(b);
  }
  const z = parseFloat(document.body.style.zoom) || 1;   // 画面全体の拡大（設定）があっても、位置がずれない
  m.style.left = e.clientX / z + 'px'; m.style.top = e.clientY / z + 'px'; m.style.maxHeight = (innerHeight - 16) / z + 'px'; m.style.overflowY = 'auto';
  document.body.append(m);
  const r = m.getBoundingClientRect();   // 実際の大きさで、画面の外に出ないように（下のメモで右クリックしても見切れない）
  if (r.bottom > innerHeight - 8) m.style.top = Math.max(8 / z, (e.clientY - (r.bottom - (innerHeight - 8))) / z) + 'px';
  if (r.right > innerWidth - 8) m.style.left = Math.max(8 / z, (innerWidth - 8 - r.width) / z) + 'px';
  setTimeout(() => document.addEventListener('mousedown', ev => { if (!m.contains(ev.target)) m.remove(); }, { once: true, capture: true }), 0);
}
export function toast(text) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.append(t); }
  t.textContent = text; t.style.opacity = 1; clearTimeout(t._t); t._t = setTimeout(() => { t.style.opacity = 0; }, 2600);
}
// ダイアログ（#modal を使う）
export function dialog(html, setup) {
  $('#modal .box').innerHTML = html; $('#modal').style.display = 'flex';
  const close = () => { $('#modal').style.display = 'none'; };
  $('#modal').onkeydown = e => { if (e.key === 'Escape') close(); };
  setup(close);
  if (!$('#modal').contains(document.activeElement)) $('#modal').querySelector('input,textarea,select,button')?.focus();
  return close;
}
