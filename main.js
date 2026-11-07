const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const store = require('./store');

const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
const readCfg = () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch { return {}; } };
const writeCfg = c => { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c)); };

let vault = process.env.PAPER_PKM_VAULT || readCfg().vault || path.join(os.homedir(), 'PaperPKM');
let v = null;
const open = () => { v = store.openVault(vault); return v.state(); };

ipcMain.handle('load', () => open());
ipcMain.handle('saveNote', (_e, n) => v.saveNote(n));
ipcMain.handle('rename', (_e, s, a, b) => v.rename(s, a, b));
ipcMain.handle('saveImage', (_e, s, id, bytes) => v.saveImage(s, id, Buffer.from(bytes)));
ipcMain.handle('saveTopic', (_e, t, old) => v.saveTopic(t, old));
ipcMain.handle('deleteTopic', (_e, name) => v.deleteTopic(name));
ipcMain.handle('deleteNotes', (_e, items) => v.deleteNotes(items));
ipcMain.handle('addFiles', (_e, list) => v.addFiles(list));
// 本文のリンクを開く。ファイルは OS の既定のビューアーで、http(s) は既定のブラウザで
ipcMain.handle('openPath', (_e, rel) => {
  if (process.env.PAPER_PKM_OPENLOG) { fs.appendFileSync(process.env.PAPER_PKM_OPENLOG, decodeURIComponent(rel) + '\n'); return ''; } // 試験用: 開かず記録だけ
  if (/^https?:\/\//.test(rel)) return shell.openExternal(rel);
  const root = path.resolve(vault), full = path.resolve(root, decodeURIComponent(rel));
  if (!full.startsWith(root + path.sep)) return 'blocked';
  return shell.openPath(full);
});
ipcMain.handle('diaryState', () => v.diaryState());
ipcMain.handle('openDiary', (_e, date) => v.openDiary(date));
ipcMain.handle('saveDiary', (_e, d) => v.saveDiary(d));
ipcMain.handle('deleteDiary', (_e, date) => v.deleteDiary(date));
ipcMain.handle('addDiaryScan', (_e, date, bytes) => v.addDiaryScan(date, Buffer.from(bytes)));
ipcMain.handle('saveDoc', (_e, name, obj) => v.saveDoc(name, obj));
ipcMain.handle('deleteDoc', (_e, name) => v.deleteDoc(name));
ipcMain.handle('setReading', (_e, k, r) => v.setReading(k, r));
// 読みの候補（kuromoji。最初の1回だけ辞書を読む）
let tk = null;
const tokenizer = () => tk || (tk = new Promise((ok, ng) => require('kuromoji')
  .builder({ dicPath: path.join(path.dirname(require.resolve('kuromoji')), '..', 'dict') })
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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const w = new BrowserWindow({
    width: 1200, height: 800, title: '紙PKM', backgroundColor: '#ffffff',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  w.loadFile('index.html');
});
app.on('window-all-closed', () => app.quit());
