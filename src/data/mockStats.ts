// Deterministic demo statistics for the web preview and the "show example" mode,
// shaped exactly like what the desktop collector produces.
import type { Agg, PairMap, Rec, StatsDetail, StatsStatus, StatsSummary } from '../lib/statsTypes'

type Arch = 'adc' | 'mage' | 'assassin' | 'fighter' | 'tank' | 'jungle' | 'jtank' | 'ench' | 'engage'
const CHAMPS: [string, string, Arch, number][] = [
  // champion, role, archetype, popularity
  ['Aatrox', 'TOP', 'fighter', 9], ['Darius', 'TOP', 'fighter', 8], ['Garen', 'TOP', 'fighter', 6], ['Fiora', 'TOP', 'fighter', 6],
  ['Jax', 'TOP', 'fighter', 8], ['Malphite', 'TOP', 'tank', 6], ['Ornn', 'TOP', 'tank', 5], ['Sett', 'TOP', 'fighter', 6],
  ['Camille', 'TOP', 'fighter', 5], ['Renekton', 'TOP', 'fighter', 5], ['KSante', 'TOP', 'tank', 6], ['Mordekaiser', 'TOP', 'fighter', 5],
  ['Riven', 'TOP', 'fighter', 4], ['Yasuo', 'TOP', 'fighter', 3],
  ['LeeSin', 'JUNGLE', 'jungle', 10], ['Viego', 'JUNGLE', 'jungle', 8], ['Vi', 'JUNGLE', 'jungle', 6], ['Kayn', 'JUNGLE', 'jungle', 6],
  ['Graves', 'JUNGLE', 'jungle', 6], ['Kindred', 'JUNGLE', 'jungle', 4], ['Elise', 'JUNGLE', 'jungle', 3], ['Nocturne', 'JUNGLE', 'jungle', 4],
  ['Hecarim', 'JUNGLE', 'jungle', 5], ['Sejuani', 'JUNGLE', 'jtank', 4], ['JarvanIV', 'JUNGLE', 'jungle', 6], ['Khazix', 'JUNGLE', 'jungle', 6],
  ['Sylas', 'JUNGLE', 'jungle', 3],
  ['Ahri', 'MIDDLE', 'mage', 9], ['Syndra', 'MIDDLE', 'mage', 6], ['Orianna', 'MIDDLE', 'mage', 6], ['Viktor', 'MIDDLE', 'mage', 7],
  ['Yasuo', 'MIDDLE', 'fighter', 7], ['Yone', 'MIDDLE', 'fighter', 7], ['Zed', 'MIDDLE', 'assassin', 7], ['Akali', 'MIDDLE', 'assassin', 6],
  ['Sylas', 'MIDDLE', 'mage', 6], ['Leblanc', 'MIDDLE', 'assassin', 4], ['Katarina', 'MIDDLE', 'assassin', 5], ['Hwei', 'MIDDLE', 'mage', 5],
  ['Jinx', 'BOTTOM', 'adc', 9], ['Kaisa', 'BOTTOM', 'adc', 10], ['Ezreal', 'BOTTOM', 'adc', 9], ['Caitlyn', 'BOTTOM', 'adc', 8],
  ['Jhin', 'BOTTOM', 'adc', 7], ['MissFortune', 'BOTTOM', 'adc', 6], ['Vayne', 'BOTTOM', 'adc', 5], ['Ashe', 'BOTTOM', 'adc', 6],
  ['Smolder', 'BOTTOM', 'adc', 6], ['Xayah', 'BOTTOM', 'adc', 5], ['Lucian', 'BOTTOM', 'adc', 5],
  ['Thresh', 'UTILITY', 'engage', 8], ['Nautilus', 'UTILITY', 'engage', 8], ['Leona', 'UTILITY', 'engage', 6], ['Lulu', 'UTILITY', 'ench', 7],
  ['Nami', 'UTILITY', 'ench', 6], ['Karma', 'UTILITY', 'ench', 6], ['Rakan', 'UTILITY', 'engage', 5], ['Milio', 'UTILITY', 'ench', 6],
  ['Bard', 'UTILITY', 'engage', 4], ['Senna', 'UTILITY', 'ench', 5], ['Morgana', 'UTILITY', 'ench', 4], ['Braum', 'UTILITY', 'engage', 4],
  ['Ashe', 'UTILITY', 'ench', 3],
]

