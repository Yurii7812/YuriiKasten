const { contextBridge, ipcRenderer: r } = require('electron');
contextBridge.exposeInMainWorld('api', {
  vault: () => r.invoke('vault'),
  list: () => r.invoke('list'),
  save: n => r.invoke('save', { id: n.id, date: n.date, keywords: n.keywords, body: n.body }),
  saveImage: (id, bytes) => r.invoke('saveImage', id, bytes),
  remove: id => r.invoke('remove', id),
  rename: (a, b) => r.invoke('rename', a, b),
  chooseVault: () => r.invoke('chooseVault')
});
