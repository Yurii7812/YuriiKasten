const { contextBridge, ipcRenderer: r } = require('electron');
contextBridge.exposeInMainWorld('api', {
  load: () => r.invoke('load'),
  saveNote: n => r.invoke('saveNote', n),
  createNote: x => r.invoke('createNote', x),
  rename: (s, a, b) => r.invoke('rename', s, a, b),
  saveImage: (s, id, bytes) => r.invoke('saveImage', s, id, bytes),
  saveTopic: (t, old) => r.invoke('saveTopic', t, old),
  deleteTopic: name => r.invoke('deleteTopic', name),
  deleteNotes: items => r.invoke('deleteNotes', items),
  addFiles: list => r.invoke('addFiles', list),
  openPath: rel => r.invoke('openPath', rel),
  diaryState: () => r.invoke('diaryState'),
  openDiary: date => r.invoke('openDiary', date),
  saveDiary: d => r.invoke('saveDiary', d),
  deleteDiary: date => r.invoke('deleteDiary', date),
  addDiaryScan: (date, bytes) => r.invoke('addDiaryScan', date, bytes),
  saveDoc: (name, obj) => r.invoke('saveDoc', name, obj),
  deleteDoc: name => r.invoke('deleteDoc', name),
  setReading: (k, yomi) => r.invoke('setReading', k, yomi),
  suggest: text => r.invoke('suggest', text),
  chooseVault: () => r.invoke('chooseVault')
});
