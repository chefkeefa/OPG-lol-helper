import type { MatchSummary, PlayerData, RankEntry } from '../types'
import { normalizeMatch, type RawMatch } from './normalize'
import { championMap } from '../lib/ddragon'

export const PLATFORMS: Record<string, string> = {
  euw1: 'EUW',
  eun1: 'EUNE',
  ru: 'RU',
  tr1: 'TR',
  me1: 'ME',
  na1: 'NA',
  br1: 'BR',
  la1: 'LAN',
  la2: 'LAS',
  kr: 'KR',
  jp1: 'JP',
  oc1: 'OCE',
  sg2: 'SG',
  tw2: 'TW',
  vn2: 'VN',
  th2: 'TH',
  ph2: 'PH',
}

export function regionalOf(platform: string): string {
  if (['na1', 'br1', 'la1', 'la2'].includes(platform)) return 'americas'
  if (['kr', 'jp1'].includes(platform)) return 'asia'
  if (['oc1', 'ph2', 'sg2', 'th2', 'tw2', 'vn2'].includes(platform)) return 'sea'
  return 'europe'
}

export class RiotError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

const KEY_STORAGE = 'riftpulse.apiKey'
export const getStoredKey = () => {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}
export const setStoredKey = (k: string) => {
  try {
    if (k) localStorage.setItem(KEY_STORAGE, k)
    else localStorage.removeItem(KEY_STORAGE)
  } catch {
    /* storage unavailable */
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function riot<T>(host: string, path: string, attempt = 0): Promise<T> {
  let status: number
  let body: unknown
  let retryAfter = 2
  if (window.rp) {
    // desktop build: the main process calls Riot with the key from settings
    const r = await window.rp.riot(host, path)
    status = r.status
    body = r.body
    retryAfter = r.retryAfter || 2
  } else {
    const key = getStoredKey()
    const res = await fetch(`/riot/${host}${path}`, { headers: key ? { 'x-riot-key': key } : {} })
    status = res.status
    retryAfter = Number(res.headers.get('retry-after') ?? 2)
    body = await res.json().catch(() => null)
  }
  if (status === 429 && attempt < 3) {
    await sleep(retryAfter * 1000 + 250)
    return riot<T>(host, path, attempt + 1)
  }
  if (status >= 400) {
    const msg = (body as { status?: { message?: string } } | null)?.status?.message ?? `HTTP ${status}`
    throw new RiotError(status, msg)
  }
  return body as T
}

/** True when the local proxy is reachable (i.e. the app runs via `npm run dev`/`preview`). */
export async function proxyConfig(): Promise<{ serverKey: boolean } | null> {
  if (window.rp) {
    const st = await window.rp.settings.get()
    return { serverKey: Boolean(st.riotApiKey) }
  }
  try {
    const r = await fetch('/riot/_config')
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

// ---- match cache: finished matches never change, so keep them between sessions
const CACHE_KEY = 'riftpulse.matches.v1'
let memCache: Record<string, MatchSummary> | null = null
export async function readCache(): Promise<Record<string, MatchSummary>> {
  if (memCache) return memCache
  let local: Record<string, MatchSummary> = {}
  try {
    local = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
  } catch {}
  if (window.rp?.cache) {
    // desktop: file on disk, no browser storage quota; merge what older versions kept in localStorage
    const disk = await window.rp.cache.read().catch(() => ({}))
    memCache = { ...local, ...disk }
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch {}
  } else memCache = local
  return memCache
}
export function writeCache(c: Record<string, MatchSummary>) {
  memCache = c
  if (window.rp?.cache) {
    window.rp.cache.write(c).catch(() => {})
    return
  }
  try {
    const entries = Object.entries(c).sort((a, b) => b[1].endedAt - a[1].endedAt).slice(0, 300)
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    /* quota or unavailable */
  }
}
export function clearCache() {
  memCache = {}
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {}
  window.rp?.cache?.clear().catch(() => {})
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

export async function loadPlayer(
  riotId: string,
  platform: string,
  count: number,
  onProgress?: (done: number, total: number) => void,
  onPartial?: (d: PlayerData) => void,
): Promise<PlayerData> {
  const [gameName, tagLine] = riotId.split('#').map((s) => s.trim())
  if (!gameName || !tagLine) throw new RiotError(400, 'Введите Riot ID в формате Имя#ТЕГ')
  const regional = regionalOf(platform)
  const accountHost = regional === 'sea' ? 'asia' : regional

  const account = await riot<{ puuid: string; gameName: string; tagLine: string }>(
    accountHost,
    `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
  )
  const [summoner, ranks, ids, top] = await Promise.all([
    riot<{ profileIconId: number; summonerLevel: number }>(
      platform,
      `/lol/summoner/v4/summoners/by-puuid/${account.puuid}`,
    ),
    riot<RankEntry[]>(platform, `/lol/league/v4/entries/by-puuid/${account.puuid}`).catch(() => []),
    (async () => {
      // match-v5 returns at most 100 ids per call
      const ids: string[] = []
      for (let start = 0; start < count; start += 100) {
        const page = await riot<string[]>(regional, `/lol/match/v5/matches/by-puuid/${account.puuid}/ids?start=${start}&count=${Math.min(100, count - start)}`)
        ids.push(...page)
        if (page.length < Math.min(100, count - start)) break
      }
      return ids
    })(),
    riot<{ championId: number; championLevel: number; championPoints: number }[]>(
      platform,
      `/lol/champion-mastery/v4/champion-masteries/by-puuid/${account.puuid}/top?count=8`,
    ).catch(() => []),
  ])
  const champs = await championMap()

  const cache = await readCache()
  const profile = {
    gameName: account.gameName,
    tagLine: account.tagLine,
    platform,
    level: summoner.summonerLevel,
    iconId: summoner.profileIconId,
    puuid: account.puuid,
  }
  const found: (MatchSummary | null | undefined)[] = ids.map((id) => {
    const m = cache[`${account.puuid}:${id}`]
    return m && m.players ? m : undefined
  })
  const snapshot = (): PlayerData => ({
    profile,
    ranks,
    matches: found.filter((m): m is MatchSummary => Boolean(m)),
    source: 'riot',
    fetchedAt: Date.now(),
  })
  const missing = ids.map((id, i) => ({ id, i })).filter(({ i }) => found[i] === undefined)
  // show what is already cached right away, then fill in the rest as it arrives
  if (onPartial && found.some(Boolean)) onPartial(snapshot())
  let done = ids.length - missing.length
  onProgress?.(done, ids.length)
  await mapLimit(missing, 4, async ({ id, i }) => {
    const raw = await riot<RawMatch>(regional, `/lol/match/v5/matches/${id}`).catch(() => null)
    const m = raw ? normalizeMatch(raw, account.puuid) : null
    if (m) cache[`${account.puuid}:${id}`] = m
    found[i] = m
    onProgress?.(++done, ids.length)
    if (done % 10 === 0) {
      writeCache(cache)
      onPartial?.(snapshot())
    }
  })
  writeCache(cache)

  return {
    profile,
    ranks,
    matches: found.filter((m): m is MatchSummary => Boolean(m)),
    source: 'riot',
    fetchedAt: Date.now(),
    mastery: top.map((t) => ({ champion: champs[t.championId] ?? String(t.championId), level: t.championLevel, points: t.championPoints })),
  }
}
