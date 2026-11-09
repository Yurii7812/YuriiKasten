const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs'), vm = require('node:vm');
const { requestFlush, guardClose } = require('../save-lifecycle');

test('close waits for confirmed success; write failure and timeout leave the window open', async () => {
  const ipc = new EventEmitter(), win = new EventEmitter();
  let closed = 0, request;
  win.isDestroyed = () => false; win.close = () => { closed++; };
  win.webContents = { send: (_channel, id) => { request = id; } };
  const errors = [];
  guardClose(win, () => requestFlush(win, ipc, 20), e => errors.push(e.message));
  const clickClose = () => { let prevented = false; win.emit('close', { preventDefault: () => { prevented = true; } }); assert.equal(prevented, true); };
  clickClose(); assert.equal(closed, 0);
  ipc.emit('flush-done', { sender: {} }, request); // Ignore another window.
  assert.equal(closed, 0);
  ipc.emit('flush-failed', { sender: win.webContents }, request, 'disk full');
  await new Promise(r => setImmediate(r));
  assert.equal(closed, 0); assert.deepEqual(errors, ['disk full']);
  clickClose(); await new Promise(r => setTimeout(r, 30));
  assert.equal(closed, 0); assert.equal(errors.length, 2);
  assert.equal(ipc.listenerCount('flush-done'), 0); assert.equal(ipc.listenerCount('flush-failed'), 0);
  clickClose(); ipc.emit('flush-done', { sender: win.webContents }, request);
  await new Promise(r => setImmediate(r)); assert.equal(closed, 1);
});

test('preload acknowledges successful flush only; rejected saves send failure', async () => {
  const ipc = new EventEmitter(), sent = []; let api;
  ipc.send = (...args) => sent.push(args);
  vm.runInNewContext(fs.readFileSync(require.resolve('../preload'), 'utf8'), {
    require: () => ({ contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } }, ipcRenderer: ipc })
  });
  let fail = true;
  api.onFlush(async () => { if (fail) throw new Error('read-only'); });
  ipc.emit('flush-now', {}, 1); await new Promise(r => setImmediate(r));
  assert.deepEqual(sent, [['flush-failed', 1, 'read-only']]);
  fail = false; ipc.emit('flush-now', {}, 2); await new Promise(r => setImmediate(r));
  assert.deepEqual(sent[1], ['flush-done', 2]);
});
