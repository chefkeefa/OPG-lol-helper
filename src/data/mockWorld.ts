// Deterministic demo numbers for the Data Studio catalogue, shaped like the collector's world().
import type { PairMap, WorldData, WorldSums } from '../lib/statsTypes'
import { CHAMPS, type Arch } from './mockStats'

// per game: kills, deaths, assists, solo kills, cs/min, plates, dodged, casts/min, jungle cs@10, vision/min, control wards, pings
const PROFILE: Record<Arch, number[]> = {
  adc: [7.2, 5.1, 6.8, 0.9, 8.6, 2.1, 14, 9, 0, 0.45, 1.4, 22],
  mage: [6.4, 4.9, 7.5, 1.1, 8.1, 1.8, 18, 13, 0, 0.55, 1.8, 20],
  assassin: [8.6, 5.9, 5.4, 2.0, 7.4, 1.7, 21, 11, 0, 0.5, 1.7, 19],
  fighter: [6.1, 5.6, 5.1, 1.9, 7.6, 2.6, 12, 10, 0, 0.5, 2.0, 18],
  tank: [3.9, 5.0, 7.8, 0.9, 7.0, 1.9, 9, 8, 0, 0.6, 2.4, 17],
  jungle: [6.3, 5.4, 8.1, 1.0, 5.9, 0.4, 13, 12, 52, 0.85, 3.6, 28],
  jtank: [4.2, 4.9, 10.1, 0.5, 5.5, 0.3, 10, 9, 50, 0.95, 4.1, 27],
  ench: [1.6, 4.1, 13.4, 0.1, 1.2, 0.2, 19, 15, 0, 2.3, 6.8, 33],
  engage: [2.1, 5.6, 12.6, 0.2, 1.1, 0.3, 11, 10, 0, 2.4, 7.4, 35],
}

export function mockWorld(): WorldData {
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const games = 48_200
  const champs: Record<string, WorldSums> = {}
  const roles: Record<string, WorldSums> = {}
  for (const [champ, role, arch, pop] of CHAMPS) {
    const p = PROFILE[arch]
    const g = Math.round(pop * 820 * (0.7 + rnd() * 0.6))
    const wr = 0.47 + rnd() * 0.07
    const min = g * (29 + rnd() * 4)
    const v = (base: number, per: number) => base * per * (0.8 + rnd() * 0.4)
    const sw = Math.round(g * wr * (0.28 + rnd() * 0.12))
    const sl = Math.round(g * (1 - wr) * (0.3 + rnd() * 0.14))
    const eg = Math.round(g * (0.18 + rnd() * 0.06))
    const lg = Math.round(g * (0.14 + rnd() * 0.06))
    const late = arch === 'adc' || arch === 'mage' || arch === 'tank' ? 0.04 : -0.03
    const s: WorldSums = {
      g, w: Math.round(g * wr), min,
      k: v(p[0], g), d: v(p[1], g), a: v(p[2], g), solo: v(p[3], g),
      dead: v(p[1] * 27, g), fb: v(0.11, g), penta: v(arch === 'adc' ? 0.012 : 0.003, g), quadra: v(arch === 'adc' ? 0.05 : 0.018, g),
      cs: v(p[4], min), plates: v(p[5], g), dodged: v(p[6], g), casts: v(p[7], min), jcs: v(p[8], g),
      vision: v(p[9], min), cw: v(p[10], g), pings: v(p[11], g),
      sw, sl, eg, ew: Math.round(eg * (wr - late)), lg, lw: Math.round(lg * (wr + late)),
    }
    const prev = champs[champ]
    champs[champ] = prev ? (Object.fromEntries(Object.keys(s).map((k) => [k, s[k as keyof WorldSums] + prev[k as keyof WorldSums]])) as unknown as WorldSums) : s
    const r = roles[role]
    roles[role] = r ? (Object.fromEntries(Object.keys(s).map((k) => [k, s[k as keyof WorldSums] + r[k as keyof WorldSums]])) as unknown as WorldSums) : { ...s }
  }
  const dur: Record<string, number> = {}
  let durSum = 0
  for (let m = 14; m <= 50; m++) {
    const n = Math.round(games * (m === 15 ? 0.045 : m === 20 ? 0.07 : 0) + games * 0.05 * Math.exp(-((m - 28) ** 2) / 60))
    dur[m] = n
    durSum += n * (m + 0.5) * 60
  }
  const total = Object.values(dur).reduce((a, b) => a + b, 0)
  const hour: Record<string, number> = {}
  for (let h = 0; h < 24; h++) {
    const d = Math.min(Math.abs(h - 21), 24 - Math.abs(h - 21))
    hour[h] = Math.round(games * (0.012 + 0.07 * Math.exp(-(d ** 2) / 18)))
  }
  const day: Record<string, number> = { 0: 8100, 1: 6400, 2: 6500, 3: 6600, 4: 6700, 5: 6200, 6: 7700 }
  const icons: PairMap = {}
  ;[29, 4568, 6285, 5367, 4834, 588, 6612, 5888, 23, 4661, 5961, 6046, 3505, 4777, 5739, 6311].forEach((id, i) => (icons[id] = [Math.round(9000 / (i + 1.4)), 0]))
  const level: Record<string, number> = {}
  for (let l = 0; l <= 1000; l += 50) level[l] = Math.round(games * 10 * 0.11 * Math.exp(-((l - 380) ** 2) / 52000))
  const pings: Record<string, number> = {
    basicPings: 1_820_000, onMyWayPings: 1_410_000, enemyMissingPings: 1_130_000, dangerPings: 610_000, assistMePings: 520_000, pushPings: 330_000,
    getBackPings: 300_000, enemyVisionPings: 240_000, allInPings: 190_000, needVisionPings: 170_000, holdPings: 140_000, commandPings: 120_000, visionClearedPings: 90_000, retreatPings: 70_000,
  }
  const bans: Record<string, number> = {}
  for (const [champ, , , pop] of CHAMPS) bans[champ] = (bans[champ] ?? 0) + Math.round(pop * pop * 120 * (0.4 + rnd()))
  return {
    games: total, matches: total, patches: ['25.20', '25.19'], durSum, dur,
    early: Math.round(total * 0.2), late: Math.round(total * 0.16), surr: Math.round(total * 0.41), earlySurr: Math.round(total * 0.14),
    hour, day, icons, level, pings,
    flash: { D: [Math.round(total * 10 * 0.58), Math.round(total * 10 * 0.58 * 0.502)], F: [Math.round(total * 10 * 0.36), Math.round(total * 10 * 0.36 * 0.497)], role: { TOP: { D: 5200, F: 3900 }, JUNGLE: { D: 3100, F: 6900 }, MIDDLE: { D: 6100, F: 3600 }, BOTTOM: { D: 7300, F: 2600 }, UTILITY: { D: 6600, F: 3100 } } },
    pairs: { '4.14': [61000, 30800], '4.12': [52000, 25600], '4.11': [48000, 24200], '4.7': [58000, 29100], '3.4': [24000, 12100], '4.6': [19000, 9300], '4.21': [9000, 4600], '1.6': [3100, 1650], '6.12': [4200, 2050] },
    first: { blood: [total, Math.round(total * 0.6)], tower: [total, Math.round(total * 0.7)], dragon: [total, Math.round(total * 0.64)], grubs: [total, Math.round(total * 0.6)], herald: [total, Math.round(total * 0.66)], baron: [Math.round(total * 0.8), Math.round(total * 0.8 * 0.79)], inhib: [Math.round(total * 0.88), Math.round(total * 0.88 * 0.86)] },
    champs, roles, bans,
  }
}
