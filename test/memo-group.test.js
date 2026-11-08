const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../memo-group.js');
const chat = { messages: [
  { id: 'a', t: new Date(2026, 10, 9, 10, 19).getTime(), topic: '哲学', text: '元の文章' },
  { id: 'b', t: new Date(2026, 10, 9, 10, 28).getTime(), topic: '認識論', text: '別の文章' }
] };
test('1件でも複数件でも同じノート化形式で扱う', () => {
  assert.deepEqual(M.idsOf({memoIds:['a','a','b']}), ['a','b']);
  assert.equal(M.entries({memoIds:['a']},chat).length, 1);
  assert.deepEqual(M.entries({memoIds:['a','b']},chat).map(x=>x.id),['a','b']);
});
test('表示内容は毎回チャットから読むため、元メモの編集が反映される', () => {
  const data={memoIds:['a']};
  assert.match(M.body(data,chat),/元の文章/);
  chat.messages[0].text='編集後の文章';
  assert.match(M.body(data,chat),/編集後の文章/);
  assert.doesNotMatch(JSON.stringify(data),/編集後の文章/);
});
test('日付・元メモへのリンクをMarkdownへ投影し、削除された元メモは欠損表示', () => {
  assert.match(M.markdown({memoIds:['b']},chat),/C_2026-11-09\.md#m-b/);
  assert.match(M.body({memoIds:['gone']},chat),/見つかりません/);
});
