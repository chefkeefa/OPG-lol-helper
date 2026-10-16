import { regionalOf, riot } from './riot'

export type ApexTier = 'challenger' | 'grandmaster' | 'master'
export type LadderQueue = 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR'

export interface LadderEntry {
  puuid: string
  leaguePoints: number
  wins: number
  losses: number
  hotStreak?: boolean
  tier?: ApexTier
}

/** Top of a ranked ladder for one region (Riot league-v4). */
export async function loadLadder(platform: string, tier: ApexTier, queue: LadderQueue = 'RANKED_SOLO_5x5'): Promise<LadderEntry[]> {
  const r = await riot<{ entries: LadderEntry[] }>(platform, `/lol/league/v4/${tier}leagues/by-queue/${queue}`)
  return r.entries.map((e) => ({ ...e, tier })).sort((a, b) => b.leaguePoints - a.leaguePoints || b.wins - a.wins)
}

export interface Apex {
  /** Challenger, Grandmaster and Master in one ranking */
  all: LadderEntry[]
  /** lowest LP currently in Challenger / Grandmaster */
  cutoff: { challenger: number | null; grandmaster: number | null }
}
/** The whole apex ladder of a region: three requests, merged by LP. */
export async function loadApex(platform: string, queue: LadderQueue): Promise<Apex> {
  const [c, g, m] = await Promise.all((['challenger', 'grandmaster', 'master'] as ApexTier[]).map((t) => loadLadder(platform, t, queue)))
  const low = (l: LadderEntry[]) => (l.length ? Math.min(...l.map((e) => e.leaguePoints)) : null)
  return { all: [...c, ...g, ...m], cutoff: { challenger: low(c), grandmaster: low(g) } }
}

/** A player's most played champions by mastery (champion ids). */
const bestCache: Record<string, number[]> = {}
export async function bestChamps(platform: string, puuid: string): Promise<number[]> {
  if (bestCache[puuid]) return bestCache[puuid]
  const r = await riot<{ championId: number }[]>(platform, `/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=4`)
  return (bestCache[puuid] = r.map((x) => x.championId))
}

/** Made-up ladder for the web preview without a key. */
export function demoApex(): Apex {
  const nick = ['God and GOAT', 'Miles Morales', 'BMPX', 'Agni Kai', 'lich', 'Alisa Powder', 'Velvet', 'DRAW HYDRA', 'Gottor', 'Koussay', 'Lumen', 'Pyro', 'Glacier', 'Akkyo', 'Mercy9', 'Densi']
  const all: LadderEntry[] = Array.from({ length: 60 }, (_, i) => {
    const lp = Math.round(2014 - i * 31 - (i % 3) * 7)
    const g = 300 + ((i * 97) % 700)
    const w = Math.round(g * (0.52 + ((i * 13) % 9) / 100))
    return { puuid: `demo-${i}`, leaguePoints: lp, wins: w, losses: g - w, hotStreak: i % 5 === 1, tier: lp >= 1085 ? 'challenger' : lp >= 671 ? 'grandmaster' : 'master' }
  })
  for (const [i, e] of all.entries()) names[e.puuid] = { n: nick[i % nick.length] + (i >= nick.length ? ` ${i}` : ''), t: 'EUW', at: Date.now(), i: [4568, 6271, 5367, 588, 29, 4834, 6600, 1640][i % 8] }
  for (const [i, e] of all.entries()) bestCache[e.puuid] = [[103, 157, 238, 84], [24, 39, 114, 266], [17, 51, 99, 222], [11, 64, 141, 77]][i % 4]
  return { all, cutoff: { challenger: 1085, grandmaster: 671 } }
}

// Riot IDs are looked up one by one, so they are cached for a week.
const NAMES_KEY = 'riftpulse.names.v1'
type NameCache = Record<string, { n: string; t: string; at: number; i?: number }>
function readNames(): NameCache {
  try {
    return JSON.parse(localStorage.getItem(NAMES_KEY) ?? '{}')
  } catch {
    return {}
  }
}
const names = readNames()
let saveTimer: ReturnType<typeof setTimeout> | undefined
function saveNames() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(NAMES_KEY, JSON.stringify(names))
    } catch {}
  }, 500)
}

export function cachedName(puuid: string) {
  const c = names[puuid]
  return c && Date.now() - c.at < 7 * 86_400_000 ? { gameName: c.n, tagLine: c.t } : null
}

/** Profile icon id, cached with the name. */
export const cachedIcon = (puuid: string) => names[puuid]?.i
export async function profileIconOf(platform: string, puuid: string): Promise<number> {
  const hit = names[puuid]?.i
  if (hit != null) return hit
  const s = await riot<{ profileIconId: number }>(platform, `/lol/summoner/v4/summoners/by-puuid/${puuid}`)
  if (names[puuid]) {
    names[puuid].i = s.profileIconId
    saveNames()
  }
  return s.profileIconId
}

export async function resolveName(platform: string, puuid: string) {
  const hit = cachedName(puuid)
  if (hit) return hit
  const regional = regionalOf(platform)
  const a = await riot<{ gameName: string; tagLine: string }>(regional === 'sea' ? 'asia' : regional, `/riot/account/v1/accounts/by-puuid/${puuid}`)
  names[puuid] = { n: a.gameName, t: a.tagLine, at: Date.now(), i: names[puuid]?.i }
  saveNames()
  return a
}
