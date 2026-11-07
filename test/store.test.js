const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { openVault } = require('../store');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pkm-'));
const ls = dir => fs.readdirSync(dir).filter(f => f !== '.trash').sort();

test('全部が1つのフォルダに平らに置かれ、リンクは同じフォルダの中', () => {
  const dir = tmp();
  let v = openVault(dir);
  v.saveNote({ s: 'd', id: '1', created: '2026-10-10 11:12', keywords: ['PKM'], body: '最初(1)\n(1):説明 :1a' });
  v.saveNote({ s: 'd', id: '1a', created: '2026-10-10 11:13', keywords: [], body: '1(1) を引用' });
  v.saveImage('p', '1', Buffer.from([0xff, 0xd8, 0xff]));
  v.saveNote({ s: 'p', id: '1', keywords: ['PKM', '紙'], body: '紙の文字 :1a' });
  v.saveTopic({ name: '1-PKM', entry: { s: 'd', id: '1' }, d: 'PKM 1 1a\n★ 2-x', p: 'PKM 1' });

  assert.deepStrictEqual(ls(dir), ['.pkm-layout', 'D_1.md', 'D_1a.md', 'D_2026-10-10.md', 'Index.md', 'P_1.jpg', 'P_1.md', 'T_1-PKM.md', 'デジタル.md', '日記.md', '紙.md'].sort()); // 日記は作った日のものが自動で
  assert.ok(fs.readdirSync(dir).every(f => fs.statSync(path.join(dir, f)).isFile())); // サブフォルダなし
  const r = f => fs.readFileSync(path.join(dir, f), 'utf8');
  const d1 = r('D_1.md');
  assert.match(d1, /<p style="color:#888;font-size:.9em">2026-10-10 11:12　索引 <a href="Index.md#k-[a-z0-9]+">PKM<\/a><\/p>/);
  assert.match(d1, /分岐 <a href="D_1a.md">1a<\/a>/);
  assert.match(d1, /<a href="T_1-PKM.md">トピックIndex 1-PKM<\/a>/);
  assert.match(d1, /\[:1a\]\(D_1a\.md\)/);
  assert.match(r('D_1a.md'), /\[1\(1\)\]\(D_1\.md#c1\)/);
  assert.match(r('D_1a.md'), /<a href="D_1.md">← 1<\/a>/);
  assert.match(r('P_1.md'), /!\[1\]\(P_1\.jpg\)/);
  assert.match(r('P_1.md'), /\[:1a\]\(P_1a\.md\)/); // 紙の中のリンクは紙へ
  assert.doesNotMatch(r('P_1.md'), /\d{4}-\d\d-\d\d \d\d:\d\d/); // 紙に日付は無い
  assert.match(r('Index.md'), /<a href="D_1.md">1<\/a> <a href="P_1.md">紙1<\/a>/);
  assert.doesNotMatch(r('Index.md'), /トピックIndex|1-PKM/);
  assert.match(r('T_1-PKM.md'), /入口 <a href="D_1.md">1<\/a>/);
  assert.match(r('T_1-PKM.md'), /\| PKM \| \[1\]\(D_1\.md\) \[1a\]\(D_1a\.md\) \[紙1\]\(P_1\.md\) \|/);
  assert.match(r('デジタル.md'), /\[1\]\(D_1\.md\)/);
  assert.doesNotMatch(r('デジタル.md'), /1a/); // 先頭の ID だけ

  v = openVault(dir); // 読み直し
  const st = v.state(), n = st.notes.find(x => x.s === 'd' && x.id === '1');
  assert.strictEqual(n.body, '最初(1)\n(1):説明 :1a');
  assert.deepStrictEqual(n.keywords, ['PKM']);
  assert.strictEqual(n.created, '2026-10-10 11:12');
  assert.ok(st.notes.find(x => x.s === 'p' && x.id === '1').image.startsWith('file://'));
  assert.deepStrictEqual(st.topics[0].entry, { s: 'd', id: '1' });

  // 読みで並べ、行ごとに分ける
  v.setReading('紙', 'かみ'); v.setReading('PKM', 'ぴーけーえむ');
  assert.match(r('Index.md'), /## <a id="row0"><\/a>か[\s\S]*紙 <small style="color:#888">かみ<\/small>[\s\S]*## <a id="row1"><\/a>は[\s\S]*PKM/);

  // キーワードのトピックIndex（赤い点は入口のIDの真上）
  v.saveNote({ s: 'd', id: '9', keywords: [], body: '上位' });
  v.saveTopic({ name: '9-PKM', entry: { s: 'd', id: '9' }, keyword: 'PKM', d: 'PKM 1 9', p: 'PKM 1' });
  assert.match(r('Index.md'), /PKM[^\n]*<a href="T_9-PKM.md"[^>]*>●<\/a><br><a href="D_9.md">9<\/a>/);
  assert.match(r('T_9-PKM.md'), /キーワード <a href="Index.md#k-[a-z0-9]+">PKM<\/a>/);
  assert.strictEqual(openVault(dir).state().topics.find(t => t.name === '9-PKM').keyword, 'PKM');

  // 添付: 同じフォルダに元の名前のままコピー。同名は -1。D_ P_ T_ で始まる名前は F_ を付ける
  assert.deepStrictEqual(v.addFiles([{ name: 'a.png', bytes: [1, 2, 3] }, { name: 'メモ.pdf', bytes: [4] }]), ['a.png', 'メモ.pdf']);
  assert.deepStrictEqual(v.addFiles([{ name: 'a.png', bytes: [5] }, { name: 'D_1.md', bytes: [6] }, { name: 'Index.md', bytes: [7] }]), ['a-1.png', 'F_D_1.md', 'F_Index.md']);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'a.png')).length, 3);
  v.saveNote({ s: 'd', id: '9', keywords: [], body: '上位\n![a](a.png)\n[メモ(1).pdf](%E3%83%A1%E3%83%A2%281%29.pdf)' });
  assert.match(r('D_9.md'), /!\[a\]\(a\.png\)/);
  assert.match(r('D_9.md'), /\[メモ\(1\)\.pdf\]\(%E3%83%A1%E3%83%A2%281%29\.pdf\)/); // (1) をリンクにしない
  assert.ok(openVault(dir).state().notes.find(n => n.s === 'd' && n.id === '9').body.includes('![a](a.png)'));
  assert.ok(openVault(dir).state().notes.every(n => !/^F_/.test(n.id))); // 添付をノートと取り違えない

  // 入口は1ノートに1つ
  v.saveTopic({ name: 'A', entry: { s: 'd', id: '1' }, d: 'x 1 5', p: '' }, '1-PKM'); // 名前の変更
  assert.ok(!fs.existsSync(path.join(dir, 'T_1-PKM.md')) && fs.existsSync(path.join(dir, 'T_A.md')));
  assert.strictEqual(v.saveTopic({ name: 'B', entry: { s: 'd', id: '1' }, d: '', p: '' }), false);
  // ノートを消す（画像つきの紙も）→ .trash、索引の行からも外れる。添付は残る
  const st2 = v.deleteNotes([{ s: 'd', id: '1' }, { s: 'p', id: '1' }]);
  assert.ok(!fs.existsSync(path.join(dir, 'D_1.md')) && !fs.existsSync(path.join(dir, 'P_1.jpg')) && fs.existsSync(path.join(dir, 'a.png')));
  assert.strictEqual(fs.readdirSync(path.join(dir, '.trash')).length, 3);
  assert.ok(!st2.notes.some(x => x.id === '1'));
  assert.strictEqual(st2.topics.find(t => t.name === 'A').entry, null);
  assert.strictEqual(st2.topics.find(t => t.name === 'A').d, 'x 5');
  // ID を変える
  assert.ok(v.rename('d', '1a', '1b'));
  assert.ok(!fs.existsSync(path.join(dir, 'D_1a.md')) && fs.existsSync(path.join(dir, 'D_1b.md')));
  fs.rmSync(dir, { recursive: true });
});

