const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pkm-phone-'));
// 本物の adb の代わりに、呼ばれ方を記録するだけの adb
function fakeAdb(dir, devices, installOut = 'Performing Streamed Install\nSuccess') {
  const f = path.join(dir, 'adb');
  fs.writeFileSync(f, `#!/bin/sh
echo "$@" >> "${dir}/calls.log"
case "$*" in
  devices) printf 'List of devices attached\\n${devices}\\n' ;;
  *install*) echo '${installOut}' ;;
  *"cat files/settings.json"*) if [ -f "${dir}/settings.out" ]; then cat "${dir}/settings.out"; else echo '{"alarmOn":true}'; fi ;;
  *"sh -c 'cat > files/settings.json'"*) cat > "${dir}/settings.out" ;;
esac
exit 0
`, { mode: 0o755 });
  return f;
}
const load = () => { delete require.cache[require.resolve('../phone')]; return require('../phone'); };

test('adb devices の出力を読む', () => {
  const P = load();
  assert.deepStrictEqual(P.parseDevices('List of devices attached\nABC123\tdevice\nXYZ\tunauthorized\n\n'), [{ serial: 'ABC123', state: 'device' }, { serial: 'XYZ', state: 'unauthorized' }]);
  assert.deepStrictEqual(P.parseDevices('List of devices attached\n\n'), []);
});

test('スマホが無い・許可待ちのときは、やることを案内する', async () => {
  const d = tmp(); process.env.ADB = fakeAdb(d, ''); let r = await load().install({}, () => { });
  assert.ok(!r.ok && /USBデバッグ/.test(r.message));
  process.env.ADB = fakeAdb(d, 'XYZ\\tunauthorized'); r = await load().install({}, () => { });
  assert.ok(!r.ok && /許可/.test(r.message));
});

test('入れる（USB）。設定は渡さない', async () => {
  const d = tmp(); process.env.ADB = fakeAdb(d, 'ABC123\\tdevice');
  const r = await load().install({}, () => { });
  assert.ok(r.ok, r.message);
  assert.match(fs.readFileSync(path.join(d, 'calls.log'), 'utf8'), /-s ABC123 install -r .*YuriiNote-memo\.apk/);
  assert.ok(!fs.existsSync(path.join(d, 'settings.out')));
});

test('入れるのに失敗したら、理由を返す', async () => {
  const d = tmp(); process.env.ADB = fakeAdb(d, 'ABC123\\tdevice', 'Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]');
  const r = await load().install({}, () => { }); assert.ok(!r.ok && /INSTALL_FAILED/.test(r.message));
});

// スマホの代わりに、フォルダ（data/files/…）を読み書きする adb
function fakePhone(dir) {
  const data = path.join(dir, 'data'); fs.mkdirSync(path.join(data, 'files/images'), { recursive: true }); fs.mkdirSync(path.join(data, 'files/scans'), { recursive: true });
  const f = path.join(dir, 'adb');
  fs.writeFileSync(f, `#!/bin/sh
D="${data}"
case "$*" in
  devices) printf 'List of devices attached\\nPH1\\tdevice\\n' ;;
  *"pm path net.yurii.note"*) echo 'package:/x' ;;
  *"exec-out run-as net.yurii.note cat "*) rel="\${*##*cat }"; cat "$D/$rel" ;;
  *"sh -c 'cat > "*) rel="\$(echo "$*" | sed -E "s/.*cat > ([^']*)'.*/\\1/")"; cat > "$D/$rel" ;;
  *"run-as net.yurii.note mv "*) all="$*"; tail="\${all##*mv }"; set -- $tail; mv "$D/$1" "$D/$2" ;;
esac
exit 0
`, { mode: 0o755 });
  return { adb: f, data };
}

