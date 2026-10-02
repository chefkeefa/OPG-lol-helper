// Demo ARAM Mayhem data for the web preview and the "show example" mode.
import type { AugTier, AugTiers, MayhemChamp, MayhemData, PairMap } from '../lib/statsTypes'
import { lang } from '../lib/i18n'

const AUGS: [number, string, string, AugTier['rarity']][] = [
  [1, 'ADAPt', 'АДАПТ', 'silver'],
  [2, 'Back to Basics', 'Назад к основам', 'prismatic'],
  [3, 'Jack of All Trades', 'Мастер на все руки', 'gold'],
  [4, 'All For You', 'Всё для тебя', 'gold'],
  [5, 'Goliath', 'Голиаф', 'prismatic'],
  [6, 'Mystic Punch', 'Мистический удар', 'silver'],
  [7, 'Tank Engine', 'Танковый двигатель', 'prismatic'],
  [8, 'Blade Waltz', 'Вальс клинков', 'prismatic'],
  [9, 'Ethereal Weapon', 'Эфирное оружие', 'gold'],
  [10, 'Firebrand', 'Огненное клеймо', 'silver'],
  [11, 'Heavy Hitter', 'Тяжёлый удар', 'silver'],
  [12, 'Vampirism', 'Вампиризм', 'silver'],
  [13, 'Magic Missile', 'Магическая ракета', 'gold'],
  [14, 'Infernal Conduit', 'Адский проводник', 'prismatic'],
  [15, 'Escape Plan', 'План побега', 'silver'],
  [16, 'Witchful Thinking', 'Колдовские мысли', 'silver'],
  [17, 'Deft', 'Ловкость', 'silver'],
  [18, 'Courage of the Colossus', 'Отвага колосса', 'gold'],
  [19, 'Frost Wraith', 'Ледяной призрак', 'gold'],
  [20, 'Quantum Computing', 'Квантовые вычисления', 'prismatic'],
  [21, 'Scopier Weapons', 'Дальнобойное оружие', 'gold'],
  [22, 'Spin to Win', 'Крутись и побеждай', 'gold'],
  [23, 'Ultimate Revolution', 'Абсолютная революция', 'prismatic'],
  [24, 'Wisdom of Ages', 'Мудрость веков', 'silver'],
]
const CHAMPS = ['Ahri', 'Lux', 'Ezreal', 'Jinx', 'Garen', 'Darius', 'Sona', 'Nami', 'Brand', 'Zyra', 'Veigar', 'Malphite', 'Sett', 'Yasuo', 'Kaisa', 'Ashe', 'Leona', 'Morgana', 'Karthus', 'Xerath']
const BUILDS: Record<string, { core: string[]; boots: string; spells: string; runes: string; skills: string }> = {
  ap: { core: ['6655.3089.4645', '6653.3089.3157'], boots: '3020', spells: '4.32', runes: '8200.8229.8226.8210.8237.8300.8345.8347.5008.5008.5011', skills: 'QWEQQRQEQERWEWW' },
  ad: { core: ['3031.6672.3094', '6675.3031.3036'], boots: '3006', spells: '4.32', runes: '8000.8008.9111.9104.8017.8300.8345.8304.5005.5008.5011', skills: 'QWEQQRQEQERWEWW' },
  fighter: { core: ['3078.6333.3053', '6631.3053.3065'], boots: '3047', spells: '4.32', runes: '8000.8010.9111.9105.8299.8400.8444.8453.5005.5008.5011', skills: 'QEWQQRQEQERWEWW' },
}
const kind = (c: string) => (['Jinx', 'Ezreal', 'Kaisa', 'Ashe', 'Yasuo'].includes(c) ? 'ad' : ['Garen', 'Darius', 'Sett', 'Malphite', 'Leona'].includes(c) ? 'fighter' : 'ap')

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
const pair = (r: () => number, g: number, wr: number): [number, number] => [g, Math.round(g * Math.min(0.7, Math.max(0.3, wr + (r() - 0.5) * 0.12)))]

let built: MayhemData | null = null
export function mockMayhem(): MayhemData {
  if (built) return built
  const r = rng('mayhem')
  const augWr = Object.fromEntries(AUGS.map(([id]) => [id, 0.46 + r() * 0.09]))
  const aug: PairMap = {}
  const champs: Record<string, MayhemChamp> = {}
  for (const c of CHAMPS) {
    const rc = rng(c)
    const g = Math.round(800 + rc() * 2400)
    const wr = 0.46 + rc() * 0.09
    const b = BUILDS[kind(c)]
    const a: MayhemChamp = { g, w: Math.round(g * wr), aug: {}, core: {}, boots: {}, spells: {}, skills: {}, runes: {}, first: {} }
    for (const [id] of AUGS) {
      const ag = Math.round(g * (0.04 + rc() * 0.2))
      a.aug[id] = pair(rc, ag, (augWr[id] + wr) / 2)
      const e = (aug[id] ||= [0, 0])
      e[0] += a.aug[id][0]
      e[1] += a.aug[id][1]
    }
    b.core.forEach((k, i) => (a.core[k] = pair(rc, Math.round(g * (i ? 0.25 : 0.55)), wr)))
    a.first[b.core[0].split('.')[0]] = pair(rc, Math.round(g * 0.6), wr)
    a.boots[b.boots] = pair(rc, Math.round(g * 0.85), wr)
    a.spells[b.spells] = pair(rc, Math.round(g * 0.9), wr)
    a.runes[b.runes] = pair(rc, Math.round(g * 0.7), wr)
    a.skills[b.skills] = pair(rc, Math.round(g * 0.8), wr)
    champs[c] = a
  }
  built = { matches: 18_412, patches: ['15.24'], aug, champs }
  return built
}

const TIERS: [string, number][] = [
  ['S+', 0.06],
  ['S', 0.2],
  ['A', 0.42],
  ['B', 0.68],
  ['C', 0.88],
  ['D', 1],
]

export function mockAugTiers(champion = ''): AugTiers {
  const m = mockMayhem()
  const total = Object.values(m.aug).reduce((n, [g]) => n + g, 0)
  const mean = Object.values(m.aug).reduce((n, [, w]) => n + w, 0) / total
  const champ = m.champs[champion]
  const rows: AugTier[] = AUGS.map(([id, en, ru, rarity]) => {
    const all = m.aug[id]
    let wr = (all[1] + mean * 80) / (all[0] + 80)
    const mine = champ?.aug[id]
    if (mine && mine[0] >= 8) wr = (mine[1] + wr * 30) / (mine[0] + 30)
    return { id, name: lang === 'en' ? en : ru, icon: '', rarity, games: all[0], champGames: mine?.[0] ?? 0, wr, rawWr: all[1] / all[0], tier: '' }
  })
  for (const rarity of ['silver', 'gold', 'prismatic'] as const) {
    const group = rows.filter((x) => x.rarity === rarity).sort((a, b) => b.wr - a.wr)
    group.forEach((x, i) => (x.tier = TIERS.find(([, lim]) => (i + 0.5) / group.length <= lim)![0]))
  }
  return { matches: m.matches, champion, rows: rows.sort((a, b) => b.wr - a.wr) }
}
