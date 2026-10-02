const { app, BrowserWindow, ipcMain, shell, globalShortcut, screen, protocol } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { Readable } = require('node:stream')
const { LeagueClient, liveGameData } = require('./lcu.cjs')
const { RiotClient } = require('./riot.cjs')
const { Collector } = require('./collector.cjs')
const { Recorder } = require('./recorder.cjs')
const builds = require('./builds.cjs')
const { t, setLangGetter } = require('./i18n.cjs')

const DEV_URL = process.env.VITE_DEV_SERVER_URL

// recordings are played back through rpmedia://media/<file>
protocol.registerSchemesAsPrivileged([{ scheme: 'rpmedia', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }])

// ---------- settings (a JSON file in the user data folder) ----------
const settingsFile = path.join(app.getPath('userData'), 'settings.json')
const DEFAULTS = {
  riotApiKey: '',
  myRiotId: '',
  lang: 'ru',
  platform: 'euw1',
  overlayEnabled: true,
  overlayCorner: 'top-right',
  overlayScale: 1,
  overlayBenchmark: true,
  // statistics collector (tier list, builds, matchups)
  collectorEnabled: true,
  collectorPlatform: '',
  // champion select
  autoOpenChampion: true,
  autoImportRunes: true,
  autoImportItems: true,
  autoImportSpells: false,
  // recording
  recordingEnabled: false,
  recordingFolder: '',
  recordingQuality: 'medium',
  recordingFps: 30,
  recordingResolution: '1920x1080',
  recordingAudio: true,
  recordingSource: 'screen',
  recordingMaxGB: 50,
}
let settings = { ...DEFAULTS }
try {
  settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) }
} catch {}
const store = {
  get: (k) => settings[k],
  set: (k, v) => {
    settings[k] = v
    try {
      fs.mkdirSync(path.dirname(settingsFile), { recursive: true })
      fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2))
    } catch {}
  },
}
setLangGetter(() => store.get('lang'))

const lcu = new LeagueClient(store)
const riot = new RiotClient(() => store.get('riotApiKey'))
let win = null
let overlay = null
let collector = null
let recorder = null
let benchmarks = {}
const send = (channel, data) => win && !win.isDestroyed() && win.webContents.send(channel, data)

function load(w, hash = '') {
  if (DEV_URL) w.loadURL(DEV_URL + (hash ? `#${hash}` : ''))
  else w.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), hash ? { hash } : undefined)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1180,
    minHeight: 720,
    frame: false,
    backgroundColor: '#0b0c16',
    show: false,
    title: 'Rift Pulse',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  })
  load(win)
  win.once('ready-to-show', () => win.show())
  const sendState = () => win?.webContents.send('win:state', { maximized: win.isMaximized() })
  win.on('maximize', sendState)
  win.on('unmaximize', sendState)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.on('closed', () => {
    win = null
    overlay?.close()
  })
}

// ---------- in-game overlay: a transparent, click-through, always-on-top window ----------
function placeOverlay() {
  if (!overlay) return
  const { workArea } = screen.getPrimaryDisplay()
  const [w, h] = overlay.getSize()
  const corner = store.get('overlayCorner')
  const x = corner.endsWith('left') ? workArea.x + 16 : workArea.x + workArea.width - w - 16
  const y = corner.startsWith('top') ? workArea.y + 90 : workArea.y + workArea.height - h - 90
  overlay.setPosition(Math.round(x), Math.round(y))
}

function showOverlay() {
  if (overlay) return
  overlay = new BrowserWindow({
    width: 250,
    height: 470,
    transparent: true,
    frame: false,
    resizable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true },
  })
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setIgnoreMouseEvents(true)
  overlay.setVisibleOnAllWorkspaces(true)
  load(overlay, 'overlay')
  overlay.webContents.once('did-finish-load', () => overlay?.webContents.send('overlay:benchmarks', benchmarks))
  placeOverlay()
  overlay.on('closed', () => (overlay = null))
}
const hideOverlay = () => overlay?.close()

// ---------- polling: client status + live game ----------
let lastStatus = { connected: false, phase: 'None' }
let inGame = false

