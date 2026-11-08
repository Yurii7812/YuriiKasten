const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../folgezettel');
const notes = [
  { s: 'd', id: '1' }, { s: 'd', id: '1a' }, { s: 'd', id: '1a1' },
  { s: 'd', id: '1b3' }, { s: 'd', id: '10' }, { s: 'd', id: '10a' }, { s: 'd', id: '2' },
  { s: 'p', id: '1' }, { s: 'p', id: '1a' },
  { s: 'd', id: 'tmp1', stem: 'child', parentStem: 'root' },
  { s: 'd', id: '3', stem: 'root' },
];
test('folgezettel:1 は1と全子孫を含み10や2を除外する', () => {
  const xs = F.lineages(notes);
  for (const k of ['d:1', 'd:1a', 'd:1a1', 'd:1b3', 'p:1', 'p:1a']) assert.equal(F.contains(xs.get(k), '1'), true, k);
  for (const k of ['d:10', 'd:10a', 'd:2']) assert.equal(F.contains(xs.get(k), '1'), false, k);
});
test('デジタルと紙の系統を区別する', () => {
  const xs = F.lineages(notes);
  assert.equal(F.contains(xs.get('d:1a1'), 'd:1'), true);
  assert.equal(F.contains(xs.get('p:1a'), 'd:1'), false);
  assert.equal(F.contains(xs.get('p:1a'), 'p:1'), true);
  assert.equal(F.contains(xs.get('d:1'), 'p:1'), false);
});
test('IDなしの子も親の系統に含め、循環する異常データも終了する', () => {
  const xs = F.lineages(notes);
  assert.equal(F.contains(xs.get('d:tmp1'), '3'), true);
  const cyclic = F.lineages([{ s: 'd', id: 'a', stem: 'a', parentStem: 'b' }, { s: 'd', id: 'b', stem: 'b', parentStem: 'a' }]);
  assert.equal(cyclic.size, 2);
});
