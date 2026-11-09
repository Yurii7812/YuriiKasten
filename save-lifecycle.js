let nextRequest = 0;
function requestFlush(win, ipc, timeoutMs = 15000) {
  if (!win || win.isDestroyed()) return Promise.reject(new Error('保存画面に接続できません'));
  const request = ++nextRequest;
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timeout); ipc.removeListener('flush-done', done); ipc.removeListener('flush-failed', failed); };
    const done = (event, id) => { if (event.sender === win.webContents && id === request) { cleanup(); resolve(); } };
    const failed = (event, id, message) => { if (event.sender === win.webContents && id === request) { cleanup(); reject(new Error(message)); } };
    const timeout = setTimeout(() => { cleanup(); reject(new Error('保存の完了を確認できませんでした')); }, timeoutMs);
    ipc.on('flush-done', done); ipc.on('flush-failed', failed);
    try { win.webContents.send('flush-now', request); } catch (error) { cleanup(); reject(error); }
  });
}
function guardClose(win, flush, onError) {
  let saved = false, closing = false;
  win.on('close', async event => {
    if (saved) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    try { await flush(); saved = true; if (!win.isDestroyed()) win.close(); }
    catch (error) { if (!win.isDestroyed()) onError(error); }
    finally { closing = false; }
  });
}
module.exports = { requestFlush, guardClose };
