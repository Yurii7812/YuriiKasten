const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib.js');

test('topic index semantic reference symbols retain their meaning', () => {
  const t = { entry: { s: 'p', id: '1b' }, text: '↑ 古代ギリシャ 1a\n★ 競技規則 1b1\n● 調査のまとめ 1b2\n裸体と身体反応 1' };
  const m = L.mergeTopic(t);
  assert.deepEqual(m.refs.map(r => [r.mark, r.label, r.id, r.s]), [
    ['↑', '古代ギリシャ', '1a', 'p'],
    ['★', '競技規則', '1b1', 'p'],
    ['●', '調査のまとめ', '1b2', 'p']
  ]);
  assert.equal(m.rows[0].kw, '裸体と身体反応');
  assert.deepEqual(m.rows[0].p, ['1']);
});

test('explicit paper/digital scope is preserved for marked references', () => {
  const t = { entry: { s: 'd', id: '1' }, text: '↑ 上位 2(p)\n● 進捗 3(d)' };
  assert.deepEqual(L.mergeTopic(t).refs.map(r => [r.mark, r.s, r.id]), [['↑','p','2'], ['●','d','3']]);
});

test('legacy star notation remains compatible', () => {
  const m = L.mergeTopic({ entry: { s: 'd', id: '1' }, text: '+ 競技 1a\n★ 文献 1b' });
  assert.deepEqual(m.refs.map(r => r.mark), ['★', '★']);
});

test('same target can have different semantic markers', () => {
  const m = L.mergeTopic({ entry: { s: 'p', id: '1' }, text: '↑ 概念 1a\n● 概念 1a' });
  assert.deepEqual(m.refs.map(r => r.mark), ['↑', '●']);
});

test('ASCII keyboard shortcuts ^ + = map to ↑ ★ ●', () => {
  const m = L.mergeTopic({ entry: { s: 'p', id: '1' }, text: '^ 上位 1a\n+ 別索引 1b\n= まとめ 1c' });
  assert.deepEqual(m.refs.map(r => r.mark), ['↑', '★', '●']);
});