async function pollStatus() {
  const s = await lcu.status().catch(() => ({ connected: false, phase: 'None' }))
  if (s.connected !== lastStatus.connected || s.phase !== lastStatus.phase) {
    lastStatus = s
    win?.webContents.send('lcu:status', s)
  }
  if (s.phase === 'ChampSelect') await pollChampSelect()
  else lastPick = ''
  setTimeout(pollStatus, s.phase === 'ChampSelect' ? 1500 : 3000)
}

// During champion select: tell the interface which champion and lane you are on, and once the
// pick is locked in, import the recommended runes / item set / spells if that is switched on.
let lastPick = ''
let lastImport = ''
const POSITION = { top: 'TOP', jungle: 'JUNGLE', middle: 'MIDDLE', bottom: 'BOTTOM', utility: 'UTILITY' }
async function pollChampSelect() {
  try {
    const session = await lcu.get('/lol-champ-select/v1/session')
    const me = session.myTeam?.find((c) => c.cellId === session.localPlayerCellId)
    const championId = me?.championId || me?.championPickIntent || 0
    const position = me?.assignedPosition ?? ''
    const key = `${championId}:${position}`
    if (championId && key !== lastPick) {
      lastPick = key
      send('champselect', { championId, position })
    }
    const locked = (session.actions || []).flat().some((a) => a.actorCellId === session.localPlayerCellId && a.type === 'pick' && a.completed)
    if (locked && me?.championId && me.selectedSkinId) noteSkin({ key: me.championId, num: me.selectedSkinId % 1000 })
    if (locked && me?.championId && key !== lastImport) {
      lastImport = key
      autoImport(me.championId, POSITION[position] || '')
    }
  } catch {}
}

async function autoImport(championKey, role) {
  const want = { runes: store.get('autoImportRunes'), items: store.get('autoImportItems'), spells: store.get('autoImportSpells') }
  if (!want.runes && !want.items && !want.spells) return
  await collector.loadItems().catch(() => null)
  const champion = collector.items?.champById?.[championKey]
  if (!champion) return
  const d = collector.detail(champion, role, collector.recentPatches())
  if (!d.rec) return send('import:done', { champion, ok: false, error: t('Пока нет статистики по этому чемпиону') })
  const done = []
  const errors = []
  const tryIt = async (label, fn) => {
    try {
      await fn()
      done.push(label)
    } catch (e) {
      errors.push(`${label}: ${e.message}`)
    }
  }
  const r = d.role || role
  if (want.runes) await tryIt(t('руны'), () => builds.importRunes(lcu, { champion, role: r, runes: d.rec.runes }))
  if (want.items) await tryIt(t('предметы'), () => builds.importItems(lcu, { champion, championKey, role: r, ...d.rec }))
  if (want.spells) await tryIt(t('заклинания'), () => builds.importSpells(lcu, d.rec.spells))
  send('import:done', { champion, ok: !errors.length, done, error: errors.join('; ') })
}

// ---- which skin you played: Riot's match data has no skin, so it is noted in champ select and in game
const skinsFile = path.join(app.getPath('userData'), 'skins.json')
let skins = (() => {
  try {
    return JSON.parse(fs.readFileSync(skinsFile, 'utf8'))
  } catch {
    return { games: [] }
  }
})()
function noteSkin(rec) {
  if (!rec || !(rec.num >= 0) || (!rec.champ && !rec.key)) return
  const last = skins.games[skins.games.length - 1]
  // the same game reports every second: refresh the entry instead of adding one
  if (last && Date.now() - last.at < 3 * 3600_000 && (last.champ === rec.champ || last.key === rec.key) && last.num === rec.num) {
    Object.assign(last, rec, { at: last.at })
    if (rec.champ && !last.champ) last.champ = rec.champ
  } else skins.games.push({ ...rec, at: Date.now() })
  skins.games = skins.games.slice(-1000)
  try {
    fs.writeFileSync(skinsFile, JSON.stringify(skins))
  } catch {}
  send('skins:update', skins)
}
ipcMain.handle('skins:get', () => skins)
let skinNotedFor = ''

