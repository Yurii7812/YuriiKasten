// URL からページの題を取ってくる（リンクの表示名を、毎回自分で打たなくていいように）。main から使う
const PRIVATE = /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { try { return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)); } catch { return m; } }
  return ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : m;
});
const clean = s => decodeEntities(s).replace(/\s+/g, ' ').trim().replace(/\[/g, '（').replace(/\]/g, '）').slice(0, 100);
// HTML の先頭から題を取り出す（og:title があればそれ、なければ <title>）
function titleOf(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  const t = og ? og[1] : (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  return t ? clean(t) : '';
}
function charsetOf(contentType, head) {
  const h = /charset=["']?([\w-]+)/i.exec(contentType || '') || /<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || /<meta[^>]+content=["'][^"']*charset=([\w-]+)/i.exec(head);
  return h ? h[1] : 'utf-8';
}
// YouTube は公式の oEmbed で題を取る（ページは大きく、同意画面になることもあるので）
const YOUTUBE = /^(www\.|m\.)?(youtube\.com|youtu\.be)$/i;
async function youtubeTitle(u, fetchImpl, signal) {
  try {
    const res = await fetchImpl('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(u.href), { signal });
    if (!res.ok) return '';
    return clean(String((await res.json()).title || ''));
  } catch { return ''; }
}
async function fetchTitle(url, { allowPrivate = false, timeout = 6000, fetchImpl = fetch } = {}) {
  let u; try { u = new URL(url); } catch { return ''; }
  if (!/^https?:$/.test(u.protocol)) return '';
  if (!allowPrivate && PRIVATE.test(u.hostname)) return '';   // 家の中の機器・自分の PC のページには、取りにいかない
  if (YOUTUBE.test(u.hostname)) {
    const ctl0 = new AbortController(), t0 = setTimeout(() => ctl0.abort(), timeout);
    try { const t = await youtubeTitle(u, fetchImpl, ctl0.signal); if (t) return t; } finally { clearTimeout(t0); }
  }
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetchImpl(u.href, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (YuriiNote link title)', Accept: 'text/html,application/xhtml+xml' } });
    if (!res.ok || !/html|xml/i.test(res.headers.get('content-type') || 'text/html')) return '';
    const reader = res.body.getReader(), chunks = []; let size = 0;
    let seen = '';   // 読んだぶん（題を見つけたら、そこでやめる）。YouTube のように、先頭に長い script があるページもあるので、3MB まで
    while (size < 3000000) {
      const { done, value } = await reader.read(); if (done) break;
      chunks.push(value); size += value.length; seen += Buffer.from(value).toString('latin1');
      if (/<\/title>/i.test(seen) && (/og:title/i.test(seen) || /<\/head>|<body/i.test(seen))) break;
    }
    try { reader.cancel(); } catch { }
    const buf = Buffer.concat(chunks), head = buf.subarray(0, 4096).toString('latin1');
    let html; try { html = new TextDecoder(charsetOf(res.headers.get('content-type'), head)).decode(buf); } catch { html = buf.toString('utf8'); }
    return titleOf(html);
  } catch { return ''; } finally { clearTimeout(timer); }
}
module.exports = { fetchTitle, titleOf, clean };
