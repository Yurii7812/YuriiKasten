'use strict';
// スマホにアプリを入れる（USB・adb）。YuriiKasten の「⋯」→「スマホにアプリを入れる」から使う
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const PKG = 'net.yurii.kasten';

const run = (cmd, args, { input, timeout = 120000 } = {}) => new Promise(resolve => {
  const p = cp.spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] }); let out = '', err = '', done = false;
  const t = setTimeout(() => { if (!done) { p.kill(); resolve({ code: -1, out, err: err + '（時間切れ）' }); } }, timeout);
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
  p.on('error', e => { done = true; clearTimeout(t); resolve({ code: -2, out, err: String(e.message) }); });
  p.on('close', code => { done = true; clearTimeout(t); resolve({ code, out, err }); });
  if (input !== undefined) p.stdin.end(input); else p.stdin.end();
});

// adb の場所: 環境変数 ADB → PATH → よくある場所
function findAdb() {
  const cands = [process.env.ADB, 'adb', path.join(os.homedir(), 'Android/Sdk/platform-tools/adb'), path.join(process.env.ANDROID_HOME || '', 'platform-tools/adb'),
    path.join(process.env.LOCALAPPDATA || '', 'Android/Sdk/platform-tools/adb.exe'), '/opt/android-sdk/platform-tools/adb'].filter(Boolean);
  for (const c of cands) {
    if (c === 'adb') { for (const d of (process.env.PATH || '').split(path.delimiter)) for (const n of ['adb', 'adb.exe']) if (d && fs.existsSync(path.join(d, n))) return path.join(d, n); }
    else if (fs.existsSync(c)) return c;
  }
  return null;
}
// APK の場所: 配布版は resources、git のフォルダは downloads
function apkPath() {
  const c = [process.resourcesPath && path.join(process.resourcesPath, 'YuriiKasten-memo.apk'), path.join(__dirname, 'downloads', 'YuriiKasten-memo.apk'), path.join(__dirname, 'android/app/build/outputs/apk/fast/app-fast.apk')].filter(Boolean);
  return c.find(f => fs.existsSync(f)) || null;
}
// `adb devices` の出力 → [{serial, state}]
function parseDevices(out) {
  return out.split('\n').slice(1).map(l => l.trim().split(/\s+/)).filter(a => a.length >= 2 && a[0]).map(a => ({ serial: a[0], state: a[1] }));
}

async function install(opts = {}, say = () => { }) {
  const adb = findAdb();
  if (!adb) return { ok: false, message: 'adb（Android の USB 接続の道具）が見つかりません。\nLinux: sudo apt install adb ／ Mac: brew install android-platform-tools ／ Windows: 「Android SDK Platform-Tools」を入れてください。' };
  const apk = apkPath();
  if (!apk) return { ok: false, message: 'スマホ用アプリのファイルが見つかりません（downloads/YuriiKasten-memo.apk）。android/build-apk.sh で作れます。' };
  say('スマホを探しています…');
  const d = await run(adb, ['devices']); const list = parseDevices(d.out);
  const ready = list.filter(x => x.state === 'device');
  if (!ready.length) {
    if (list.some(x => x.state === 'unauthorized')) return { ok: false, message: 'スマホの画面に「USBデバッグを許可しますか？」と出ています。「許可」を押して、もう一度やってください。' };
    return { ok: false, message: 'スマホが見つかりません。\n1. USB ケーブルでつなぐ\n2. 設定 → 開発者向けオプション → USBデバッグ をオン\n3. 画面に出る許可を押す\nそのあと、もう一度やってください。' };
  }
  const serial = ready[0].serial, A = a => ['-s', serial, ...a];
  say(`スマホに入れています…（${serial}）`);
  const r = await run(adb, A(['install', '-r', apk]), { timeout: 180000 });
  if (r.code !== 0 || !/Success/.test(r.out)) return { ok: false, message: '入れられませんでした:\n' + (r.out + r.err).trim().split('\n').slice(-4).join('\n') };
  const note = '';
  if (opts.open !== false) await run(adb, A(['shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1']));
  return { ok: true, message: 'スマホにアプリを入れました（YuriiKasten メモ）。' + note + (ready.length > 1 ? `\n（つながっていたスマホが複数あったので、${serial} に入れました）` : '') };
}