interface Template {
  runes: string[]
  spells: string[]
  start: string[]
  core: string[]
  boots: string[]
  late: string[]
  skills: string[]
}
const T: Record<Arch, Template> = {
  adc: {
    runes: ['8000.8008.9111.9104.8017.8300.8345.8304.5005.5008.5011', '8000.8005.9111.9104.8014.8100.8139.8135.5005.5008.5011', '8000.8021.9101.9104.8299.8300.8304.8345.5005.5008.5011'],
    spells: ['4.7', '4.21', '4.12'],
    start: ['1055.2003', '1083.2003'],
    core: ['3031.3036.6672', '3153.3031.6672', '3031.3046.6672', '3031.3087.3036'],
    boots: ['3006', '3009', '3111'],
    late: ['3072', '3026', '3033', '3139', '3036', '3046', '3085'],
    skills: ['QWEQQRQWQWRWWEE', 'QEWQQRQEQERWEWW', 'WQEQQRQWQWRWWEE'],
  },
  mage: {
    runes: ['8200.8229.8226.8210.8237.8300.8345.8304.5008.5008.5011', '8100.8112.8139.8138.8135.8200.8226.8210.5008.5008.5011', '8200.8214.8226.8210.8236.8300.8345.8347.5008.5008.5011'],
    spells: ['4.14', '4.12', '4.21'],
    start: ['1056.2003', '1082.2003'],
    core: ['6655.4645.3089', '6655.3157.3089', '3118.4645.3089', '6655.3165.3089'],
    boots: ['3020', '3158'],
    late: ['3135', '3157', '3089', '3003', '3102', '3165'],
    skills: ['QWEQQRQWQWRWWEE', 'QEWQQRQEQERWEWW', 'EQWQQRQEQERWEWW'],
  },
  assassin: {
    runes: ['8100.8112.8139.8138.8135.8000.9111.8014.5008.5008.5011', '8100.8128.8126.8138.8106.8300.8304.8345.5008.5008.5011'],
    spells: ['4.14', '4.12'],
    start: ['1055.2003', '1036.2003.2003'],
    core: ['3142.6694.3814', '6692.3142.6694', '3142.6701.6694'],
    boots: ['3158', '3047', '3020'],
    late: ['3026', '3036', '6333', '3156', '3814'],
    skills: ['QWEQQRQEQERWEWW', 'QEWQQRQEQERWEWW'],
  },
  fighter: {
    runes: ['8000.8010.9111.9104.8299.8400.8446.8444.5008.5008.5011', '8400.8437.8446.8444.8242.8000.9111.9104.5008.5008.5011', '8000.8010.9111.9104.8299.8300.8304.8345.5005.5008.5011'],
    spells: ['4.12', '4.14', '4.6'],
    start: ['1055.2003', '1054.2003', '2003.2003.1036'],
    core: ['3071.3053.6333', '3078.3053.6333', '3074.3053.6333', '6692.3053.6333'],
    boots: ['3047', '3111', '3158'],
    late: ['3026', '3065', '3742', '3071', '6333', '3143'],
    skills: ['QEWQQRQEQERWEWW', 'QWEQQRQWQWRWWEE', 'EQWQQRQEQERWEWW'],
  },
  tank: {
    runes: ['8400.8437.8446.8444.8451.8300.8304.8347.5005.5010.5011', '8400.8439.8463.8444.8242.8000.9111.9104.5008.5010.5011'],
    spells: ['4.12', '4.14', '4.6'],
    start: ['1054.2003', '2003.2003.1036'],
    core: ['3068.3075.3065', '3068.2502.3143', '6662.3068.3075'],
    boots: ['3047', '3111'],
    late: ['3143', '4401', '3065', '3110', '2502', '3742'],
    skills: ['QEWQQRQEQERWEWW', 'WQEWWRWQWQRQQEE'],
  },
  jungle: {
    runes: ['8000.8010.9111.9104.8299.8100.8143.8135.5005.5008.5011', '8100.8112.8143.8138.8135.8000.9111.8014.5008.5008.5011', '8000.8008.9111.9104.8299.8300.8304.8345.5005.5008.5011'],
    spells: ['4.11', '11.6'],
    start: ['1101.2003', '1102.2003', '1103.2003'],
    core: ['3071.3053.6333', '3142.6694.3814', '6692.3053.6333', '3078.3053.6333'],
    boots: ['3047', '3158', '3111'],
    late: ['3026', '3036', '6333', '3065', '3156'],
    skills: ['QWEQQRQEQERWEWW', 'QEWQQRQEQERWEWW', 'WQEQQRQEQERWEWW'],
  },
  jtank: {
    runes: ['8400.8439.8446.8444.8242.8300.8304.8347.5005.5010.5011'],
    spells: ['4.11'],
    start: ['1102.2003', '1103.2003'],
    core: ['3068.3075.3065', '6662.3068.2502'],
    boots: ['3047', '3111'],
    late: ['3143', '4401', '3110', '2502'],
    skills: ['WQEWWRWEWERQEQQ', 'QWEWWRWEWERQEQQ'],
  },
  ench: {
    runes: ['8200.8214.8226.8210.8237.8400.8463.8453.5008.5008.5011', '8400.8465.8463.8473.8453.8300.8304.8345.5008.5008.5011'],
    spells: ['4.14', '4.3', '4.21'],
    start: ['3865.2003.2003', '3865.2003.2055'],
    core: ['6617.3504.3107', '6617.3222.3107', '6620.3504.3222'],
    boots: ['3158', '3020'],
    late: ['3222', '3107', '3504', '3190', '3011'],
    skills: ['EQWEERQEQERQWWW', 'WEQWWRWEWERQEQQ', 'QEWQQRQEQERWEWW'],
  },
  engage: {
    runes: ['8400.8439.8463.8473.8242.8300.8304.8345.5005.5010.5011', '8400.8465.8401.8444.8453.8300.8304.8345.5005.5010.5011'],
    spells: ['4.14', '4.3'],
    start: ['3865.2003.2003'],
    core: ['3190.3109.3050', '3190.3107.3109', '2504.3190.3109'],
    boots: ['3111', '3047', '3158'],
    late: ['3109', '3050', '3107', '3075', '3143'],
    skills: ['QWEQQRQEQERWEWW', 'QEWQQRQEQERWEWW'],
  },
}

