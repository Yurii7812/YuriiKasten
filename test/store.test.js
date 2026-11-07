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
  v.saveTopic({ name: '1-PKM', anchors: [{ s: 'd', id: '1' }], d: 'PKM 1 1a\n★ 2-x', p: 'PKM 1' });

  const r = p => fs.readFileSync(path.join(dir, p), 'utf8');
  assert.match(r('digital/1.md'), /2026-10-10 11:12/);
  assert.match(r('digital/1.md'), /下 \[1a\]\(1a\.md\)/);
  assert.match(r('digital/1.md'), /トピックIndex \[1-PKM\]/);
  assert.match(r('digital/1a.md'), /\[1\(1\)\]\(1\.md#c1\)/);
  assert.match(r('paper/1.md'), /!\[1\]\(1\.jpg\)/);
  assert.doesNotMatch(r('paper/1.md'), /\d{4}-\d\d-\d\d \d\d:\d\d/); // 紙に日付は無い
  assert.match(r('Index.md'), /\*\*PKM\*\*　\[1\]\(digital\/1\.md\) · \[紙1\]\(paper\/1\.md\)/);
  assert.match(r('Index.md'), /\[1-PKM\]\(topic\/1-PKM\.md\)/);
  assert.match(r('topic/1-PKM.md'), /\| PKM \| \[1\]\(\.\.\/digital\/1\.md\) \[1a\]\(\.\.\/digital\/1a\.md\) · \[紙1\]\(\.\.\/paper\/1\.md\) \|/);
  assert.match(r('紙.md'), /## <a id="n1"><\/a>1/);
  assert.match(r('デジタル.md'), /^  - \[1a\]\(digital\/1a\.md\)/m);

  v = openVault(dir); // 読み直し
  const st = v.state(), n = st.notes.find(x => x.s === 'd' && x.id === '1');
  assert.strictEqual(n.body, '最初(1)\n(1):説明 :1a');
  assert.deepStrictEqual(n.keywords, ['PKM']);
  assert.strictEqual(n.created, '2026-10-10 11:12');
  const old = st.notes.find(x => x.s === 'd' && x.id === '5');
  assert.strictEqual(old.body, '昔の本文'); assert.strictEqual(old.created, '2026-11-07 00:00');
  assert.ok(st.notes.find(x => x.s === 'p' && x.id === '1').image.startsWith('file://'));
  assert.strictEqual(st.topics[0].p, 'PKM 1');

  assert.ok(v.rename('d', '1a', '1b'));
  assert.ok(!fs.existsSync(path.join(dir, 'digital/1a.md')));
  assert.match(r('digital/1.md'), /下 \[1b\]/);
  fs.rmSync(dir, { recursive: true });
});
