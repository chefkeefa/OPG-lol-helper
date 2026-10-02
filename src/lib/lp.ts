// LP over time. Riot keeps no rank history, so every time a profile is loaded its ranked entries
// are written down locally; the chart and the per-game LP changes come from those snapshots.
import type { PlayerData, RankEntry } from '../types'

export interface LpSnap {
  at: number
  tier: string
  rank: string
  lp: number
  wins: number
  losses: number
  /** one comparable number across tiers: Iron IV 0 LP = 0, each division 100 */
  v: number
}

const KEY = 'riftpulse.lp.v1'
const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND']
const DIV: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 }

export function ladderValue(e: Pick<RankEntry, 'tier' | 'rank' | 'leaguePoints'>) {
  const i = TIERS.indexOf(e.tier)
  // Master and above share one LP ladder on top of Diamond I
  if (i < 0) return TIERS.length * 400 + e.leaguePoints
  return i * 400 + (DIV[e.rank] ?? 0) * 100 + e.leaguePoints
}

type Store = Record<string, Record<string, LpSnap[]>>
function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}

/** Adds a snapshot for each ranked queue whose numbers changed since the last one. */
export function recordRanks(d: PlayerData) {
  if (d.source === 'demo' || !d.profile.puuid) return
  const all = read()
  const mine = (all[d.profile.puuid] ||= {})
  let changed = false
  for (const e of d.ranks) {
    if (!e.tier || e.tier === 'NONE') continue
    const list = (mine[e.queueType] ||= [])
    const last = list[list.length - 1]
    if (last && last.tier === e.tier && last.rank === e.rank && last.lp === e.leaguePoints && last.wins === e.wins && last.losses === e.losses) continue
    list.push({ at: Date.now(), tier: e.tier, rank: e.rank, lp: e.leaguePoints, wins: e.wins, losses: e.losses, v: ladderValue(e) })
    if (list.length > 2000) list.splice(0, list.length - 2000)
    changed = true
  }
  if (!changed) return
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {}
}

/** Snapshots for one account and queue; for the demo profile a made-up season. */
export function lpHistory(d: PlayerData, queue: string): LpSnap[] {
  if (d.source === 'demo') return demoHistory(d, queue)
  return read()[d.profile.puuid]?.[queue] ?? []
}

/** LP won or lost between snapshots that are one game apart. */
export function lpChanges(list: LpSnap[]) {
  const out: { at: number; delta: number; win: boolean }[] = []
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1]
    const b = list[i]
    const games = b.wins + b.losses - (a.wins + a.losses)
    if (games === 1) out.push({ at: b.at, delta: b.v - a.v, win: b.wins > a.wins })
  }
  return out
}

function demoHistory(d: PlayerData, queue: string): LpSnap[] {
  const e = d.ranks.find((r) => r.queueType === queue)
  if (!e) return []
  let v = ladderValue(e)
  let w = e.wins
  let l = e.losses
  let seed = 7
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const out: LpSnap[] = []
  const now = Date.now()
  for (let i = 0; i < 40; i++) {
    const tier = v >= TIERS.length * 400 ? 'MASTER' : TIERS[Math.floor(v / 400)]
    const rank = v >= TIERS.length * 400 ? 'I' : ['IV', 'III', 'II', 'I'][Math.floor((v % 400) / 100)]
    out.unshift({ at: now - i * 9 * 3600_000, tier, rank, lp: v >= TIERS.length * 400 ? v - TIERS.length * 400 : v % 100, wins: w, losses: l, v })
    const won = r() > 0.45
    v -= won ? 18 + Math.round(r() * 6) : -(16 + Math.round(r() * 6))
    if (won) w--
    else l--
  }
  return out
}

export const TIER_NAMES = TIERS
