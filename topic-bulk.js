const members = m => [...new Set([m.topic, ...(m.ups || [])].filter(Boolean))];
function aggregate(messages) {
  const counts = new Map(); for (const m of messages) for (const name of members(m)) counts.set(name, (counts.get(name) || 0) + 1);
  return counts;
}
function assign(messages, selected, mode = 'add', primary = null) {
  if (!['add', 'replace'].includes(mode)) throw Error('Unknown topic assignment mode');
  const chosen = [...new Set(selected.filter(Boolean))];
  return messages.map(m => {
    const names = mode === 'add' ? [...new Set([...members(m), ...chosen, ...(primary ? [primary] : [])])] : [...new Set([...chosen, ...(primary ? [primary] : [])])];
    const topic = primary !== null ? primary : names.includes(m.topic) ? m.topic : names[0] || '';
    return { ...m, topic, ups: names.filter(n => n !== topic), edited: Date.now() };
  });
}
module.exports = { members, aggregate, assign };
