// 「ノート化」されたチャットメモの参照形式。本文の正本は常に C_チャット.json。
// 通常ノートと同じ Folgezettel / Index / トピックIndex を使えるが、本文は複製保存しない。
const idsOf = data => [...new Set((data && Array.isArray(data.memoIds) ? data.memoIds : []).filter(id => typeof id === 'string' && id))];
const entries = (data, chat) => {
  const by = new Map(((chat && chat.messages) || []).map(m => [m.id, m]));
  return idsOf(data).map(id => ({ id, memo: by.get(id) || null }));
};
const pad = n => String(n).padStart(2, '0');
const at = t => {
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dateOf = t => at(t).slice(0, 10);
const source = m => `C_${dateOf(m.t)}.md#m-${m.id}`;
const body = (data, chat) => entries(data, chat).map(({ id, memo: m }) =>
  m ? `${at(m.t)} [${m.topic || '未所属'}]\n${m.text || ''}` : `（元のチャットメモ ${id} は見つかりません）`
).join('\n\n');
const markdown = (data, chat) => entries(data, chat).map(({ id, memo: m }) =>
  m ? `[元のチャットメモ ${at(m.t)}](${source(m)})${m.topic ? ` ［${m.topic}］` : ''}\n\n${m.text || ''}` :
    `（元のチャットメモ ${id} は見つかりません）`
).join('\n\n---\n\n');
module.exports = { idsOf, entries, at, source, body, markdown };
