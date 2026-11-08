const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const store = require('./store');
const upd = require('./update');

// ===== コマンド: YuriiKasten --update / --check / --version / --install =====
// 開発用のフォルダ（git）か、AppImage か。どちらでもなければ（Windows / Mac のインストーラー版）更新はページを開くだけ
const argv = process.argv.slice(app.isPackaged ? 1 : 2);
const info = () => ({
  version: process.env.YURIIKASTEN_VERSION || app.getVersion(), platform: process.platform, arch: process.arch,
  appImage: process.env.APPIMAGE || null, devDir: !app.isPackaged && fs.existsSync(path.join(__dirname, '.git')) ? __dirname : null
});
if (argv.includes('--version')) { console.log(`YuriiKasten ${app.getVersion()}`); app.exit(0); }
else if (argv.includes('--update') || argv.includes('--check')) {
  (async () => {
    const i = info(), say = t => console.log(t);
    try {
      const c = await upd.check(i);
      if (c.none) return say('まだ公開されたバージョンがありません。');
      if (!c.newer) return say(`最新です（${c.current}）`);
      say(i.devDir ? `新しい変更があります（${c.latest}）` : `新しいバージョンがあります: ${c.current} → ${c.latest}`);
      if (argv.includes('--check')) return say('更新するには: YuriiKasten --update');
      const r = await upd.apply(i, c, say); say(r.message); if (r.manual) say(r.url);
    } catch (e) { console.error('更新できませんでした: ' + e.message); process.exitCode = 1; }
  })().finally(() => app.exit(process.exitCode || 0));
}

const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
const readCfg = () => {
  for (const f of [cfgFile(), path.join(app.getPath('appData'), 'paper-pkm', 'config.json')]) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { } }
  return {};
};
const writeCfg = c => { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c)); };

// 保存先: 環境変数 → 設定 → 昔の「PaperPKM」フォルダが残っていればそれ → 新しい ~/YuriiKasten
const defaultVault = () => { const old = path.join(os.homedir(), 'PaperPKM'), now = path.join(os.homedir(), 'YuriiKasten'); return fs.existsSync(old) && !fs.existsSync(now) ? old : now; };
let vault = process.env.YURIIKASTEN_VAULT || process.env.PAPER_PKM_VAULT || readCfg().vault || defaultVault();
if (process.platform === 'linux' && process.env.APPIMAGE) app.commandLine.appendSwitch('no-sandbox'); // AppImage ではサンドボックス用の権限が付けられない
let v = null;
const open = () => { v = store.openVault(vault); return v.state(); };

ipcMain.handle('load', () => open());
ipcMain.handle('state', () => v.state());

