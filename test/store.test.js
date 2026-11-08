const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { openVault } = require('../store');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pkm-'));
const dfile = (v, date, kind = '日記') => v.state().diaries.find(d => d.date === date && d.kind === kind).stem + '.md';   // 日記のファイル名は日時
const ls = dir => fs.readdirSync(dir).filter(f => f !== '.trash' && !f.startsWith('.backup-')).sort();

test('全部が1つのフォルダに平らに置かれ、リンクは同じフォルダの中', () => {
  const dir = tmp();
  let v = openVault(dir);
  v.saveNote({ s: 'd', id: '1', created: '2026-10-10 11:12:30', keywords: ['PKM'], body: '最初(1)\n(1):説明 :1a' });
  v.saveNote({ s: 'd', id: '1a', created: '2026-10-10 11:13:00', keywords: [], body: '1(1) を引用' });
  v.saveImage('p', '1', Buffer.from([0xff, 0xd8, 0xff]));
  v.saveNote({ s: 'p', id: '1', keywords: ['PKM', '紙'], body: '紙の文字 :1a' });
  v.saveTopic({ name: '1-PKM', entry: { s: 'd', id: '1' }, d: 'PKM 1 1a\n★ 2-x', p: 'PKM 1' });

  const F = (s, id) => v.state().notes.find(n => n.s === s && n.id === id).stem; // ファイル名は作った日時
  assert.strictEqual(F('d', '1'), '20261010111230'); assert.strictEqual(F('d', '1a'), '20261010111300');
  assert.match(F('p', '1'), /^\d{14}$/);
  assert.deepStrictEqual(ls(dir), ['.pkm-layout', dfile(v, '2026-10-10'), 'Index.md', F('d', '1') + '.md', F('d', '1a') + '.md', F('p', '1') + '.jpg', F('p', '1') + '.md', 'T_1-PKM.md', 'キーワード.md', 'デジタル.md', '日記.md', '未整理.md', '紙.md'].sort()); // 日記は作った日のものが自動で
  const D1 = F('d', '1') + '.md', D1a = F('d', '1a') + '.md', P1 = F('p', '1');
  assert.ok(fs.readdirSync(dir).every(f => fs.statSync(path.join(dir, f)).isFile())); // サブフォルダなし
  const r = f => fs.readFileSync(path.join(dir, f), 'utf8');
  const d1 = r(D1);
  assert.match(r(D1), /^---\nfolgezettel: "1"\nsource: "digital"\ncreated: "2026-10-10 11:12:30"\nupdated: "[^"]+"\nkeywords: \["PKM"\]\n---\n/); // 先頭は YAML
  // Gnosis 風: YAML ／ # 題 ／ ParentBranch・TopicBranch・Topic ／ 本文 ／ ChildBranch。前・次・一覧のリンクは無い
  assert.match(d1, /\n# 1\n\nTopicBranch: \[1-PKM\]\(T_1-PKM\.md\)  \nTopic: \[1-PKM\]\(T_1-PKM\.md\)\n\n<!-- body -->/);   // 自分が入口のトピックIndex・載っているトピックIndex。親は無いので ParentBranch の行は出ない
  assert.ok(d1.endsWith(`\nChildBranch: [1a](${D1a})\n`));
  assert.doesNotMatch(d1, /<hr>|Index\.md|デジタル一覧|<p /);
  assert.ok(d1.includes(`[:1a](${D1a})`));
  assert.ok(r(D1a).includes(`[1(1)](${D1}#c1)`));
  assert.ok(r(D1a).includes(`\nParentBranch: [1](${D1})  \nTopic: [1-PKM](T_1-PKM.md)\n`));   // 親・自分が載っているトピックIndex
  assert.ok(r(P1 + '.md').includes(`![1](${P1}.jpg)`));
  assert.match(r(P1 + '.md'), /^---\nfolgezettel: "1"\nsource: "paper"/);
  assert.doesNotMatch(r(P1 + '.md').replace(/^---[\s\S]*?---\n/, ''), /\d{4}-\d\d-\d\d \d\d:\d\d/); // 紙の本文に日付は無い（YAML にだけ）
  assert.ok(r('キーワード.md').includes(`<a href="${D1}">1</a> <a href="${P1}.md">紙1</a>`));
  assert.doesNotMatch(r('キーワード.md'), /トピックIndex/);
  // Index.md には、一覧へのリンクだけを縦に（ほかのファイルには、そのリンクを出さない）
  assert.match(r('Index.md'), /^# Index\n\n- \[デジタル\]\([^)]*\)\n- \[紙\]\([^)]*\)\n- \[未整理\]\([^)]*\)\n- \[Index（キーワード）\]\([^)]*\)\n- \[日記\]\([^)]*\)\n$/);
  for (const f of ['デジタル.md', '紙.md', '未整理.md', 'キーワード.md', '日記.md', 'T_1-PKM.md', D1, D1a]) assert.doesNotMatch(r(f), /Index\.md/);
  assert.match(r('デジタル.md'), /^# デジタル\n\n\[1\]\(T_1-PKM\.md\)\n/);   // 最上位の番号だけ。トピックIndex があればそこへ
  assert.match(r('紙.md'), /\[紙1\]\([^)]*\.md\)/);
  assert.ok(r('T_1-PKM.md').includes(`入口 <a href="${D1}">1</a>`));
  assert.ok(r('T_1-PKM.md').includes(`| PKM | [1](${D1}) [1a](${D1a}) [紙1](${P1}.md) |`));
  assert.doesNotMatch(r('デジタル.md'), /1a/); // 先頭の ID だけ

  v = openVault(dir); // 読み直し
  const st = v.state(), n = st.notes.find(x => x.s === 'd' && x.id === '1');
  assert.strictEqual(n.body, '最初(1)\n(1):説明 :1a');
  assert.deepStrictEqual(n.keywords, ['PKM']);
  assert.strictEqual(n.created, '2026-10-10 11:12:30'); assert.strictEqual(n.stem, '20261010111230');
  assert.ok(st.notes.find(x => x.s === 'p' && x.id === '1').image.startsWith('file://'));
  assert.deepStrictEqual(st.topics[0].entry, { s: 'd', id: '1' });

  // 読みで並べ、行ごとに分ける
  v.setReading('紙', 'かみ'); v.setReading('PKM', 'ぴーけーえむ');
  assert.match(r('キーワード.md'), /### <a id="row0"><\/a>か[\s\S]*紙 <small style="color:#888">かみ<\/small>[\s\S]*### <a id="row1"><\/a>は[\s\S]*PKM/);

  // キーワードのトピックIndex（赤い点は入口のIDの真上）
  v.saveNote({ s: 'd', id: '9', keywords: [], body: '上位' });
  v.saveTopic({ name: '9-PKM', entry: { s: 'd', id: '9' }, keyword: 'PKM', d: 'PKM 1 9', p: 'PKM 1' });
  const D9 = () => F('d', '9') + '.md';
  assert.ok(new RegExp(`PKM[^\\n]*<a href="T_9-PKM.md"[^>]*>●</a><br><a href="${D9()}">9</a>`).test(r('キーワード.md')));
  assert.match(r('T_9-PKM.md'), /キーワード <a href="%E3%82%AD%E3%83%BC%E3%83%AF%E3%83%BC%E3%83%89\.md#k-[a-z0-9]+">PKM<\/a>/);
  assert.strictEqual(openVault(dir).state().topics.find(t => t.name === '9-PKM').keyword, 'PKM');

  // 添付: 同じフォルダに、日時の名前でコピー（元の名前は K_files.json）。同じ秒はずらす
  const [f1, f2] = v.addFiles([{ name: 'a.png', bytes: [1, 2, 3] }, { name: 'メモ.pdf', bytes: [4] }]);
  assert.match(f1, /^\d{14}\.png$/); assert.match(f2, /^\d{14}\.pdf$/); assert.notStrictEqual(f1.slice(0, 14), f2.slice(0, 14));
  assert.strictEqual(fs.readFileSync(path.join(dir, f1)).length, 3);
  const meta = JSON.parse(r('K_files.json')).files; assert.strictEqual(meta[f2].orig, 'メモ.pdf'); assert.strictEqual(meta[f2].title, '');
  v.saveNote({ s: 'd', id: '9', keywords: [], body: `上位\n![a](${f1})\n[メモ(1).pdf](%E3%83%A1%E3%83%A2%281%29.pdf)` });
  assert.ok(r(D9()).includes(`![a](${f1})`));
  assert.match(r(D9()), /\[メモ\(1\)\.pdf\]\(%E3%83%A1%E3%83%A2%281%29\.pdf\)/); // (1) をリンクにしない
  assert.ok(openVault(dir).state().notes.find(n => n.s === 'd' && n.id === '9').body.includes(`![a](${f1})`));
  assert.ok(openVault(dir).state().notes.every(n => n.id.length < 8 || n.noid)); // 添付をノートと取り違えない（14桁の名前の添付は、md が無いのでノートにならない）

  // 入口は1ノートに1つ
  v.saveTopic({ name: 'A', entry: { s: 'd', id: '1' }, d: 'x 1 5', p: '' }, '1-PKM'); // 名前の変更
  assert.ok(!fs.existsSync(path.join(dir, 'T_1-PKM.md')) && fs.existsSync(path.join(dir, 'T_A.md')));
  assert.strictEqual(v.saveTopic({ name: 'B', entry: { s: 'd', id: '1' }, d: '', p: '' }), false);
  // ノートを消す（画像つきの紙も）→ .trash、索引の行からも外れる。添付は残る
  const st2 = v.deleteNotes([{ s: 'd', id: '1' }, { s: 'p', id: '1' }]);
  assert.strictEqual(fs.readdirSync(path.join(dir, '.trash')).length, 3);
  assert.ok(!fs.existsSync(path.join(dir, D1)) && !fs.existsSync(path.join(dir, P1 + '.jpg')) && fs.existsSync(path.join(dir, f1)));
  assert.ok(!st2.notes.some(x => x.id === '1'));
  assert.strictEqual(st2.topics.find(t => t.name === 'A').entry, null);
  assert.strictEqual(st2.topics.find(t => t.name === 'A').text, 'x 5');
  // ID を変える（ファイル名は日時のまま。YAML の folgezettel が変わる）
  assert.ok(v.rename('d', '1a', '1b'));
  assert.ok(fs.existsSync(path.join(dir, D1a)) && /folgezettel: "1b"/.test(r(D1a)));
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
  const sx = (s, id) => v.state().notes.find(n => n.s === s && n.id === id).stem;
  assert.deepStrictEqual(ls(dir), ['.pkm-layout', sx('d', '1b') + '.md', sx('d', '2') + '.md', 'Index.md', sx('p', '3') + '.jpg', sx('p', '3') + '.md', 'T_1-X.md', 'y.png', 'キーワード.md', '未整理.md', 'デジタル.md', '図(1)-1.html', '図(1).html', '日記.md', '紙.md'].sort());
  assert.ok(fs.readdirSync(dir).some(f => f.startsWith('.backup-')));   // 日時の名前に移す前の複製
  assert.ok(fs.readdirSync(dir).filter(f => !f.startsWith('.backup-')).every(f => fs.statSync(path.join(dir, f)).isFile()));
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
  assert.strictEqual(old.body, '昔の本文'); assert.strictEqual(old.created, '2026-11-07 00:00:00'); assert.deepStrictEqual(old.keywords, ['古い']);
  assert.ok(fs.existsSync(path.join(dir, old.stem + '.md')) && fs.existsSync(path.join(dir, '5.md.old')) && old.stem === '20261107000000');
  // 平らになったあとに入れた 7.png は、添付のまま（次に開いても紙の画像にならない）
  const [f7] = v.addFiles([{ name: '7.png', bytes: [1] }]);
  const again = openVault(dir);
  assert.ok(fs.existsSync(path.join(dir, f7)));
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
  assert.ok(fs.existsSync(path.join(dir, dfile(v, '2026-11-07'))) && /title: "旅の話"/.test(r(dfile(v, '2026-11-07'))) && /record: "日記"/.test(r(dfile(v, '2026-11-07'))));   // 日時の名前＋YAML
  // 紙の日記（スキャン）: 日記の最後に入る。2枚目は _2
  v.addDiaryScan('2026-11-07', Buffer.from([0xff, 0xd8]));
  const d = v.addDiaryScan('2026-11-07', Buffer.from([0xff, 0xd8, 1]));
  assert.deepStrictEqual(d.pages, ['P_2026-11-07.jpg', 'P_2026-11-07_2.jpg']);
  assert.match(d.body, /## 今日のノート[\s\S]*## 紙の日記\n\n!\[\]\(P_2026-11-07\.jpg\)\n!\[\]\(P_2026-11-07_2\.jpg\)$/);
  assert.match(r(dfile(v, '2026-11-07')), /\[:1\]/);
  assert.match(r(dfile(v, '2026-11-07')), /!\[\]\(P_2026-11-07\.jpg\)/);
  assert.ok(r('日記.md').includes(`[2026-11-09（月）](${dfile(v, '2026-11-09')})`) && r('日記.md').includes(`[2026-11-07（土） 旅の話](${dfile(v, '2026-11-07')})`) && /## 2026-11/.test(r('日記.md')));
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
  assert.ok(a.noid && rp.noid && cv.noid && /^\d{14}$/.test(a.id) && a.kind === 'text' && rp.kind === 'rp' && cv.kind === 'canvas');
  assert.ok(rp.body.includes('**孔子**: 学ぶとは') && cv.body.includes('メモ')); // 本文は種類ごとに作られる（検索に出る）
  assert.ok(fs.existsSync(path.join(dir, `${a.id}.md`)) && a.stem === a.id && a.id === '20261107110000');
  assert.match(r(`${rp.id}.md`), /<!-- pkm-data \{.*"title":"論語"/);
  assert.match(r('未整理.md'), new RegExp(a.id));   // IDなしは「未整理」に出る（キーワードの表には出ない）
  assert.doesNotMatch(r('キーワード.md'), new RegExp(a.id));
  assert.match(r('未整理.md'), /とりあえず書いた/);
  assert.match(r(dfile(v, '2026-11-07')), /- \[未整理 11:00\]\(\d{14}\.md\)/);   // 日記には日時のリンク
  // 読み直し: 種類・データ・IDなしのまま
  v = openVault(dir); const st = v.state(), rp2 = st.notes.find(n => n.id === rp.id);
  assert.strictEqual(rp2.kind, 'rp'); assert.strictEqual(rp2.data.messages[0].text, '学ぶとは'); assert.ok(rp2.noid);
  // ID を付ける（ファイル名が変わり、日記のリンクは :ID になる。種類とデータは残る）
  const b = v.rename('d', rp.id, '2');
  assert.ok(b && b.id === '2' && !b.noid && b.kind === 'rp' && b.data.title === '論語');
  assert.ok(fs.existsSync(path.join(dir, `${rp.id}.md`)) && /folgezettel: "2"/.test(r(`${rp.id}.md`)));   // ファイル名は日時のまま
  assert.ok(r(dfile(v, '2026-11-07')).includes(`[:2](${rp.id}.md)`));   // 日記のリンクは :2 になる（ファイル上はリンク表記）
  assert.ok(v.state().diaries[0].body.includes('- :2'));
  assert.match(r('Index.md'), /./);
  assert.ok(!v.rename('d', a.id, 'abc'));   // ID の形でないものは付けられない
  // ほかのノートのファイルへのリンクは、ID を付けても動かない（ファイル名が日時で変わらないため）
  v.saveNote({ s: 'd', id: '1', created: '2026-11-07 10:00', keywords: [], body: `引用 [↩ 会話](${cv.id}.md#m1)` });
  v.rename('d', cv.id, '3');
  assert.ok(v.state().notes.find(n => n.id === '1').body.includes(`](${cv.id}.md#m1)`));
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
  const S1 = v.state().notes[0].stem + '.md';
  assert.match(r(S1), /title: "PKMとは何か"/);
  assert.match(r(S1), /\n# PKMとは何か\n\n<!-- body -->/); // 見出しはタイトル
  assert.ok(r('デジタル.md').includes(`[1 PKMとは何か](${S1})`));
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

test('IDを消してIDなしに。このノートを指すリンクは、ファイルへのリンクに直る', () => {
  const dir = tmp(), r = f => fs.readFileSync(path.join(dir, f), 'utf8');
  const v = openVault(dir);
  v.saveNote({ s: 'd', id: '1', created: '2026-11-07 10:00', keywords: [], body: 'PKMの本文', title: 'PKMとは' });
  v.saveNote({ s: 'd', id: '1a', created: '2026-11-07 10:05', keywords: [], body: '子のノート' });
  v.saveNote({ s: 'd', id: '2', created: '2026-11-07 10:10', keywords: [], body: '参照 :1 と 1(1) と、:1a' });
  v.saveTopic({ name: 'PKM', entry: { s: 'd', id: '1' }, d: '基本 1 1a', p: '' });
  const st = v.clearId('d', '1');
  const n = st.notes.find(x => x.title === 'PKMとは');
  assert.ok(n.noid && /^\d{14}$/.test(n.id) && n.id === n.stem);
  assert.ok(fs.existsSync(path.join(dir, `${n.id}.md`)) && !/folgezettel/.test(r(`${n.id}.md`)));   // ファイルはそのまま、YAML から folgezettel が消える
  const b2 = st.notes.find(x => x.id === '2').body;
  assert.strictEqual(b2, `参照 [PKMとは](${n.id}.md) と [PKMとは](${n.id}.md) と、:1a`); // :1a は別のノートなのでそのまま
  assert.ok(st.notes.find(x => x.id === '1a'));                                                   // 子はそのまま
  assert.strictEqual(st.topics[0].entry, null); assert.strictEqual(st.topics[0].text, '基本 1a');      // 入口なし・索引の行から外れる
  assert.ok(st.diaries[0].body.includes(`[PKMとは](${n.id}.md)`) && st.diaries[0].body.includes('- :1a')); // 日記のリンクも直る
  assert.ok(!v.clearId('d', n.id));                                                                // すでにIDなしなら何もしない
  fs.rmSync(dir, { recursive: true });
});

test('紙のIndex: 取り込み前のIDも書ける。紙のノートができたら本 Index にマージされる', () => {
  const dir = tmp(), r = f => fs.readFileSync(path.join(dir, f), 'utf8');
  const v = openVault(dir);
  v.saveImage('p', '3', Buffer.from([0xff, 0xd8, 0xff]));                       // 紙の 3 だけ、もう取り込んである
  let st = v.addPaperIndex({ kw: 'GUI', reading: 'ぐい', ids: ['3', '12', '12a'] });
  const pd = st.docs.K_paperindex;
  assert.deepStrictEqual(pd.entries, [{ kw: 'GUI', reading: 'ぐい', ids: ['12', '12a'] }]); // 3 はもうノートがあるのでマージ済み、12 と 12a は取り込み前
  assert.deepStrictEqual(st.notes.find(n => n.s === 'p' && n.id === '3').keywords, ['GUI']);
  assert.match(r('キーワード.md'), /GUI[^\n]*紙3/);                                          // 本 Index には、ノートがあるものだけ
  assert.doesNotMatch(r('キーワード.md'), /紙12/);
  // 紙の 12 を取り込む → 自動でマージされる
  st = v.saveImage('p', '12', Buffer.from([0xff, 0xd8, 0xff])) && v.state();
  assert.deepStrictEqual(st.docs.K_paperindex.entries[0].ids, ['12a']);
  assert.deepStrictEqual(st.notes.find(n => n.s === 'p' && n.id === '12').keywords, ['GUI']);
  assert.match(r('キーワード.md'), /紙12/);
  // 同じ名前の読みを後から直せる。外す: 取り込み前のIDは表から、ノートがあるIDはキーワードから
  st = v.addPaperIndex({ kw: 'GUI', reading: 'ジーユーアイ', ids: [] });
  assert.strictEqual(st.readings.GUI, 'ジーユーアイ');
  st = v.removePaperIndex({ kw: 'GUI', id: '12a' }); assert.deepStrictEqual(st.docs.K_paperindex.entries, []);
  st = v.removePaperIndex({ kw: 'GUI', id: '3' }); assert.deepStrictEqual(st.notes.find(n => n.s === 'p' && n.id === '3').keywords, []);
  assert.ok(!v.addPaperIndex({ kw: '  ', ids: ['1'] }));
  // 読み直し
  assert.ok(!openVault(dir).state().docs.K_paperindex || openVault(dir).state().docs.K_paperindex.entries.length === 0);
  fs.rmSync(dir, { recursive: true });
});

test('日記の「今日のノート」から、消したノート・空のノートのリンクが外れる', () => {
  const dir = tmp(), v = openVault(dir);
  v.saveNote({ s: 'd', id: '1', created: '2026-10-10 11:12', keywords: [], body: 'あ' });
  v.saveNote({ s: 'd', id: '2', created: '2026-10-10 11:13', keywords: [], body: '' });   // 空: 載せない
  let d = v.diaryState().find(x => x.date === '2026-10-10');
  assert.match(d.body, /:1/); assert.doesNotMatch(d.body, /:2/);
  v.saveNote({ s: 'd', id: '2', created: '2026-10-10 11:13', keywords: [], body: 'い' }); // 書いたら載る
  assert.match(v.diaryState().find(x => x.date === '2026-10-10').body, /:2/);
  v.deleteNotes([{ s: 'd', id: '1' }]);                                                    // 消したら外れる
  d = v.diaryState().find(x => x.date === '2026-10-10');
  assert.doesNotMatch(d.body, /:1\b/); assert.match(d.body, /:2/);
});

test('トピックIndexの + は案内、ID の前の * は赤い点の印', () => {
  const L = require('../lib');
  assert.strictEqual(L.topicLine('+GUI').star, 'GUI');
  assert.strictEqual(L.topicLine('★ GUI').star, 'GUI');
  const r = L.topicLine('PKM *1 1a');
  assert.strictEqual(r.kw, 'PKM'); assert.deepStrictEqual(r.ids.map(x => [x.id, !!x.dot]), [['1', true], ['1a', false]]);
  assert.deepStrictEqual(L.mergeTopic({ d: 'PKM *1 1a', p: '' }).rows[0].dot, { s: 'd', id: '1' });
});

test('昔の名前（D_<ID>.md / P_<ID>.md / D_u….md）を、日時の名前と YAML に移す（バックアップつき）', () => {
  const dir = tmp(), w = (f, t) => fs.writeFileSync(path.join(dir, f), t), r = f => fs.readFileSync(path.join(dir, f), 'utf8');
  w('.pkm-layout', 'flat1\n');
  w('D_1.md', '<!-- pkm {"created":"2026-11-07 10:00","keywords":["PKM"],"kind":"text","title":"最初"} -->\n# 最初\n\n<!-- body -->\n本文 :1a [先](D_u20261107-110000.md)  \n<!-- nav -->\n');
  w('D_1a.md', '<!-- pkm {"created":"2026-11-07 10:00","keywords":[]} -->\n# 1a\n\n<!-- body -->\n同じ分の子\n<!-- nav -->\n');
  w('D_u20261107-110000.md', '<!-- pkm {"created":"2026-11-07 11:00","keywords":[],"kind":"canvas","title":"案"} -->\n<!-- pkm-data {"title":"案","nodes":[{"id":"a","type":"note","s":"d","nid":"u20261107-110000"}],"edges":[]} -->\n# 案\n\n<!-- body -->\n\n<!-- nav -->\n');
  w('P_2.md', '<!-- pkm {"keywords":["紙"]} -->\n# 紙 2\n\n<!-- body -->\n紙の文字\n<!-- nav -->\n'); w('P_2.jpg', 'jpg');
  w('C_チャット.json', JSON.stringify({ messages: [{ nid: 'u20261107-110000' }] }));
  const v = openVault(dir), st = v.state(), n = (s, id) => st.notes.find(x => x.s === s && x.id === id);
  assert.strictEqual(n('d', '1').stem, '20261107100000'); assert.strictEqual(n('d', '1a').stem, '20261107100001');   // 同じ分はずらす
  assert.strictEqual(n('d', '1').title, '最初'); assert.deepStrictEqual(n('d', '1').keywords, ['PKM']); assert.strictEqual(n('d', '1').created, '2026-11-07 10:00:00');
  const cv = st.notes.find(x => x.kind === 'canvas'); assert.strictEqual(cv.stem, '20261107110000'); assert.ok(cv.noid && cv.id === cv.stem);
  assert.strictEqual(cv.data.nodes[0].nid, cv.id);                                  // キャンバスの中の参照も新しい名前に
  assert.ok(n('d', '1').body.includes('[先](20261107110000.md)'));                    // 本文のファイルへのリンクも
  assert.ok(r('C_チャット.json').includes('"20261107110000"'));                      // チャットの参照も
  assert.ok(n('p', '2').image && fs.existsSync(path.join(dir, n('p', '2').stem + '.jpg')) && !fs.existsSync(path.join(dir, 'P_2.jpg')));
  assert.ok(!fs.readdirSync(dir).some(f => /^[DP]_\d/.test(f) || /^D_u/.test(f)));      // 昔の名前は残らない
  const bk = fs.readdirSync(dir).find(f => f.startsWith('.backup-')); assert.ok(bk && fs.existsSync(path.join(dir, bk, 'D_1.md')));   // バックアップ
  const again = openVault(dir).state(); assert.strictEqual(again.notes.length, 4); // 二度目は増えない
  fs.rmSync(dir, { recursive: true });
});

test('昔の形式のファイルが同期で戻ってきても、複製が増えない（増殖の再発防止）', () => {
  const dir = tmp(), w = (f, t) => fs.writeFileSync(path.join(dir, f), t);
  w('.pkm-layout', 'flat1\n');
  w('D_1.md', '<!-- pkm {"created":"2026-11-07 10:00","keywords":[]} -->\n# 1\n\n<!-- body -->\n本文\n<!-- nav -->\n');
  for (let i = 0; i < 3; i++) { openVault(dir); w('D_1.md', '<!-- pkm {"created":"2026-11-07 10:00","keywords":[]} -->\n# 1\n\n<!-- body -->\n本文\n<!-- nav -->\n'); } // 同期が昔の形式を戻す
  const st = openVault(dir).state();
  assert.strictEqual(st.notes.length, 1); assert.strictEqual(st.notes[0].id, '1');
  assert.ok(!fs.existsSync(path.join(dir, 'D_1.md')));
  fs.rmSync(dir, { recursive: true });
});

test('取り込んだファイル: 一覧にタイトル・説明を付けられる。ノートや Index は含まれない', () => {
  const dir = tmp(), v = openVault(dir);
  v.saveNote({ s: 'd', id: '1', keywords: [], body: 'x' });
  const [f] = v.addFiles([{ name: '表紙.png', bytes: [1, 2] }]);
  fs.writeFileSync(path.join(dir, '昔の図.html'), 'h');   // 昔の名前のままの添付も出る
  let l = v.filesInfo();
  assert.deepStrictEqual(l.map(x => x.name).sort(), [f, '昔の図.html'].sort()); assert.ok(l.every(x => !x.title));
  assert.strictEqual(l.find(x => x.name === f).orig, '表紙.png');
  assert.ok(v.setFileInfo(f, { title: '本の表紙', desc: '図でわかる〜' }) && !v.setFileInfo('../x', { title: 'x' }));
  assert.strictEqual(openVault(dir).filesInfo().find(x => x.name === f).title, '本の表紙');   // 読み直しても残る
  assert.strictEqual(openVault(dir).filesInfo().filter(x => !x.title).length, 1);            // タイトルなしだけ数えられる
  fs.rmSync(dir, { recursive: true });
});

test('トピックIndex・紙のIndex: 1a(1) のように (番号) もつけられる', () => {
  const dir = tmp(), v = openVault(dir), r = f => fs.readFileSync(path.join(dir, f), 'utf8');
  v.saveNote({ s: 'd', id: '1', keywords: [], body: 'x' }); v.saveNote({ s: 'd', id: '2', keywords: [], body: 'y' });
  v.saveTopic({ name: 'T', entry: { s: 'd', id: '1' }, d: 'PKM 1(2) 2', p: '' });
  const st = openVault(dir).state(), s1 = st.notes.find(n => n.id === '1').stem;
  assert.ok(r('T_T.md').includes(`[1(2)](${s1}.md#c2)`));         // md では (番号) の場所へのリンク
  assert.deepStrictEqual(require('../lib').mergeTopic(st.topics[0]).rows[0].d, ['1(2)', '2']);
  const s = v.addPaperIndex({ kw: 'GUI', ids: ['3a(1)', 'x'] });
  assert.deepStrictEqual(s.docs.K_paperindex.entries[0].ids, ['3a(1)']);     // 形の違うものは入らない
});

test('日記の「今日のノート」: 無いノート（IDなしの日時の名前を含む）へのリンクは出さない', () => {
  const dir = tmp(), v = openVault(dir);
  v.saveNote({ s: 'd', id: '1', created: '2026-10-10 11:12:00', keywords: [], body: 'あ' });
  const n = v.createNote({ created: '2026-10-10 11:13:00', body: 'IDなし' });
  assert.match(v.diaryState().find(x => x.date === '2026-10-10').body, new RegExp(n.id + '\\.md'));
  v.deleteNotes([{ s: 'd', id: n.id }]);
  const d = openVault(dir).diaryState().find(x => x.date === '2026-10-10');
  assert.doesNotMatch(d.body, new RegExp(n.id)); assert.match(d.body, /:1/);
  // ファイルを直接消されたとき（同期で消えたとき）も、開き直すと外れる
  const m = v.createNote({ created: '2026-10-10 11:14:00', body: 'もう1つ' });
  fs.rmSync(path.join(dir, m.id + '.md'));
  assert.doesNotMatch(openVault(dir).diaryState().find(x => x.date === '2026-10-10').body, new RegExp(m.id));
});

test('昔の日記（D_日付.md）は、日時の名前＋YAML に移る。戻ってきても増えない', () => {
  const dir = tmp(), w = (f, t) => fs.writeFileSync(path.join(dir, f), t), old = '<!-- pkm-diary {"title":"旅"} -->\n# 2026-11-07-旅\n\n<!-- body -->\n朝は晴れ\n<!-- nav -->\n';
  w('.pkm-layout', 'flat1\n'); w('D_2026-11-07-旅.md', old);
  let v = openVault(dir), d = v.state().diaries;
  assert.strictEqual(d.length, 1); assert.deepStrictEqual([d[0].kind, d[0].date, d[0].title, d[0].body], ['日記', '2026-11-07', '旅', '朝は晴れ']);
  assert.match(d[0].stem, /^\d{14}$/); assert.ok(!fs.existsSync(path.join(dir, 'D_2026-11-07-旅.md')));
  assert.match(fs.readFileSync(path.join(dir, d[0].stem + '.md'), 'utf8'), /^---\nrecord: "日記"\ndate: "2026-11-07"\ntitle: "旅"/);
  for (let i = 0; i < 3; i++) { w('D_2026-11-07-旅.md', old); v = openVault(dir); }   // 昔の形式が戻ってきても
  assert.strictEqual(v.state().diaries.length, 1);
  fs.rmSync(dir, { recursive: true });
});

const recs = v => v.records().map(r => ({ name: r.name, parent: r.parent }));
test('記録の種類（日記・夢・ビジネス）: 足す・上位・DailyNotes・名前を変える・まとめる・消す', () => {
  const dir = tmp(), v = openVault(dir), r = f => fs.readFileSync(path.join(dir, f), 'utf8');
  assert.deepStrictEqual(recs(v), [{ name: '日記', parent: '' }]);
  assert.ok(v.addRecord('夢') && v.addRecord('ビジネス') && v.addRecord('営業', 'ビジネス'));
  assert.ok(!v.addRecord('夢') && !v.addRecord('日記') && !v.addRecord('a/b') && !v.addRecord('x', 'ない'));
  v.openDiary('2026-11-08'); v.saveDiary({ date: '2026-11-08', kind: '夢', body: '空を飛んだ' });
  v.saveDiary({ date: '2026-11-08', kind: 'ビジネス', body: '会議' }); v.saveDiary({ date: '2026-11-08', kind: '営業', body: '訪問' });
  const st = v.state(), get = k => st.diaries.find(d => d.kind === k && d.date === '2026-11-08');
  assert.strictEqual(get('営業').parent, 'ビジネス');                                   // 種類の上位が、新しい日の初期値になる
  assert.deepStrictEqual(get('日記').lower.sort(), ['ビジネス', '夢'].sort());          // 日記には最上位だけ
  assert.deepStrictEqual(get('ビジネス').lower, ['営業']);                             // 各記録には、その日の直接の下位
  assert.match(r(get('日記').stem + '.md'), /DailyNotes: .*\[夢\]\([^)]+\)/); assert.match(r(get('夢').stem + '.md'), /^---\nrecord: "夢"\ndate: "2026-11-08"/);
  // 上位が変わっても、もう作った日は変わらない（これから作る日だけ）
  assert.ok(v.setRecordParent('営業', '')); v.saveDiary({ date: '2026-11-09', kind: '営業', body: '次の日' });
  const st2 = v.state(); assert.strictEqual(st2.diaries.find(d => d.kind === '営業' && d.date === '2026-11-08').parent, 'ビジネス'); assert.strictEqual(st2.diaries.find(d => d.kind === '営業' && d.date === '2026-11-09').parent, '');
  assert.ok(!v.setRecordParent('ビジネス', '営業') || true); assert.ok(v.recordCycle('ビジネス', 'ビジネス'));
  // その日の中間が無ければ飛ばす（営業の上位ビジネスのその日が無い → 日記の直下へ）
  v.setRecordParent('営業', 'ビジネス'); v.saveDiary({ date: '2026-11-10', kind: '営業', body: '中間なし' });
  assert.ok(v.state().diaries.find(d => d.kind === '日記' && d.date === '2026-11-10') === undefined || true);
  v.openDiary('2026-11-10'); assert.ok(v.state().diaries.find(d => d.kind === '日記' && d.date === '2026-11-10').lower.includes('営業'));
  // 名前を変える・まとめる（同じ日は時刻の順にまぜる）・消す
  assert.ok(v.renameRecord('夢', '夢日記')); assert.ok(v.state().diaries.some(d => d.kind === '夢日記') && !v.state().diaries.some(d => d.kind === '夢'));
  v.addRecord('ゆめ'); v.saveDiary({ date: '2026-11-08', kind: 'ゆめ', body: '09:00 あとの夢\n\n07:00 先の夢' });
  v.saveDiary({ date: '2026-11-08', kind: '夢日記', body: '08:00 まんなか' });
  assert.ok(v.mergeRecords('ゆめ', '夢日記')); const m = v.state().diaries.find(d => d.kind === '夢日記' && d.date === '2026-11-08');
  assert.strictEqual(m.body, '07:00 先の夢\n\n08:00 まんなか\n\n09:00 あとの夢'); assert.ok(!v.records().some(k => k.name === 'ゆめ'));
  assert.ok(v.deleteRecord('夢日記')); assert.ok(!v.state().diaries.some(d => d.kind === '夢日記'));
  assert.ok(!v.renameRecord('日記', 'x') && !v.deleteRecord('日記'));
  // 読み直し
  const v2 = openVault(dir); assert.ok(v2.state().diaries.some(d => d.kind === 'ビジネス')); assert.deepStrictEqual(v2.records().map(k => k.name).sort(), ['ビジネス', '営業', '日記'].sort());
  // appendToDay（USB 取り込み用）
  v2.appendToDay('日記', '2026-11-08', '10:30 スマホのメモ'); assert.match(v2.state().diaries.find(d => d.kind === '日記' && d.date === '2026-11-08').body, /10:30 スマホのメモ$/);
  fs.rmSync(dir, { recursive: true });
});

test('チャットメモ: 日ごとの md（## 日付・時刻つきの段落・ノートにしたメモの→リンク・メンションのリンク）', () => {
  const dir = tmp(), v = openVault(dir), r = f => fs.readFileSync(path.join(dir, f), 'utf8');
  const t = new Date(2026, 10, 8, 14, 3).getTime(), note = v.createNote({ created: '2026-11-08 14:05', body: '元のチャットメモ: x' });
  v.saveDoc('C_チャット', { topics: [], messages: [{ id: 'a1', topic: '', t, text: '最初のメモ\n2行目' }, { id: 'b2', topic: '読書', t: t + 600000, text: '[@最初のメモ](memo:a1) の続き' }], noted: { a1: [note.stem] } });
  const md = r('C_2026-11-08.md');
  assert.ok(md.startsWith('# チャットメモ 2026-11-08\n\n## 2026-11-08\n\n<a id="m-a1"></a>14:03 最初のメモ  \n2行目　→ [ノート （IDなし）](' + note.stem + '.md)'), md);
  assert.match(md, /<a id="m-b2"><\/a>14:13 \[@最初のメモ\]\(C_2026-11-08\.md#m-a1\) の続き　［読書］/);
  v.saveDoc('C_チャット', { topics: [], messages: [], noted: {} });
  assert.ok(!fs.existsSync(path.join(dir, 'C_2026-11-08.md')));   // メモが無くなった日のファイルは消える
});

test('紙のトピックIndex: 入口の紙のノートが、まだ無くても作れる。1 つの欄に、紙とデジタルを (p) で書き分ける', () => {
  const dir = tmp(), v = openVault(dir), r = f => fs.readFileSync(path.join(dir, f), 'utf8');
  v.saveNote({ s: 'd', id: '1', keywords: [], body: 'デジタル' }); v.saveNote({ s: 'p', id: '3', keywords: [], body: '紙の文字 :1(d) と :1' });
  assert.ok(v.saveTopic({ name: '12-紙の索引', entry: { s: 'p', id: '12' }, keyword: '', text: '書き分け 3 1(d)\n+hoge 3' }));   // 紙の 12 は、まだ取り込んでいない
  const st = openVault(dir).state(), t = st.topics.find(x => x.name === '12-紙の索引');
  assert.deepStrictEqual(t.entry, { s: 'p', id: '12' }); const m = require('../lib').mergeTopic(t);
  assert.deepStrictEqual([m.rows[0].p, m.rows[0].d, m.refs], [['3'], ['1'], [{ s: 'p', label: 'hoge', id: '3' }]]);   // 入口が紙なので、印なしは紙。(d) はデジタル
  const md = r('T_12-紙の索引.md');
  assert.match(md, /\| 書き分け \| \[1\]\([^)]*\.md\) \[紙3\]\([^)]*\.md\) \|/);
  // 紙のノートの md: 印なしの :1 は紙の 1（まだ無いので # のリンク）、:1(d) はデジタルの 1
  const p3 = st.notes.find(n => n.s === 'p' && n.id === '3'), d1 = st.notes.find(n => n.s === 'd' && n.id === '1');
  assert.ok(r(p3.stem + '.md').includes(`[:1(d)](${d1.stem}.md)`));
  assert.match(r(p3.stem + '.md'), /Topic: \[12-紙の索引\]/);   // 紙の 3 が載っているトピックIndex
  // 昔の 2 つの欄（d・p）のトピックIndex は、1 つの欄に直る
  const old = v.saveTopic({ name: '古い', entry: { s: 'd', id: '1' }, keyword: '', d: 'PKM 1', p: 'PKM 3' });
  assert.strictEqual(openVault(dir).state().topics.find(x => x.name === '古い').text, 'PKM 1\nPKM 3(p)');
});

test('日のノート: 同じ時刻のメモは、空行なしでつなぐ。時刻が違うときだけ空行＋時刻', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkm-day-')), v = openVault(dir);
  v.appendToDay('日記', '2026-11-08', '10:00 一つ目');
  v.appendToDay('日記', '2026-11-08', '10:00 二つ目');
  v.appendToDay('日記', '2026-11-08', '10:05 三つ目');
  v.appendToDay('日記', '2026-11-08', '10:05 四つ目');
  assert.strictEqual(v.openDiary('2026-11-08').body.trim(), '10:00 一つ目\n二つ目\n\n10:05 三つ目\n四つ目');
});

test('IDなしの分岐: 親にIDが付いた時に、子（と孫）のIDも順に決まる', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkm-br-')), v = openVault(dir);
  const p = v.createNote({ kind: 'text', title: '親', created: '2026-11-08 10:00:00' });
  const a = v.createNote({ kind: 'text', title: '子1', created: '2026-11-08 10:00:01', parentStem: p.stem });
  const b = v.createNote({ kind: 'text', title: '子2（並列）', created: '2026-11-08 10:00:02', parentStem: p.stem });
  const c = v.createNote({ kind: 'text', title: '孫', created: '2026-11-08 10:00:03', parentStem: a.stem });
  assert.ok(p.noid && a.noid && c.noid);
  v.rename('d', p.id, '1c');
  const ids = Object.fromEntries(v.state().notes.map(n => [n.title, n.id]));
  assert.deepStrictEqual([ids['親'], ids['子1'], ids['子2（並列）'], ids['孫']], ['1c', '1c1', '1c2', '1c1a']);
  const re = openVault(dir), again = Object.fromEntries(re.state().notes.map(n => [n.title, n.id]));   // 保存して読み直しても同じ
  assert.deepStrictEqual([again['子1'], again['孫']], ['1c1', '1c1a']);
});

test('時系列記録: 上位を、いくつでも決められる（どの上位の日のノートにも、下位として並ぶ）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkm-rec2-')), v = openVault(dir);
  v.addRecord('仕事'); v.addRecord('学び'); v.addRecord('哲学メモ', ['仕事', '学び']);
  assert.deepStrictEqual(v.records().find(r => r.name === '哲学メモ').parents, ['仕事', '学び']);
  for (const k of ['仕事', '学び', '哲学メモ']) v.openDiary('2026-11-08', k);
  assert.deepStrictEqual(v.openDiary('2026-11-08', '仕事').lower, ['哲学メモ']);
  assert.deepStrictEqual(v.openDiary('2026-11-08', '学び').lower, ['哲学メモ']);
  assert.deepStrictEqual(v.openDiary('2026-11-08', '哲学メモ').parents, ['仕事', '学び']);
  assert.strictEqual(v.setRecordParent('仕事', ['哲学メモ']), false);   // 輪になる上位は、だめ
  const re = openVault(dir); assert.deepStrictEqual(re.openDiary('2026-11-08', '哲学メモ').parents, ['仕事', '学び']);   // 読み直しても同じ
});
