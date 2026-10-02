import { regionalOf, riot } from './riot'

export type ApexTier = 'challenger' | 'grandmaster' | 'master'

export interface LadderEntry {
  puuid: string
  leaguePoints: number
  wins: number
  losses: number
  hotStreak?: boolean
}

/** Top of the ranked solo ladder for one region (Riot league-v4). */
export async function loadLadder(platform: string, tier: ApexTier): Promise<LadderEntry[]> {
  const r = await riot<{ entries: LadderEntry[] }>(platform, `/lol/league/v4/${tier}leagues/by-queue/RANKED_SOLO_5x5`)
  return [...r.entries].sort((a, b) => b.leaguePoints - a.leaguePoints || b.wins - a.wins)
}

// Riot IDs are looked up one by one, so they are cached for a week.
const NAMES_KEY = 'riftpulse.names.v1'
type NameCache = Record<string, { n: string; t: string; at: number }>
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

export async function resolveName(platform: string, puuid: string) {
  const hit = cachedName(puuid)
  if (hit) return hit
  const regional = regionalOf(platform)
  const a = await riot<{ gameName: string; tagLine: string }>(regional === 'sea' ? 'asia' : regional, `/riot/account/v1/accounts/by-puuid/${puuid}`)
  names[puuid] = { n: a.gameName, t: a.tagLine, at: Date.now() }
  saveNames()
  return a
}
