// YuriiNote の共通処理（main と画面の両方で使う）
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
// '1a(1)' → { id: '1a', n: '1' }（(番号) が無ければ n は undefined）
const splitAnchor = raw => { const m = String(raw).match(/^(.*?)(?:[(（](\d+)[)）])?$/); return { id: m[1], n: m[2] }; };

// ===== 本文のリンク =====
// :1a（続き） 1a:（全体） 1a(1) :1a(1) 1a(1):（別ノートの (1)） (1) :(1) (1):（同じノートの (1)）
const C = '[:：]', LP = '[(（]', RP = '[)）]';
const RE = `(?<![0-9A-Za-z])(?:(${C})?(${ID})?${LP}(\\d+)${RP}(${C})?|${C}(${ID})(?![0-9A-Za-z])|(${ID})${C}(?![0-9]))`;

const MDLINK = /!?\[[^\]\n]*\]\([^)\s]*\)/g; // [名前](パス) と ![名前](パス)
// コードの範囲（``` で囲んだ行・`コード`・``コード``）。この中は、リンクにしない
function codeRanges(text) {
  const r = []; let pos = 0, open = -1;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { if (open < 0) open = pos; else { r.push([open, pos + line.length]); open = -1; } }
    pos += line.length + 1;
  }
  if (open >= 0) r.push([open, text.length]);
  const inFence = i => r.some(([a, b]) => i >= a && i < b);
  for (const m of text.matchAll(/(`+)[^`\n][^\n]*?\1(?!`)/g)) if (!inFence(m.index)) r.push([m.index, m.index + m[0].length]);
  return r;
}
const SEP = '[,，、]';
// :1a(p)  :1a(p)(2)  :1a(2)(p)  — ID のあとの (p)（紙）・(d)（デジタル）と、(番号)（ノートの中の場所）。書かなければ、いまのノートと同じ側
const SPN = /^[(（]([pdPD])[)）]/, NN = /^[(（](\d+)[)）]/;
function tokens(text) {
  const re = new RegExp(RE, 'g'), out = [], skip = [...text.matchAll(MDLINK)].map(m => [m.index, m.index + m[0].length]).concat(codeRanges(text)); let m;
  const hit = (a, b) => skip.some(([x, y]) => a < y && b > x);
  const extend = t => {
    let end = t.to;
    for (let g = 0; g < 2; g++) {
      const rest = text.slice(end); let x;
      if (t.sp === undefined && (x = rest.match(SPN))) { t.sp = x[1].toLowerCase(); end += x[0].length; continue; }
      if (t.n === undefined && (x = rest.match(NN))) { t.n = x[1]; end += x[0].length; continue; }
      break;
    }
    t.to = end; t.text = text.slice(t.from, end); return t;
  };
  while ((m = re.exec(text))) {
    if (hit(m.index, m.index + m[0].length)) continue;
    const [all, c1, id1, n, c2, idB, idC] = m; let t;
    if (n !== undefined) t = id1 ? { k: 'ref', id: id1, n } : { k: 'self', n, bare: !c1 && !c2 };
    else t = { k: 'ref', id: idB || idC };
    t.from = m.index; t.to = m.index + all.length; t.text = all;
    if (t.k === 'ref') extend(t);
    out.push(t); re.lastIndex = Math.max(re.lastIndex, t.to);
    if (idB && n === undefined && t.k === 'ref') { // :1a,1b,1c のように、ひとつの : で複数のID（それぞれに (p) (番号) もつけられる）
      const more = new RegExp(`^${SEP}(${ID})(?![0-9A-Za-z])`);
      for (let p = t.to, x; (x = text.slice(p).match(more)) && !hit(p, p + x[0].length);) {
        const t2 = extend({ k: 'ref', id: x[1], from: p + 1, to: p + x[0].length, text: x[1] }); out.push(t2); p = t2.to; re.lastIndex = p;
      }
    }
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
    if (t.k === 'ref') href = pathOf(t.id, t.sp) + (t.n ? '#c' + t.n : '');
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

// ===== エクスポート（複数のノートを1つの Markdown に）=====
// ids（同じ s の ID の並び）のうち、from 〜 to（番号順）の範囲
function fzRange(ids, from, to) {
  let a = from, b = to; if (cmpId(a, b) > 0) [a, b] = [b, a];
  return ids.filter(i => cmpId(i, a) >= 0 && cmpId(i, b) <= 0);
}
// root とその子孫（1a → 1a, 1a1, 1a2b …）
function fzSubtree(ids, root) {
  const r = tok(root);
  return ids.filter(i => { const t = tok(i); return t.length >= r.length && r.every((x, k) => t[k] === x); });
}
// items: [{s,id,title,body,noid,created}]（出す順）。選んだノートの中を指すリンクだけ生かし、外へのリンクは普通の文字にする
function exportMd(items) {
  const has = new Set(items.filter(n => !n.noid).map(n => n.s + ':' + n.id));
  const plain = (body, s) => {
    const toks = tokens(body).filter(t => t.k === 'ref' && !has.has(s + ':' + t.id)).sort((a, b) => b.from - a.from);
    let out = body; for (const t of toks) out = out.slice(0, t.from) + t.text.replace(/[:：]/g, '') + out.slice(t.to);
    return out;
  };
  return items.map(n => {
    const label = n.noid ? '（IDなし）' : (n.s === 'p' ? '紙 ' : '') + n.id;
    return `## ${label}${n.title ? ' ' + n.title : ''}\n\n${plain((n.body || '').trim(), n.s)}`;
  }).join('\n\n---\n\n') + '\n';
}

