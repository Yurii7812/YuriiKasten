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

test('日記の日付・節・階層', () => {
  assert.strictEqual(L.dayOf('2026-11-07 14:20'), '2026-11-07');
  assert.strictEqual(L.dayOf('2026-11-07 03:30'), '2026-11-06'); // 5時までは前の日
  assert.strictEqual(L.todayStr(new Date(2026, 10, 7, 4, 59)), '2026-11-06');
  assert.strictEqual(L.todayStr(new Date(2026, 10, 7, 5, 0)), '2026-11-07');
  assert.strictEqual(L.weekday('2026-11-07'), '土');
  let b = '朝の話';
  b = L.addToSection(b, '今日のノート', '- :1');
  b = L.addToSection(b, '今日のノート', '- :2');
  b = L.addToSection(b, '紙の日記', '![](P_2026-11-07.jpg)');
  b = L.addToSection(b, '今日のノート', '- :3'); // 「紙の日記」より前の節に入る
  b = L.addToSection(b, '紙の日記', '![](P_2026-11-07_2.jpg)');
  assert.strictEqual(L.addToSection(b, '今日のノート', '- :1'), b); // 二重に入れない
  assert.strictEqual(b, '朝の話\n\n## 今日のノート\n\n- :1\n- :2\n- :3\n\n## 紙の日記\n\n![](P_2026-11-07.jpg)\n![](P_2026-11-07_2.jpg)');
  assert.deepStrictEqual(L.diaryTree(['2026-11-07', '2026-11-05', '2026-10-30']), [{ label: '2026-11', days: ['2026-11-07', '2026-11-05'] }, { label: '2026-10', days: ['2026-10-30'] }]);
  assert.deepStrictEqual(L.diaryTree(['2027-01-02', '2026-12-31']).map(y => y.label), ['2027', '2026']);
});

test('IDなしのノート・種類ごとの本文', () => {
  assert.ok(L.isNoid('u20261107-143521') && L.isNoid('u20261107-143521-2'));
  assert.ok(!L.isNoid('1a') && !L.isNoid('2026') && !L.isId('u20261107-143521')); // ID の形と取り違えない
  assert.strictEqual(L.noidStem(new Date(2026, 10, 7, 14, 35, 21)), '20261107143521');
  assert.ok(L.isNoid('20261107143521') && L.isStem('20261107143521') && !L.isStem('1a'));
  const rp = { title: '論語', cast: [{ id: 'a', name: '孔子' }, { id: 'b', name: '私' }], messages: [{ role: 'a', text: '学ぶとは' }, { role: 'b', text: '復習', quote: { kind: 'note', id: '1' } }] };
  assert.strictEqual(L.deriveBody('rp', rp), '# 論語\n\n**孔子**: 学ぶとは\n\n**私**: > 引用: ノート 1\n復習');
  const cv = { title: '案', nodes: [{ type: 'text', x: 5, y: 9, text: '下' }, { type: 'text', x: 0, y: 0, text: '上' }, { type: 'note', s: 'd', nid: '1a', x: 0, y: 5 }, { type: 'image', file: 'a.png', x: 0, y: 1 }] };
  assert.strictEqual(L.deriveBody('canvas', cv), '# 案\n\n上\n\n:1a\n\n下');
  assert.strictEqual(L.deriveBody('text', null), '');
});

test('エクスポート: 番号の範囲・枝、リンクは選んだ中だけ生かす', () => {
  const L = require('../lib');
  const ids = ['1', '1a', '1a1', '1a2', '1b', '2'].sort(L.cmpId);
  assert.deepStrictEqual(L.fzRange(ids, '1a', '1a2'), ['1a', '1a1', '1a2']);
  assert.deepStrictEqual(L.fzSubtree(ids, '1a'), ['1a', '1a1', '1a2']);
  assert.deepStrictEqual(L.fzSubtree(ids, '1'), ['1', '1a', '1a1', '1a2', '1b']);
  const md = L.exportMd([{ s: 'd', id: '1', title: 'あ', body: '続き :1a と :2' }, { s: 'd', id: '1a', title: 'い', body: '本文' }]);
  assert.match(md, /## 1 あ/); assert.match(md, /:1a と 2/); assert.match(md, /## 1a い/);
});

test('YAML（---）: 書いて読む。手で書いた形も読める', () => {
  const y = L.fmDump({ folgezettel: '1a', source: 'digital', created: '2026-11-08 07:35:11', keywords: ['a', 'b'], title: '' });
  assert.strictEqual(y, '---\nfolgezettel: "1a"\nsource: "digital"\ncreated: "2026-11-08 07:35:11"\nkeywords: ["a","b"]\n---\n');
  const r = L.fmParse(y + '本文');
  assert.deepStrictEqual(r.meta, { folgezettel: '1a', source: 'digital', created: '2026-11-08 07:35:11', keywords: ['a', 'b'] }); assert.strictEqual(r.rest, '本文');
  assert.deepStrictEqual(L.fmParse('---\nfolgezettel: 1a\nkeywords: [x, y]\n---\n').meta, { folgezettel: '1a', keywords: ['x', 'y'] });
  assert.strictEqual(L.fmParse('本文だけ').meta, null);
  assert.strictEqual(L.now(new Date(2026, 10, 8, 7, 35, 11)), '2026-11-08 07:35:11');
});

test('リンク: :1a,1b で複数。: 1a（空白）や コードの中はリンクにしない', () => {
  const ids = t => L.tokens(t).filter(x => x.k === 'ref').map(x => x.id);
  assert.deepStrictEqual(ids(':1a,1b、2 と :3'), ['1a', '1b', '2', '3']);
  assert.deepStrictEqual(ids('これは : 1a で、リンクではない'), []);
  assert.deepStrictEqual(ids('`:3` と ``:4`` と :5'), ['5']);
  assert.deepStrictEqual(ids('前 :1\n```\n:4 :5\n```\n後 :6'), ['1', '6']);
  assert.deepStrictEqual(ids('~~~\n:7\n~~~'), []);
  assert.ok(!L.bodyToMd('`:3`', x => x + '.md').includes('](')); // Markdown にしてもリンクにならない
});
test('トピックIndex: +hoge 1 は 1 がリンクの星。+GUI だけなら案内', () => {
  const r = L.topicLine('+hoge 1');
  assert.deepStrictEqual(r.ref, { label: 'hoge', id: '1', from: 6, to: 7 }); assert.strictEqual(r.star, '');
  const m = L.mergeTopic({ d: '+hoge 1\n+GUI\nPKM 1', p: '★ 紙 2a' });
  assert.deepStrictEqual(m.refs, [{ s: 'd', label: 'hoge', id: '1' }, { s: 'p', label: '紙', id: '2a' }]);
  assert.deepStrictEqual(m.stars, ['GUI']); assert.strictEqual(m.rows.length, 1);
});
