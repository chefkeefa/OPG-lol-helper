import type { MatchSummary, PlayerData, Role } from '../types'

// Deterministic PRNG so the demo looks the same on every load.
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const POOL: [string, Role][] = [
  ['Twitch', 'BOTTOM'],
  ['Braum', 'UTILITY'],
  ['Nautilus', 'UTILITY'],
  ['Kaisa', 'BOTTOM'],
  ['Ahri', 'MIDDLE'],
  ['Talon', 'MIDDLE'],
  ['Kayn', 'JUNGLE'],
  ['Kalista', 'BOTTOM'],
  ['Thresh', 'UTILITY'],
  ['LeeSin', 'JUNGLE'],
  ['Darius', 'TOP'],
  ['Sett', 'TOP'],
]
const OTHERS = [
  'Graves', 'Viego', 'Jinx', 'Ezreal', 'Lux', 'Yasuo', 'Yone', 'Leona', 'Lulu', 'Garen',
  'Jax', 'Fiora', 'Zed', 'Syndra', 'Orianna', 'Vayne', 'Caitlyn', 'Morgana', 'Sylas', 'Vi',
  'Malphite', 'Ornn', 'Hecarim', 'Rakan', 'Xayah', 'Akali', 'Katarina', 'Draven', 'Pyke', 'Senna',
]
const NAMES = ['Mercy9', 'Densi', 'Koussay', 'nightowl', 'Zerg Rush', 'Tilted', 'Akkyo', 'Kanavi fan', 'mid or feed', 'Lumen', 'Hydra', 'Velvet', 'Sion Main', 'Pyro', 'Glacier']
const ITEMS = [3031, 3006, 3046, 3094, 3036, 6672, 3072, 3087, 3190, 3109, 3050, 3047, 3157, 3089, 4645, 3020]
const QUEUES = [420, 420, 420, 440, 440, 450, 400]
const KEYSTONES: [number, number][] = [[8008, 8100], [8021, 8300], [8439, 8400], [8465, 8300], [8112, 8200], [8010, 8000]]
const SUB = [8000, 8100, 8200, 8300, 8400]
// regular duo partners, so "Played with" has someone to show
const MATES = [
  { name: 'TiTiJovka', tag: 'RU1' },
  { name: 'fakers chair', tag: 'udk' },
  { name: 'XO Lacoste', tag: 'z0v' },
]

