const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../chat-relations');
const L = require('../lib');
const ms = [
  { id: 'a', topic: '認識論', ups: ['哲学', '哲学', '研究'], text: '対象の文章 (1)' },
  { id: 'b', topic: '認識論', ups: ['哲学'], text: '返信', replies: ['a'] },
  { id: 'c', topic: '倫理学', ups: ['哲学'], text: '別の返信', reply: 'a' },
  { id: 'd', topic: '哲学', text: '直接書いた文章' },
  { id: 'e', topic: '', ups: ['哲学'], text: '下位未設定' },
];
const opts = { lookup: id => ms.find(m => m.id === id), source: m => `C_2026-11-08.md#m-${m.id}` };
test('下位の件数はメモ単位。直接書いたものと下位未設定は「なし」、同じ上位は重複しない', () => {
  const rows = R.childCounts(ms, '哲学');
  assert.deepEqual(new Map(rows.map(r => [r.name, r.count])), new Map([['認識論', 2], ['倫理学', 1], ['', 2]]));
  assert.deepEqual(rows.map(r => r.count), [2, 2, 1]);
  assert.deepEqual(ms.filter(m => R.inTopic(m, '哲学') && ['認識論', '倫理学'].includes(R.childOf(m, '哲学'))).map(m => m.id), ['a', 'b', 'c']);
});
test('グラフは複数の上位と件数をメモから集計する。自己関係は描かない', () => {
  assert.deepEqual(R.topicRelations([...ms, { topic: '哲学', ups: ['哲学'] }]), [
    { parent: '哲学', child: '認識論', count: 2 }, { parent: '研究', child: '認識論', count: 1 }, { parent: '哲学', child: '倫理学', count: 1 },
  ]);
});
test('同じノートの返信先の末尾に番号を付け、既存番号を避けて複数の返信で共有する', () => {
  const body = R.noteText(ms.slice(0, 3), opts);
  assert.equal(body, '対象の文章 (1) (2)\n(2): 返信\n(2): 別の返信');
  assert.equal(L.selfTarget(body, '2', false), body.indexOf('(2)'));
  const md = L.bodyToMd(body, id => `${id}.md`);
  assert.equal((md.match(/\]\(#c2\)/g) || []).length, 2);
});
test('別のノートへの返信はノート化済みでも元メモへのリンクになる', () => {
  assert.equal(R.noteText([ms[1]], opts), '[↩ 対象の文章 (1)](C_2026-11-08.md#m-a) 返信');
});
test('メンションも同じノートなら番号、外なら元メモへのリンク。ノートへのリンクは保つ', () => {
  const mention = { id: 'f', text: '参照 [@文章](memo:a)、[@外](memo:c)、[:1a](20261108000000.md)' };
  assert.equal(R.noteText([ms[0], mention], opts), '対象の文章 (1) (2)\n参照 (2):、[@外](C_2026-11-08.md#m-c)、[:1a](20261108000000.md)');
});
test('複数行・時刻・逆向きの返信も正しい番号でつなぐ', () => {
  assert.equal(R.noteText([{ id: 'x', text: '先の文章\n続き', replies: ['y'] }, { id: 'y', text: '後の文章' }], { ...opts, stamp: () => '12:30' }), '12:30 (1): 先の文章\n続き\n12:30 後の文章 (1)');
});

test('生成したノートを保存・再読込しても返信番号と外部の元メモリンクを維持する', t => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { openVault } = require('../store');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkm-reply-note-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const v = openVault(dir);
  const body = R.noteText([ms[0], ms[1], { id: 'x', text: '外への返信', replies: ['c'] }], opts);
  const n = v.saveNote({ s: 'd', id: '1', body, created: '2026-11-08 12:00', keywords: [] });
  const read = openVault(dir).state().notes.find(n => n.id === '1' && n.s === 'd');
  assert.equal(read.body, body);
  const md = fs.readFileSync(path.join(dir, n.stem + '.md'), 'utf8');
  assert.match(md, /\]\(#c2\)/);
  assert.match(md, /C_2026-11-08\.md#m-c/);
});

test('専用グラフのノードはトピックだけ。本文・ノート化先・添付を含めない', () => {
  const data = R.topicGraphData([{ name: '哲学' }, { name: '空のトピック' }], ms.map(m => ({ ...m, noted: ['note1'], attachment: 'secret.jpg' })));
  assert.deepEqual(data.nodes.map(n => n.name).sort(), ['哲学', '空のトピック', '認識論', '倫理学', '研究'].sort());
  assert.ok(data.nodes.every(n => Object.keys(n).sort().join(',') === 'count,id,name'));
  assert.ok(data.nodes.every(n => n.id.startsWith('C:')));
  assert.equal(data.nodes.find(n => n.name === '哲学').count, 5);
  assert.equal(data.nodes.find(n => n.name === '空のトピック').count, 0);
  assert.equal(data.links.find(l => l.source === 'C:哲学' && l.target === 'C:認識論').count, 2);
  assert.ok(data.links.every(l => data.nodes.some(n => n.id === l.source) && data.nodes.some(n => n.id === l.target)));
  assert.ok(!JSON.stringify(data).includes('secret.jpg'));
});
test('専用グラフは記録トピック・複数の上位・孤立トピックも扱う', () => {
  const data = R.topicGraphData(['日記', '夢', '単独'], [{ topic: '夢', ups: ['日記', '研究', '日記'], text: '夢の本文' }]);
  assert.equal(data.nodes.length, 4);
  assert.deepEqual(data.links, [{ source: 'C:日記', target: 'C:夢', count: 1 }, { source: 'C:研究', target: 'C:夢', count: 1 }]);
  assert.deepEqual(R.topicGraphData([], []), { nodes: [], links: [] });
});
