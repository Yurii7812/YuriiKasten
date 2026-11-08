// Folgezettel系統: 文字列の前方一致ではなく、実在するノートの親子関係をたどる。
const L = require('./lib');
function lineages(notes) {
  const keys = new Set(notes.map(n => n.s + ':' + n.id));
  const stems = new Map(notes.filter(n => n.stem).map(n => [n.stem, n.s + ':' + n.id]));
  const parents = new Map();
  for (const n of notes) {
    const key = n.s + ':' + n.id;
    const parent = n.parentStem ? stems.get(n.parentStem) : L.parentIn(n.id, id => keys.has(n.s + ':' + id));
    const parentKey = n.parentStem ? parent : parent && n.s + ':' + parent;
    if (parentKey && parentKey !== key && keys.has(parentKey)) parents.set(key, parentKey);
  }
  const result = new Map(), active = new Set();
  const of = key => {
    if (result.has(key)) return result.get(key);
    if (active.has(key)) return [key];
    active.add(key);
    const p = parents.get(key), chain = [key, ...(p ? of(p) : [])];
    active.delete(key); result.set(key, chain); return chain;
  };
  for (const key of keys) of(key);
  return result;
}
function contains(lineage, selector) {
  const q = String(selector || '').trim().toLowerCase();
  const m = /^(?:(d|p):)?(.+)$/.exec(q);
  if (!m || !m[2]) return false;
  return (lineage || []).some(key => {
    const ix = key.indexOf(':');
    return ix > 0 && (!m[1] || key.slice(0, ix).toLowerCase() === m[1]) && key.slice(ix + 1).toLowerCase() === m[2];
  });
}
module.exports = { lineages, contains };