test('v2（digital/ paper/ topic/ files/）を平らに移す', () => {
  const dir = tmp(), w = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
  w('digital/1b.md', '<!-- pkm {"created":"2026-11-07 12:41","keywords":["図"]} -->\n# 1b\n\n<!-- body -->\n[図(1).html](files/1b/%E5%9B%B3%281%29.html)  \n\n<!-- nav -->\n');
  w('digital/2.md', '<!-- pkm {"created":"2026-11-07 12:42","keywords":[]} -->\n# 2\n\n<!-- body -->\n![x](files/2/%E5%9B%B3%281%29.html)  \n![y](files/y.png)  \n\n<!-- nav -->\n');
  w('digital/files/1b/図(1).html', 'x'); w('digital/files/2/図(1).html', 'y'); w('digital/files/y.png', 'z');
  w('paper/3.md', '<!-- pkm {"keywords":[]} -->\n# 紙 3\n\n<!-- body -->\n文字\n<!-- nav -->\n'); w('paper/3.jpg', 'j');
  w('topic/1-X.md', '<!-- pkm-topic {"name":"1-X","entry":{"s":"d","id":"1b"},"d":"図 1b","p":""} -->\n# 1-X\n');
  w('Index.md', '<!-- pkm-index {"readings":{"図":"ず"}} -->\n# Index\n');
  const v = openVault(dir), body = id => v.state().notes.find(n => n.s === 'd' && n.id === id).body;
  assert.deepStrictEqual(ls(dir), ['.pkm-layout', 'D_1b.md', 'D_2.md', 'Index.md', 'P_3.jpg', 'P_3.md', 'T_1-X.md', 'y.png', 'デジタル.md', '図(1)-1.html', '図(1).html', '日記.md', '紙.md'].sort());
  assert.ok(fs.readdirSync(dir).every(f => fs.statSync(path.join(dir, f)).isFile()));
  assert.strictEqual(body('1b'), '[図(1).html](%E5%9B%B3%281%29.html)'); // リンクも平らに
  assert.strictEqual(body('2'), '![x](%E5%9B%B3%281%29-1.html)  \n![y](y.png)'.replace('  \n', '\n'));
  assert.ok(v.state().notes.find(n => n.s === 'p' && n.id === '3').image);
  assert.strictEqual(v.state().topics[0].name, '1-X');
  assert.deepStrictEqual(v.state().readings, { 図: 'ず' });
  fs.rmSync(dir, { recursive: true });
});

