// ARAM Mayhem augments: names from CommunityDragon, tiers from the collected Mayhem games, and a
// screen reader that finds the offered augment cards. The game is never touched: the screen is
// captured the same way the recorder does it, the card titles are read with OCR (tesseract.js,
// language data shipped with the app) and the tiers are drawn by a separate click-through window.
const { desktopCapturer, screen } = require('electron')
const path = require('node:path')

const CD = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global'
const MAYHEM_QUEUE = 2400
const TIERS = [
  ['S+', 0.06],
  ['S', 0.2],
  ['A', 0.42],
  ['B', 0.68],
  ['C', 0.88],
  ['D', 1],
]

const unpacked = (p) => p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/g, '')

/** Levenshtein similarity, 0..1 */
function similar(a, b) {
  if (!a || !b) return 0
  if (a === b) return 1
  const m = a.length
  const n = b.length
  if (Math.abs(m - n) > Math.max(m, n) * 0.4) return 0
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return 1 - prev[n] / Math.max(m, n)
}

const iconUrl = (p) => (p ? `${CD}/default/${String(p).replace(/^\/lol-game-data\/assets\//i, '').toLowerCase()}` : '')
const RARITY = { kSilver: 'silver', kGold: 'gold', kPrismatic: 'prismatic', 0: 'silver', 1: 'gold', 2: 'prismatic' }

class Augments {
  constructor({ collector, getSettings, lcu, onCards }) {
    this.collector = collector
    this.getSettings = getSettings
    this.lcu = lcu
    this.onCards = onCards
    this.list = null // [{ id, name, names: {en, ru}, icon, rarity }]
    this.worker = null
    this.scanUntil = 0
    this.scanning = false
    this.level = 0
    this.mayhem = false
    this.champion = ''
    this.shown = false
  }

  // ------------------------------------------------------------ names
  async load() {
    if (this.list) return this.list
    const get = (loc) => fetch(`${CD}/${loc}/v1/cherry-augments.json`, { signal: AbortSignal.timeout(20_000) }).then((r) => (r.ok ? r.json() : []))
    const [en, ru] = await Promise.all([get('default'), get('ru_ru').catch(() => [])])
    // no names, no matching: leave the list unset so the next scan tries again
    if (!en?.length) throw new Error('augment names unavailable')
    // the Mayhem pool, when the list file has one; otherwise every augment is a candidate
    let pool = null
    try {
      const lists = await fetch(`${CD}/default/v1/augment-lists.json`, { signal: AbortSignal.timeout(20_000) }).then((r) => r.json())
      const ids = new Set()
      const walk = (v, inKiwi) => {
        if (Array.isArray(v)) v.forEach((x) => walk(x, inKiwi))
        else if (v && typeof v === 'object')
          for (const [k, x] of Object.entries(v)) walk(x, inKiwi || /kiwi/i.test(k) || (typeof x === 'string' && /kiwi/i.test(x)))
        else if (inKiwi && typeof v === 'number') ids.add(v)
      }
      walk(lists, false)
      if (ids.size > 20) pool = ids
    } catch {}
    const ruById = Object.fromEntries((ru || []).map((a) => [a.id, a.nameTRA]))
    this.list = (en || [])
      .filter((a) => a.nameTRA && (!pool || pool.has(a.id)))
      .map((a) => ({
        id: a.id,
        names: { en: a.nameTRA, ru: ruById[a.id] || '' },
        icon: iconUrl(a.augmentSmallIconPath || a.augmentIconPath),
        rarity: RARITY[a.rarity] || 'silver',
      }))
    this.keys = this.list.flatMap((a) => [norm(a.names.en), norm(a.names.ru)].filter((k) => k.length >= 3).map((k) => ({ k, a })))
    return this.list
  }