// ===== 索引 =====
// 1行 = 「キーワード ID ID …」。
//   + で始まる行（★ も同じ）は、別の索引への案内（星マーク）
//   ID の前の * は、そのIDの上に赤い点を付ける印（例: PKM *1 1a）。グローバルな Index でも同じ印
// 行の ID: 1a  1a(2)  1a(p)  1a(p)(2)  1a(2)(p)  — (p)（紙）(d)（デジタル）は、書かなければ、その索引 の親と同じ側
const IDTOK = new RegExp('^(' + ID + ')((?:[(（](?:\\d+|[pdPD])[)）]){0,2})$');
function parseIdTok(tok) {
  const m = tok.match(IDTOK); if (!m) return null;
  let sp, n; for (const g of m[2].matchAll(/[(（](\d+|[pdPD])[)）]/g)) { if (/^\d+$/.test(g[1])) { if (n === undefined) n = g[1]; } else if (sp === undefined) sp = g[1].toLowerCase(); }
  return { id: m[1], n, sp, raw: m[1] + (n ? `(${n})` : ''), tok };
}
const defOf = t => t && t.entry && t.entry.s === 'p' ? 'p' : 'd';   // 索引 の、印なしの側（親が紙なら紙）
function topicLine(line) {
  const c = line.match(/^(\s*[@＠]\s*)(.+?)\s*$/);   // @夢 → チャットメモのトピック「夢」への案内（メモ自体は書かない）
  if (c) return { chat: c[2], from: c[1].length, to: c[1].length + c[2].length, ids: [] };
  const s = line.match(/^(\s*[★☆+＋]\s*)(.*?)\s*$/);
  if (s) {
    // +hoge 1 → 「★ hoge 1」（1 がリンク。そのIDの索引 があってもなくても）。+GUI だけなら、索引 への案内
    const ps = [...s[2].matchAll(/\S+/g)], last = ps[ps.length - 1], pt = last && parseIdTok(last[0]);
    if (ps.length >= 2 && pt) {
      const at = s[1].length + last.index;
      return { star: '', ref: { label: s[2].slice(0, last.index).trim(), id: pt.id, sp: pt.sp, from: at, to: at + last[0].length }, from: s[1].length, to: s[1].length + s[2].length, ids: [] };
    }
    return { star: s[2], from: s[1].length, to: s[1].length + s[2].length, ids: [] };
  }
  const parts = [...line.matchAll(/[^\s,、，]+/g)], ids = [], bare = x => x.replace(/^[*＊]/, '');
  let i = parts.length - 1, pt;
  while (i >= 0 && (pt = parseIdTok(bare(parts[i][0])))) {
    const t = parts[i][0], dot = bare(t) !== t;
    ids.unshift({ ...pt, dot, from: parts[i].index + (dot ? 1 : 0), to: parts[i].index + t.length }); i--;
  }
  const kw = i >= 0 ? line.slice(0, parts[i].index + parts[i][0].length).trim() : '';
  return { kw, ids };
}
// 昔の「デジタル欄・紙欄」の 2 つの文字を、1 つの文字に（印なしの側と違う ID に、(p) か (d) を付ける）
function legacyTopicText(t) {
  const def = defOf(t), out = [];
  for (const sp of ['d', 'p']) for (const line of (t[sp] || '').split('\n')) {
    const r = topicLine(line);
    if (r.ref && sp !== def && r.ref.sp === undefined) { out.push(line.slice(0, r.ref.to) + `(${sp})` + line.slice(r.ref.to)); continue; }   // 「+名前 ID」の星も、側を付ける
    if (r.star !== undefined || !r.ids.length) { if (line.trim()) out.push(line); continue; }
    out.push(r.kw + ' ' + r.ids.map(x => (x.dot ? '*' : '') + x.raw + (sp !== def ? `(${sp})` : '')).join(' '));
  }
  return out.join('\n');
}
const topicText = t => t.text !== undefined ? t.text : legacyTopicText(t);
// 表示用に: [{kw, d:[ids], p:[ids]}], stars, refs。(p) (d) の印で、紙とデジタルに分ける
function mergeTopic(t) {
  const m = new Map(), stars = [], refs = [], chats = [], def = defOf(t);
  for (const line of topicText(t).split('\n')) {
    const r = topicLine(line);
    if (r.chat) { if (!chats.includes(r.chat)) chats.push(r.chat); continue; }
    if (r.ref) { const s = r.ref.sp || def; if (!refs.some(x => x.s === s && x.id === r.ref.id && x.label === r.ref.label)) refs.push({ s, label: r.ref.label, id: r.ref.id }); continue; }
    if (r.star !== undefined) { if (r.star && !stars.includes(r.star)) stars.push(r.star); continue; }
    if (!r.kw && !r.ids.length) continue;
    const k = r.kw || '';
    if (!m.has(k)) m.set(k, { kw: k, d: [], p: [] });
    for (const x of r.ids) { const s = x.sp || def; if (!m.get(k)[s].includes(x.raw)) m.get(k)[s].push(x.raw); if (x.dot && !m.get(k).dot) m.get(k).dot = { s, id: x.id }; }   // 並びには (番号) つきのまま入れる
  }
  return { rows: [...m.values()], stars, refs, chats };
}