// ===== 同期（ラズパイの同期サーバーと。設定が無ければ何もしない）=====
let mainWin = null;
// ===== スマホ（USB・adb）=====
ipcMain.handle('phoneInstall', async () => require('./phone').install({}, m => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('phoneMsg', m); }));
// スマホのメモを取り込む（Gnosis の \M と同じ）。取り込んだら、スマホへ「取り込み済み」の印を返す
ipcMain.handle('phoneImport', async () => {
  const P = require('./phone'), C = require('./capture');
  const r = await P.pull(); if (!r.ok) return { ok: false, message: r.message };
  const out = C.importCapture(v, r.data);
  const m = await P.mark(C.importedEntries(v), out.scansDone);
  await P.sendRecords(v.records().map(x => x.name));
  return { ok: true, state: v.state(), message: C.summaryText(out.sum) + (m.ok ? '\nスマホには「取り込み済み」の印を返しました。もう要らないメモは、スマホの中から消せます（PC のノートは消えません）。' : '\n（取り込み済みの印は、スマホへ返せませんでした: ' + m.message + '）') };
});
ipcMain.handle('saveNote', (_e, n) => v.saveNote(n));
ipcMain.handle('createNote', (_e, x) => v.createNote(x));
ipcMain.handle('addPaperIndex', (_e, x) => v.addPaperIndex(x));
ipcMain.handle('removePaperIndex', (_e, x) => v.removePaperIndex(x));
ipcMain.handle('clearId', (_e, sp, id) => v.clearId(sp, id));
ipcMain.handle('rename', (_e, s, a, b) => v.rename(s, a, b));
ipcMain.handle('saveImage', (_e, s, id, bytes) => v.saveImage(s, id, Buffer.from(bytes)));
ipcMain.handle('saveTopic', (_e, t, old) => v.saveTopic(t, old));
ipcMain.handle('deleteTopic', (_e, name) => v.deleteTopic(name));
ipcMain.handle('deleteNotes', (_e, items) => v.deleteNotes(items));
ipcMain.handle('addFiles', (_e, list) => v.addFiles(list));
ipcMain.handle('filesInfo', () => v.filesInfo());
ipcMain.handle('setFileInfo', (_e, name, info) => v.setFileInfo(name, info));
// 本文のリンクを開く。ファイルは OS の既定のビューアーで、http(s) は既定のブラウザで
ipcMain.handle('openPath', (_e, rel) => {
  if (process.env.YURIIKASTEN_OPENLOG) { fs.appendFileSync(process.env.YURIIKASTEN_OPENLOG, decodeURIComponent(rel) + '\n'); return ''; } // 試験用: 開かず記録だけ
  if (/^https?:\/\//.test(rel)) return shell.openExternal(rel);
  const root = path.resolve(vault), full = path.resolve(root, decodeURIComponent(rel));
  if (!full.startsWith(root + path.sep)) return 'blocked';
  return shell.openPath(full);
});
ipcMain.handle('diaryState', () => v.diaryState());
ipcMain.handle('openDiary', (_e, date, kind) => v.openDiary(date, kind));
ipcMain.handle('saveDiary', (_e, d) => v.saveDiary(d));
ipcMain.handle('deleteDiary', (_e, date, kind) => v.deleteDiary(date, kind));
ipcMain.handle('recordOp', (_e, op, ...a) => ['addRecord', 'setRecordParent', 'setDayParent', 'renameRecord', 'deleteRecord', 'mergeRecords'].includes(op) ? v[op](...a) : false);
ipcMain.handle('addDiaryScan', (_e, date, bytes) => v.addDiaryScan(date, Buffer.from(bytes)));
ipcMain.handle('saveDoc', (_e, name, obj) => v.saveDoc(name, obj));
ipcMain.handle('deleteDoc', (_e, name) => v.deleteDoc(name));
ipcMain.handle('setReading', (_e, k, r) => v.setReading(k, r));
// 読みの候補（kuromoji。最初の1回だけ辞書を読む）
let tk = null;
const tokenizer = () => tk || (tk = new Promise((ok, ng) => require('kuromoji')
  .builder({ dicPath: path.join(path.dirname(require.resolve('kuromoji')), '..', 'dict').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep) })
  .build((e, t) => e ? ng(e) : ok(t))));