export function mockPlayer(): PlayerData {
  const r = rng(420)
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
  const now = Date.now()
  const matches: MatchSummary[] = []
  let t = now - 50 * 60_000

  for (let i = 0; i < 30; i++) {
    const weighted = r() < 0.55 ? POOL[Math.floor(r() * 3)] : pick(POOL)
    const [champion, mainRole] = weighted
    const queueId = pick(QUEUES)
    const aram = queueId === 450
    const role: Role = aram ? '' : mainRole
    const win = r() < 0.56
    const durationSec = Math.round((aram ? 14 : 20) * 60 + r() * 18 * 60)
    const min = durationSec / 60
    const skill = 0.6 + r() * 0.8 + (win ? 0.25 : -0.1)
    const support = role === 'UTILITY'
    const kills = Math.round((support ? 2 : 7) * skill * (aram ? 1.8 : 1) * (0.5 + r()))
    const deaths = Math.round((aram ? 8 : 5) * (1.5 - skill * 0.6) * (0.5 + r()))
    const assists = Math.round((support ? 14 : 7) * skill * (aram ? 2 : 1) * (0.5 + r()))
    const teamKills = Math.max(kills + assists, Math.round((aram ? 45 : 28) * (0.7 + r() * 0.6)))
    const score = Math.max(12, Math.min(100, Math.round(55 * skill + r() * 25)))
    const shuffled = [...OTHERS].sort(() => r() - 0.5)
    const ks = pick(KEYSTONES)
    const mate = r() < 0.6 ? MATES[Math.floor(r() * r() * 3)] : null
    const ping = (base: number) => Math.round(base * (0.4 + r() * 1.2))
    matches.push({
      v: 2,
      spells: [4, aram ? 32 : role === 'JUNGLE' ? 11 : role === 'UTILITY' ? 3 : role === 'TOP' ? 12 : 7],
      keystone: ks[0],
      subStyle: SUB.filter((x) => x !== ks[1])[Math.floor(r() * 4)],
      pings: { onMyWay: ping(4), push: ping(2), enemyMissing: ping(3), assistMe: ping(0.1), getBack: ping(5.8), needVision: ping(0.1), allIn: ping(0.3), basic: ping(9) },
      id: `DEMO_${7000000 + i}`,
      queueId,
      endedAt: t,
      durationSec,
      win,
      remake: false,
      champion,
      champLevel: Math.min(18, Math.round(min * 0.55 + 4)),
      role,
      kills,
      deaths,
      assists,
      cs: Math.round(min * (support ? 1.2 : aram ? 3.5 : 6.5 + r() * 2.2)),
      kp: Math.min(1, (kills + assists) / teamKills),
      dmgPerMin: (support ? 380 : 650) * skill * (0.8 + r() * 0.4),
      dmgShare: Math.min(0.48, (support ? 0.1 : 0.24) * skill * (0.8 + r() * 0.4)),
      goldPerMin: (support ? 260 : 400) * (0.85 + skill * 0.15 + r() * 0.1),
      visionPerMin: support ? 1.6 + r() * 1.2 : 0.4 + r() * 0.6,
      d15: aram ? undefined : { gold: Math.round((r() - 0.4) * 1800), ka: Math.round((r() - 0.4) * 6), cs: Math.round((r() - 0.4) * 30), xp: Math.round((r() - 0.4) * 900) },
      score,
      placement: score >= 95 ? 1 : Math.max(2, Math.min(10, Math.round(11 - score / 10))),
      largestMultiKill: kills > 12 ? 3 : kills > 7 ? 2 : 1,
      items: Array.from({ length: 6 }, () => pick(ITEMS)).concat(3340),
      allies: shuffled.slice(0, 4),
      enemies: shuffled.slice(4, 9),
      players: [champion, ...shuffled.slice(0, 9)].map((c, j) => {
        const me = j === 0
        const k = me ? kills : Math.round(r() * 12)
        return {
          name: me ? 'mentally stable' : j === 1 && mate ? mate.name : NAMES[(i * 7 + j) % NAMES.length],
          tag: me ? 'xd420' : j === 1 && mate ? mate.tag : 'EUW',
          champion: c,
          teamId: j < 5 ? 100 : 200,
          me,
          kills: k,
          deaths: me ? deaths : Math.round(r() * 10),
          assists: me ? assists : Math.round(r() * 16),
          cs: Math.round(min * (2 + r() * 6)),
          damage: Math.round(min * (300 + r() * 700)),
          gold: Math.round(min * (280 + r() * 160)),
          vision: Math.round(min * (0.4 + r() * 1.6)),
          score: me ? score : Math.round(20 + r() * 80),
          items: Array.from({ length: 6 }, () => pick(ITEMS)).concat(3340),
        }
      }),
    })
    t -= durationSec * 1000 + (r() < 0.3 ? r() * 20 * 3600_000 : r() * 90 * 60_000)
  }

  return {
    profile: {
      gameName: 'mentally stable',
      tagLine: 'xd420',
      platform: 'euw1',
      level: 633,
      iconId: 6655,
      puuid: 'demo',
    },
    ranks: [
      { queueType: 'RANKED_SOLO_5x5', tier: 'MASTER', rank: 'I', leaguePoints: 142, wins: 88, losses: 75 },
      { queueType: 'RANKED_FLEX_SR', tier: 'DIAMOND', rank: 'II', leaguePoints: 54, wins: 31, losses: 24 },
    ],
    matches,
    mastery: [
      { champion: 'Twitch', level: 42, points: 512340 },
      { champion: 'Braum', level: 31, points: 388120 },
      { champion: 'Nautilus', level: 27, points: 301877 },
      { champion: 'Kaisa', level: 18, points: 204551 },
      { champion: 'Thresh', level: 12, points: 140022 },
    ],
    source: "demo",
    fetchedAt: now,
  }
}
