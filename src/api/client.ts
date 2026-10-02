import type { MatchSummary, PlayerData, RankEntry } from '../types'
import { lcuGameToRaw, normalizeMatch, type LcuGame } from './normalize'
import { championMap } from '../lib/ddragon'
import { mapLimit, readCache, writeCache } from './riot'

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
    matches: matches.filter((m): m is MatchSummary => Boolean(m)).sort((a, b) => b.endedAt - a.endedAt),
    source: 'client',
    fetchedAt: Date.now(),
    mastery: mastery
      .sort((a, b) => b.championPoints - a.championPoints)
      .slice(0, 8)
      .map((t) => ({ champion: champs[t.championId] ?? String(t.championId), level: t.championLevel, points: t.championPoints })),
  }
}
