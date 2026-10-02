const { t } = require('./i18n.cjs')
// Game recording: a hidden window captures the screen (and system sound) with MediaRecorder,
// chunks are streamed to disk, and ffmpeg turns the result into a seekable mp4 when the game
// ends. Kills, deaths, multikills and objectives are saved as moments with the video.
const { BrowserWindow, desktopCapturer, session, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')

function ffmpegPath() {
  try {
    return require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked')
  } catch {
    return null
  }
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const bin = ffmpegPath()
    if (!bin) return reject(new Error(t('ffmpeg не найден')))
    execFile(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true, timeout: 10 * 60_000 }, (err, _o, stderr) =>
      err ? reject(new Error(stderr || err.message)) : resolve(),
    )
  })
}

const QUALITY = { high: 14_000_000, medium: 8_000_000, low: 4_000_000 }
const MULTI = () => ({ 2: t('Двойное убийство'), 3: t('Тройное убийство'), 4: t('Четверное убийство'), 5: t('ПЕНТАКИЛЛ') })

class Recorder {
  constructor({ getSettings, defaultFolder, onChange }) {
    this.getSettings = getSettings
    this.defaultFolder = defaultFolder
    this.onChange = onChange
    this.win = null
    this.cur = null // the recording in progress
    this.seenEvents = new Set()

    session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
      let streams = {}
      try {
        let sources = []
        for (let i = 0; i < 3 && !sources.length; i++) {
          if (i) await new Promise((r) => setTimeout(r, 700))
          sources = await desktopCapturer.getSources({ types: ['screen', 'window'] }).catch(() => [])
        }
        const wantWindow = this.getSettings().recordingSource === 'window'
        const game = sources.find((s) => /League of Legends \(TM\) Client/i.test(s.name))
        const screen = sources.find((s) => s.id.startsWith('screen:'))
        const src = (wantWindow && game) || screen || sources[0]
        if (src) {
          streams = { video: src }
          // system sound can only be captured together with a whole screen (Windows)
          if (this.getSettings().recordingAudio && src.id.startsWith('screen:') && process.platform === 'win32') streams.audio = 'loopback'
        }
      } catch (e) {
        console.error('capture sources', e)
      }
      try {
        cb(streams)
      } catch (e) {
        console.error('capture callback', e)
      }
    })

    ipcMain.on('rec:chunk', (_e, buf) => this.cur?.stream?.write(Buffer.from(buf)))
    ipcMain.on('rec:started', () => {
      if (!this.cur) return
      this.cur.startedAt = Date.now()
      this.cur.gameOffset = this.cur.lastGameTime ?? 0
      this.onChange?.('recording')
    })
    ipcMain.on('rec:stopped', () => this.finish())
    ipcMain.on('rec:error', (_e, msg) => {
      this.cur && (this.cur.error = msg)
      this.finish()
    })
  }

  folder() {
    const f = this.getSettings().recordingFolder || this.defaultFolder
    fs.mkdirSync(path.join(f, 'clips'), { recursive: true })
    return f
  }

  get recording() {
    return Boolean(this.cur)
  }

  ensureWindow() {
    if (this.win && !this.win.isDestroyed()) return Promise.resolve()
    this.win = new BrowserWindow({
      show: false,
      width: 320,
      height: 200,
      webPreferences: { preload: path.join(__dirname, 'recorder-preload.cjs'), backgroundThrottling: false, contextIsolation: true },
    })
    return this.win.loadFile(path.join(__dirname, 'recorder.html'))
  }

  async start(info) {
    if (this.cur) return
    const s = this.getSettings()
    const id = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const raw = path.join(this.folder(), `${id}.webm`)
    this.cur = { id, raw, stream: fs.createWriteStream(raw), info, moments: [], lastGameTime: info.gameTime, me: info.me }
    this.seenEvents = new Set()
    await this.ensureWindow()
    const [w, h] = (s.recordingResolution || '1920x1080').split('x').map(Number)
    this.win.webContents.send('rec:start', { fps: Number(s.recordingFps) || 30, bitrate: QUALITY[s.recordingQuality] || QUALITY.medium, width: w, height: h, audio: Boolean(s.recordingAudio) })
  }

  stop(result) {
    if (!this.cur) return
    if (result) this.cur.result = result
    this.win?.webContents.send('rec:stop')
    // fall back if the recorder window never answers
    setTimeout(() => this.cur && this.finish(), 8000)
  }

  /** Called with every live data sample while a game is running. */
  onLive(data) {
    const c = this.cur
    if (!c) return
    c.lastGameTime = data.gameData?.gameTime ?? c.lastGameTime
    const me = data.activePlayer
    const names = new Set([me?.riotIdGameName, me?.riotId, me?.summonerName, me?.riotId?.split('#')[0]].filter(Boolean))
    const mine = data.allPlayers?.find((p) => names.has(p.riotIdGameName) || names.has(p.riotId) || names.has(p.summonerName))
    if (mine) c.final = { champion: mine.championName, scores: mine.scores, team: mine.team }
    if (c.startedAt === undefined) return
    for (const ev of data.events?.Events || []) {
      if (this.seenEvents.has(ev.EventID)) continue
      this.seenEvents.add(ev.EventID)
      if (ev.EventTime < c.gameOffset - 1) continue
      const at = Math.max(0, ev.EventTime - c.gameOffset)
      const killer = names.has(ev.KillerName)
      let m = null
      if (ev.EventName === 'ChampionKill') {
        if (killer) m = { kind: 'kill', label: t('Убийство: {name}', { name: ev.VictimName }) }
        else if (names.has(ev.VictimName)) m = { kind: 'death', label: t('Смерть от {name}', { name: ev.KillerName }) }
        else if ((ev.Assisters || []).some((a) => names.has(a))) m = { kind: 'assist', label: t('Помощь: {name}', { name: ev.VictimName }) }
      } else if (ev.EventName === 'Multikill' && killer) m = { kind: 'multikill', label: MULTI()[ev.KillStreak] || t('Мультикилл') }
      else if (ev.EventName === 'FirstBlood' && (names.has(ev.Recipient) || killer)) m = { kind: 'kill', label: t('Первая кровь') }
      else if (ev.EventName === 'Ace') m = { kind: 'objective', label: t('Эйс') }
      else if (['DragonKill', 'BaronKill', 'HeraldKill', 'HordeKill'].includes(ev.EventName)) {
        const name = { DragonKill: t('Дракон'), BaronKill: t('Барон'), HeraldKill: t('Герольд'), HordeKill: t('Личинки') }[ev.EventName]
        m = { kind: ev.Stolen === 'True' ? 'steal' : 'objective', label: ev.Stolen === 'True' ? t('{name} (украден)', { name }) : name }
      } else if (ev.EventName === 'GameEnd') c.result = ev.Result
      if (m) c.moments.push({ t: at, ...m })
    }
  }

  async finish() {
    const c = this.cur
    if (!c) return
    this.cur = null
    await new Promise((r) => c.stream.end(r))
    const folder = this.folder()
    const duration = c.startedAt ? (Date.now() - c.startedAt) / 1000 : 0
    let file = path.basename(c.raw)
    if (duration < 5 || fs.statSync(c.raw).size < 1000) {
      fs.rmSync(c.raw, { force: true })
      this.onChange?.('idle')
      return
    }
    try {
      // MediaRecorder output has no index, so players cannot seek; a copy remux fixes that
      const mp4 = path.join(folder, `${c.id}.mp4`)
      await ffmpeg(['-i', c.raw, '-c', 'copy', '-movflags', '+faststart', mp4])
      fs.rmSync(c.raw, { force: true })
      file = path.basename(mp4)
    } catch {
      try {
        const fixed = path.join(folder, `${c.id}.fixed.webm`)
        await ffmpeg(['-i', c.raw, '-c', 'copy', fixed])
        fs.renameSync(fixed, c.raw)
      } catch {}
    }
    const meta = {
      id: c.id,
      file,
      createdAt: c.startedAt || Date.now(),
      duration,
      champion: c.final?.champion || c.info.champion || '',
      gameMode: c.info.gameMode || '',
      result: c.result || '',
      kda: c.final?.scores ? [c.final.scores.kills, c.final.scores.deaths, c.final.scores.assists] : null,
      moments: c.moments,
      clips: [],
      error: c.error || '',
    }
    fs.writeFileSync(path.join(folder, `${c.id}.json`), JSON.stringify(meta, null, 2))
    this.cleanup()
    this.onChange?.('idle')
  }

  /** Deletes the oldest recordings once the folder grows past the size limit (clips are kept). */
  cleanup() {
    const maxBytes = (Number(this.getSettings().recordingMaxGB) || 50) * 1024 ** 3
    const list = this.list().sort((a, b) => a.createdAt - b.createdAt)
    let total = list.reduce((s, r) => s + r.size, 0)
    for (const r of list) {
      if (total <= maxBytes) break
      this.remove(r.id)
      total -= r.size
    }
  }

  list() {
    const folder = this.folder()
    const out = []
    for (const f of fs.readdirSync(folder)) {
      if (!f.endsWith('.json')) continue
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(folder, f), 'utf8'))
        const full = path.join(folder, meta.file)
        if (!fs.existsSync(full)) continue
        meta.size = fs.statSync(full).size
        meta.clips = (meta.clips || []).filter((c) => fs.existsSync(path.join(folder, 'clips', c.file)))
        out.push(meta)
      } catch {}
    }
    return out.sort((a, b) => b.createdAt - a.createdAt)
  }

  readMeta(id) {
    if (!/^[\w-]+$/.test(id)) throw new Error('bad id')
    const p = path.join(this.folder(), `${id}.json`)
    return { p, meta: JSON.parse(fs.readFileSync(p, 'utf8')) }
  }

  remove(id) {
    const { p, meta } = this.readMeta(id)
    fs.rmSync(path.join(this.folder(), meta.file), { force: true })
    fs.rmSync(p, { force: true })
    return true
  }

  async clip(id, start, end, label) {
    const { p, meta } = this.readMeta(id)
    const s = Math.max(0, Number(start) || 0)
    const e = Math.min(meta.duration || s + 30, Math.max(s + 1, Number(end) || s + 15))
    const ext = path.extname(meta.file)
    const name = `${id}-${Math.round(s)}${ext}`
    const out = path.join(this.folder(), 'clips', name)
    await ffmpeg(['-ss', String(s), '-i', path.join(this.folder(), meta.file), '-t', String(e - s), '-c', 'copy', '-avoid_negative_ts', 'make_zero', out])
    meta.clips = [...(meta.clips || []).filter((c) => c.file !== name), { file: name, start: s, end: e, label: label || '' }]
    fs.writeFileSync(p, JSON.stringify(meta, null, 2))
    return name
  }

  /** Resolves a media URL path to a file inside the recordings folder. */
  resolve(rel) {
    const folder = path.resolve(this.folder())
    const full = path.resolve(folder, rel)
    if (!full.startsWith(folder + path.sep)) return null
    return full
  }
}

module.exports = { Recorder }
