const { contextBridge, ipcRenderer: r } = require('electron');
contextBridge.exposeInMainWorld('api', {
  load: () => r.invoke('load'),
  saveNote: n => r.invoke('saveNote', n),
  rename: (s, a, b) => r.invoke('rename', s, a, b),
  saveImage: (s, id, bytes) => r.invoke('saveImage', s, id, bytes),
  saveTopic: (t, old) => r.invoke('saveTopic', t, old),
  deleteTopic: name => r.invoke('deleteTopic', name),
  chooseVault: () => r.invoke('chooseVault')
});
