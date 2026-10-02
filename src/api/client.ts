import type { MatchSummary, PlayerData, RankEntry } from '../types'
import { lcuGameToRaw, normalizeMatch, type LcuGame } from './normalize'
import { championMap } from '../lib/ddragon'
import { mapLimit, proxyConfig, readCache, regionalOf, riot, writeCache } from './riot'
import type { RawMatch } from './normalize'

// region names the client reports → Riot API platform ids
const REGION_PLATFORM: Record<string, string> = {
  RU: 'ru', EUW: 'euw1', EUW1: 'euw1', EUNE: 'eun1', EUN1: 'eun1', TR: 'tr1', TR1: 'tr1', ME: 'me1', ME1: 'me1',
  NA: 'na1', NA1: 'na1', BR: 'br1', BR1: 'br1', LAN: 'la1', LA1: 'la1', LAS: 'la2', LA2: 'la2', KR: 'kr',
  JP: 'jp1', JP1: 'jp1', OCE: 'oc1', OC1: 'oc1', SG: 'sg2', SG2: 'sg2', TW: 'tw2', TW2: 'tw2', VN: 'vn2', VN2: 'vn2',
  TH: 'th2', TH2: 'th2', PH: 'ph2', PH2: 'ph2',
}

/** Which server the signed-in account is on; tries several client endpoints because some are missing on some builds. */
async function detectPlatform(get: <T>(path: string) => Promise<T>): Promise<string> {
  const probes: (() => Promise<unknown>)[] = [
    () => get<string>('/lol-platform-config/v1/namespaces/LoginDataPacket/platformId'),
    () => get<{ platformId?: string }>('/lol-chat/v1/me').then((r) => r?.platformId),
    () => get<{ region?: string }>('/riotclient/region-locale').then((r) => r?.region),
    () => get<{ region?: string }>('/riotclient/get_region_locale').then((r) => r?.region),
  ]
  for (const probe of probes) {
    const v = await probe().catch(() => null)
    const p = typeof v === 'string' ? REGION_PLATFORM[v.trim().toUpperCase()] : undefined
    if (p) return p
  }
  return 'euw1'
}

/** Loads the signed-in account straight from the running League client — no API key needed. */
export async function loadFromClient(count: number, onProgress?: (done: number, total: number) => void): Promise<PlayerData> {
  const rp = window.rp
  if (!rp) throw new Error('desktop only')
  const get = rp.lcu.get

  const me = await get<{ puuid: string; gameName: string; tagLine: string; profileIconId: number; summonerLevel: number }>(
    '/lol-summoner/v1/current-summoner',
  )
  // The client returns at most 20 games per request, so the history is read page by page.
  const loadHistory = async () => {
    const all: LcuGame[] = []
    for (let beg = 0; beg < count; beg += 20) {
      const end = Math.min(count, beg + 20) - 1
      const page = await get<{ games: { games: LcuGame[] } }>(`/lol-match-history/v1/products/lol/${me.puuid}/matches?begIndex=${beg}&endIndex=${end}`)
      const games = page.games?.games ?? []
      for (const g of games) if (!all.some((x) => x.gameId === g.gameId)) all.push(g)
      if (games.length < end - beg + 1) break
    }
    return all
  }
  const [ranked, games, platform, mastery, champs] = await Promise.all([
    get<{ queues: { queueType: string; tier: string; division: string; leaguePoints: number; wins: number; losses: number }[] }>(
      '/lol-ranked/v1/current-ranked-stats',
    ).catch(() => ({ queues: [] })),
    loadHistory(),
    detectPlatform(get),
    get<{ championId: number; championLevel: number; championPoints: number }[]>(
      '/lol-champion-mastery/v1/local-player/champion-mastery',
    ).catch(() => []),
    championMap(),
  ])

  const cache = await readCache()
  let done = 0
  onProgress?.(0, games.length)
  // The history list only carries our own participant; fetch each full game for all ten players.
  const matches = await mapLimit(games, 4, async (g) => {
    const key = `${me.puuid}:${g.platformId ?? 'LCU'}_${g.gameId}`
    let m: MatchSummary | null | undefined = cache[key]
    if (!m || !m.players) {
      const full = await get<LcuGame>(`/lol-match-history/v1/games/${g.gameId}`).catch(() => g)
      m = normalizeMatch(lcuGameToRaw(full, champs), me.puuid)
      if (m) cache[key] = m
    }
    onProgress?.(++done, games.length)
    return m
  })

  // The client only keeps the latest ~20 games. Games seen on earlier launches stay in the
  // disk cache, so the history keeps growing even without a key.
  const all = matches.filter((m): m is MatchSummary => Boolean(m))
  const have = new Set(all.map((m) => m.id.split('_').pop()))
  for (const [key, m] of Object.entries(cache)) {
    const gameId = m.id.split('_').pop()
    if (key.startsWith(`${me.puuid}:`) && m.players && !have.has(gameId)) {
      have.add(gameId)
      all.push(m)
    }
  }
  // Older games come from match-v5 when a key is set.
  if (all.length < count && (await proxyConfig().catch(() => null))?.serverKey) {
    const regional = regionalOf(String(platform).toLowerCase())
    const ids: string[] = []
    // match-v5 wants the puuid issued for this API key, which may differ from the client's
    let apiPuuid = me.puuid
    try {
      if (me.gameName && me.tagLine) {
        const account = await riot<{ puuid: string }>(
          regional === 'sea' ? 'asia' : regional,
          `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(me.gameName)}/${encodeURIComponent(me.tagLine)}`,
        )
        apiPuuid = account.puuid
      }
      for (let start = 0; start < count; start += 100) {
        const n = Math.min(100, count - start)
        const page = await riot<string[]>(regional, `/lol/match/v5/matches/by-puuid/${apiPuuid}/ids?start=${start}&count=${n}`)
        ids.push(...page)
        if (page.length < n) break
      }
    } catch {}
    const missing = ids.filter((id) => !have.has(id.split('_').pop())).slice(0, count - all.length)
    let extraDone = 0
    onProgress?.(games.length, games.length + missing.length)
    const extra = await mapLimit(missing, 4, async (id) => {
      const key = `${me.puuid}:${id}`
      let m: MatchSummary | null | undefined = cache[key]
      if (!m || !m.players) {
        m = await riot<RawMatch>(regional, `/lol/match/v5/matches/${id}`)
          .then((raw) => normalizeMatch(raw, apiPuuid))
          .catch(() => null)
        if (m) cache[key] = m
      }
      onProgress?.(games.length + ++extraDone, games.length + missing.length)
      return m
    })
    for (const m of extra) if (m) all.push(m)
  }
  writeCache(cache)

  const ranks: RankEntry[] = ranked.queues
    .filter((q) => q.tier && q.tier !== 'NONE' && q.tier !== '')
    .map((q) => ({ queueType: q.queueType, tier: q.tier, rank: q.division, leaguePoints: q.leaguePoints, wins: q.wins, losses: q.losses }))

  return {
    profile: {
      gameName: me.gameName,
      tagLine: me.tagLine,
      platform: String(platform).toLowerCase(),
      level: me.summonerLevel,
      iconId: me.profileIconId,
      puuid: me.puuid,
    },
    ranks,
    matches: all.sort((a, b) => b.endedAt - a.endedAt).slice(0, count),
    source: 'client',
    fetchedAt: Date.now(),
    mastery: mastery
      .sort((a, b) => b.championPoints - a.championPoints)
      .slice(0, 8)
      .map((t) => ({ champion: champs[t.championId] ?? String(t.championId), level: t.championLevel, points: t.championPoints })),
  }
}
