// Stable multi-target references; stored as ordinary JSON in K_links.json.
const L = require('./lib');
const safeTitle = s => String(s || '').replace(/[\[\]\\\n]/g, ' ').slice(0, 100);
const keyOf = t => `${t.kind}:${t.kind === 'memo' ? t.id : t.stem || t.s + ':' + t.id}:${t.range ? JSON.stringify(t.range) : '*'}`;
function rangeOf(text, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > text.length) throw Error('参照範囲が正しくありません');
  return { quote: text.slice(from, to), prefix: text.slice(Math.max(0, from - 48), from), suffix: text.slice(to, to + 48), from, to };
}
function locate(text, r) {
  if (!r) return { from: 0, to: text.length, text };
  if (!r.quote) return null;
  const hits = []; let i = -1;
  while ((i = text.indexOf(r.quote, i + 1)) >= 0) hits.push(i);
  if (!hits.length) return null;
  let candidates = hits.filter(at => (!r.prefix || text.slice(Math.max(0, at - r.prefix.length), at) === r.prefix) && (!r.suffix || text.slice(at + r.quote.length, at + r.quote.length + r.suffix.length) === r.suffix));
  if (!candidates.length && hits.length === 1) candidates = hits;
  if (candidates.length !== 1) return null; // Ambiguous/deleted text never resolves to unrelated prose.
  const from = candidates[0]; return { from, to: from + r.quote.length, text: r.quote };
}
function targetOf(item, from, to) {
  const t = item.kind === 'memo' ? { kind: 'memo', id: item.id } : { kind: 'note', s: item.s, stem: item.stem, id: item.id };
  if (from !== undefined) t.range = rangeOf(item.text || item.body || '', from, to);
  return t;
}
function resolve(t, notes, memos) {
  const source = t.kind === 'memo' ? memos.find(m => m.id === t.id) : notes.find(n => t.stem ? n.stem === t.stem && n.s === t.s : n.id === t.id && n.s === t.s);
  if (!source) return { target: t, missing: true, title: t.kind === 'memo' ? '削除されたメモ' : '見つからないノート', text: '' };
  const text = source.text ?? source.body ?? '', range = locate(text, t.range);
  return { target: t, source, title: source.title || safeTitle(text.split('\n')[0]) || source.id, text: range?.text || '', range, missingRange: !range, kind: t.kind === 'memo' ? 'memo' : source.s === 'p' ? 'paper' : 'note', date: source.t || L.parseTime(source.created)?.getTime() || 0 };
}
function normalizeLink(input, previous) {
  const seen = new Set(), targets = [];
  for (const t of input.targets || []) { if (!['note', 'memo'].includes(t.kind) || (t.kind === 'note' ? !t.stem && !t.id : !t.id)) throw Error('参照先が正しくありません'); const key = keyOf(t); if (!seen.has(key)) { seen.add(key); targets.push(JSON.parse(JSON.stringify(t))); } }
  const out = { ...previous, ...input, id: previous?.id || input.id, title: String(input.title || '').trim(), targets, order: input.order || 'newest' };
  if (!out.id || !out.title) throw Error('リンクの名前を入力してください');
  if (!['newest', 'oldest', 'kind', 'manual'].includes(out.order)) out.order = 'newest';
  if (input.manual || previous?.manual) { const keys = new Set(targets.map(keyOf)); out.manual = [...new Set([...(input.manual || previous.manual).filter(k => keys.has(k)), ...keys])]; }
  else delete out.manual;
  if (out.order === 'manual' && !out.manual) out.order = 'newest';
  return out;
}
function ordered(link, notes, memos, order = link.order) {
  const data = link.targets.map(t => resolve(t, notes, memos));
  const stable = (a,b) => keyOf(a.target).localeCompare(keyOf(b.target));
  const newest = (a,b) => (b.date || 0) - (a.date || 0) || stable(a,b);
  if (order === 'manual' && link.manual) return data.sort((a,b) => link.manual.indexOf(keyOf(a.target)) - link.manual.indexOf(keyOf(b.target)));
  if (order === 'kind') { const types = { note: 0, memo: 1, paper: 2 }; return data.sort((a,b) => (types[a.kind] ?? 3) - (types[b.kind] ?? 3) || newest(a,b)); }
  return data.sort(order === 'oldest' ? (a,b) => (a.date || 0) - (b.date || 0) || stable(a,b) : newest);
}
function move(link, orderedKeys, from, to) {
  const keys = [...orderedKeys]; if (from === to || from < 0 || to < 0 || from >= keys.length || to >= keys.length) return link;
  keys.splice(to, 0, keys.splice(from, 1)[0]); return { ...link, manual: keys, order: 'manual' };
}
function reference(item, postfix = false, space = 'd') {
  if (item.kind === 'memo') { const md = `[${safeTitle(item.title || item.text?.split('\n')[0]) || 'メモ'}](memo:${item.id})`; return postfix ? md + ':' : ':' + md; }
  if (item.noid) return `[${safeTitle(item.title || item.body?.split('\n')[0]) || 'ノート'}](${item.stem}.md)`;
  const id = item.id + (item.s !== space ? `(${item.s})` : ''); return postfix ? id + ':' : ':' + id;
}
function occurrences(text) {
  const blocked = L.codeRanges(text), out = [];
  for (const m of text.matchAll(/!?\[[^\]\n]*\]\((link:|memo:|reply:)([^)\s]+)\)/g)) if (!blocked.some(([a,b]) => m.index >= a && m.index < b)) out.push({ kind: m[1].slice(0,-1), id: m[2], from: m.index, to: m.index + m[0].length });
  return out;
}
function backlinks(id, sources, kind = 'link') { return sources.flatMap(source => occurrences(source.text || source.body || '').filter(x => x.kind === kind && x.id === id).map(hit => ({ source, ...hit }))); }
module.exports = { keyOf, rangeOf, locate, targetOf, resolve, normalizeLink, ordered, move, reference, occurrences, backlinks, safeTitle };