ipcMain.handle('suggest', async (_e, text) => {
  const t = await tokenizer();
  return require('./lib').toHira(t.tokenize(text).map(x => x.reading && x.reading !== '*' ? x.reading : x.surface_form).join(''));
});
ipcMain.handle('chooseVault', async () => {
  const r = await dialog.showOpenDialog({ title: 'ノートを保存するフォルダ', defaultPath: vault, properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled) return null;
  vault = r.filePaths[0]; writeCfg({ vault }); return open();
});

// ===== ショートカット（デスクトップ）とコマンド =====
//  Windows: インストーラーが、デスクトップとスタートメニューに作る
//  Mac: アプリをデスクトップに置くショートカット（エイリアス）を作る
//  Linux: AppImage を ~/.local/share/YuriiKasten に置き、アプリ一覧・デスクトップのショートカットと `YuriiKasten` コマンドを作る
function installShortcuts() {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    const exe = app.getPath('exe'), bundle = exe.includes('.app/') ? exe.slice(0, exe.indexOf('.app/') + 4) : null;
    if (!bundle) return '開発中は作れません';
    const link = path.join(home, 'Desktop', 'YuriiKasten');
    try { fs.rmSync(link, { force: true }); fs.symlinkSync(bundle, link); } catch (e) { return 'ショートカットを作れませんでした: ' + e.message; }
    return `デスクトップに YuriiKasten のショートカットを作りました`;
  }
  if (process.platform === 'win32') return 'Windows は、インストーラーがデスクトップとスタートメニューに作ります';
  const dir = path.join(home, '.local', 'share', 'YuriiKasten'), bin = path.join(home, '.local', 'bin');
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(bin, { recursive: true });
  let exec;
  if (process.env.APPIMAGE) { // AppImage: 決まった場所へ置く
    exec = path.join(dir, 'YuriiKasten.AppImage');
    if (path.resolve(process.env.APPIMAGE) !== exec) { fs.copyFileSync(process.env.APPIMAGE, exec); fs.chmodSync(exec, 0o755); }
    fs.copyFileSync(path.join(__dirname, 'update.js'), path.join(dir, 'update.js'));
    fs.writeFileSync(path.join(dir, 'install.json'), JSON.stringify({ appImage: exec, version: app.getVersion() }));
    fs.writeFileSync(path.join(bin, 'YuriiKasten'), `#!/bin/sh
# YuriiKasten のコマンド。--update / --check / --version は、画面なしで動く
case "$1" in
  --update|--check|--version) exec env ELECTRON_RUN_AS_NODE=1 "${exec}" "${path.join(dir, 'update.js')}" "$@" ;;
  *) exec "${exec}" "$@" ;;
esac
`, { mode: 0o755 });
  } else { // 開発用のフォルダ: そのまま起動する
    exec = path.join(__dirname, 'yuriikasten.sh');
    fs.writeFileSync(path.join(bin, 'YuriiKasten'), `#!/bin/sh
exec "${exec}" "$@"
`, { mode: 0o755 });
  }
  const icon = path.join(dir, 'icon.png'); try { fs.copyFileSync(path.join(__dirname, 'build', 'icon.png'), icon); } catch { }
  const entry = `[Desktop Entry]\nType=Application\nName=YuriiKasten\nComment=紙のPKM（ツェッテルカステン）をデジタルで\nExec="${exec}" %U\nIcon=${icon}\nTerminal=false\nCategories=Office;\n`.replace(/\\n/g, '\n');
  const apps = path.join(home, '.local', 'share', 'applications'); fs.mkdirSync(apps, { recursive: true });
  fs.writeFileSync(path.join(apps, 'YuriiKasten.desktop'), entry, { mode: 0o755 });
  const desk = path.join(home, 'Desktop'); let onDesk = false;
  if (fs.existsSync(desk)) { const f = path.join(desk, 'YuriiKasten.desktop'); fs.writeFileSync(f, entry, { mode: 0o755 }); onDesk = true; try { require('child_process').execFileSync('gio', ['set', f, 'metadata::trusted', 'true'], { stdio: 'ignore' }); } catch { } }
  return `アプリ一覧${onDesk ? 'と、デスクトップ' : ''}にショートカットを作りました。端末では YuriiKasten で開けます（更新は YuriiKasten --update）`;
}
if (argv.includes('--install') || argv.includes('--install-shortcuts')) { app.whenReady().then(() => { console.log(installShortcuts()); app.exit(0); }); }

// アプリの情報・更新（ユーザーが押したときだけ。自動では確認も更新もしない）
ipcMain.handle('appInfo', () => ({ version: app.getVersion(), platform: process.platform, selfUpdate: !!(process.env.APPIMAGE || info().devDir), mode: info().devDir ? 'git' : process.env.APPIMAGE ? 'appimage' : 'installer' }));
ipcMain.handle('checkUpdate', async () => { try { const c = await upd.check(info()); return { ok: true, ...c, release: undefined, asset: c.asset && c.asset.name }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('doUpdate', async () => {
  try {
    const i = info(), c = await upd.check(i), r = await upd.apply(i, c);
    if (r.manual) shell.openExternal(r.url);
    return { ok: true, ...r };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('installShortcuts', () => installShortcuts());
ipcMain.handle('openUrl', (_e, url) => /^https:\/\/github\.com\/Yurii7812\//.test(url) ? shell.openExternal(url) : null);

if (!argv.some(a => ['--version', '--update', '--check', '--install'].includes(a))) app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('jp.yurii.yuriikasten');
  Menu.setApplicationMenu(null);
  const w = new BrowserWindow({
    width: 1200, height: 800, title: 'YuriiKasten', backgroundColor: '#ffffff',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  mainWin = w; w.loadFile('index.html'); 
});
app.on('window-all-closed', () => app.quit());
