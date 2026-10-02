const { contextBridge, ipcRenderer } = require('electron')

const on = (channel) => (cb) => {
  const listener = (_e, data) => cb(data)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('rp', {
  window: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close'),
    onState: on('win:state'),
  },
  version: () => ipcRenderer.invoke('app:version'),
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  },
  riot: (host, path) => ipcRenderer.invoke('riot:fetch', host, path),
  lcu: {
    status: () => ipcRenderer.invoke('lcu:status'),
    get: (path) => ipcRenderer.invoke('lcu:get', path),
    onStatus: on('lcu:status'),
    onChampSelect: on('champselect'),
  },
  live: {
    get: () => ipcRenderer.invoke('live:get'),
    on: on('live:data'),
  },
  overlay: {
    toggle: () => ipcRenderer.invoke('overlay:toggle'),
    setBenchmarks: (b) => ipcRenderer.send('overlay:benchmarks', b),
    onBenchmarks: on('overlay:benchmarks'),
  },
  stats: {
    status: () => ipcRenderer.invoke('stats:status'),
    summary: (patches) => ipcRenderer.invoke('stats:summary', patches),
    detail: (champ, role, patches) => ipcRenderer.invoke('stats:detail', champ, role, patches),
    onUpdate: on('stats:update'),
  },
  build: {
    import: (what, build) => ipcRenderer.invoke('build:import', what, build),
    onAutoImport: on('import:done'),
  },
  spectate: (puuid, name) => ipcRenderer.invoke('lcu:spectate', puuid, name),
  update: {
    state: () => ipcRenderer.invoke('update:state'),
    install: () => ipcRenderer.invoke('update:install'),
    check: () => ipcRenderer.invoke('update:check'),
    onState: on('update:state'),
  },
  rec: {
    list: () => ipcRenderer.invoke('rec:list'),
    status: () => ipcRenderer.invoke('rec:status'),
    remove: (id) => ipcRenderer.invoke('rec:delete', id),
    clip: (id, start, end, label) => ipcRenderer.invoke('rec:clip', id, start, end, label),
    open: (file) => ipcRenderer.invoke('rec:open', file),
    toggle: () => ipcRenderer.invoke('rec:toggle'),
    onState: on('rec:state'),
  },
})