let endTimer = null
async function pollLive() {
  const data = await liveGameData()
  const was = inGame
  inGame = Boolean(data && data.gameData)
  if (inGame) {
    clearTimeout(endTimer)
    endTimer = null
    send('live:data', data)
    overlay?.webContents.send('live:data', data)
    if (!was && store.get('overlayEnabled')) showOverlay()
    if (!was && store.get('recordingEnabled') && !recorder.recording) {
      const me = data.activePlayer
      const mine = data.allPlayers?.find((p) => [p.riotIdGameName, p.riotId, p.summonerName].includes(me?.riotIdGameName || me?.summonerName))
      recorder.start({ champion: mine?.championName, gameMode: data.gameData.gameMode, gameTime: data.gameData.gameTime }).catch(() => {})
    }
    recorder.onLive(data)
    const me = data.activePlayer
    const mine = data.allPlayers?.find((p) => [p.riotIdGameName, p.riotId, p.summonerName].filter(Boolean).includes(me?.riotIdGameName || me?.riotId || me?.summonerName))
    const champ = String(mine?.rawChampionName || '').replace('game_character_displayname_', '')
    const tag = `${champ}:${mine?.skinID}`
    if (mine && champ && tag !== skinNotedFor) {
      skinNotedFor = tag
      noteSkin({ champ, num: Number(mine.skinID) || 0 })
    }
  } else if (was) {
    skinNotedFor = ''
    send('live:data', null)
    hideOverlay()
    // the game window closed: stop recording a moment later
    if (recorder.recording) endTimer = setTimeout(() => recorder.stop(), 1500)
  }
  setTimeout(pollLive, inGame ? 1000 : 3000)
}

// ---------- IPC ----------
ipcMain.on('win:minimize', () => win?.minimize())
ipcMain.on('win:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
ipcMain.on('win:close', () => win?.close())
ipcMain.handle('app:version', () => app.getVersion())

// finished matches never change: keep them on disk so the next start only fetches new games
const matchCacheFile = path.join(app.getPath('userData'), 'matches.json')
ipcMain.handle('cache:read', () => {
  try {
    return JSON.parse(fs.readFileSync(matchCacheFile, 'utf8'))
  } catch {
    return {}
  }
})
ipcMain.handle('cache:write', (_e, data) => {
  if (!data || typeof data !== 'object') return false
  const entries = Object.entries(data)
    .sort((a, b) => (b[1]?.endedAt ?? 0) - (a[1]?.endedAt ?? 0))
    .slice(0, 5000)
  const tmp = matchCacheFile + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(entries)))
  fs.renameSync(tmp, matchCacheFile)
  return true
})
ipcMain.handle('cache:clear', () => {
  fs.rmSync(matchCacheFile, { force: true })
  return true
})

ipcMain.handle('settings:get', () => ({ ...settings, riotApiKey: settings.riotApiKey ? '•'.repeat(8) + settings.riotApiKey.slice(-4) : '' }))
ipcMain.handle('settings:set', (_e, key, value) => {
  if (!(key in DEFAULTS)) return false
  store.set(key, value)
  if (key === 'collectorPlatform' || key === 'riotApiKey' || key === 'collectorEnabled') setTimeout(() => send('stats:update'), 500)
  if (key === 'overlayCorner') placeOverlay()
  if (key === 'overlayEnabled' && !value) hideOverlay()
  if (key === 'overlayEnabled' && value && inGame) showOverlay()
  return true
})

ipcMain.handle('riot:fetch', (_e, host, pathname) => riot.request(host, pathname, 'high'))

// statistics
ipcMain.handle('stats:status', () => collector.status())
ipcMain.handle('stats:summary', (_e, patches) => collector.summary(patches?.length ? patches : collector.recentPatches()))
ipcMain.handle('stats:detail', (_e, champ, role, patches) => collector.detail(champ, role, patches?.length ? patches : collector.recentPatches()))
ipcMain.handle('build:import', async (_e, what, b) => {
  try {
    if (what === 'runes') await builds.importRunes(lcu, b)
    else if (what === 'items') await builds.importItems(lcu, b)
    else if (what === 'spells') await builds.importSpells(lcu, b.spells || [])
    else return { ok: false, error: 'unknown' }
    return { ok: true }
  } catch (e) {
    const offline = e.status === 503 || /ECONNREFUSED|not running/i.test(e.message)
    return { ok: false, error: offline ? t('Клиент League of Legends не запущен') : e.message }
  }
})

// spectate a live game through the League client
ipcMain.handle('lcu:spectate', async (_e, puuid, name) => {
  try {
    await lcu.post('/lol-spectator/v1/spectate/launch', { allowObserveMode: 'ALL', dropInSpectateGameId: name || '', gameQueueType: '', puuid })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.status === 503 ? t('Клиент League of Legends не запущен') : e.message }
  }
})

