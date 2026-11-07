// グラフのモックの HTML を画像にする（開発用）
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1440, height: 760, show: false });
  for (const f of fs.readdirSync(__dirname).filter(x => new RegExp(process.env.ONLY||'^g\\d-.*\\.html$').test(x)).sort()) {
    try {
      await w.loadFile(path.join(__dirname, f));
      await new Promise(r => setTimeout(r, 500));
      fs.writeFileSync(path.join(__dirname, f.replace('.html', '.png')), (await w.webContents.capturePage()).toPNG());
      console.log('ok', f);
    } catch (e) { console.log('NG', f, e.message); }
  }
  app.quit();
});
