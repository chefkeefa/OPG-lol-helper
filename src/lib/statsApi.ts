// Statistics source: the desktop collector, or demo data in the web preview / example mode.
import type { StatsDetail, StatsStatus, StatsSummary } from './statsTypes'
import { mockDetail, mockStatus, mockSummary } from '../data/mockStats'

export const hasCollector = () => Boolean(window.rp?.stats)

export async function statsStatus(): Promise<StatsStatus> {
  return window.rp?.stats ? window.rp.stats.status() : mockStatus()
}
export async function statsSummary(patches: string[], demo: boolean): Promise<StatsSummary> {
  return window.rp?.stats && !demo ? window.rp.stats.summary(patches) : mockSummary()
}
export async function statsDetail(champ: string, role: string, patches: string[], demo: boolean): Promise<StatsDetail> {
  return window.rp?.stats && !demo ? window.rp.stats.detail(champ, role, patches) : mockDetail(champ, role)
}

export const ROLE_LABEL: Record<string, string> = { TOP: 'Топ', JUNGLE: 'Лес', MIDDLE: 'Мид', BOTTOM: 'Бот', UTILITY: 'Поддержка' }
export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`
export const wrOf = ([g, w]: [number, number]) => (g ? w / g : 0)

export interface TierRow {
  champ: string
  role: string
  g: number
  wr: number
  pr: number
  br: number
  score: number
  tier: string
  rank: number
}

const TIERS: [string, number][] = [
  ['S+', 0.05],
  ['S', 0.17],
  ['A', 0.38],
  ['B', 0.66],
  ['C', 0.86],
  ['D', 1],
]

/** Win rate pulled towards 50% for small samples, plus a bonus for being popular and banned. */
export function tierRows(s: StatsSummary): TierRow[] {
  const minGames = Math.max(8, s.matches * 0.004)
  const rows = s.rows
    .filter((r) => r.g >= minGames)
    .map((r) => {
      const K = 80
      const wrS = (r.w + 0.5 * K) / (r.g + K)
      const pr = s.matches ? r.g / s.matches : 0
      const br = s.matches ? (s.bans[r.champ] ?? 0) / s.matches : 0
      const score = (wrS - 0.5) * 100 + Math.log2(1 + pr * 100) * 0.9 + br * 4
      return { champ: r.champ, role: r.role, g: r.g, wr: r.g ? r.w / r.g : 0, pr, br, score, tier: 'D', rank: 0 }
    })
  // tiers are given per role, by position in that role's ranking
  const byRole: Record<string, TierRow[]> = {}
  for (const r of rows) (byRole[r.role] ||= []).push(r)
  for (const list of Object.values(byRole)) {
    list.sort((a, b) => b.score - a.score)
    list.forEach((r, i) => {
      const q = (i + 0.5) / list.length
      r.tier = TIERS.find(([, lim]) => q <= lim)![0]
      r.rank = i + 1
    })
  }
  return rows
}

export const TIER_COLOR: Record<string, string> = { 'S+': '#ff9f43', S: '#f6c945', A: '#7b9cff', B: '#6f5ef6', C: '#8a8fb0', D: '#5d617c' }
