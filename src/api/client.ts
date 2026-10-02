import type { MatchSummary, PlayerData, RankEntry } from '../types'
import { lcuGameToRaw, normalizeMatch, type LcuGame, type RawMatch } from './normalize'
import { championMap } from '../lib/ddragon'
import { mapLimit, readCache, regionalOf, riot, writeCache } from './riot'

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
    get<string>('/lol-platform-config/v1/namespaces/LoginDataPacket/platformId').catch(() => 'EUW1'),
    get<{ championId: number; championLevel: number; championPoints: number }[]>(
      '/lol-champion-mastery/v1/local-player/champion-mastery',
    ).catch(() => []),
    championMap(),
  ])

  const cache = readCache()
  const platformId = String(platform).toLowerCase()
  const [stored, hasKey] = await Promise.all([
    rp.history.get(me.puuid).catch(() => [] as MatchSummary[]),
    rp.settings.get().then((st) => Boolean(st.riotApiKey)).catch(() => false),
  ])
  const known = new Map<string, MatchSummary>()
  for (const m of stored) if (m?.players) known.set(m.id, m)

  // The client keeps only the last 20 games. With a Riot API key the rest of the
  // history comes from match-v5; without one, games saved on earlier launches fill it up.
  let apiIds: string[] = []
  let apiPuuid = ''
  if (hasKey && me.gameName && me.tagLine) {
    try {
      const regional = regionalOf(platformId)
      const account = await riot<{ puuid: string }>(
        regional === 'sea' ? 'asia' : regional,
        `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(me.gameName)}/${encodeURIComponent(me.tagLine)}`,
      )
      apiPuuid = account.puuid
      for (let start = 0; start < count; start += 100) {
        const n = Math.min(100, count - start)
        const page = await riot<string[]>(regional, `/lol/match/v5/matches/by-puuid/${apiPuuid}/ids?start=${start}&count=${n}`)
        apiIds.push(...page)
        if (page.length < n) break
      }
    } catch {
      apiIds = [] // expired or missing key: fall back to the client and the saved history
    }
  }
  const lcuIds = new Set(games.map((g) => `${g.platformId ?? 'LCU'}_${g.gameId}`))
  const missing = apiIds.filter((id) => !known.has(id) && !lcuIds.has(id))

  let done = 0
  const total = games.length + missing.length
  onProgress?.(0, total)
  // The history list only carries our own participant; fetch each full game for all ten players.
  const fromClient = await mapLimit(games, 4, async (g) => {
    const key = `${me.puuid}:${g.platformId ?? 'LCU'}_${g.gameId}`
    let m: MatchSummary | null | undefined = cache[key]
    if (!m || !m.players) {
      const full = await get<LcuGame>(`/lol-match-history/v1/games/${g.gameId}`).catch(() => g)
      m = normalizeMatch(lcuGameToRaw(full, champs), me.puuid)
      if (m) cache[key] = m
    }
    onProgress?.(++done, total)
    return m
  })
  writeCache(cache)
  const fromApi = await mapLimit(missing, 4, async (id) => {
    const raw = await riot<RawMatch>(regionalOf(platformId), `/lol/match/v5/matches/${id}`).catch(() => null)
    onProgress?.(++done, total)
    return raw ? normalizeMatch(raw, apiPuuid) : null
  })

  const fresh = [...fromClient, ...fromApi].filter((m): m is MatchSummary => Boolean(m?.players))
  for (const m of fresh) known.set(m.id, m)
  if (fresh.length) rp.history.put(me.puuid, fresh).catch(() => {})
  const matches = [...known.values()].sort((a, b) => b.endedAt - a.endedAt).slice(0, count)

  const ranks: RankEntry[] = ranked.queues
    .filter((q) => q.tier && q.tier !== 'NONE' && q.tier !== '')
    .map((q) => ({ queueType: q.queueType, tier: q.tier, rank: q.division, leaguePoints: q.leaguePoints, wins: q.wins, losses: q.losses }))

  return {
    profile: {
      gameName: me.gameName,
      tagLine: me.tagLine,
      platform: platformId,
      level: me.summonerLevel,
      iconId: me.profileIconId,
      puuid: me.puuid,
    },
    ranks,
    matches,
    source: 'client',
    fetchedAt: Date.now(),
    mastery: mastery
      .sort((a, b) => b.championPoints - a.championPoints)
      .slice(0, 8)
      .map((t) => ({ champion: champs[t.championId] ?? String(t.championId), level: t.championLevel, points: t.championPoints })),
  }
}
