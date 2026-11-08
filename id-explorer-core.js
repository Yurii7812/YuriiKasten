// ID付与用の知識探索。検索対象はノート本文、グローバルIndex、トピックIndex。
// トピックIndexは知識の入口であり、Folgezettelの親子関係ではない。
const L = require('./lib');
const key = n => n.s + ':' + n.id;
const isAssigned = n => n && !n.noid && L.isId(n.id);
const textMatches = (text, query) => {
  const all = String(text || '').toLocaleLowerCase();
  return String(query || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every(w => all.includes(w));
};
function keywords(notes, readings = {}, paperEntries = []) {
  const rows = new Map();
  for (const n of notes) {
    if (!isAssigned(n)) continue;
    for (const kw of n.keywords || []) {
      if (!rows.has(kw)) rows.set(kw, { name: kw, reading: readings[kw] || '', notes: [], pending: [] });
      if (!rows.get(kw).notes.some(x => key(x) === key(n))) rows.get(kw).notes.push(n);
    }
  }
  for (const entry of paperEntries) {
    if (!entry || !entry.kw) continue;
    const kw = entry.kw;
    if (!rows.has(kw)) rows.set(kw, { name: kw, reading: readings[kw] || entry.reading || '', notes: [], pending: [] });
    const r = rows.get(kw);
    if (!r.reading) r.reading = entry.reading || '';
    for (const raw of entry.ids || []) {
      const id = L.splitAnchor(raw).id;
      if (!r.notes.some(n => n.s === 'p' && n.id === id) && !r.pending.includes(raw)) r.pending.push(raw);
    }
  }
  return [...rows.values()].sort((a, b) => L.byReading(k => readings[k] || (rows.get(k) || {}).reading)(a.name, b.name));
}
function matchesTopic(t, query) {
  const merged = L.mergeTopic(t);
  return textMatches([t.name, t.keyword || '', L.topicText(t), ...merged.rows.map(x => x.kw)].join('\n'), query);
}
function search(notes, topics, readings, query, paperEntries = []) {
  const kw = keywords(notes, readings, paperEntries).filter(k => textMatches([k.name, k.reading].join(' '), query));
  const ti = topics.filter(t => matchesTopic(t, query)).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const nn = notes.filter(n => textMatches([
    isAssigned(n) ? n.id : '', n.title || '', n.body || '',
    ...(n.keywords || []), ...(n.keywords || []).map(k => readings[k] || '')
  ].join('\n'), query)).sort((a, b) => (b.updated || b.created || '').localeCompare(a.updated || a.created || ''));
  return { keywords: kw, topics: ti, notes: nn };
}
function topicEntries(topic, notes) {
  const by = new Map(notes.map(n => [key(n), n])), merged = L.mergeTopic(topic);
  return {
    entry: topic.entry ? by.get(topic.entry.s + ':' + topic.entry.id) || null : null,
    rows: merged.rows.map(r => ({ keyword: r.kw, notes: ['d', 'p'].flatMap(s =>
      r[s].map(raw => { const ref = L.splitAnchor(raw); return { s, id: ref.id, anchor: ref.n || '', note: by.get(s + ':' + ref.id) || null }; })
    ) })),
    stars: merged.stars, refs: merged.refs
  };
}
// 通常のIndexと同じ遷移順: IDがトピックIndexの入口なら、先にその索引を開く。
// そのトピックIndexの中から同じIDを押したときだけ、入口ノートを開く。
function followIndexReference(notes, topics, space, id, fromTopicName = '') {
  const t = topics.find(t => t.entry && t.entry.s === space && t.entry.id === id);
  if (t && t.name !== fromTopicName) return { kind: 'topic', key: t.name };
  const note = notes.find(n => n.s === space && n.id === id);
  return note ? { kind: 'note', key: space + ':' + id } : { kind: 'missing', key: space + ':' + id };
}
function noteRelations(note, notes, topics) {
  const has = id => notes.some(n => n.s === note.s && !n.noid && n.id === id);
  const parentId = !note.noid ? L.parentIn(note.id, has) : null;
  const parent = note.parentStem ? notes.find(n => n.stem === note.parentStem) || null
    : parentId ? notes.find(n => n.s === note.s && n.id === parentId) || null : null;
  const children = notes.filter(n => n !== note && n.s === note.s &&
    ((n.parentStem && n.parentStem === note.stem) ||
    (!note.noid && !n.noid && L.parentIn(n.id, has) === note.id)));
  const indexed = topics.filter(t => L.mergeTopic(t).rows.some(r =>
    r[note.s].some(raw => L.splitAnchor(raw).id === note.id)));
  const owned = topics.filter(t => t.entry && t.entry.s === note.s && t.entry.id === note.id);
  const backlinks = isAssigned(note) ? notes.filter(n => n !== note &&
    L.tokens(n.body || '').some(t => t.k === 'ref' && t.id === note.id && (t.sp || n.s) === note.s)) : [];
  return { parent, children, indexed, owned, backlinks };
}
function nextRoot(notes, space = 'd') {
  const roots = notes.filter(n => n.s === space && !n.noid && /^\d+$/.test(n.id)).map(n => +n.id);
  let id = String((roots.length ? Math.max(...roots) : 0) + 1);
  while (notes.some(n => n.s === space && n.id === id)) id = L.sibling(id);
  return id;
}
function suggest(notes, base, mode, space = 'd') {
  if (!base || base.s !== space || !isAssigned(base)) return null;
  if (mode !== 'child' && mode !== 'sibling') return null;
  let id = mode === 'child' ? L.child(base.id) : L.sibling(base.id);
  while (notes.some(n => n.s === space && n.id === id)) id = L.sibling(id);
  return id;
}
function available(notes, id, current = null, space = 'd') {
  if (!L.isId(id) || /^\d{8,}$/.test(id)) return false;
  return !notes.some(n => n.s === space && n.id === id && (!current || key(n) !== key(current)));
}
module.exports = { key, isAssigned, textMatches, keywords, matchesTopic, search, topicEntries, followIndexReference, noteRelations, nextRoot, suggest, available };