// ===== スマホのメモを USB で取り込む（Gnosis の \M と同じやり方）=====
// アプリの中のデータ（files/entries.json・images/・scans/・settings.json）を、adb の run-as で直接読む（デバッグ版の APK だけ）
const runBuf = (cmd, args, { input, timeout = 120000 } = {}) => new Promise(resolve => {
  const p = cp.spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] }); const out = []; let err = '', done = false;
  const t = setTimeout(() => { if (!done) { p.kill(); resolve({ code: -1, out: Buffer.concat(out), err: err + '（時間切れ）' }); } }, timeout);
  p.stdout.on('data', d => out.push(d)); p.stderr.on('data', d => err += d);
  p.on('error', e => { done = true; clearTimeout(t); resolve({ code: -2, out: Buffer.concat(out), err: String(e.message) }); });
  p.on('close', code => { done = true; clearTimeout(t); resolve({ code, out: Buffer.concat(out), err }); });
  p.stdin.end(input !== undefined ? input : undefined);
});
// つながっているスマホ（1 台）と、アプリが入っているか。だめなら { error: やること }
async function ready() {
  const adb = findAdb();
  if (!adb) return { error: 'adb（Android の USB 接続の道具）が見つかりません。\nLinux: sudo apt install adb ／ Mac: brew install android-platform-tools ／ Windows: 「Android SDK Platform-Tools」を入れてください。' };
  const list = parseDevices((await run(adb, ['devices'])).out), devs = list.filter(x => x.state === 'device');
  if (!devs.length) return { error: list.some(x => x.state === 'unauthorized') ? 'スマホの画面に「USBデバッグを許可しますか？」と出ています。「許可」を押して、もう一度やってください。' : 'スマホが見つかりません。\n1. USB ケーブルでつなぐ\n2. 設定 → 開発者向けオプション → USBデバッグ をオン\n3. 画面に出る許可を押す\nそのあと、もう一度やってください。' };
  if (devs.length > 1) return { error: 'スマホが 2 台以上つながっています。1 台だけにしてください。' };
  const serial = devs[0].serial, A = a => ['-s', serial, ...a];
  const pm = await run(adb, A(['shell', 'pm', 'path', PKG]));
  if (!/package:/.test(pm.out)) return { error: 'スマホに YuriiKasten のアプリが入っていません。「スマホにアプリを入れる…」で入れてください。' };
  return { adb, serial, A };
}
const cat = (r, rel) => runBuf(r.adb, r.A(['exec-out', 'run-as', PKG, 'cat', rel]));
const putFile = async (r, rel, text) => {   // アプリの権限で、一時ファイルに書いてから置き換える
  const w = await run(r.adb, r.A(['shell', `run-as ${PKG} sh -c 'cat > ${rel}.tmp'`]), { input: text });
  if (w.code !== 0) return false;
  return (await run(r.adb, r.A(['shell', `run-as ${PKG} mv ${rel}.tmp ${rel}`]))).code === 0;
};
const parseJson = (buf, fallback) => { try { return JSON.parse(buf.toString('utf8')); } catch { return fallback; } };
// スマホのメモ・写真・スキャンを読む。1 つでも読めなければ中止（取り込み済みにしない）
async function pull() {
  const r = await ready(); if (r.error) return { ok: false, message: r.error };
  const e = await cat(r, 'files/entries.json'), raw = e.out.toString('utf8').trim();
  let entries;
  if (e.code !== 0 || !raw.startsWith('[')) { if (!raw || /No such file/.test(raw + e.err)) entries = []; else return { ok: false, message: 'スマホのメモを読めませんでした: ' + (raw || e.err).slice(0, 200) + '\n（デバッグ版のアプリだけ読めます。「スマホにアプリを入れる…」で入れ直してください）' }; }
  else entries = JSON.parse(raw);
  const images = {};
  for (const n of [...new Set(entries.flatMap(x => x.images || []))]) {
    if (n.includes('/') || n.startsWith('.')) continue;
    const g = await cat(r, 'files/images/' + n); if (g.code !== 0 || !g.out.length) return { ok: false, message: '画像を読めませんでした（取り込みを中止します）: ' + n };
    images[n] = g.out;
  }
  const scans = { index: [], files: {} };
  const ix = await cat(r, 'files/scans/scans.json'); if (ix.code === 0) scans.index = parseJson(ix.out, []);
  for (const sc of scans.index) {
    if (sc.imported || !sc.id || sc.name.includes('/') || sc.name.startsWith('.')) continue;   // 番号の無いスキャンは、スマホで番号を付けてから
    const g = await cat(r, 'files/scans/' + sc.name); if (g.code !== 0 || !g.out.length) return { ok: false, message: 'スキャンを読めませんでした: ' + sc.name };
    scans.files[sc.name] = g.out;
  }
  const st = await cat(r, 'files/settings.json'), topicModes = (st.code === 0 && parseJson(st.out, {}).topicModes) || {};
  return { ok: true, data: { entries, images, scans, topicModes } };
}
// 取り込んだメモ（原本のまま）と、取り込んだスキャンの名前を、スマホへ返す → スマホに「取り込み済み」と出て、そのメモだけ消せるようになる
async function mark(importedEntries, scansDone) {
  const r = await ready(); if (r.error) return { ok: false, message: r.error };
  if (scansDone && scansDone.length && !await putFile(r, 'files/scans_done.json', JSON.stringify(scansDone))) return { ok: false, message: 'スマホへ、取り込み済みの印を返せませんでした' };
  if (!await putFile(r, 'files/imported.json', JSON.stringify({ version: 2, entries: importedEntries }))) return { ok: false, message: 'スマホへ、取り込み済みの印を返せませんでした' };
  return { ok: true };
}
// PC の記録の種類の名前を、スマホへ渡す（スマホでは選ぶだけにして、表記揺れを防ぐ）
async function sendRecords(names) {
  const r = await ready(); if (r.error) return { ok: false, message: r.error };
  return { ok: await putFile(r, 'files/records.json', JSON.stringify({ version: 1, records: names.filter(n => n && n !== '日記') })) };
}
module.exports = { install, findAdb, apkPath, parseDevices, PKG, pull, mark, sendRecords };