test('スマホのメモを USB で取り込む: 未整理・日記・記録・まとめ・スキャン。取り込み済みの印をスマホへ返す', async () => {
  const d = tmp(), ph = fakePhone(d), vdir = tmp(); process.env.ADB = ph.adb;
  const t0 = new Date(2026, 10, 8, 9, 30, 0).getTime(), w = (rel, x) => fs.writeFileSync(path.join(ph.data, rel), x);
  const entries = [
    { id: 'a', created: t0, topic: '', text: '未整理のメモ', images: ['p1.jpg'], parent: null, contexts: [], exported: false, edited: 0 },
    { id: 'b', created: t0 + 60000, topic: '', text: '続き [元](memo:a)', images: [], parent: 'a', contexts: ['a'], exported: false, edited: 0 },
    { id: 'c', created: t0 + 120000, topic: '日記', text: '朝の日記', images: [], parent: null, contexts: [], exported: false, edited: 0 },
    { id: 'd', created: t0 + 180000, topic: '夢', text: '空を飛んだ', images: [], parent: null, contexts: [], exported: false, edited: 0 },
    { id: 'e', created: t0 + 240000, topic: '読書', text: '1 行目', images: [], parent: null, contexts: [], exported: false, edited: 0 },
  ];
  w('files/entries.json', JSON.stringify(entries)); w('files/images/p1.jpg', Buffer.from([0xff, 0xd8, 1]));
  w('files/settings.json', JSON.stringify({ topicModes: { 夢: { record: true }, 読書: { single: true, stamp: true } } }));
  w('files/scans/scans.json', JSON.stringify([{ name: 'paper-scan-1.jpg', id: '12a', imported: false }, { name: 'paper-scan-2.jpg', id: '', imported: false }]));
  w('files/scans/paper-scan-1.jpg', Buffer.from([0xff, 0xd8, 2])); w('files/scans/paper-scan-2.jpg', Buffer.from([0xff, 0xd8, 3]));
  const P = load(), C = require('../capture'), { openVault } = require('../store');
  const r = await P.pull(); assert.ok(r.ok, r.message); assert.strictEqual(r.data.entries.length, 5); assert.ok(r.data.images['p1.jpg'].length === 3);
  assert.deepStrictEqual(Object.keys(r.data.scans.files), ['paper-scan-1.jpg']);   // 番号の無いスキャンは、取らない
  const v = openVault(vdir), out = C.importCapture(v, r.data), st = v.state(), chat = st.docs['C_チャット'];
  assert.deepStrictEqual([out.sum.chats, out.sum.days, out.sum.appended, out.sum.scans, out.sum.blankScans], [5, 2, 1, 1, 1]);
  const ma = chat.messages.find(m => m.text.includes('未整理のメモ')), mb = chat.messages.find(m => m.text.includes('続き'));
  assert.ok(/!\[\]\(\d{14}\.jpg\)/.test(ma.text) && ma.topic === '');                               // 写真は日時の名前で取り込まれる
  assert.ok(mb.text.startsWith(`[@未整理のメモ](memo:${ma.id}) `));                                       // 分岐元・文脈は、返信の @ になる（親・文脈は持たない）
  assert.ok(!chat.messages.some(m => 'parent' in m || 'ctx' in m));
  assert.strictEqual(st.notes.filter(n => n.noid && n.title !== '読書').length, 0);                       // 普通のメモは、ノートにならない
  assert.match(st.diaries.find(x => x.kind === '日記').body, /09:32 朝の日記/); assert.match(st.diaries.find(x => x.kind === '夢').body, /09:33 空を飛んだ/);   // 日記・記録には、行としても入る
  assert.ok(chat.messages.some(m => m.topic === '日記' && m.text.includes('朝の日記')) && chat.messages.some(m => m.topic === '夢'));
  assert.ok(st.records.some(k => k.name === '夢'));                                                  // 記録の種類は、なければ足される
  assert.ok(chat.topics.some(t => t.name === '読書'));
  const book = st.notes.find(n => n.title === '読書'); assert.match(book.body, /## 2026-11-08[\s\S]*09:34 1 行目/);
  assert.ok(st.notes.find(n => n.s === 'p' && n.id === '12a').image);                                // 番号つきのスキャン → 紙のノート
  assert.ok(fs.readdirSync(vdir).some(f => /^C_2026-11-08\.md$/.test(f)) && /09:30 未整理のメモ/.test(fs.readFileSync(path.join(vdir, 'C_2026-11-08.md'), 'utf8')));   // 日ごとの md
  const m = await P.mark(C.importedEntries(v), out.scansDone); assert.ok(m.ok);
  const imp = JSON.parse(fs.readFileSync(path.join(ph.data, 'files/imported.json'), 'utf8')); assert.strictEqual(imp.entries.length, 5);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(ph.data, 'files/scans_done.json'), 'utf8')), ['paper-scan-1.jpg']);
  // もう一度取り込んでも、増えない
  const out2 = C.importCapture(v, (await P.pull()).data); assert.deepStrictEqual([out2.sum.chats, out2.sum.days, out2.sum.already], [0, 0, 5]);
  assert.strictEqual(openVault(vdir).state().docs['C_チャット'].messages.length, 5);
  // チャットメモを消して、ごみ箱からも無くなったら、そのメモは「取り込み済み」に含めない
  const cd = v.state().docs['C_チャット']; cd.messages = cd.messages.filter(x => x.id !== ma.id); cd.trash = []; v.saveDoc('C_チャット', cd); assert.strictEqual(C.importedEntries(v).length, 4);
  await P.sendRecords(['夢'], ['アイデア', '夢']); assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(ph.data, 'files/records.json'), 'utf8')).records, ['夢']); assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(ph.data, 'files/records.json'), 'utf8')).topics, ['アイデア']);
});

test('スマホにアプリが無い・つながっていないときは、やることを案内する（取り込み）', async () => {
  const d = tmp(); process.env.ADB = fakeAdb(d, ''); const r = await load().pull();
  assert.ok(!r.ok && /USBデバッグ/.test(r.message));
});
