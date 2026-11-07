const { contextBridge, ipcRenderer: r } = require('electron');
contextBridge.exposeInMainWorld('api', {
  load: () => r.invoke('load'),
  saveNote: n => r.invoke('saveNote', n),
  rename: (s, a, b) => r.invoke('rename', s, a, b),
  saveImage: (s, id, bytes) => r.invoke('saveImage', s, id, bytes),
  saveTopic: (t, old) => r.invoke('saveTopic', t, old),
  deleteTopic: name => r.invoke('deleteTopic', name),
  deleteNotes: items => r.invoke('deleteNotes', items),
  addFiles: list => r.invoke('addFiles', list),
  openPath: rel => r.invoke('openPath', rel),
  setReading: (k, yomi) => r.invoke('setReading', k, yomi),
  suggest: text => r.invoke('suggest', text),
  chooseVault: () => r.invoke('chooseVault')
});
