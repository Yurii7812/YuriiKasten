// チャットメモの入力時に使う上位トピック設定。表示している所属トピックごとに保持する。
const clean = (list, owner = '') => [...new Set((Array.isArray(list) ? list : []).filter(x => typeof x === 'string' && x && x !== owner))];
function init(data = {}) {
  const saved = data.upperByTopic && typeof data.upperByTopic === 'object' && !Array.isArray(data.upperByTopic) ? data.upperByTopic : {};
  const prefs = Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, clean(v, k)]));
  const target = data.target || { topic: '', ups: [] }, current = target.topic || '';
  // 旧版の単一設定は、最後に入力していたトピックだけに移行する。別トピックには複製しない。
  if (!Object.prototype.hasOwnProperty.call(prefs, current)) prefs[current] = clean(target.ups, current);
  data.upperByTopic = prefs;
  data.target = { topic: current, ups: clean(prefs[current], current) };
  return data;
}
function open(data, name) {
  init(data);
  const previous = data.target.topic;
  data.upperByTopic[previous] = clean(data.target.ups, previous);
  const current = name === '*' ? '' : (name || '');
  data.target = { topic: current, ups: clean(data.upperByTopic[current], current) };
  return data.target;
}
function selectUpper(data, list) {
  init(data);
  const current = data.target.topic;
  data.target.ups = clean(list, current);
  data.upperByTopic[current] = [...data.target.ups];
  return data.target.ups;
}
function rename(data, from, to) {
  init(data);
  const prefs = {};
  for (const [k, list] of Object.entries(data.upperByTopic)) {
    const key = k === from ? to : k;
    prefs[key] = clean(list.map(x => x === from ? to : x), key);
  }
  data.upperByTopic = prefs;
  if (data.target.topic === from) data.target.topic = to;
  data.target.ups = clean(data.target.ups.map(x => x === from ? to : x), data.target.topic);
  data.upperByTopic[data.target.topic] = [...data.target.ups];
}
function remove(data, name) {
  init(data);
  delete data.upperByTopic[name];
  for (const [k, list] of Object.entries(data.upperByTopic)) data.upperByTopic[k] = clean(list.filter(x => x !== name), k);
  if (data.target.topic === name) data.target.topic = '';
  data.target.ups = clean(data.target.ups.filter(x => x !== name), data.target.topic);
  data.upperByTopic[data.target.topic] = [...data.target.ups];
}
module.exports = { clean, init, open, selectUpper, rename, remove };