// 索引 の文字に「キーワード ID」を足す（同じキーワードの行があればその行の後ろに）。ID は 1a や 1a(p) のように、印つきで
function addToTopic(text, kw, tok) {
  const lines = text ? text.split('\n') : [];
  for (let i = 0; i < lines.length; i++) {
    const r = topicLine(lines[i]);
    if (r.star !== undefined || r.kw !== kw) continue;
    if (!r.ids.some(x => x.tok === tok || x.tok === '*' + tok)) lines[i] = lines[i].replace(/\s+$/, '') + ' ' + tok;
    return lines.join('\n');
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  lines.push(kw + ' ' + tok);
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

// 索引 の文字から ID を外す（ID が無くなった行は消す）。items: [{s, id}]（紙かデジタルかも見る）。def は、印なしの側
function removeFromTopic(text, items, def = 'd') {
  const gone = x => items.some(it => it.id === x.id && it.s === (x.sp || def));
  return (text || '').split('\n').flatMap(line => {
    const r = topicLine(line);
    if (r.star !== undefined || !r.ids.some(gone)) return [line];
    const keep = r.ids.filter(x => !gone(x));
    return keep.length ? [r.kw + ' ' + keep.map(x => (x.dot ? '*' : '') + x.tok).join(' ')] : [];
  }).join('\n');
}

// ===== 日記 =====
// 日付が変わる時刻は朝5時（Gnosis と同じ）。夜中の3時のメモは前の日の日記に入る
let DAY_START = 5;   // 日付が変わる時刻（設定で変えられる）
const setDayStart = h => { DAY_START = Math.max(0, Math.min(12, Math.floor(+h) || 0)); };
const pad2 = x => String(x).padStart(2, '0');
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
// 日のノートの「## 今日のノート」（その日に作ったノートへのリンクの並び）を、メモ・本文の下（紙の日記の上）へ。書いた文章は、いつも上
function normDay(body) {
  const lines = (body || '').split('\n'), i = lines.findIndex(l => l.trim() === '## 今日のノート');
  if (i < 0) return body;
  let j = i + 1; while (j < lines.length && (!lines[j].trim() || /^\s*-\s+(\[[^\]]*\]\([^)]*\)|:[0-9a-z]+)/.test(lines[j]))) j++;
  const sec = lines.slice(i, j), rest = lines.slice(j), pre = lines.slice(0, i), paper = rest.findIndex(l => l.trim() === '## 紙の日記');
  const mid = paper < 0 ? rest : rest.slice(0, paper), tail = paper < 0 ? [] : rest.slice(paper);
  return [...pre, ...mid, '', ...sec, '', ...tail].join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '');
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
// 新しい名前は 20261108073511（YYYYMMDDHHmmss）。昔の u20261107-143521 も IDなしとして読む
const NOID = /^(?:\d{14}(?:-\d+)?|u\d{8}-\d{6}(?:-\d+)?)$/;
const isNoid = s => NOID.test(s);
const noidStem = (d = new Date()) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
const STEM = /^\d{14}(?:-\d+)?$/;   // ノートのファイル名（拡張子なし）
const isStem = s => STEM.test(s);

