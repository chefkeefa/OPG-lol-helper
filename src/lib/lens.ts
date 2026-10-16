// "Lens": your games scored per playstyle category, either against the other nine players of the
// same games (they are around your rank) or against your own earlier games ("my progress").
import type { MatchSummary } from '../types'
import { t } from './i18n'

export type LensMode = 'lobby' | 'progress'
export type LensCat = 'laning' | 'fighting' | 'survival' | 'vision' | 'impact' | 'consistency'

export interface LensMetric {
  key: string
  label: string
  /** sub-group inside the category, shown as a card on the category tab */
  group: string
  value: number
  base: number
  /** 0–100, 50 = level with the baseline */
  score: number
  lower: boolean
  fmt: (v: number) => string
  /** per game, oldest first, for the chart */
  series: number[]
}

export interface LensCategory {
  id: LensCat
  label: string
  score: number
  metrics: LensMetric[]
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const fx = (d: number) => (v: number) => v.toFixed(d)
const pct = (v: number) => `${Math.round(v * 100)}%`
const sgn = (d: number) => (v: number) => (v >= 0 ? '+' : '') + v.toFixed(d)
const clamp = (v: number) => Math.max(1, Math.min(99, Math.round(v)))
/** ratio to the baseline → 0–100; ±30% lands around 25 / 75 */
const ratioScore = (v: number, base: number, lower: boolean) => {
  if (!base) return 50
  const r = lower ? base / Math.max(v, 0.01) : v / base
  return clamp(50 + 50 * Math.tanh((r - 1) * 1.8))
}
/** a difference against an even baseline (lane diffs) → 0–100 */
const diffScore = (d: number, scale: number) => clamp(50 + 50 * Math.tanh(d / scale))

export const LENS_CATS: { id: LensCat; label: string }[] = [
  { id: 'laning', label: t('Лайнинг') },
  { id: 'fighting', label: t('Бой') },
  { id: 'survival', label: t('Выживание') },
  { id: 'vision', label: t('Обзор') },
  { id: 'impact', label: t('Влияние') },
  { id: 'consistency', label: t('Стабильность') },
]

interface Row {
  csm: number
  dpm: number
  share: number
  kp: number
  kills: number
  deaths: number
  kda: number
  vpm: number
  gpm: number
  score: number
}
const mine = (m: MatchSummary): Row => {
  const min = Math.max(1, m.durationSec / 60)
  return {
    csm: m.cs / min,
    dpm: m.dmgPerMin,
    share: m.dmgShare,
    kp: m.kp,
    kills: m.kills,
    deaths: m.deaths,
    kda: (m.kills + m.assists) / Math.max(1, m.deaths),
    vpm: m.visionPerMin,
    gpm: m.goldPerMin,
    score: m.score,
  }
}
/** the other nine players of one game, averaged */
function lobby(m: MatchSummary): Row | null {
  const ps = m.players
  if (!ps || ps.length < 6) return null
  const min = Math.max(1, m.durationSec / 60)
  const teamKills: Record<number, number> = {}
  const teamDmg: Record<number, number> = {}
  for (const p of ps) {
    teamKills[p.teamId] = (teamKills[p.teamId] ?? 0) + p.kills
    teamDmg[p.teamId] = (teamDmg[p.teamId] ?? 0) + p.damage
  }
  const rows = ps
    .filter((p) => !p.me)
    .map((p) => ({
      csm: p.cs / min,
      dpm: p.damage / min,
      share: p.damage / Math.max(1, teamDmg[p.teamId]),
      kp: (p.kills + p.assists) / Math.max(1, teamKills[p.teamId]),
      kills: p.kills,
      deaths: p.deaths,
      kda: (p.kills + p.assists) / Math.max(1, p.deaths),
      vpm: p.vision / min,
      gpm: p.gold / min,
      score: p.score,
    }))
  const out = {} as Row
  for (const k of Object.keys(rows[0]) as (keyof Row)[]) out[k] = avg(rows.map((r) => r[k]))
  return out
}

export function lens(all: MatchSummary[], mode: LensMode): { cats: LensCategory[]; overall: number; games: number; wr: number; comparable: boolean } {
  const ms = all.filter((m) => !m.remake).sort((a, b) => a.endedAt - b.endedAt)
  const me = ms.map(mine)
  const lob = ms.map(lobby)
  const hasLobby = lob.filter(Boolean).length >= Math.min(5, ms.length)
  const useLobby = mode === 'lobby' && hasLobby
  // progress: the latest ten games against everything before them
  const cut = Math.max(1, ms.length - 10)
  const recent = useLobby ? me : me.slice(cut)
  const older = me.slice(0, cut)
  const tl = ms.filter((m) => m.d15)
  const tlRecent = useLobby ? tl : tl.slice(Math.max(1, tl.length - 10))
  const tlOlder = tl.slice(0, Math.max(1, tl.length - 10))

  const ratio = (key: keyof Row, label: string, group: string, fmt: (v: number) => string, lower = false): LensMetric => {
    const value = avg(recent.map((r) => r[key]))
    const base = useLobby ? avg(lob.filter((r): r is Row => !!r).map((r) => r[key])) : avg(older.map((r) => r[key]))
    return { key, label, group, value, base, score: ratioScore(value, base, lower), lower, fmt, series: me.slice(-20).map((r) => r[key]) }
  }
  const d15 = (key: 'gold' | 'cs' | 'xp' | 'ka', label: string, group: string, fmt: (v: number) => string, scale: number): LensMetric | null => {
    if (tl.length < 3) return null
    const value = avg(tlRecent.map((m) => m.d15![key]))
    // against the lane opponent an even lane is 0; in progress mode the baseline is your older average
    const base = useLobby ? 0 : avg(tlOlder.map((m) => m.d15![key]))
    return { key: `d15${key}`, label, group, value, base, score: diffScore(value - base, scale), lower: false, fmt, series: tl.slice(-20).map((m) => m.d15![key]) }
  }
  const scores = ms.map((m) => m.score)
  const sd = Math.sqrt(avg(scores.map((s) => (s - avg(scores)) ** 2)))
  const sdOld = Math.sqrt(avg(scores.slice(0, cut).map((s) => (s - avg(scores.slice(0, cut))) ** 2)))
  let afterLoss = 0
  let afterLossWins = 0
  ms.forEach((m, i) => {
    if (i > 0 && !ms[i - 1].win) {
      afterLoss++
      if (m.win) afterLossWins++
    }
  })
  const good = scores.filter((s) => s >= 50).length / Math.max(1, scores.length)
  const consistency: LensMetric[] = [
    {
      key: 'sd',
      label: t('Разброс оценки'),
      group: t('Ровная игра'),
      value: sd,
      base: useLobby ? 18 : sdOld || sd,
      score: ratioScore(sd, useLobby ? 18 : sdOld || sd, true),
      lower: true,
      fmt: fx(1),
      series: scores.slice(-20),
    },
    { key: 'good', label: t('Игр с оценкой 50+'), group: t('Ровная игра'), value: good, base: 0.5, score: ratioScore(good, 0.5, false), lower: false, fmt: pct, series: scores.slice(-20).map((s) => (s >= 50 ? 1 : 0)) },
    {
      key: 'tilt',
      label: t('Победы после поражения'),
      group: t('Устойчивость'),
      value: afterLoss ? afterLossWins / afterLoss : 0.5,
      base: 0.5,
      score: ratioScore(afterLoss ? afterLossWins / afterLoss : 0.5, 0.5, false),
      lower: false,
      fmt: pct,
      series: ms.slice(-20).map((m) => (m.win ? 1 : 0)),
    },
  ]
  const wins = ms.filter((m) => m.win).length
  const multi = ms.map((m) => (m.largestMultiKill >= 2 ? 1 : 0))
  const defs: Record<LensCat, (LensMetric | null)[]> = {
    laning: [
      ratio('csm', t('CS/мин'), t('Фарм'), fx(1)),
      d15('cs', t('CS @15'), t('Фарм'), sgn(1), 15),
      d15('gold', t('Золото @15'), t('Преимущество'), sgn(0), 600),
      d15('xp', t('Опыт @15'), t('Преимущество'), sgn(0), 600),
      d15('ka', t('У+П @15'), t('Ранние бои'), sgn(1), 2),
    ],
    fighting: [
      ratio('kp', 'KP', t('Командные бои'), pct),
      ratio('dpm', t('Урон/мин'), t('Урон'), fx(0)),
      ratio('share', t('Доля урона'), t('Урон'), pct),
      ratio('kills', t('Убийств за игру'), t('Дуэли'), fx(1)),
      {
        key: 'multi',
        label: t('Игр с мультикиллом'),
        group: t('Дуэли'),
        value: avg(multi),
        base: 0.35,
        score: ratioScore(avg(multi), 0.35, false),
        lower: false,
        fmt: pct,
        series: multi.slice(-20),
      },
    ],
    survival: [ratio('deaths', t('Смертей за игру'), t('Смерти'), fx(1), true), ratio('kda', 'KDA', t('Размен'), fx(2))],
    vision: [ratio('vpm', t('Обзор/мин'), t('Контроль карты'), fx(2))],
    impact: [
      ratio('score', t('Оценка'), t('Вклад'), fx(0)),
      ratio('gpm', t('Золото/мин'), t('Ресурсы'), fx(0)),
      { key: 'wr', label: t('Винрейт'), group: t('Результат'), value: wins / Math.max(1, ms.length), base: 0.5, score: ratioScore(wins / Math.max(1, ms.length), 0.5, false), lower: false, fmt: pct, series: ms.slice(-20).map((m) => (m.win ? 1 : 0)) },
    ],
    consistency,
  }
  const cats = LENS_CATS.map(({ id, label }) => {
    const metrics = defs[id].filter((m): m is LensMetric => !!m)
    return { id, label, metrics, score: Math.round(avg(metrics.map((m) => m.score))) }
  }).filter((c) => c.metrics.length)
  return { cats, overall: Math.round(avg(cats.map((c) => c.score)) * 10) / 10, games: ms.length, wr: wins / Math.max(1, ms.length), comparable: hasLobby }
}

export const lensColor = (s: number) => (s >= 75 ? '#e9c46a' : s >= 60 ? '#c3b6ff' : s >= 48 ? '#7fd0ef' : s >= 35 ? '#f2a25c' : '#f0545c')
