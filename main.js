const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
const readCfg = () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch { return {}; } };
const writeCfg = c => { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c)); };
let vault = readCfg().vault || path.join(os.homedir(), 'PaperPKM');

const IMG = ['.jpg', '.jpeg', '.png', '.webp'];
const validId = s => /^[0-9][0-9a-z]*$/.test(s) && !/^\d{8,}$/.test(s); // 日時名のファイルは除外
const mdPath = id => path.join(vault, id + '.md');
const imgPath = id => IMG.map(e => path.join(vault, id + e)).find(fs.existsSync);

function parse(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = {}; let body = text;
  if (m) { body = m[2]; m[1].split('\n').forEach(l => { const i = l.indexOf(':'); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }); }
  return { date: meta.date || '', keywords: meta.keywords || '', body: body.replace(/\n$/, '') };
}
const dump = n => `---\ndate: ${n.date}\nkeywords: ${n.keywords}\n---\n${n.body}\n`;

function list() {
  fs.mkdirSync(vault, { recursive: true });
  const ids = new Set();
  for (const f of fs.readdirSync(vault)) {
    const e = path.extname(f).toLowerCase(), b = path.basename(f, path.extname(f));
    if ((e === '.md' || IMG.includes(e)) && validId(b)) ids.add(b);
  }
  return [...ids].map(id => {
    const n = fs.existsSync(mdPath(id)) ? parse(fs.readFileSync(mdPath(id), 'utf8')) : { date: '', keywords: '', body: '' };
    const ip = imgPath(id);
    return { id, ...n, image: ip ? 'file://' + encodeURI(ip) + '?' + fs.statSync(ip).mtimeMs : null };
  });
}

ipcMain.handle('vault', () => vault);
ipcMain.handle('list', list);
ipcMain.handle('save', (_e, n) => { fs.mkdirSync(vault, { recursive: true }); fs.writeFileSync(mdPath(n.id), dump(n)); });
ipcMain.handle('saveImage', (_e, id, bytes) => {
  for (const e of IMG) { const p = path.join(vault, id + e); if (fs.existsSync(p)) fs.unlinkSync(p); }
  const p = path.join(vault, id + '.jpg'); fs.writeFileSync(p, Buffer.from(bytes));
  return 'file://' + encodeURI(p) + '?' + Date.now();
});
ipcMain.handle('remove', (_e, id) => {
  const t = path.join(vault, '.trash'); fs.mkdirSync(t, { recursive: true });
  [mdPath(id), imgPath(id)].filter(p => p && fs.existsSync(p)).forEach(p => fs.renameSync(p, path.join(t, Date.now() + '-' + path.basename(p))));
});
ipcMain.handle('rename', (_e, a, b) => {
  if (fs.existsSync(mdPath(b)) || imgPath(b)) return false;
  if (fs.existsSync(mdPath(a))) fs.renameSync(mdPath(a), mdPath(b));
  const ip = imgPath(a); if (ip) fs.renameSync(ip, path.join(vault, b + path.extname(ip)));
  return true;
});
ipcMain.handle('chooseVault', async () => {
  const r = await dialog.showOpenDialog({ title: 'ノートを保存するフォルダ', defaultPath: vault, properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled) return null;
  vault = r.filePaths[0]; writeCfg({ vault }); return vault;
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const w = new BrowserWindow({
    width: 1100, height: 750, title: '紙PKM', backgroundColor: '#ffffff',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  w.loadFile('index.html');
});
app.on('window-all-closed', () => app.quit());
