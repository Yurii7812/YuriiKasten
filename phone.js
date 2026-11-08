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

// opts.sync: { url, token } があれば、スマホの設定（サーバーのアドレスと合言葉）も入れる
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
  let note = '';
  if (opts.sync && opts.sync.url && opts.sync.token) { // 設定も入れる。アプリを止めてから書いて、読み返して確かめ、そのあと起動する（動いたままだと、読み込み済みの設定のまま）
    say('同期の設定を入れています…');
    await run(adb, A(['shell', 'am', 'force-stop', PKG]));
    const cur = await run(adb, A(['shell', 'run-as', PKG, 'cat', 'files/settings.json']));
    let o = {}; try { o = JSON.parse(cur.out); } catch { }
    o.serverUrl = opts.sync.url; o.serverToken = opts.sync.token;
    await run(adb, A(['shell', 'run-as', PKG, 'mkdir', '-p', 'files']));
    const w = await run(adb, A(['shell', `run-as ${PKG} sh -c 'cat > files/settings.json'`]), { input: JSON.stringify(o) });
    const back = await run(adb, A(['shell', 'run-as', PKG, 'cat', 'files/settings.json']));
    let ok = false; try { const r = JSON.parse(back.out); ok = r.serverUrl === opts.sync.url && r.serverToken === opts.sync.token; } catch { }
    note = w.code === 0 && ok ? '\n同期の設定（アドレスと合言葉）も、スマホに入れました（読み返して確かめました）。' : '\n同期の設定は入れられませんでした（' + ((w.err || back.err || '書き込み後に読み返せませんでした').trim().split('\n').pop()) + '）。スマホの ⚙️ 設定で入れてください。';
  } else if (opts.syncWanted) note = '\n同期の設定は、PC 側にまだありません。PC の「⋯ → 同期の設定…」で入れてから、もう一度やってください。';
  if (opts.open !== false) await run(adb, A(['shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1']));
  return { ok: true, message: 'スマホにアプリを入れました（YuriiKasten メモ）。' + note + (ready.length > 1 ? `\n（つながっていたスマホが複数あったので、${serial} に入れました）` : '') };
}
module.exports = { install, findAdb, apkPath, parseDevices, PKG };
