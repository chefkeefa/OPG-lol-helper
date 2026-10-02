const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('rec', {
  onStart: (cb) => ipcRenderer.on('rec:start', (_e, o) => cb(o)),
  onStop: (cb) => ipcRenderer.on('rec:stop', () => cb()),
  chunk: (buf) => ipcRenderer.send('rec:chunk', buf),
  started: () => ipcRenderer.send('rec:started'),
  stopped: () => ipcRenderer.send('rec:stopped'),
  error: (msg) => ipcRenderer.send('rec:error', msg),
})
