const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const C = require('../capture'), { openVault } = require('../store');

// メモは PC とスマホで共有する: PC のメモをスマホへ渡す・スマホで直した／消したものを PC に反映する
test('PC のメモをスマホへ・スマホで直した／消したものを PC へ', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkm-share-')), v = openVault(dir);
  v.saveDoc('C_チャット', { topics: [{ name: 'アイデア', type: 'bubble', stamp: true, entry: null }], messages: [
    { id: 'a1', topic: 'アイデア', t: 1000, text: 'PCで書いた' }, { id: 'a2', topic: '', t: 2000, text: '消されるメモ' }, { id: 'p1', topic: '', t: 3000, text: 'スマホ由来', src: 'phone:x' }], converted: {}, trash: [], noted: {} });
  const out = C.pcMemos(v);
  assert.deepStrictEqual(out.memos.map(m => m.id), ['a1', 'a2']);   // スマホで書いたものは、返さない
  const data = { entries: [{ id: 'pc-a1', pcId: 'a1', created: 1000, topic: 'アイデア', text: 'スマホで直した', edited: 9000, images: [] }], images: {}, scans: { index: [], files: {} }, topicModes: {}, pcDeleted: ['a2'] };
  const r = C.importCapture(v, data), chat = v.state().docs['C_チャット'];
  assert.deepStrictEqual([r.sum.updated, r.sum.removed], [1, 1]);
  assert.strictEqual(chat.messages.find(m => m.id === 'a1').text, 'スマホで直した');
  assert.ok(!chat.messages.some(m => m.id === 'a2')); assert.ok(chat.trash.some(m => m.id === 'a2'));
  // PC の方が新しい直しは、スマホの古い内容で上書きしない
  chat.messages.find(m => m.id === 'a1').edited = 20000; v.saveDoc('C_チャット', chat);
  const r2 = C.importCapture(v, { ...data, pcDeleted: [] });
  assert.strictEqual(r2.sum.updated, 0); assert.strictEqual(v.state().docs['C_チャット'].messages.find(m => m.id === 'a1').text, 'スマホで直した');
});

test('PC で消した、スマホ由来のメモは、スマホへ「消して」と伝える', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkm-rm-')), v = openVault(dir);
  C.importCapture(v, { entries: [{ id: 'e1', created: 1000, topic: '', text: 'スマホで書いた', images: [], edited: 0 }], images: {}, scans: { index: [], files: {} }, topicModes: {}, pcDeleted: [] });
  assert.deepStrictEqual(C.pcMemos(v).removed, []);
  const chat = v.state().docs['C_チャット']; chat.messages = []; v.saveDoc('C_チャット', chat);   // PC で消した
  assert.deepStrictEqual(C.pcMemos(v).removed, ['e1']);
});
