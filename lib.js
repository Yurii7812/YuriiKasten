// YuriiKasten の共通処理（main と画面の両方で使う）
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

const MDLINK = /!?\[[^\]\n]*\]\([^)\s]*\)/g; // [名前](パス) と ![名前](パス)
function tokens(text) {
  const re = new RegExp(RE, 'g'), out = [], skip = [...text.matchAll(MDLINK)].map(m => [m.index, m.index + m[0].length]); let m;
  while ((m = re.exec(text))) {
    if (skip.some(([a, b]) => m.index < b && m.index + m[0].length > a)) continue;
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
// 1行 = 「キーワード ID ID …」。
//   + で始まる行（★ も同じ）は、別のトピックIndexへの案内（星マーク）
//   ID の前の * は、そのIDの上に赤い点を付ける印（例: PKM *1 1a）。グローバルな Index でも同じ印
function topicLine(line) {
  const s = line.match(/^(\s*[★☆+＋]\s*)(.*?)\s*$/);
  if (s) return { star: s[2], from: s[1].length, to: s[1].length + s[2].length, ids: [] };
  const parts = [...line.matchAll(/[^\s,、，]+/g)], ids = [], bare = x => x.replace(/^[*＊]/, '');
  let i = parts.length - 1;
  while (i >= 0 && isId(bare(parts[i][0]))) {
    const t = parts[i][0], dot = bare(t) !== t;
    ids.unshift({ id: bare(t), dot, from: parts[i].index + (dot ? 1 : 0), to: parts[i].index + t.length }); i--;
  }
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
    for (const x of r.ids) { if (!m.get(k)[s].includes(x.id)) m.get(k)[s].push(x.id); if (x.dot && !m.get(k).dot) m.get(k).dot = { s, id: x.id }; }
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

// 読み: カタカナ → ひらがな
const toHira = s => (s || '').replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
// 読みの頭が何行か（紙の索引の並び）。かな以外は「英数・他」
const ROWS = ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ'];
const ROW_OF = {}; 'あいうえおぁぃぅぇぉゔ|かきくけこ|さしすせそ|たちつてとっ|なにぬねの|はひふへほ|まみむめも|やゆよゃゅょ|らりるれろ|わをんゎ'.split('|').forEach((g, i) => { for (const c of g) ROW_OF[c] = ROWS[i]; });
function kanaRow(reading) {
  const c = toHira(reading).normalize('NFD').replace(/[\u3099\u309a]/g, '').charAt(0);
  return ROW_OF[c] || '英数・他';
}
const rowIdx = r => { const i = ROWS.indexOf(kanaRow(r)); return i < 0 ? 99 : i; }; // 英数・他は最後
const byReading = rd => (a, b) => { const x = rd(a) || a, y = rd(b) || b; return rowIdx(x) - rowIdx(y) || x.localeCompare(y, 'ja'); };

// トピックIndex の欄から ID を外す（ID が無くなった行は消す）
function removeFromTopic(text, ids) {
  const set = new Set(ids);
  return (text || '').split('\n').flatMap(line => {
    const r = topicLine(line);
    if (r.star !== undefined || !r.ids.some(x => set.has(x.id))) return [line];
    const keep = r.ids.filter(x => !set.has(x.id));
    return keep.length ? [r.kw + ' ' + keep.map(x => x.id).join(' ')] : [];
  }).join('\n');
}

// ===== 日記 =====
// 日付が変わる時刻は朝5時（Gnosis と同じ）。夜中の3時のメモは前の日の日記に入る
const DAY_START = 5, pad2 = x => String(x).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayStr = (now = new Date()) => { const d = new Date(now); d.setHours(d.getHours() - DAY_START); return ymd(d); };
function dayOf(created) { // 'YYYY-MM-DD HH:MM' → 日記の日付
  const m = (created || '').match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/); if (!m) return '';
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0)); d.setHours(d.getHours() - DAY_START); return ymd(d);
}
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const weekday = date => { const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? WD[new Date(+m[1], +m[2] - 1, +m[3]).getDay()] : ''; };
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s);
// 本文の「## 見出し」の節の最後に1行を足す。節が無ければ作る（「紙の日記」は必ず最後、ほかはその前）
function addToSection(body, heading, line) {
  const H = '## ' + heading, lines = body ? body.split('\n') : [];
  if (lines.some(l => l.trim() === line.trim())) return body;
  const i = lines.findIndex(l => l.trim() === H);
  if (i < 0) {
    const paper = lines.findIndex(l => l.trim() === '## 紙の日記');
    if (heading !== '紙の日記' && paper >= 0) { lines.splice(paper, 0, H, '', line, ''); return lines.join('\n'); }
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return (lines.length ? lines.join('\n') + '\n\n' : '') + H + '\n\n' + line;
  }
  let j = i + 1; while (j < lines.length && !/^##\s/.test(lines[j])) j++;
  let k = j; while (k > i + 1 && !lines[k - 1].trim()) k--;
  lines.splice(k, 0, line); return lines.join('\n');
}
// 年・月・日の階層（Gnosis 同様: 月はいつも、年は2つ以上の年にまたがってから）
function diaryTree(dates) {
  const sorted = [...dates].sort().reverse(), years = new Set(sorted.map(d => d.slice(0, 4)));
  const months = new Map();
  for (const d of sorted) { const m = d.slice(0, 7); if (!months.has(m)) months.set(m, []); months.get(m).push(d); }
  if (years.size < 2) return [...months].map(([m, ds]) => ({ label: m, days: ds }));
  const out = new Map();
  for (const [m, ds] of months) { const y = m.slice(0, 4); if (!out.has(y)) out.set(y, []); out.get(y).push({ label: m, days: ds }); }
  return [...out].map(([y, ms]) => ({ label: y, months: ms }));
}

// ===== IDなしのノート（とりあえず書いて、あとで整理する）=====
// ファイル名は D_u20261107-143521.md のように日時。ID の形（数字で始まる）と区別できる
const NOID = /^u\d{8}-\d{6}(-\d+)?$/;
const isNoid = s => NOID.test(s);
const noidStem = (d = new Date()) => `u${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;

// ===== ノートの種類: text（文章）/ rp（なりきりチャット）/ canvas（キャンバス）=====
// なりきり・キャンバスはデータ（data）を持ち、本文はそこから作る（検索やMarkdownで文字が見えるように）
const KINDS = { text: '', rp: '🎭', canvas: '🗺' };
function deriveBody(kind, data) {
  data = data || {};
  if (kind === 'rp') {
    const cast = data.cast || [];
    return `# ${data.title || '会話'}\n\n` + (data.messages || []).map(m => {
      const r = cast.find(x => x.id === m.role) || { name: m.name || '?' };
      const q = m.quote ? `> 引用: ${m.quote.kind === 'note' ? `ノート ${m.quote.id}` : `会話「${m.quote.title}」`}\n` : '';
      return `**${r.name}**: ${q}${m.text || ''}`.trim();
    }).join('\n\n');
  }
  if (kind === 'canvas') {
    const ns = [...(data.nodes || [])].sort((a, b) => a.y - b.y || a.x - b.x);
    return `# ${data.title || 'キャンバス'}\n\n` + ns.map(n => n.type === 'text' ? (n.text || '') : n.type === 'note' && n.s === 'd' ? `:${n.nid}` : '').filter(Boolean).join('\n\n');
  }
  return '';
}

const kwAnchor = k => { let h = 5381; for (const c of k) h = (h * 33 + c.codePointAt(0)) >>> 0; return 'k-' + h.toString(36); };
const fileName = name => name.replace(/[\\/:*?"<>|#%]/g, '_');
const splitKw = s => (s || '').split(/[,、，]/).map(x => x.trim()).filter(Boolean);
const now = (d = new Date()) => {
  const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

module.exports = {
  MDLINK, ID, isId, tok, cmpId, sibling, child, parentIn, root,
  tokens, anchorPos, selfTarget, bodyToMd, mdToBody,
  isNoid, noidStem, KINDS, deriveBody, DAY_START, todayStr, dayOf, weekday, isDate, addToSection, diaryTree, topicLine, mergeTopic, addToTopic, removeFromTopic, toHira, kanaRow, ROWS, byReading, kwAnchor, fileName, splitKw, now
};