  // ------------------------------------------------------------ tiers
  /** Every augment with its win rate and tier, for one champion when given. */
  async tiers(champion = '') {
    const list = await this.load().catch(() => [])
    const m = this.collector.mayhem()
    const total = Object.values(m.aug).reduce((n, [g]) => n + g, 0)
    const mean = total ? Object.values(m.aug).reduce((n, [, w]) => n + w, 0) / total : 0.5
    const champ = m.champs[champion]
    const rows = list.map((a) => {
      const all = m.aug[a.id] || [0, 0]
      const K = 80
      let wr = (all[1] + mean * K) / (all[0] + K)
      const mine = champ?.aug?.[a.id]
      // with enough games on this champion, its own result counts
      if (mine && mine[0] >= 8) wr = (mine[1] + wr * 30) / (mine[0] + 30)
      return { ...a, name: (this.getSettings().lang === 'en' ? a.names.en : a.names.ru) || a.names.en, games: all[0], champGames: mine?.[0] || 0, wr, rawWr: all[0] ? all[1] / all[0] : 0, tier: '' }
    })
    for (const rarity of ['silver', 'gold', 'prismatic']) {
      const group = rows.filter((r) => r.rarity === rarity && r.games >= 10).sort((x, y) => y.wr - x.wr)
      group.forEach((r, i) => (r.tier = TIERS.find(([, lim]) => (i + 0.5) / group.length <= lim)[0]))
    }
    return { matches: m.matches, champion, rows: rows.sort((x, y) => y.wr - x.wr) }
  }

  // ------------------------------------------------------------ in game
  /** Called with every live game update; starts a scan when an augment offer is likely. */
  async onLive(data) {
    if (!data?.gameData) {
      this.mayhem = false
      this.level = 0
      return
    }
    if (!this.checked) {
      this.checked = true
      // the client knows the queue; the live game only gives the map and a mode name
      const q = await this.lcu.get('/lol-gameflow/v1/session').catch(() => null)
      const queue = q?.gameData?.queue?.id
      this.mayhem = queue === MAYHEM_QUEUE || (data.gameData.mapNumber === 12 && !['ARAM', 'PRACTICETOOL'].includes(data.gameData.gameMode))
      if (this.mayhem) this.scanFor(90_000)
    }
    const me = data.activePlayer
    const mine = data.allPlayers?.find((p) => [p.riotIdGameName, p.riotId, p.summonerName].filter(Boolean).includes(me?.riotIdGameName || me?.riotId || me?.summonerName))
    this.champion = String(mine?.rawChampionName || '').replace('game_character_displayname_', '')
    const level = Number(me?.level) || 0
    if (this.mayhem && level > this.level && this.level) this.scanFor(35_000)
    this.level = level
  }

  reset() {
    this.checked = false
    this.mayhem = false
    this.level = 0
    this.scanUntil = 0
    this.clear()
  }

  /** Scan the screen for a while: on a hotkey, at the start of a game and after each level up. */
  scanFor(ms) {
    if (!this.getSettings().augmentsEnabled) return
    this.scanUntil = Math.max(this.scanUntil, Date.now() + ms)
    if (!this.scanning) this.loop()
  }

  async loop() {
    this.scanning = true
    let misses = 0
    try {
      while (Date.now() < this.scanUntil) {
        const t0 = Date.now()
        const cards = await this.scan().catch(() => [])
        if (cards.length) {
          misses = 0
          this.show(cards)
        } else if (++misses >= 2) this.clear()
        await new Promise((r) => setTimeout(r, Math.max(400, 1300 - (Date.now() - t0))))
      }
    } finally {
      this.scanning = false
      this.clear()
    }
  }

