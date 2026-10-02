import type { MatchSummary, QueueFilter, Role } from '../types'

export const QUEUE_LABEL: Record<number, string> = {
  420: 'Solo/Duo',
  440: 'Flex',
  450: 'ARAM',
  400: 'Normal Draft',
  430: 'Normal Blind',
  480: 'Swiftplay',
  490: 'Quickplay',
  700: 'Clash',
  720: 'ARAM Clash',
  2400: 'ARAM: Хаос',
  1700: 'Arena',
  1710: 'Arena',
  1300: 'Nexus Blitz',
  1900: 'URF',
  900: 'ARURF',
  0: 'Своя игра',
}
const MODE_LABEL: Record<string, string> = { ARAM: 'ARAM', CHERRY: 'Arena', URF: 'URF', ARURF: 'ARURF', CLASSIC: 'Обычная', NEXUSBLITZ: 'Nexus Blitz', ONEFORALL: 'Один за всех', ULTBOOK: 'Ultimate Spellbook' }
export const queueLabel = (id: number, mode?: string) => QUEUE_LABEL[id] ?? (mode && MODE_LABEL[mode]) ?? 'Другой режим'
const isAram = (m: MatchSummary) => [450, 720, 2400].includes(m.queueId) || m.mode === 'ARAM'

export const QUEUE_FILTERS: { id: QueueFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'solo', label: 'Solo' },
  { id: 'flex', label: 'Flex' },
  { id: 'aram', label: 'ARAM' },
  { id: 'normal', label: 'Normal' },
]

