// チャット・なりきり・キャンバスで共通の部品。app.js が ctx の中身を入れる
import MarkdownIt from 'markdown-it';
import L from '../lib.js';

export const ctx = {};
export const $ = s => document.querySelector(s);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const pad = n => String(n).padStart(2, '0');
export const hm = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const vaultUrl = () => 'file://' + ctx.vault().split('/').map(encodeURIComponent).join('/') + '/';

// ===== 吹き出しなどの Markdown 表示 =====
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
// :1a や 1a: は、ノートへのリンクにする（pkm: で始まるリンク）
export function renderMd(text) {
  let src = text || '', out = '', last = 0;
  for (const t of L.tokens(src)) {
    if (t.k !== 'ref') continue;
    out += src.slice(last, t.from) + `[${t.text}](pkm:${t.id})`; last = t.to;
  }
  const el = document.createElement('div');
  el.innerHTML = md.render(out + src.slice(last));
  for (const i of el.querySelectorAll('img')) { // 画像は保存フォルダの中のファイル
    const s = i.getAttribute('src') || '';
    if (!/^(https?:|data:|file:)/.test(s)) try { i.src = new URL(s, vaultUrl()).href; } catch { }
  }
  for (const a of el.querySelectorAll('a')) {
    const h = a.getAttribute('href') || '';
    if (h.startsWith('pkm:')) a.dataset.ref = h.slice(4); else a.dataset.file = h;
  }
  return el.innerHTML;
}
// 表示した Markdown の中のリンクを押したとき（ノートへ飛ぶ・ファイルや外のリンクは既定のアプリで開く）
export function mdClick(e) {
  const a = e.target.closest('a'); if (!a) return false;
  e.preventDefault();
  if (a.dataset.ref) { if (ctx.get('d', a.dataset.ref)) ctx.openNote('d', a.dataset.ref); }
  else if (a.dataset.file) ctx.api.openPath(a.dataset.file);
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
  m.style.left = Math.min(e.clientX, innerWidth - 190) + 'px'; m.style.top = Math.min(e.clientY, innerHeight - items.length * 32 - 10) + 'px';
  document.body.append(m);
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
  setup(close); return close;
}
