const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../chat-topic-preferences');
test('所属トピックごとに複数の上位トピックを保持し、切り替えて復元する', () => {
  const d = { target: { topic: '哲学', ups: ['ヘーゲル', '政治哲学'] } };
  P.init(d);
  P.open(d, 'YuriiNote実装');
  assert.deepEqual(d.target.ups, []);
  P.selectUpper(d, ['プログラミング', 'PKM']);
  P.open(d, '哲学');
  assert.deepEqual(d.target.ups, ['ヘーゲル', '政治哲学']);
  P.open(d, 'YuriiNote実装');
  assert.deepEqual(d.target.ups, ['プログラミング', 'PKM']);
  assert.deepEqual(P.init(JSON.parse(JSON.stringify(d))).upperByTopic, d.upperByTopic);
});
test('全部表示は未選択として扱い、別トピックの上位設定を継承しない', () => {
  const d = P.init({ target: { topic: '哲学', ups: ['思想'] } });
  P.open(d, '*');
  assert.deepEqual(d.target, { topic: '', ups: [] });
  P.selectUpper(d, ['分類なし']);
  P.open(d, '哲学');
  assert.deepEqual(d.target.ups, ['思想']);
  P.open(d, '*');
  assert.deepEqual(d.target.ups, ['分類なし']);
});
test('自己参照・重複の除去と、トピック名変更・削除に設定が追従する', () => {
  const d = P.init({ target: { topic: 'A', ups: ['B', 'B', 'A'] }, upperByTopic: { A: ['B', 'B', 'A'], C: ['A', 'B'] } });
  assert.deepEqual(d.target.ups, ['B']);
  P.rename(d, 'B', '新B');
  assert.deepEqual(d.upperByTopic.A, ['新B']);
  assert.deepEqual(d.upperByTopic.C, ['A', '新B']);
  P.rename(d, 'A', '新A');
  assert.equal(d.target.topic, '新A');
  assert.deepEqual(d.upperByTopic.C, ['新A', '新B']);
  P.remove(d, '新B');
  assert.deepEqual(d.target.ups, []);
  assert.deepEqual(d.upperByTopic.C, ['新A']);
});

test('トピック削除で以前の上位設定がトピック未選択へ漏れない', () => {
  const d = P.init({ target: { topic: '哲学', ups: ['理論'] }, upperByTopic: { 哲学: ['理論'], '': ['メモ一般'] } });
  P.remove(d, '哲学');
  assert.deepEqual(d.target, { topic: '', ups: ['メモ一般'] });
  assert.deepEqual(d.upperByTopic[''], ['メモ一般']);
  assert.equal(Object.hasOwn(d.upperByTopic, '哲学'), false);
});
