const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { openVault } = require('../store');

test('保存フォルダ: 書き出しと読み直し', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkm-'));
  // 前の版の形式（直下）も移す
  fs.writeFileSync(path.join(dir, '5.md'), '---\ndate: 2026 11 07\nkeywords: 古い\n---\n昔の本文\n');
  let v = openVault(dir);
  v.saveNote({ s: 'd', id: '1', created: '2026-10-10 11:12', keywords: ['PKM'], body: '最初(1)\n(1):説明 :1a' });
  v.saveNote({ s: 'd', id: '1a', created: '2026-10-10 11:13', keywords: [], body: '1(1) を引用' });
  v.saveImage('p', '1', Buffer.from([0xff, 0xd8, 0xff]));
  v.saveNote({ s: 'p', id: '1', keywords: ['PKM', '紙'], body: '紙の文字 :1a' });
  v.saveTopic({ name: '1-PKM', entry: { s: 'd', id: '1' }, d: 'PKM 1 1a\n★ 2-x', p: 'PKM 1' });

  const r = p => fs.readFileSync(path.join(dir, p), 'utf8');
  const d1 = r('digital/1.md');
  assert.match(d1, /<p style="color:#888;font-size:.9em">2026-10-10 11:12　索引 <a href="..\/Index.md#k-[a-z0-9]+">PKM<\/a><\/p>/);
  assert.match(d1, /分岐 <a href="1a.md">1a<\/a>/);
  assert.match(d1, /<a href="..\/topic\/1-PKM.md">トピックIndex 1-PKM<\/a>/);
  assert.match(r('digital/1a.md'), /\[1\(1\)\]\(1\.md#c1\)/);
  assert.match(r('digital/1a.md'), /<a href="1.md">← 1<\/a>/);
  assert.match(r('paper/1.md'), /!\[1\]\(1\.jpg\)/);
  assert.doesNotMatch(r('paper/1.md'), /\d{4}-\d\d-\d\d \d\d:\d\d/); // 紙に日付は無い
  assert.match(r('Index.md'), /\| <a id="k-[a-z0-9]+"><\/a>PKM \| <a href="digital\/1\.md">1<\/a> <a href="paper\/1\.md">紙1<\/a> \|/);
  // 読みで並べ、行ごとに分ける
  v.setReading('紙', 'かみ'); v.setReading('PKM', 'ぴーけーえむ');
  assert.match(r('Index.md'), /## <a id="row0"><\/a>か[\s\S]*紙 <small style="color:#888">かみ<\/small>[\s\S]*## <a id="row1"><\/a>は[\s\S]*PKM/);
  assert.doesNotMatch(r('Index.md'), /トピックIndex|1-PKM/); // Index にトピックIndexは出さない
  assert.match(r('topic/1-PKM.md'), /入口 <a href="..\/digital\/1.md">1<\/a>/);
  assert.match(r('topic/1-PKM.md'), /\| PKM \| \[1\]\(\.\.\/digital\/1\.md\) \[1a\]\(\.\.\/digital\/1a\.md\) \[紙1\]\(\.\.\/paper\/1\.md\) \|/);
  assert.match(r('デジタル.md'), /\[1\]\(digital\/1\.md\)　\[5\]\(digital\/5\.md\)/); // 先頭の ID だけ
  assert.doesNotMatch(r('デジタル.md'), /1a/);

  v = openVault(dir); // 読み直し
  const st = v.state(), n = st.notes.find(x => x.s === 'd' && x.id === '1');
  assert.strictEqual(n.body, '最初(1)\n(1):説明 :1a');
  assert.deepStrictEqual(n.keywords, ['PKM']);
  assert.strictEqual(n.created, '2026-10-10 11:12');
  assert.strictEqual(st.notes.find(x => x.s === 'd' && x.id === '1a').body, '1(1) を引用');
  const old = st.notes.find(x => x.s === 'd' && x.id === '5');
  assert.strictEqual(old.body, '昔の本文'); assert.strictEqual(old.created, '2026-11-07 00:00');
  assert.ok(st.notes.find(x => x.s === 'p' && x.id === '1').image.startsWith('file://'));
  assert.deepStrictEqual(st.topics[0].entry, { s: 'd', id: '1' });
  assert.deepStrictEqual(st.readings, { 紙: 'かみ', PKM: 'ぴーけーえむ' });

  // 入口と名前を変える → 古いファイルは消える
  v.saveTopic({ name: '1a-PKM', entry: { s: 'd', id: '1a' }, d: 'PKM 1', p: '' }, '1-PKM');
  assert.ok(!fs.existsSync(path.join(dir, 'topic/1-PKM.md')));
  assert.match(r('digital/1a.md'), /トピックIndex 1a-PKM/);
  assert.doesNotMatch(r('digital/1.md'), /トピックIndex/);
  // 削除
  v.deleteTopic('1a-PKM');
  assert.ok(!fs.existsSync(path.join(dir, 'topic/1a-PKM.md')));
  assert.doesNotMatch(r('digital/1a.md'), /トピックIndex/);

  // キーワードのトピックIndex（赤い点）
  v.saveNote({ s: 'd', id: '9', keywords: ['PKM'], body: '上位' });
  v.saveTopic({ name: '9-PKM', entry: { s: 'd', id: '9' }, keyword: 'PKM', d: 'PKM 1 9', p: 'PKM 1' });
  // 点は入口のID（9）の真上。キーワード PKM の ID の並びに 9 も入る
  assert.match(r('Index.md'), /PKM[^\n]*<a href="topic\/9-PKM.md"[^>]*>●<\/a><br><a href="digital\/9.md">9<\/a>/);
  assert.doesNotMatch(r('Index.md'), /●<\/a> PKM/);
  assert.match(r('topic/9-PKM.md'), /キーワード <a href="..\/Index.md#k-[a-z0-9]+">PKM<\/a>/);
  assert.strictEqual(openVault(dir).state().topics.find(t => t.name === '9-PKM').keyword, 'PKM');
  // 入口は1ノートに1つ
  v.saveTopic({ name: 'A', entry: { s: 'd', id: '1' }, d: 'x 1 5', p: '' });
  assert.strictEqual(v.saveTopic({ name: 'B', entry: { s: 'd', id: '1' }, d: '', p: '' }), false);
  // ノートを消す（画像つきの紙も）→ .trash、索引の行からも外れる
  const st2 = v.deleteNotes([{ s: 'd', id: '1' }, { s: 'p', id: '1' }]);
  assert.ok(!fs.existsSync(path.join(dir, 'digital/1.md')) && !fs.existsSync(path.join(dir, 'paper/1.jpg')));
  assert.strictEqual(fs.readdirSync(path.join(dir, '.trash')).length, 3);
  assert.ok(!st2.notes.some(x => x.id === '1'));
  assert.strictEqual(st2.topics.find(t => t.name === 'A').entry, null);
  assert.strictEqual(st2.topics.find(t => t.name === 'A').d, 'x 5');
  assert.doesNotMatch(r('Index.md'), /digital\/1\.md/);

  assert.ok(v.rename('d', '1a', '1b'));
  assert.ok(!fs.existsSync(path.join(dir, 'digital/1a.md')));
  assert.ok(fs.existsSync(path.join(dir, 'digital/1b.md')));
  fs.rmSync(dir, { recursive: true });
});
