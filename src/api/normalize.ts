import type { MatchSummary, PlayerLine, Role } from '../types'

/** match-v5 participant (only the fields we read). LCU games are converted to this shape. */
export interface RawParticipant {
  puuid: string
  riotIdGameName?: string
  summonerName?: string
  teamId: number
  championName: string
  champLevel: number
  teamPosition: string
  kills: number
  deaths: number
  assists: number
  totalMinionsKilled: number
  neutralMinionsKilled: number
  totalDamageDealtToChampions: number
  goldEarned: number
  visionScore: number
  win: boolean
  largestMultiKill: number
  gameEndedInEarlySurrender: boolean
  item0: number
  item1: number
  item2: number
  item3: number
  item4: number
  item5: number
  item6: number
}
export interface RawMatch {
  metadata: { matchId: string }
  info: {
    gameDuration: number
    gameEndTimestamp: number
    queueId: number
    participants: RawParticipant[]
  }
}

const DDRAGON_FIX: Record<string, string> = { FiddleSticks: 'Fiddlesticks' }
const champ = (n: string) => DDRAGON_FIX[n] ?? n
const itemsOf = (p: RawParticipant) => [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6]

export function normalizeMatch(m: RawMatch, puuid: string): MatchSummary | null {
  const ps = m.info.participants
  const me = ps.find((p) => p.puuid === puuid)
  if (!me) return null
  const minutes = Math.max(1, m.info.gameDuration / 60)

  const totals = new Map<number, { kills: number; dmg: number; gold: number; vision: number }>()
  for (const p of ps) {
    const t = totals.get(p.teamId) ?? { kills: 0, dmg: 0, gold: 0, vision: 0 }
    t.kills += p.kills
    t.dmg += p.totalDamageDealtToChampions
    t.gold += p.goldEarned
    t.vision += p.visionScore
    totals.set(p.teamId, t)
  }

  // Own performance score: a weighted blend of share-of-team metrics + KDA.
  const raw = ps.map((p) => {
    const t = totals.get(p.teamId)!
    const kda = (p.kills + p.assists) / Math.max(1, p.deaths)
    const kp = t.kills ? (p.kills + p.assists) / t.kills : 0
    return (
      0.3 * Math.min(kda / 6, 1.5) +
      0.25 * kp +
      0.25 * (t.dmg ? (p.totalDamageDealtToChampions / t.dmg) * 4 : 0) +
      0.1 * (t.gold ? (p.goldEarned / t.gold) * 4 : 0) +
      0.1 * (t.vision ? (p.visionScore / t.vision) * 4 : 0) +
      (p.win ? 0.1 : 0)
    )
  })
  const max = Math.max(...raw) || 1
  const myIdx = ps.indexOf(me)
  const order = raw.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0])
  const t = totals.get(me.teamId)!

  const players: PlayerLine[] = ps
    .map((p, i) => ({
      name: p.riotIdGameName || p.summonerName || '—',
      champion: champ(p.championName),
      teamId: p.teamId,
      me: p === me,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      cs: p.totalMinionsKilled + p.neutralMinionsKilled,
      damage: p.totalDamageDealtToChampions,
      gold: p.goldEarned,
      vision: p.visionScore,
      score: Math.round((raw[i] / max) * 100),
      items: itemsOf(p),
    }))
    .sort((a, b) => Number(b.teamId === me.teamId) - Number(a.teamId === me.teamId))

  return {
    id: m.metadata.matchId,
    queueId: m.info.queueId,
    endedAt: m.info.gameEndTimestamp,
    durationSec: m.info.gameDuration,
    win: me.win,
    remake: me.gameEndedInEarlySurrender,
    champion: champ(me.championName),
    champLevel: me.champLevel,
    role: (me.teamPosition || '') as Role,
    kills: me.kills,
    deaths: me.deaths,
    assists: me.assists,
    cs: me.totalMinionsKilled + me.neutralMinionsKilled,
    kp: t.kills ? (me.kills + me.assists) / t.kills : 0,
    dmgPerMin: me.totalDamageDealtToChampions / minutes,
    dmgShare: t.dmg ? me.totalDamageDealtToChampions / t.dmg : 0,
    goldPerMin: me.goldEarned / minutes,
    visionPerMin: me.visionScore / minutes,
    score: Math.round((raw[myIdx] / max) * 100),
    placement: order.findIndex(([, i]) => i === myIdx) + 1,
    largestMultiKill: me.largestMultiKill,
    items: itemsOf(me),
    allies: ps.filter((p) => p.teamId === me.teamId && p !== me).map((p) => champ(p.championName)),
    enemies: ps.filter((p) => p.teamId !== me.teamId).map((p) => champ(p.championName)),
    players,
  }
}

// ---------- LCU match-history game → RawMatch ----------
interface LcuGame {
  gameId: number
  gameCreation: number
  gameDuration: number
  queueId: number
  platformId?: string
  participants: {
    participantId: number
    teamId: number
    championId: number
    stats: Record<string, number | boolean>
    timeline?: { lane?: string; role?: string }
  }[]
  participantIdentities: { participantId: number; player: { puuid: string; gameName?: string; summonerName?: string } }[]
}

function lcuRole(lane = '', role = ''): string {
  if (lane === 'BOTTOM' && /SUPPORT/.test(role)) return 'UTILITY'
  if (['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM'].includes(lane)) return lane
  return ''
}

export function lcuGameToRaw(g: LcuGame, champs: Record<number, string>): RawMatch {
  const n = (v: unknown) => (typeof v === 'number' ? v : 0)
  return {
    metadata: { matchId: `${g.platformId ?? 'LCU'}_${g.gameId}` },
    info: {
      gameDuration: g.gameDuration,
      gameEndTimestamp: g.gameCreation + g.gameDuration * 1000,
      queueId: g.queueId,
      participants: g.participants.map((p) => {
        const id = g.participantIdentities.find((x) => x.participantId === p.participantId)?.player
        const s = p.stats
        return {
          puuid: id?.puuid ?? '',
          riotIdGameName: id?.gameName,
          summonerName: id?.summonerName,
          teamId: p.teamId,
          championName: champs[p.championId] ?? `Champion${p.championId}`,
          champLevel: n(s.champLevel),
          teamPosition: lcuRole(p.timeline?.lane, p.timeline?.role),
          kills: n(s.kills),
          deaths: n(s.deaths),
          assists: n(s.assists),
          totalMinionsKilled: n(s.totalMinionsKilled),
          neutralMinionsKilled: n(s.neutralMinionsKilled),
          totalDamageDealtToChampions: n(s.totalDamageDealtToChampions),
          goldEarned: n(s.goldEarned),
          visionScore: n(s.visionScore),
          win: Boolean(s.win),
          largestMultiKill: n(s.largestMultiKill),
          gameEndedInEarlySurrender: Boolean(s.gameEndedInEarlySurrender),
          item0: n(s.item0),
          item1: n(s.item1),
          item2: n(s.item2),
          item3: n(s.item3),
          item4: n(s.item4),
          item5: n(s.item5),
          item6: n(s.item6),
        }
      }),
    },
  }
}
export type { LcuGame }