  async ocr() {
    if (this.worker) return this.worker
    const { createWorker } = require('tesseract.js')
    const langPath = (lang) => unpacked(path.join(path.dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`)), '4.0.0_best_int'))
    // both packages hold one language each, so the worker gets the folder of the first and a
    // second worker is not needed: rus data is copied next to it on first use
    const fs = require('node:fs')
    const dir = path.join(require('electron').app.getPath('userData'), 'tessdata')
    fs.mkdirSync(dir, { recursive: true })
    for (const lang of ['eng', 'rus']) {
      const to = path.join(dir, `${lang}.traineddata.gz`)
      if (!fs.existsSync(to)) fs.copyFileSync(path.join(langPath(lang), `${lang}.traineddata.gz`), to)
    }
    this.worker = await createWorker(['eng', 'rus'], 1, {
      langPath: dir,
      cachePath: dir,
      workerPath: unpacked(path.join(path.dirname(require.resolve('tesseract.js')), 'worker-script', 'node', 'index.js')),
      gzip: true,
      // without a handler a failing worker takes the whole app down with it
      errorHandler: (e) => console.error('[ocr]', e?.message || e),
      ...(process.env.RP_OCR_DEBUG ? { logger: (m) => console.log('[ocr]', JSON.stringify(m)) } : {}),
    })
    await this.worker.setParameters({ tessedit_pageseg_mode: '11' })
    return this.worker
  }

  /** One look at the screen: the augment cards found, with where their titles are. */
  async scan() {
    await this.load()
    const display = screen.getPrimaryDisplay()
    const size = { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) }
    const [src] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size })
    if (!src) return []
    const img = src.thumbnail
    const { width, height } = img.getSize()
    // the cards sit in the middle of the screen; reading only that band keeps OCR fast
    const crop = { x: Math.round(width * 0.12), y: Math.round(height * 0.18), width: Math.round(width * 0.76), height: Math.round(height * 0.5) }
    const part = img.crop(crop)
    const found = this.match(await this.words(part.toPNG()))
    const scale = display.scaleFactor
    return found.map((f) => ({
      ...f,
      // back to screen coordinates (DIP) for the overlay
      x: (crop.x + f.box.x0 + (f.box.x1 - f.box.x0) / 2) / scale,
      y: (crop.y + f.box.y1) / scale,
    }))
  }

  /** Every word OCR finds in a PNG, with its box. */
  async words(png) {
    const worker = await this.ocr()
    const { data } = await worker.recognize(png, {}, { blocks: true, text: false })
    const words = []
    for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) if (w.text?.trim()) words.push(w)
    return words
  }

  /** Groups OCR words into title lines and finds the augments they name. */
  match(words) {
    const lines = []
    for (const w of words.sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)) {
      const h = w.bbox.y1 - w.bbox.y0
      const line = lines.find((l) => Math.abs(l.cy - (w.bbox.y0 + w.bbox.y1) / 2) < h * 0.6 && w.bbox.x0 - l.box.x1 < h * 2.2 && w.bbox.x1 > l.box.x0 - h * 2.2)
      if (line) {
        line.words.push(w)
        line.box = { x0: Math.min(line.box.x0, w.bbox.x0), y0: Math.min(line.box.y0, w.bbox.y0), x1: Math.max(line.box.x1, w.bbox.x1), y1: Math.max(line.box.y1, w.bbox.y1) }
      } else lines.push({ words: [w], cy: (w.bbox.y0 + w.bbox.y1) / 2, box: { ...w.bbox } })
    }
    for (const l of lines) l.text = norm(l.words.sort((a, b) => a.bbox.x0 - b.bbox.x0).map((w) => w.text).join(''))
    // titles can wrap to two lines, so each line is also tried together with the one below it
    const tries = [...lines]
    for (const a of lines)
      for (const b of lines)
        if (b !== a && b.box.y0 > a.box.y0 && b.box.y0 - a.box.y1 < (a.box.y1 - a.box.y0) * 1.2 && Math.abs((a.box.x0 + a.box.x1) / 2 - (b.box.x0 + b.box.x1) / 2) < (a.box.x1 - a.box.x0)) {
          tries.push({ text: a.text + b.text, box: { x0: Math.min(a.box.x0, b.box.x0), y0: a.box.y0, x1: Math.max(a.box.x1, b.box.x1), y1: b.box.y1 } })
        }
    const hits = []
    for (const l of tries) {
      if (l.text.length < 4) continue
      let best = null
      for (const { k, a } of this.keys) {
        const s = similar(l.text, k)
        if (s >= 0.78 && (!best || s > best.s)) best = { s, a }
      }
      if (best) hits.push({ id: best.a.id, score: best.s, box: l.box })
    }
    // one hit per card: keep the best match in each horizontal position
    hits.sort((x, y) => y.score - x.score)
    const out = []
    for (const h of hits) if (!out.some((o) => o.id === h.id || (h.box.x0 < o.box.x1 && h.box.x1 > o.box.x0))) out.push(h)
    return out.sort((a, b) => a.box.x0 - b.box.x0)
  }

  async show(cards) {
    const { rows } = await this.tiers(this.champion)
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    this.shown = true
    this.onCards?.(cards.map((c) => ({ x: c.x, y: c.y, ...(byId[c.id] || { id: c.id, tier: '' }) })))
  }

  clear() {
    if (!this.shown) return
    this.shown = false
    this.onCards?.([])
  }
}

module.exports = { Augments, norm, similar }
