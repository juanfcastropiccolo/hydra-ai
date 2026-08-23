const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('spike', {
  spawn: (o) => ipcRenderer.invoke('spawn', o),
  write: (d) => ipcRenderer.send('write', d),
  resize: (o) => ipcRenderer.send('resize', o),
  detach: () => ipcRenderer.invoke('detach'),
  list: () => ipcRenderer.invoke('list'),
  cleanup: () => ipcRenderer.invoke('cleanup'),
  onData: (cb) => ipcRenderer.on('data', (_e, d) => cb(d)),
  onExit: (cb) => ipcRenderer.on('exit', (_e, c) => cb(c)),
});
