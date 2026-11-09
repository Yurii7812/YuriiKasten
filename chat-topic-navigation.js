// PCとAPKで共有するトピックの意味。フォルダ階層ではなく、メモの所属・上位の組み合わせ。
const uniq = xs => [...new Set((xs || []).filter(x => typeof x === 'string' && x))];
const eligible = (m, current, kind, choice) => {
  const ups = m.ups || [];
  if (kind === 'upper') return m.topic === current && ups.includes(choice);
  if (kind === 'lower') return m.topic === choice && ups.includes(current);
  return m.topic === current || (current !== '' && ups.includes(current));
};
const candidates = (messages, current) => {
  const upper = new Map(), lower = new Map();
  for (const m of messages) {
    if (m.topic === current) for (const u of uniq(m.ups).filter(u => u !== current)) upper.set(u, (upper.get(u) || 0) + 1);
    if (current && m.topic && m.topic !== current && (m.ups || []).includes(current)) lower.set(m.topic, (lower.get(m.topic) || 0) + 1);
  }
  const ranked = map => [...map].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0],'ja')).map(([name,count])=>({name,count}));
  return {upper:ranked(upper),lower:ranked(lower)};
};
// 複数選択はOR。上位と下位が同時に指定されるときは、どちらかの条件を満たすメモ。
function filter(messages, current, selectedUpper = [], selectedLower = []) {
  const upper = uniq(selectedUpper), lower = uniq(selectedLower);
  if (!upper.length && !lower.length) return messages.filter(m => eligible(m,current));
  return messages.filter(m => upper.some(u=>eligible(m,current,'upper',u)) || lower.some(l=>eligible(m,current,'lower',l)));
}
function destination(selectedUpper = [],selectedLower = [],last = null) {
  const all=uniq([...selectedUpper,...selectedLower]);
  if (!all.length) return null;
  return last && all.includes(last) ? last : (all.length===1 ? all[0] : null);
}
module.exports = { uniq, eligible, candidates, filter, destination };