// recordings
ipcMain.handle('rec:list', () => recorder.list())
ipcMain.handle('rec:status', () => ({ recording: recorder.recording, folder: recorder.folder() }))
ipcMain.handle('rec:delete', (_e, id) => recorder.remove(id))
ipcMain.handle('rec:clip', (_e, id, start, end, label) => recorder.clip(id, start, end, label))
ipcMain.handle('rec:open', (_e, file) => {
  const full = file ? recorder.resolve(file) : null
  if (full) shell.showItemInFolder(full)
  else shell.openPath(recorder.folder())
})
ipcMain.handle('rec:toggle', () => {
  if (recorder.recording) {
    recorder.stop()
    return false
  }
  recorder.start({ champion: '', gameMode: 'manual', gameTime: 0 }).catch(() => {})
  return true
})

// benchmarks for the in-game overlay (your averages per champion, computed by the interface)
ipcMain.on('overlay:benchmarks', (_e, b) => {
  benchmarks = b || {}
  overlay?.webContents.send('overlay:benchmarks', benchmarks)
})

ipcMain.handle('lcu:status', () => lastStatus)
ipcMain.handle('lcu:get', async (_e, pathname) => {
  const ok = typeof pathname === 'string' && (pathname.startsWith('/lol-') || pathname === '/riotclient/region-locale' || pathname === '/riotclient/get_region_locale')
  if (!ok) throw new Error('bad path')
  return lcu.get(pathname)
})
ipcMain.handle('live:get', () => liveGameData())
ipcMain.handle('overlay:toggle', () => {
  if (overlay) hideOverlay()
  else showOverlay()
  return Boolean(overlay)
})

function mediaProtocol() {
  protocol.handle('rpmedia', async (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname.slice(1))
    const full = recorder.resolve(rel)
    if (!full || !fs.existsSync(full)) return new Response('not found', { status: 404 })
    const size = fs.statSync(full).size
    const type = full.endsWith('.mp4') ? 'video/mp4' : 'video/webm'
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '')
    if (!range) return new Response(Readable.toWeb(fs.createReadStream(full)), { headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } })
    const start = range[1] ? Number(range[1]) : 0
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    return new Response(Readable.toWeb(fs.createReadStream(full, { start, end })), {
      status: 206,
      headers: { 'Content-Type': type, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' },
    })
  })
}

// ---------- automatic updates (installed builds only; releases come from GitHub) ----------
let updateState = { state: 'idle', version: '', error: '' }
function setupUpdates() {
  if (!app.isPackaged) return
  let autoUpdater
  try {
    autoUpdater = require('electron-updater').autoUpdater
  } catch {
    return
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  const push = (state, version = '', error = '') => {
    updateState = { state, version, error }
    send('update:state', updateState)
  }
  autoUpdater.on('checking-for-update', () => push('checking'))
  autoUpdater.on('update-available', (i) => push('downloading', i.version))
  autoUpdater.on('update-not-available', () => push('latest'))
  autoUpdater.on('update-downloaded', (i) => push('ready', i.version))
  autoUpdater.on('error', (e) => push('error', '', String(e?.message || e).split('\n')[0].slice(0, 160)))
  const check = () => {
    if (updateState.state === 'downloading' || updateState.state === 'ready') return
    autoUpdater.checkForUpdates().catch(() => {})
  }
  check()
  setInterval(check, 30 * 60_000)
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall(true, true))
  ipcMain.handle('update:check', () => check())
}
ipcMain.handle('update:state', () => updateState)

app.whenReady().then(() => {
  setupUpdates()
  collector = new Collector({
    dir: path.join(app.getPath('userData'), 'stats'),
    riot,
    getSettings: () => settings,
    onUpdate: () => send('stats:update'),
  })
  recorder = new Recorder({
    getSettings: () => settings,
    defaultFolder: path.join(app.getPath('videos'), 'Rift Pulse'),
    onChange: (state) => send('rec:state', state),
  })
  mediaProtocol()
  createWindow()
  pollStatus()
  pollLive()
  collector.start()
  globalShortcut.register('CommandOrControl+Shift+O', () => (overlay ? hideOverlay() : showOverlay()))
})
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  collector?.stop()
})
app.on('window-all-closed', () => app.quit())