test('v1（直下に <ID>.md / <ID>.jpg）も移す。添付の 5.png をノートと取り違えない', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, '5.md'), '---\ndate: 2026 11 07\nkeywords: 古い\n---\n昔の本文\n');
  const v = openVault(dir);
  const old = v.state().notes.find(x => x.s === 'd' && x.id === '5');
  assert.strictEqual(old.body, '昔の本文'); assert.strictEqual(old.created, '2026-11-07 00:00'); assert.deepStrictEqual(old.keywords, ['古い']);
  assert.ok(fs.existsSync(path.join(dir, 'D_5.md')) && fs.existsSync(path.join(dir, '5.md.old')));
  // 平らになったあとに入れた 7.png は、添付のまま（次に開いても紙の画像にならない）
  v.addFiles([{ name: '7.png', bytes: [1] }]);
  const again = openVault(dir);
  assert.ok(fs.existsSync(path.join(dir, '7.png')));
  assert.ok(!again.state().notes.some(x => x.id === '7'));
  fs.rmSync(dir, { recursive: true });
});

test('日記: ノートを作ると作った日の日記に載り、紙の日記が最後に入る', () => {
  const dir = tmp(), r = f => fs.readFileSync(path.join(dir, f), 'utf8');
  const v = openVault(dir);
  v.saveNote({ s: 'd', id: '1', created: '2026-11-07 14:20', keywords: [], body: 'x' });
  v.saveNote({ s: 'd', id: '2', created: '2026-11-08 02:10', keywords: [], body: 'y' }); // 5時前 → 前の日
  v.saveNote({ s: 'd', id: '3', created: '2026-11-09 10:00', keywords: [], body: 'z' });
  assert.deepStrictEqual(v.state().diaries.map(d => d.date).sort(), ['2026-11-07', '2026-11-09']);
  assert.strictEqual(v.state().diaries.find(d => d.date === '2026-11-07').body, '## 今日のノート\n\n- :1\n- :2');
  // 過去の日記を開くと、その日のノートが足される。タイトルも付けられる
  v.saveDiary({ date: '2026-11-07', title: '旅の話', body: '朝は晴れ\n\n## 今日のノート\n\n- :1\n- :2' });
  assert.ok(fs.existsSync(path.join(dir, 'D_2026-11-07-旅の話.md')) && !fs.existsSync(path.join(dir, 'D_2026-11-07.md')));
  // 紙の日記（スキャン）: 日記の最後に入る。2枚目は _2
  v.addDiaryScan('2026-11-07', Buffer.from([0xff, 0xd8]));
  const d = v.addDiaryScan('2026-11-07', Buffer.from([0xff, 0xd8, 1]));
  assert.deepStrictEqual(d.pages, ['P_2026-11-07.jpg', 'P_2026-11-07_2.jpg']);
  assert.match(d.body, /## 今日のノート[\s\S]*## 紙の日記\n\n!\[\]\(P_2026-11-07\.jpg\)\n!\[\]\(P_2026-11-07_2\.jpg\)$/);
  assert.match(r('D_2026-11-07-旅の話.md'), /\[:1\]\(D_1\.md\)|\[:1\]/);
  assert.match(r('D_2026-11-07-旅の話.md'), /!\[\]\(P_2026-11-07\.jpg\)/);
  assert.match(r('日記.md'), /## 2026-11[\s\S]*\[2026-11-09（月）\]\(D_2026-11-09\.md\)[\s\S]*\[2026-11-07（土） 旅の話\]\(D_2026-11-07-%E6%97%85%E3%81%AE%E8%A9%B1\.md\)/);
  // 読み直し（タイトルと本文と紙のページ）
  const again = openVault(dir).state().diaries.find(x => x.date === '2026-11-07');
  assert.strictEqual(again.title, '旅の話'); assert.ok(again.body.startsWith('朝は晴れ')); assert.strictEqual(again.pages.length, 2);
  assert.ok(openVault(dir).state().notes.every(n => /^[0-9]/.test(n.id))); // 日記や紙のページをノートと取り違えない
  // 過去の日付の日記を作る
  assert.strictEqual(v.openDiary('2020-01-02').date, '2020-01-02');
  assert.deepStrictEqual(L_tree(v), ['2026', '2020'].length ? ['2026', '2020'] : []);
  // JSON の文書（チャットメモ・役）。R_ と V_ は、今はノートの一種なのでここでは保存しない
  assert.ok(v.saveDoc('C_チャット', { topics: [], messages: [{ text: 'やあ' }] }));
  assert.ok(!v.saveDoc('R_会話', {}) && !v.saveDoc('../x', {}));
  assert.deepStrictEqual(openVault(dir).state().docs['C_チャット'].messages, [{ text: 'やあ' }]);
  fs.rmSync(dir, { recursive: true });
});
function L_tree(v) { return require('../lib').diaryTree(v.state().diaries.map(d => d.date)).map(g => g.label); }

test('IDなしのノート・なりきり・キャンバスもノート。ID はあとから付ける', () => {
  const dir = tmp(), r = f => fs.readFileSync(path.join(dir, f), 'utf8');
  let v = openVault(dir);
  v.saveNote({ s: 'd', id: '1', created: '2026-11-07 10:00', keywords: ['PKM'], body: 'ID つき' });
  const a = v.createNote({ created: '2026-11-07 11:00', body: 'とりあえず書いた' });                     // IDなし
  const rp = v.createNote({ kind: 'rp', created: '2026-11-07 11:05', data: { title: '論語', cast: [{ id: 'x', name: '孔子' }], messages: [{ role: 'x', text: '学ぶとは' }] } });
  const cv = v.createNote({ kind: 'canvas', created: '2026-11-07 11:10', data: { title: '案', nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, text: 'メモ' }], edges: [] } });
  assert.ok(a.noid && rp.noid && cv.noid && /^u\d{8}-\d{6}/.test(a.id) && a.kind === 'text' && rp.kind === 'rp' && cv.kind === 'canvas');
  assert.ok(rp.body.includes('**孔子**: 学ぶとは') && cv.body.includes('メモ')); // 本文は種類ごとに作られる（検索に出る）
  assert.ok(fs.existsSync(path.join(dir, `D_${a.id}.md`)));
  assert.match(r(`D_${rp.id}.md`), /<!-- pkm-data \{.*"title":"論語"/);
  assert.doesNotMatch(r('Index.md'), new RegExp(a.id));                // IDなしは Index に出ない
  assert.match(r('デジタル.md'), /## 未整理（IDなし）[\s\S]*とりあえず書いた/);
  assert.match(r('D_2026-11-07.md'), /- \[未整理 11:00\]\(D_u\d{8}-\d{6}\.md\)/);   // 日記には日時のリンク
  // 読み直し: 種類・データ・IDなしのまま
  v = openVault(dir); const st = v.state(), rp2 = st.notes.find(n => n.id === rp.id);
  assert.strictEqual(rp2.kind, 'rp'); assert.strictEqual(rp2.data.messages[0].text, '学ぶとは'); assert.ok(rp2.noid);
  // ID を付ける（ファイル名が変わり、日記のリンクは :ID になる。種類とデータは残る）
  const b = v.rename('d', rp.id, '2');
  assert.ok(b && b.id === '2' && !b.noid && b.kind === 'rp' && b.data.title === '論語');
  assert.ok(fs.existsSync(path.join(dir, 'D_2.md')) && !fs.existsSync(path.join(dir, `D_${rp.id}.md`)));
  assert.match(r('D_2026-11-07.md'), /\[:2\]\(D_2\.md\)/);   // 日記のリンクは :2 になる（ファイル上はリンク表記）
  assert.ok(v.state().diaries[0].body.includes('- :2'));
  assert.match(r('Index.md'), /./);
  assert.ok(!v.rename('d', a.id, 'abc'));   // ID の形でないものは付けられない
  // ほかのノートの D_<名前>.md へのリンクも、新しい名前に書き換わる
  v.saveNote({ s: 'd', id: '1', created: '2026-11-07 10:00', keywords: [], body: `引用 [↩ 会話](D_${cv.id}.md#m1)` });
  v.rename('d', cv.id, '3');
  assert.ok(v.state().notes.find(n => n.id === '1').body.includes('](D_3.md#m1)'));
  fs.rmSync(dir, { recursive: true });
});

test('昔の R_ / V_ のファイルは、IDなしのノートに移る', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'R_論語.json'), JSON.stringify({ title: '論語', created: Date.UTC(2026, 10, 7), cast: [{ id: 'a', name: '孔子' }], messages: [{ id: 'm', role: 'a', t: 1, text: 'やあ' }] }));
  fs.writeFileSync(path.join(dir, 'V_案.json'), JSON.stringify({ title: '案', nodes: [], edges: [], view: { x: 0, y: 0, z: 1 } }));
  const v = openVault(dir), ns = v.state().notes;
  assert.deepStrictEqual(ns.map(n => n.kind).sort(), ['canvas', 'rp']);
  assert.ok(ns.every(n => n.noid) && ns.find(n => n.kind === 'rp').body.includes('やあ'));
  assert.ok(!fs.existsSync(path.join(dir, 'R_論語.json')) && !fs.existsSync(path.join(dir, 'V_案.json')));
  assert.strictEqual(openVault(dir).state().notes.length, 2); // 二度目は増えない
  fs.rmSync(dir, { recursive: true });
});

