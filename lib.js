// 紙PKM の共通処理（main と画面の両方で使う）
// ID: 1 → 並列 1a,1b … → 分岐 1a1 …
const ID = '[0-9]+[a-z0-9]*';
const isId = s => new RegExp('^' + ID + '$').test(s);
const tok = id => id.match(/\d+|[a-z]+/g) || [];

function cmpTok(a, b) {
  const an = /\d/.test(a), bn = /\d/.test(b);
  if (an && bn) return +a - +b;
  if (!an && !bn) return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
  return an ? -1 : 1;
}
function cmpId(x, y) {
  const a = tok(x), b = tok(y);
  for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = cmpTok(a[i], b[i]); if (c) return c; }
  return a.length - b.length;
}
function incLetters(s) {
  const c = s.split(''); let i = c.length - 1;
  while (i >= 0) { if (c[i] === 'z') { c[i] = 'a'; i--; } else { c[i] = String.fromCharCode(c[i].charCodeAt(0) + 1); return c.join(''); } }
  return 'a' + c.join('');
}
function sibling(id) { // 並列: 1a→1b, 1→2, 1a1→1a2
  const t = tok(id); if (!t.length) return '1';
  const l = t.pop(); t.push(/\d/.test(l) ? String(+l + 1) : incLetters(l)); return t.join('');
}
function child(id) { // 分岐: 1→1a, 1a→1a1
  const t = tok(id); if (!t.length) return '1';
  return id + (/\d/.test(t[t.length - 1]) ? 'a' : '1');
}
// いちばん近い、実在する祖先（無ければ null）
function parentIn(id, has) {
  const t = tok(id);
  while (t.length > 1) { t.pop(); const p = t.join(''); if (has(p)) return p; }
  return null;
}
const root = id => tok(id)[0] || id;

// ===== 本文のリンク =====
// :1a（続き） 1a:（全体） 1a(1) :1a(1) 1a(1):（別ノートの (1)） (1) :(1) (1):（同じノートの (1)）
const C = '[:：]', LP = '[(（]', RP = '[)）]';
const RE = `(?<![0-9A-Za-z])(?:(${C})?(${ID})?${LP}(\\d+)${RP}(${C})?|${C}(${ID})(?![0-9A-Za-z])|(${ID})${C}(?![0-9]))`;

function tokens(text) {
  const re = new RegExp(RE, 'g'), out = []; let m;
  while ((m = re.exec(text))) {
    const [all, c1, id1, n, c2, idB, idC] = m; let t;
    if (n !== undefined) t = id1 ? { k: 'ref', id: id1, n } : { k: 'self', n, bare: !c1 && !c2 };
    else t = { k: 'ref', id: idB || idC };
    t.from = m.index; t.to = m.index + all.length; t.text = all;
    out.push(t);
  }
  return out;
}
// ノートの中で (n) の位置（素の (n) を優先）
function anchorPos(text, n) {
  const s = tokens(text).filter(t => t.k === 'self' && t.n === String(n));
  const b = s.find(t => t.bare) || s[0];
  return b ? b.from : -1;
}
// 同じノートの (n) を押したときの行き先: 素の (n) ⇄ (n): / :(n)
function selfTarget(text, n, bare) {
  const t = tokens(text).find(t => t.k === 'self' && t.n === String(n) && t.bare !== bare);
  return t ? t.from : -1;
}

