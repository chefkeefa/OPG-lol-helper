// Background statistics collector.
// Walks the Challenger/Grandmaster/Master ladder of one region, downloads their recent ranked
// solo games (match + timeline) through the official Riot API and aggregates, per patch and per
// champion+role: win/pick rates, bans, item builds, boots, starting items, rune pages, summoner
// spells, skill order and lane matchups. Only the aggregates are stored, never raw matches.
const fs = require('node:fs')
const path = require('node:path')
const { regionalOf } = require('./riot.cjs')
const { recommend } = require('./builds.cjs')

const DD = 'https://ddragon.leagueoflegends.com'
const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']
const FIX = { FiddleSticks: 'Fiddlesticks' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const newAgg = () => ({ g: 0, w: 0, core: {}, boots: {}, start: {}, runes: {}, ks: {}, spells: {}, skills: {}, vs: {}, late: {}, first: {} })
const bump = (map, key, win) => {
  if (key === undefined || key === null || key === '') return
  const e = map[key] || (map[key] = [0, 0])
  e[0]++
  if (win) e[1]++
}
function prune(map, keep = 60) {
  const keys = Object.keys(map)
  if (keys.length <= keep * 2) return
  keys
    .sort((a, b) => map[b][0] - map[a][0])
    .slice(keep)
    .forEach((k) => delete map[k])
}

class Collector {
  constructor({ dir, riot, getSettings, onUpdate }) {
    this.dir = dir
    this.riot = riot
    this.getSettings = getSettings
    this.onUpdate = onUpdate
    this.running = false
    this.state = null
    this.platform = null
    this.items = null
    this.lastError = ''
    this.recent = [] // timestamps of processed matches, for the speed readout
  }

  file(platform) {
    return path.join(this.dir, `stats-${platform}.json`)
  }

  load(platform) {
    if (this.platform === platform && this.state) return this.state
    this.save()
    this.platform = platform
    try {
      this.state = JSON.parse(fs.readFileSync(this.file(platform), 'utf8'))
    } catch {
      this.state = { patches: {}, seen: [], players: [], matchQueue: [], ladderAt: 0 }
    }
    this.seen = new Set(this.state.seen)
    return this.state
  }

  save() {
    if (!this.state || !this.platform) return
    try {
      fs.mkdirSync(this.dir, { recursive: true })
      this.state.seen = [...this.seen].slice(-60000)
      const tmp = this.file(this.platform) + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(this.state))
      fs.renameSync(tmp, this.file(this.platform))
    } catch {}
  }

  async loadItems() {
    if (this.items) return this.items
    const versions = await (await fetch(`${DD}/api/versions.json`)).json()
    const data = (await (await fetch(`${DD}/cdn/${versions[0]}/data/en_US/item.json`)).json()).data
    const champs = (await (await fetch(`${DD}/cdn/${versions[0]}/data/en_US/champion.json`)).json()).data
    const completed = new Set()
    const boots = new Set()
    for (const [id, it] of Object.entries(data)) {
      const sr = it.maps?.['11']
      if (!sr || !it.gold?.purchasable) continue
      const tags = it.tags || []
      if (tags.includes('Boots') && it.from?.length) boots.add(Number(id))
      else if (!it.into?.length && it.gold.total >= 2000 && !tags.includes('Consumable') && !tags.includes('Trinket')) completed.add(Number(id))
    }
    this.items = {
      completed,
      boots,
      champById: Object.fromEntries(Object.values(champs).map((c) => [Number(c.key), c.id])),
    }
    return this.items
  }

  // ---------------------------------------------------------------- loop
  start() {
    if (this.running) return
    this.running = true
    this.loop()
  }

  stop() {
    this.running = false
    this.save()
  }

  async api(host, p) {
    const r = await this.riot.request(host, p, 'low')
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error('Ключ Riot API недействителен или истёк'), { fatal: true })
    if (r.status >= 400) throw new Error(`Riot API ${r.status}`)
    return r.body
  }

  async loop() {
    let saved = 0
    while (this.running) {
      const s = this.getSettings()
      if (!s.riotApiKey || !s.collectorEnabled) {
        await sleep(3000)
        continue
      }
      const platform = s.collectorPlatform || s.platform || 'euw1'
      const st = this.load(platform)
      const regional = regionalOf(platform)
      try {
        await this.loadItems()
        if (!st.players.length || Date.now() - st.ladderAt > 6 * 3600_000) {
          const tiers = ['challenger', 'grandmaster', 'master']
          const all = []
          for (const t of tiers) {
            const l = await this.api(platform, `/lol/league/v4/${t}leagues/by-queue/RANKED_SOLO_5x5`)
            for (const e of l.entries || []) if (e.puuid) all.push(e.puuid)
          }
          st.players = shuffle(all)
          st.ladderAt = Date.now()
        } else if (st.matchQueue.length < 30) {
          const puuid = st.players.shift()
          st.players.push(puuid)
          const since = Math.floor(Date.now() / 1000) - 10 * 86400
          const ids = await this.api(regional, `/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&type=ranked&start=0&count=20&startTime=${since}`)
          for (const id of ids || []) if (!this.seen.has(id) && !st.matchQueue.includes(id)) st.matchQueue.push(id)
        } else {
          const id = st.matchQueue.shift()
          this.seen.add(id)
          const match = await this.api(regional, `/lol/match/v5/matches/${id}`)
          if (match?.info?.queueId === 420 && match.info.gameDuration > 600) {
            const timeline = await this.api(regional, `/lol/match/v5/matches/${id}/timeline`).catch(() => null)
            this.ingest(match, timeline)
            this.recent.push(Date.now())
            if (++saved % 25 === 0) {
              this.save()
              this.onUpdate?.()
            }
          }
        }
        this.lastError = ''
      } catch (e) {
        this.lastError = e.message
        await sleep(e.fatal ? 30000 : 3000)
      }
    }
  }

  // ---------------------------------------------------------------- aggregation
  ingest(match, timeline) {
    const info = match.info
    const patch = String(info.gameVersion).split('.').slice(0, 2).join('.')
    const st = this.state
    this.version = (this.version || 0) + 1
    const P = (st.patches[patch] ||= { matches: 0, bans: {}, champs: {} })
    P.matches++
    const { completed, boots, champById } = this.items

    for (const t of info.teams || []) for (const b of t.bans || []) if (b.championId > 0) bump(P.bans, champById[b.championId] ?? String(b.championId), false)

    // per participant purchase/skill history from the timeline
    const buys = {}
    const skills = {}
    for (const f of timeline?.info?.frames || []) {
      for (const ev of f.events || []) {
        if (ev.type === 'ITEM_PURCHASED') (buys[ev.participantId] ||= []).push({ id: ev.itemId, t: ev.timestamp })
        else if (ev.type === 'ITEM_UNDO') {
          const list = buys[ev.participantId] || []
          const i = list.map((x) => x.id).lastIndexOf(ev.beforeId)
          if (i >= 0) list.splice(i, 1)
        } else if (ev.type === 'SKILL_LEVEL_UP' && ev.levelUpType === 'NORMAL') (skills[ev.participantId] ||= []).push(ev.skillSlot)
      }
    }

    for (const p of info.participants) {
      const role = p.teamPosition
      if (!ROLES.includes(role)) continue
      const champ = FIX[p.championName] ?? p.championName
      const byRole = (P.champs[champ] ||= {})
      const a = (byRole[role] ||= newAgg())
      const win = p.win
      a.g++
      if (win) a.w++

      const opp = info.participants.find((o) => o.teamId !== p.teamId && o.teamPosition === role)
      if (opp) bump(a.vs, FIX[opp.championName] ?? opp.championName, win)

      const st0 = p.perks?.styles?.[0]
      const st1 = p.perks?.styles?.[1]
      if (st0 && st1) {
        const sp = p.perks.statPerks || {}
        const page = [st0.style, ...st0.selections.map((x) => x.perk), st1.style, ...st1.selections.map((x) => x.perk), sp.offense, sp.flex, sp.defense].join('.')
        bump(a.runes, page, win)
        bump(a.ks, st0.selections[0]?.perk, win)
      }
      bump(a.spells, [p.summoner1Id, p.summoner2Id].sort((x, y) => x - y).join('.'), win)

      const list = buys[p.participantId]
      if (list) {
        const start = list.filter((x) => x.t < 90_000).map((x) => x.id).sort((x, y) => x - y)
        if (start.length) bump(a.start, start.join('.'), win)
        const legendary = []
        for (const x of list) if (completed.has(x.id) && !legendary.includes(x.id)) legendary.push(x.id)
        if (legendary.length >= 3) bump(a.core, legendary.slice(0, 3).join('.'), win)
        if (legendary[0]) bump(a.first, legendary[0], win)
        for (const id of legendary.slice(3, 6)) bump(a.late, id, win)
        const b = list.find((x) => boots.has(x.id))
        if (b) bump(a.boots, b.id, win)
      }
      const sk = skills[p.participantId]
      if (sk && sk.length >= 11) bump(a.skills, sk.slice(0, 15).map((s) => 'QWER'[s - 1]).join(''), win)

      if (a.g % 50 === 0) for (const k of ['core', 'runes', 'start', 'skills', 'spells']) prune(a[k])
    }
  }

  // ---------------------------------------------------------------- queries
  status() {
    const s = this.getSettings()
    const platform = s.collectorPlatform || s.platform || 'euw1'
    const st = this.load(platform)
    const now = Date.now()
    this.recent = this.recent.filter((t) => now - t < 600_000)
    const patches = Object.entries(st.patches)
      .map(([patch, v]) => ({ patch, matches: v.matches }))
      .sort((a, b) => cmpPatch(b.patch, a.patch))
    return {
      enabled: Boolean(s.collectorEnabled),
      hasKey: Boolean(s.riotApiKey),
      platform,
      patches,
      queued: st.matchQueue.length,
      players: st.players.length,
      perHour: Math.round((this.recent.length / 10) * 60),
      error: this.lastError,
    }
  }

  merged(patches) {
    const memoKey = `${this.platform}|${this.version || 0}|${patches.join(',')}`
    if (this.memo?.key === memoKey) return this.memo.value
    const value = this.mergeNow(patches)
    this.memo = { key: memoKey, value }
    return value
  }

  mergeNow(patches) {
    const st = this.state
    const out = { matches: 0, bans: {}, champs: {} }
    for (const p of patches) {
      const P = st?.patches[p]
      if (!P) continue
      out.matches += P.matches
      for (const [k, [g]] of Object.entries(P.bans)) {
        const e = (out.bans[k] ||= [0, 0])
        e[0] += g
      }
      for (const [champ, roles] of Object.entries(P.champs)) {
        for (const [role, a] of Object.entries(roles)) {
          const t = ((out.champs[champ] ||= {})[role] ||= newAgg())
          t.g += a.g
          t.w += a.w
          for (const key of ['core', 'boots', 'start', 'runes', 'ks', 'spells', 'skills', 'vs', 'late', 'first'])
            for (const [k, [g, w]] of Object.entries(a[key] || {})) {
              const e = (t[key][k] ||= [0, 0])
              e[0] += g
              e[1] += w
            }
        }
      }
    }
    return out
  }

  summary(patches) {
    this.load(this.status().platform)
    const m = this.merged(patches)
    const rows = []
    for (const [champ, roles] of Object.entries(m.champs)) for (const [role, a] of Object.entries(roles)) rows.push({ champ, role, g: a.g, w: a.w })
    return { matches: m.matches, bans: Object.fromEntries(Object.entries(m.bans).map(([k, v]) => [k, v[0]])), rows }
  }

  detail(champ, role, patches) {
    this.load(this.status().platform)
    const m = this.merged(patches)
    const roles = m.champs[champ] || {}
    const roleGames = Object.fromEntries(Object.entries(roles).map(([r, a]) => [r, a.g]))
    const pick = role && roles[role] ? role : Object.entries(roleGames).sort((a, b) => b[1] - a[1])[0]?.[0]
    const agg = pick ? roles[pick] : null
    return { matches: m.matches, bans: m.bans[champ]?.[0] ?? 0, role: pick || null, roleGames, agg, rec: recommend(agg) }
  }

  /** Newest patches, enough of them for a useful sample (the current patch alone early on is thin). */
  recentPatches() {
    const list = this.status().patches
    const out = []
    let n = 0
    for (const p of list) {
      out.push(p.patch)
      n += p.matches
      if (n >= 3000 || out.length >= 2) break
    }
    return out
  }
}

function cmpPatch(a, b) {
  const [a1, a2] = a.split('.').map(Number)
  const [b1, b2] = b.split('.').map(Number)
  return a1 - b1 || a2 - b2
}

module.exports = { Collector }
