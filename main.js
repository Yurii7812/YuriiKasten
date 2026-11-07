const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
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