// 本文 → Markdown（ブラウザでもリンク・(1) へ飛べるように）
function bodyToMd(text, pathOf) {
  const toks = tokens(text), seenA = new Set(), seenB = new Set();
  const has = (n, bare) => toks.some(t => t.k === 'self' && t.n === n && t.bare === bare);
  let out = '', last = 0;
  for (const t of toks) {
    out += text.slice(last, t.from);
    let pre = '', href = null;
    if (t.k === 'ref') href = pathOf(t.id) + (t.n ? '#c' + t.n : '');
    else if (t.bare) { // 素の (1) はリンクにせず、赤くして目印だけ
      if (!seenA.has(t.n)) { seenA.add(t.n); pre = `<a id="c${t.n}"></a>`; }
      out += pre + `<span style="color:#c0392b">${t.text}</span>`; last = t.to; continue;
    }
    else { if (!seenB.has(t.n)) { seenB.add(t.n); pre = `<a id="c${t.n}-"></a>`; } if (has(t.n, true)) href = `#c${t.n}`; }
    out += pre + (href ? `[${t.text}](${href})` : t.text);
    last = t.to;
  }
  out += text.slice(last);
  return out.split('\n').map(l => (l.trim() ? l + '  ' : l)).join('\n');
}
// Markdown → 本文（上の逆。自分で書いた普通のリンクは残す）
function mdToBody(md) {
  return md
    .replace(/<a id="c[^"]*"><\/a>/g, '')
    .replace(/<span style="color:#c0392b">([^<]*)<\/span>/g, '$1')
    .replace(/\[([^\]\n]+)\]\(([^)\s]*)\)/g, (all, t) => {
      const k = tokens(t);
      return k.length === 1 && k[0].from === 0 && k[0].to === t.length ? t : all;
    })
    .split('\n').map(l => l.replace(/ {2}$/, '')).join('\n')
    .replace(/\n+$/, '');
}

// ===== トピックIndex =====
// 1行 = 「キーワード ID ID …」。★ で始まる行は別のトピックIndexへの案内
function topicLine(line) {
  const s = line.match(/^(\s*[★☆]\s*)(.*?)\s*$/);
  if (s) return { star: s[2], from: s[1].length, to: s[1].length + s[2].length, ids: [] };
  const parts = [...line.matchAll(/[^\s,、，]+/g)], ids = [];
  let i = parts.length - 1;
  while (i >= 0 && isId(parts[i][0])) { ids.unshift({ id: parts[i][0], from: parts[i].index, to: parts[i].index + parts[i][0].length }); i--; }
  const kw = i >= 0 ? line.slice(0, parts[i].index + parts[i][0].length).trim() : '';
  return { kw, ids };
}
// デジタル欄と紙欄をまとめて表示用に: [{kw, d:[ids], p:[ids]}], stars
function mergeTopic(t) {
  const m = new Map(), stars = [];
  for (const s of ['d', 'p']) for (const line of (t[s] || '').split('\n')) {
    const r = topicLine(line);
    if (r.star !== undefined) { if (r.star && !stars.includes(r.star)) stars.push(r.star); continue; }
    if (!r.kw && !r.ids.length) continue;
    const k = r.kw || '';
    if (!m.has(k)) m.set(k, { kw: k, d: [], p: [] });
    for (const x of r.ids) if (!m.get(k)[s].includes(x.id)) m.get(k)[s].push(x.id);
  }
  return { rows: [...m.values()], stars };
}

// トピックIndex の欄に「キーワード ID」を足す（同じキーワードの行があればその行の後ろに）
function addToTopic(text, kw, id) {
  const lines = text ? text.split('\n') : [];
  for (let i = 0; i < lines.length; i++) {
    const r = topicLine(lines[i]);
    if (r.star !== undefined || r.kw !== kw) continue;
    if (!r.ids.some(x => x.id === id)) lines[i] = lines[i].replace(/\s+$/, '') + ' ' + id;
    return lines.join('\n');
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  lines.push(kw + ' ' + id);
  return lines.join('\n');
}

const kwAnchor = k => { let h = 5381; for (const c of k) h = (h * 33 + c.codePointAt(0)) >>> 0; return 'k-' + h.toString(36); };
const fileName = name => name.replace(/[\\/:*?"<>|#%]/g, '_');
const splitKw = s => (s || '').split(/[,、，]/).map(x => x.trim()).filter(Boolean);
const now = (d = new Date()) => {
  const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

module.exports = {
  ID, isId, tok, cmpId, sibling, child, parentIn, root,
  tokens, anchorPos, selfTarget, bodyToMd, mdToBody,
  topicLine, mergeTopic, addToTopic, kwAnchor, fileName, splitKw, now
};
