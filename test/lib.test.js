const test = require('node:test');
const assert = require('node:assert');
const L = require('../lib');

const kinds = s => L.tokens(s).map(t => t.k === 'ref' ? `ref:${t.id}${t.n ? '(' + t.n + ')' : ''}` : `self:${t.n}${t.bare ? '' : ':'}`);

test('リンクの読み取り', () => {
  assert.deepStrictEqual(kinds('続き :1a1 へ'), ['ref:1a1']);
  assert.deepStrictEqual(kinds('7a: を見る'), ['ref:7a']);
  assert.deepStrictEqual(kinds('引用(1) あとで (1):説明 :(2)'), ['self:1', 'self:1:', 'self:2:']);
  assert.deepStrictEqual(kinds('1(1): と :1(1) と 7a(3)'), ['ref:1(1)', 'ref:1(1)', 'ref:7a(3)']);
  assert.deepStrictEqual(kinds('全角 ：2b と（3）'), ['ref:2b', 'self:3']);
  assert.deepStrictEqual(kinds('時刻 11:12 や f(1) や abc1: はリンクにしない'), []);
});

test('(1) の行き先', () => {
  const s = 'あいう(1)。\n(1):説明';
  assert.strictEqual(L.selfTarget(s, '1', true), s.indexOf('(1):'));
  assert.strictEqual(L.selfTarget(s, '1', false), s.indexOf('(1)'));
  assert.strictEqual(L.anchorPos(s, '1'), s.indexOf('(1)'));
});

test('Markdown との行き来', () => {
  const body = '最初(1)。:1a へ\n(1):説明 7a(2) と 3:\n普通の [リンク](http://x) は残す';
  const md = L.bodyToMd(body, id => id + '.md');
  assert.match(md, /<a id="c1"><\/a><span style="color:#c0392b">\(1\)<\/span>/);
  assert.match(md, /<a id="c1-"><\/a>\[\(1\):\]\(#c1\)/);
  assert.match(md, /\[:1a\]\(1a\.md\)/);
  assert.match(md, /\[7a\(2\)\]\(7a\.md#c2\)/);
  assert.match(md, /\[3:\]\(3\.md\)/);
  assert.strictEqual(L.mdToBody(md), body);
});

test('ID', () => {
  assert.deepStrictEqual(['2', '1a1', '1b', '10', '1a', '1'].sort(L.cmpId), ['1', '1a', '1a1', '1b', '2', '10']);
  assert.strictEqual(L.sibling('1a'), '1b'); assert.strictEqual(L.sibling('1z'), '1aa');
  assert.strictEqual(L.child('1'), '1a'); assert.strictEqual(L.child('1a'), '1a1');
  const has = x => ['1', '1a'].includes(x);
  assert.strictEqual(L.parentIn('1a1b', has), '1a'); assert.strictEqual(L.parentIn('1', has), null);
});

test('トピックIndex の行', () => {
  assert.deepStrictEqual(L.topicLine('キーワード 1').ids.map(x => x.id), ['1']);
  assert.strictEqual(L.topicLine('タイトル検索 7b1, 7b2').kw, 'タイトル検索');
  assert.strictEqual(L.topicLine('★ 7b-デジタルPKM').star, '7b-デジタルPKM');
  const m = L.mergeTopic({ d: 'PKM 1a 3\n★ 9-x', p: 'PKM 2\n紙だけ 5' });
  assert.deepStrictEqual(m.rows, [{ kw: 'PKM', d: ['1a', '3'], p: ['2'] }, { kw: '紙だけ', d: [], p: ['5'] }]);
  assert.deepStrictEqual(m.stars, ['9-x']);
});

test('トピックIndex に足す', () => {
  assert.strictEqual(L.addToTopic('', '英雄伝', '1a'), '英雄伝 1a');
  assert.strictEqual(L.addToTopic('英雄伝 1a\n漢字 1', '英雄伝', '2'), '英雄伝 1a 2\n漢字 1');
  assert.strictEqual(L.addToTopic('英雄伝 1a', '英雄伝', '1a'), '英雄伝 1a');
  assert.strictEqual(L.addToTopic('英雄伝 1a\n\n', '新しい', '3'), '英雄伝 1a\n新しい 3');
});

test('読み', () => {
  assert.strictEqual(L.toHira('カンジ'), 'かんじ');
  assert.strictEqual(L.kanaRow('がっこう'), 'か');
  assert.strictEqual(L.kanaRow('ぷるたるこす'), 'は');
  assert.strictEqual(L.kanaRow('PKM'), '英数・他');
  const rd = { 漢字: 'かんじ', 英雄伝: 'えいゆうでん' };
  assert.deepStrictEqual(['PKM', '漢字', '英雄伝'].sort(L.byReading(k => rd[k])), ['英雄伝', '漢字', 'PKM']);
});

test('トピックIndex から ID を外す', () => {
  assert.strictEqual(L.removeFromTopic('英雄伝 1 2\n漢字 1\n★ 3-x', ['1']), '英雄伝 2\n★ 3-x');
});