test('タイトル: 保存・読み直し・見出し。なりきり・キャンバスの題も同じ', () => {
  const dir = tmp(), r = f => fs.readFileSync(path.join(dir, f), 'utf8');
  let v = openVault(dir);
  v.saveNote({ s: 'd', id: '1', created: '2026-11-07 10:00', keywords: [], body: '本文', title: 'PKMとは何か' });
  assert.match(r('D_1.md'), /<!-- pkm \{[^}]*"title":"PKMとは何か"/);
  assert.match(r('D_1.md'), /# PKMとは何か\n\n<p[^>]*>1<\/p>/); // 見出しはタイトル、IDは小さく
  assert.match(r('デジタル.md'), /\[1 PKMとは何か\]\(D_1\.md\)/);
  const rp = v.createNote({ kind: 'rp', title: '論語を読む', data: { title: '', cast: [], messages: [] } });
  assert.strictEqual(rp.title, '論語を読む');
  const cv = v.createNote({ kind: 'canvas', data: { title: '昔の題', nodes: [], edges: [] } });
  v = openVault(dir); const ns = v.state().notes;
  assert.strictEqual(ns.find(n => n.id === '1').title, 'PKMとは何か');
  assert.strictEqual(ns.find(n => n.id === rp.id).title, '論語を読む');
  assert.strictEqual(ns.find(n => n.id === cv.id).title, '昔の題');             // 昔のデータの題を引き継ぐ
  v.saveNote({ s: 'd', id: cv.id, kind: 'canvas', data: ns.find(n => n.id === cv.id).data, title: '新しい題' });
  assert.match(openVault(dir).state().notes.find(n => n.id === cv.id).body, /^# 新しい題/); // 本文（検索用）も題に合わせる
  fs.rmSync(dir, { recursive: true });
});