// ===== YAML（ファイルの先頭の --- で囲んだ部分）=====
// 値は JSON の形で書く（YAML としても正しい）。手で書いた plain な値と [a, b] も読む
function fmParse(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return { meta: null, rest: text };
  const meta = {};
  for (const l of m[1].split(/\r?\n/)) {
    const i = l.indexOf(':'); if (i <= 0 || /^\s/.test(l)) continue;
    const k = l.slice(0, i).trim(), v = l.slice(i + 1).trim();
    let x; try { x = JSON.parse(v); } catch {
      x = /^\[.*\]$/.test(v) ? v.slice(1, -1).split(/[,、]/).map(y => y.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : v.replace(/^["']|["']$/g, '');
    }
    meta[k] = x;
  }
  return { meta, rest: text.slice(m[0].length) };
}
const fmDump = o => '---\n' + Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n') + '\n---\n';

// ===== ノートの種類: text（文章）/ rp（なりきりチャット）/ canvas（キャンバス）=====
// なりきり・キャンバスはデータ（data）を持ち、本文はそこから作る（検索やMarkdownで文字が見えるように）
const KINDS = { text: '', rp: '🎭', canvas: '🗺', 'memo-group': '💬 ノート化' };
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
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const parseTime = c => { const m = (c || '').match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/); return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : null; };

module.exports = {
  codeRanges, MDLINK, ID, isId, splitAnchor, tok, cmpId, sibling, child, parentIn, root,
  tokens, anchorPos, selfTarget, bodyToMd, mdToBody,
  fzRange, fzSubtree, exportMd, defOf, topicText, legacyTopicText, parseIdTok, isNoid, noidStem, isStem, STEM, fmParse, fmDump, parseTime, KINDS, deriveBody, setDayStart, todayStr, dayOf, weekday, isDate, addToSection, normDay, diaryTree, topicLine, mergeTopic, addToTopic, removeFromTopic, toHira, kanaRow, ROWS, byReading, kwAnchor, fileName, splitKw, now
};
