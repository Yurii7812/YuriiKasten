// Read-only projections. Never use a projection as a persistence payload.
const L = require('./lib');
const normalize = value => ['p', 'd'].includes(value) ? value : 'all';
const includes = (scope, space = 'd') => normalize(scope) === 'all' || scope === space;
function index(notes, pending = [], readings = {}, scope = 'all') {
  const rows = new Map();
  const add = (kw, s, id) => {
    if (!includes(scope, s)) return;
    if (!rows.has(kw)) rows.set(kw, { d: [], p: [] });
    if (!rows.get(kw)[s].includes(id)) rows.get(kw)[s].push(id);
  };
  for (const n of notes) for (const kw of n.keywords || []) add(kw, n.s, n.id);
  for (const e of pending) for (const id of e.ids || []) add(e.kw, 'p', id);
  for (const r of rows.values()) { r.d.sort(L.cmpId); r.p.sort(L.cmpId); }
  const reading = kw => readings[kw] || pending.find(e => e.kw === kw)?.reading || kw;
  return [...rows].sort((a, b) => L.byReading(reading)(a[0], b[0]));
}
function visibleTopic(t, scope, topics = [], seen = new Set()) {
  if (!t) return includes(scope, 'd');
  if (includes(scope, L.defOf(t))) return true;
  if (seen.has(t)) return false;
  seen.add(t);
  const m = L.mergeTopic(t);
  return m.rows.some(r => (includes(scope,'p') && r.p.length) || (includes(scope,'d') && r.d.length)) ||
    m.refs.some(r => includes(scope,r.s)) ||
    m.stars.some(name => visibleTopic(topics.find(x => x.name === name),scope,topics,seen));
}
function topic(t, scope, topics = []) {
  const m = L.mergeTopic(t);
  return {
    ...m,
    rows: m.rows.map(r => ({ ...r, d: includes(scope, 'd') ? [...r.d] : [], p: includes(scope, 'p') ? [...r.p] : [] })).filter(r => r.d.length || r.p.length),
    refs: m.refs.filter(r => includes(scope, r.s)),
    stars: m.stars.filter(name => { const target = topics.find(x => x.name === name); return target ? visibleTopic(target, scope, topics) : includes(scope, L.defOf(t)); }),
    chats: includes(scope, 'd') ? m.chats : []
  };
}
function topicInsertion(item, space = 'd') {
  if (!item || item.kind === 'memo' || item.noid || !L.isId(String(item.id || ''))) return '';
  // A numeric title must remain a keyword, not be parsed as a second ID.
  let label = String(item.title || item.text || item.id).split('\n')[0].trim().replace(/\s+/g, ' ');
  if (!label) label = 'Note';
  if (L.parseIdTok(label) || /^[★☆+＋↑●^=@＠]/.test(label)) label = '「' + label + '」';
  return label + ' ' + item.id + (item.s && item.s !== space ? '(' + item.s + ')' : '');
}
module.exports = { normalize, includes, index, topic, visibleTopic, topicInsertion };