function rng(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MATCHES = 48_216
let built: { aggs: Record<string, Record<string, Agg>>; bans: Record<string, number> } | null = null

function spread(r: () => number, keys: string[], total: number, wr: number, decay = 0.45): PairMap {
  const out: PairMap = {}
  let left = total
  keys.forEach((k, i) => {
    const g = i === keys.length - 1 ? left : Math.round(left * (decay + r() * 0.25))
    left -= g
    if (g <= 0) return
    const w = Math.round(g * Math.min(0.75, Math.max(0.3, wr + (r() - 0.5) * 0.08)))
    out[k] = [g, w]
  })
  return out
}

function build() {
  if (built) return built
  const aggs: Record<string, Record<string, Agg>> = {}
  const bans: Record<string, number> = {}
  for (const [champ, role, arch, pop] of CHAMPS) {
    const r = rng(champ + role)
    const g = Math.round(pop * (280 + r() * 260))
    const wr = 0.475 + r() * 0.06
    const t = T[arch]
    const opponents = CHAMPS.filter((c) => c[1] === role && c[0] !== champ)
    const vs: PairMap = {}
    for (const [o] of opponents) {
      const og = Math.round(g * (0.03 + r() * 0.12))
      if (og > 0) vs[o] = [og, Math.round(og * Math.min(0.68, Math.max(0.33, wr + (r() - 0.5) * 0.2)))]
    }
    const lateMap: PairMap = {}
    for (const id of t.late) {
      const lg = Math.round(g * (0.1 + r() * 0.5))
      lateMap[id] = [lg, Math.round(lg * (wr + (r() - 0.5) * 0.1))]
    }
    const coreMap = spread(r, t.core, Math.round(g * 0.78), wr)
    const first: PairMap = {}
    for (const [k, v] of Object.entries(coreMap)) {
      const f = k.split('.')[0]
      const e = (first[f] ||= [0, 0])
      e[0] += v[0]
      e[1] += v[1]
    }
    const runes = spread(r, t.runes, g, wr, 0.6)
    const ks: PairMap = {}
    for (const [k, v] of Object.entries(runes)) {
      const id = k.split('.')[1]
      const e = (ks[id] ||= [0, 0])
      e[0] += v[0]
      e[1] += v[1]
    }
    ;(aggs[champ] ||= {})[role] = {
      g,
      w: Math.round(g * wr),
      core: coreMap,
      boots: spread(r, t.boots, Math.round(g * 0.9), wr, 0.7),
      start: spread(r, t.start, g, wr, 0.7),
      runes,
      ks,
      spells: spread(r, t.spells, g, wr, 0.78),
      skills: spread(r, t.skills, Math.round(g * 0.95), wr, 0.65),
      vs,
      late: lateMap,
      first,
    }
    bans[champ] = (bans[champ] ?? 0) + Math.round(g * (r() < 0.25 ? 0.4 + r() * 1.2 : r() * 0.15))
  }
  built = { aggs, bans }
  return built
}

export function mockStatus(): StatsStatus {
  return { enabled: true, hasKey: true, platform: 'euw1', patches: [{ patch: '15.24', matches: MATCHES }], queued: 0, players: 0, perHour: 0, error: '', demo: true }
}

export function mockSummary(): StatsSummary {
  const { aggs, bans } = build()
  const rows = []
  for (const [champ, roles] of Object.entries(aggs)) for (const [role, a] of Object.entries(roles)) rows.push({ champ, role, g: a.g, w: a.w })
  return { matches: MATCHES, bans, rows }
}

const top = (m: PairMap) => Object.entries(m).sort((a, b) => b[1][0] - a[1][0])

export function recommendLocal(agg: Agg | null): Rec | null {
  if (!agg) return null
  const runeKey = top(agg.runes)[0]?.[0]
  const n = runeKey?.split('.').map(Number)
  const core = top(agg.core)[0]?.[0]?.split('.').map(Number) ?? []
  return {
    runes: n ? { primaryStyleId: n[0], subStyleId: n[5], perks: [n[1], n[2], n[3], n[4], n[6], n[7], n[8], n[9], n[10]] } : null,
    spells: top(agg.spells)[0]?.[0]?.split('.').map(Number) ?? [],
    start: top(agg.start)[0]?.[0]?.split('.').map(Number) ?? [],
    core,
    boots: Number(top(agg.boots)[0]?.[0]) || 0,
    late: top(agg.late)
      .map(([k]) => Number(k))
      .filter((id) => !core.includes(id))
      .slice(0, 6),
    skills: top(agg.skills)[0]?.[0] ?? '',
  }
}

export function mockDetail(champ: string, role: string): StatsDetail {
  const { aggs, bans } = build()
  const roles = aggs[champ] ?? {}
  const roleGames = Object.fromEntries(Object.entries(roles).map(([r, a]) => [r, a.g]))
  const pick = role && roles[role] ? role : Object.entries(roleGames).sort((a, b) => b[1] - a[1])[0]?.[0]
  const agg = pick ? roles[pick] : null
  return { matches: MATCHES, bans: bans[champ] ?? 0, role: pick ?? null, roleGames, agg, rec: recommendLocal(agg) }
}
