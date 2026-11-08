// メモごとの関係から集計する。トピック自体に固定の親は持たせない。
const L = require('./lib');
const repliesOf = m => [...new Set(m.replies || (m.reply ? [m.reply] : []))];
const inTopic = (m, name) => name === '*' || m.topic === name || (name !== '' && (m.ups || []).includes(name));
const childOf = (m, name) => m.topic && m.topic !== name ? m.topic : '';
function childCounts(messages, name) {
  const counts = new Map();
  for (const m of messages) if (inTopic(m, name)) { const k = childOf(m, name); counts.set(k, (counts.get(k) || 0) + 1); }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'));
}
function topicRelations(messages) {
  const rows = new Map();
  for (const m of messages) if (m.topic) for (const parent of new Set(m.ups || [])) {
    if (!parent || parent === m.topic) continue;
    const key = JSON.stringify([parent, m.topic]);
    if (!rows.has(key)) rows.set(key, { parent, child: m.topic, count: 0 });
    rows.get(key).count++;
  }
  return [...rows.values()];
}
// 固定のトピック一覧に加え、メモで使われる記録・上位トピックも含める。
function topicGraphData(topics, messages) {
  const names = new Set(topics.map(t => typeof t === 'string' ? t : t.name).filter(Boolean));
  const counts = new Map();
  for (const m of messages) for (const name of new Set([m.topic, ...(m.ups || [])])) if (name) {
    names.add(name); counts.set(name, (counts.get(name) || 0) + 1);
  }
  return {
    nodes: [...names].map(name => ({ id: 'C:' + name, name, count: counts.get(name) || 0 })),
    links: topicRelations(messages).map(r => ({ source: 'C:' + r.parent, target: 'C:' + r.child, count: r.count })),
  };
}
// 選んだメモだけを同じノートとみなし、外の参照は元のチャットメモへ。
function noteText(messages, { lookup, source, stamp = () => '' }) {
  const selected = new Map(messages.map(m => [m.id, m])), used = new Set();
  for (const m of messages) for (const t of L.tokens(m.text || '')) if (t.n) used.add(Number(t.n));
  const numbers = new Map(); let next = 1;
  const number = id => { if (!numbers.has(id)) { while (used.has(next)) next++; numbers.set(id, next); used.add(next++); } return numbers.get(id); };
  const mention = /\[@([^\]]*)\]\(memo:([^)\s]+)\)/g;
  const texts = messages.map(m => {
    const prefix = repliesOf(m).filter(id => id !== m.id).map(id => {
      if (selected.has(id)) return `(${number(id)}):`;
      const target = lookup(id);
      return target ? `[↩ ${String(target.text || '').replace(/[\[\]\\\n]/g, ' ').slice(0, 30)}](${source(target)})` : '↩（元メモが見つかりません）';
    });
    const text = (m.text || '').replace(mention, (all, label, id) => {
      if (selected.has(id)) return `(${number(id)}):`;
      const target = lookup(id);
      return target ? `[@${label}](${source(target)})` : all;
    });
    return [stamp(m), ...prefix, text].filter(Boolean).join(' ');
  });
  return texts.map((text, i) => text + (numbers.has(messages[i].id) ? ` (${numbers.get(messages[i].id)})` : '')).join('\n');
}
module.exports = { repliesOf, inTopic, childOf, childCounts, topicRelations, topicGraphData, noteText };