export function filterMatches(ms: MatchSummary[], f: QueueFilter) {
  const ok = (m: MatchSummary) =>
    f === 'all' ||
    (f === 'solo' && m.queueId === 420) ||
    (f === 'flex' && m.queueId === 440) ||
    (f === 'aram' && isAram(m)) ||
    (f === 'normal' && [400, 430, 480, 490].includes(m.queueId))
  return ms.filter((m) => !m.remake && ok(m))
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export interface StatCard {
  key: string
  label: string
  value: number
  delta: number
  series: number[]
  fmt: (v: number) => string
  fmtDelta: (v: number) => string
  /** per point of `series`: when the game ended and on which champion */
  dates: number[]
  champs: string[]
}

const num = (d: number) => (v: number) => v.toFixed(d)
const pct = (v: number) => `${Math.round(v * 100)}%`
const signed = (f: (v: number) => string) => (v: number) => {
  const t = f(v)
  if (/^-0(\.0+)?%?$/.test(t)) return t.slice(1)
  return t.startsWith('-') ? t : '+' + t
}

/** Stat cards: value = average over all games, delta = last 5 games vs that average. */
export function statCards(ms: MatchSummary[]): StatCard[] {
  const chrono = [...ms].sort((a, b) => a.endedAt - b.endedAt)
  const defs: [string, string, (m: MatchSummary) => number, (v: number) => string, (v: number) => string][] = [
    ['kda', 'KDA', (m) => (m.kills + m.assists) / Math.max(1, m.deaths), num(1), num(1)],
    ['score', 'Оценка', (m) => m.score, num(1), num(1)],
    ['kp', 'KP', (m) => m.kp, pct, (v) => `${Math.round(v * 100)}%`],
    ['cs', 'CS/мин', (m) => m.cs / Math.max(1, m.durationSec / 60), num(1), num(1)],
    ['dmg', 'Урон/мин', (m) => m.dmgPerMin, num(0), num(0)],
    ['share', 'Доля урона', (m) => m.dmgShare, pct, (v) => `${Math.round(v * 100)}%`],
    ['gold', 'Золото/мин', (m) => m.goldPerMin, num(0), num(0)],
    ['vision', 'Обзор/мин', (m) => m.visionPerMin, num(2), num(2)],
  ]
  const card = (key: string, label: string, list: MatchSummary[], get: (m: MatchSummary) => number, fmt: (v: number) => string, fd: (v: number) => string): StatCard => {
    const series = list.map(get)
    const value = avg(series)
    const recent = avg(series.slice(-5))
    return { key, label, value, delta: series.length ? recent - value : 0, series, fmt, fmtDelta: signed(fd), dates: list.map((m) => m.endedAt), champs: list.map((m) => m.champion) }
  }
  const out = defs.map(([key, label, get, fmt, fd]) => card(key, label, chrono, get, fmt, fd))
  // lane diffs at 15 minutes replace gold/min and vision once enough timelines are loaded
  const withTl = chrono.filter((m) => m.d15)
  if (withTl.length >= 3) {
    const sg = (d: number) => (v: number) => (v >= 0 ? '+' : '') + v.toFixed(d)
    out[6] = card('gd15', 'Золото @15', withTl, (m) => m.d15!.gold, sg(0), num(0))
    out[7] = card('ka15', 'У+П @15', withTl, (m) => m.d15!.ka, sg(1), num(1))
  }
  return out
}

export interface ChampAgg {
  champion: string
  games: number
  wins: number
  kills: number
  deaths: number
  assists: number
  score: number
}

export function championAggs(ms: MatchSummary[]): ChampAgg[] {
  const map = new Map<string, MatchSummary[]>()
  for (const m of ms) map.set(m.champion, [...(map.get(m.champion) ?? []), m])
  return [...map.entries()]
    .map(([champion, g]) => ({
      champion,
      games: g.length,
      wins: g.filter((m) => m.win).length,
      kills: avg(g.map((m) => m.kills)),
      deaths: avg(g.map((m) => m.deaths)),
      assists: avg(g.map((m) => m.assists)),
      score: avg(g.map((m) => m.score)),
    }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins)
}

export const ROLES: { id: Exclude<Role, ''>; label: string }[] = [
  { id: 'TOP', label: 'Топ' },
  { id: 'JUNGLE', label: 'Лес' },
  { id: 'MIDDLE', label: 'Мид' },
  { id: 'BOTTOM', label: 'Бот' },
  { id: 'UTILITY', label: 'Саппорт' },
]

export function roleAggs(ms: MatchSummary[]) {
  return ROLES.map((r) => {
    const g = ms.filter((m) => m.role === r.id)
    return { ...r, games: g.length, wins: g.filter((m) => m.win).length }
  })
}

/** Games and wins per calendar day for the last `days` days, oldest first. */
export function activity(ms: MatchSummary[], days = 14) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return Array.from({ length: days }, (_, i) => {
    const d0 = start.getTime() - (days - 1 - i) * 86_400_000
    const g = ms.filter((m) => m.endedAt >= d0 && m.endedAt < d0 + 86_400_000)
    return { date: new Date(d0), games: g.length, wins: g.filter((m) => m.win).length }
  })
}

export function badge(m: MatchSummary): { text: string; tone: 'mvp' | 'ace' | 'plain' } {
  if (m.placement === 1) return { text: 'MVP', tone: 'mvp' }
  if (!m.win && m.score >= 80) return { text: 'ACE', tone: 'ace' }
  const n = m.placement
  return { text: `#${n}`, tone: 'plain' }
}

export function ago(ts: number) {
  const s = (Date.now() - ts) / 1000
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} мин назад`
  if (s < 86400) return `${Math.round(s / 3600)} ч назад`
  return `${Math.round(s / 86400)} д назад`
}

export const duration = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

export const kdaRatio = (k: number, d: number, a: number) =>
  d === 0 ? 'Perfect' : ((k + a) / d).toFixed(1)

/** Your averages per champion (and "*" over all games) for the in-game overlay. */
export function benchmarks(ms: MatchSummary[]): Record<string, { games: number; csPerMin: number; kda: number; kp: number; visionPerMin: number; deathsPerGame: number }> {
  const groups: Record<string, MatchSummary[]> = { '*': [] }
  for (const m of ms) {
    if (m.remake || m.queueId === 450) continue
    groups['*'].push(m)
    ;(groups[m.champion] ||= []).push(m)
  }
  const out: ReturnType<typeof benchmarks> = {}
  for (const [k, list] of Object.entries(groups)) {
    if (!list.length) continue
    out[k] = {
      games: list.length,
      csPerMin: avg(list.map((m) => m.cs / Math.max(1, m.durationSec / 60))),
      kda: avg(list.map((m) => (m.kills + m.assists) / Math.max(1, m.deaths))),
      kp: avg(list.map((m) => m.kp)),
      visionPerMin: avg(list.map((m) => m.visionPerMin)),
      deathsPerGame: avg(list.map((m) => m.deaths)),
    }
  }
  return out
}
