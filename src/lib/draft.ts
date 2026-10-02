// Draft assistant model. Every number comes from the collected Master+ games: a champion's win
// rate in its role, how it does with each possible teammate and against each possible enemy, and
// its lane matchups. Effects are added on the log-odds scale, and small samples are pulled
// towards "no effect" so a 6-game matchup does not decide the pick.
import type { DraftData, PairMap } from './statsTypes'

export const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const

export interface Pick {
  champ: string
  /** '' when the role is not known (enemy team): it is inferred */
  role: string
}

export interface Score {
  champ: string
  role: string
  games: number
  /** expected win rate with this lobby */
  wr: number
  /** the parts, in percentage points of win rate */
  meta: number
  counter: number
  lane: number
  synergy: number
  comfort: number
  laneOpp: string | null
}

const K_BASE = 150
const K_PAIR = 60
const K_LANE = 40

const logit = (p: number) => Math.log(p / (1 - p))
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))
/** a log-odds effect expressed as percentage points away from 50% */
export const pp = (x: number) => (sigmoid(x) - 0.5) * 100

const shrink = (pair: [number, number] | undefined, prior: number, k: number) => (pair ? (pair[1] + prior * k) / (pair[0] + k) : prior)

function base(data: DraftData, champ: string, role: string) {
  const a = data.champs[champ]?.[role]
  if (!a) {
    // off-role or unknown: the champion's overall record, else a coin flip
    const all = Object.values(data.champs[champ] ?? {})
    const g = all.reduce((n, x) => n + x.g, 0)
    const w = all.reduce((n, x) => n + x.w, 0)
    return { p: shrink([g, w], 0.5, K_BASE * 2), a: null }
  }
  return { p: shrink([a.g, a.w], 0.5, K_BASE), a }
}

/** effect of a pair (teammate or enemy) on this champion, in log-odds */
function pairEffect(map: PairMap | undefined, other: string, p: number, k = K_PAIR) {
  const pair = map?.[other]
  if (!pair) return 0
  return logit(shrink(pair, p, k)) - logit(p)
}

/** Gives every champion with an unknown role the role that fits the team best (most games). */
export function inferRoles(data: DraftData, picks: Pick[]): Pick[] {
  const known = new Set(picks.filter((p) => p.role).map((p) => p.role))
  const open = ROLES.filter((r) => !known.has(r))
  const unknown = picks.filter((p) => !p.role && p.champ)
  if (!unknown.length) return picks
  let best: string[] = []
  let bestScore = -1
  const games = (c: string, r: string) => data.champs[c]?.[r]?.g ?? 0
  const walk = (i: number, used: Set<string>, acc: string[], score: number) => {
    if (i === unknown.length) {
      if (score > bestScore) {
        bestScore = score
        best = [...acc]
      }
      return
    }
    for (const r of open) {
      if (used.has(r)) continue
      used.add(r)
      acc.push(r)
      // log keeps one very popular champion from overriding the rest of the team
      walk(i + 1, used, acc, score + Math.log1p(games(unknown[i].champ, r)))
      acc.pop()
      used.delete(r)
    }
  }
  walk(0, new Set(), [], 0)
  return picks.map((p) => {
    const i = unknown.indexOf(p)
    return i >= 0 ? { ...p, role: best[i] ?? '' } : p
  })
}

/** How good a champion is in this role, with these teammates, against these enemies. */
export function scoreChamp(data: DraftData, champ: string, role: string, allies: Pick[], enemies: Pick[], masteryPoints = 0): Score {
  const { p, a } = base(data, champ, role)
  let counter = 0
  let lane = 0
  let laneOpp: string | null = null
  for (const e of enemies) {
    if (!e.champ) continue
    if (e.role && e.role === role && a?.vs?.[e.champ]) {
      lane = pairEffect(a.vs, e.champ, p, K_LANE)
      laneOpp = e.champ
    } else counter += pairEffect(a?.foe, e.champ, p)
  }
  let synergy = 0
  for (const t of allies) if (t.champ && t.champ !== champ) synergy += pairEffect(a?.with, t.champ, p)
  // a champion you have put many games into is worth a little: up to about 2.5 points
  const comfort = masteryPoints > 0 ? Math.min(0.1, 0.03 * Math.log10(1 + masteryPoints / 1000)) : 0
  const total = logit(p) + counter + lane + synergy + comfort
  return {
    champ,
    role,
    games: a?.g ?? 0,
    wr: sigmoid(total),
    meta: pp(logit(p)),
    counter: pp(counter),
    lane: pp(lane),
    synergy: pp(synergy),
    comfort: pp(comfort),
    laneOpp,
  }
}

/** Every champion that is played in this role often enough, best first. */
export function rankPicks(
  data: DraftData,
  role: string,
  allies: Pick[],
  enemies: Pick[],
  opts: { taken: Set<string>; owned?: Set<string> | null; mastery?: Record<string, number> },
): Score[] {
  const roleGames = Object.values(data.champs).reduce((n, r) => n + (r[role]?.g ?? 0), 0)
  const minGames = Math.max(20, roleGames * 0.002)
  const out: Score[] = []
  for (const [champ, roles] of Object.entries(data.champs)) {
    const a = roles[role]
    if (!a || a.g < minGames || opts.taken.has(champ)) continue
    if (opts.owned && opts.owned.size && !opts.owned.has(champ)) continue
    out.push(scoreChamp(data, champ, role, allies, enemies, opts.mastery?.[champ] ?? 0))
  }
  return out.sort((x, y) => y.wr - x.wr)
}

/** Chance that the allied team wins, from the champions picked so far. */
export function draftOdds(data: DraftData, allies: Pick[], enemies: Pick[]) {
  const A = allies.filter((x) => x.champ && x.role)
  const B = enemies.filter((x) => x.champ && x.role)
  const side = (us: Pick[], them: Pick[]) => {
    let meta = 0
    let syn = 0
    let vs = 0
    for (const x of us) {
      const { p, a } = base(data, x.champ, x.role)
      meta += logit(p)
      for (const y of us) if (y !== x) syn += 0.5 * pairEffect(a?.with, y.champ, p)
      for (const y of them) vs += y.role === x.role && a?.vs?.[y.champ] ? pairEffect(a.vs, y.champ, p, K_LANE) : pairEffect(a?.foe, y.champ, p)
    }
    return { meta, syn, vs }
  }
  const a = side(A, B)
  const b = side(B, A)
  // the matchup terms are seen from both sides, so each side's view counts half
  const x = a.meta - b.meta + a.syn - b.syn + 0.5 * (a.vs - b.vs)
  return { p: Math.min(0.8, Math.max(0.2, sigmoid(x))), known: A.length + B.length }
}

/** Bans worth considering: strong, popular champions, and those that beat your champion. */
export function banSuggestions(data: DraftData, taken: Set<string>, mine: Pick | null, n = 5) {
  const out: { champ: string; role: string; why: number; threat: number }[] = []
  const mineBase = mine?.champ ? base(data, mine.champ, mine.role) : null
  for (const [champ, roles] of Object.entries(data.champs)) {
    if (taken.has(champ)) continue
    const [role, a] = Object.entries(roles).sort((x, y) => y[1].g - x[1].g)[0]
    const pr = data.matches ? a.g / data.matches : 0
    if (pr < 0.01) continue
    const p = shrink([a.g, a.w], 0.5, K_BASE)
    // against you: how much worse your champion does when this one is on the enemy team
    const vsMe = mineBase?.a ? -(mine!.role === role && mineBase.a.vs?.[champ] ? pairEffect(mineBase.a.vs, champ, mineBase.p, K_LANE) : pairEffect(mineBase.a.foe, champ, mineBase.p)) : 0
    const threat = logit(p) + vsMe + Math.log2(1 + pr * 20) * 0.02
    out.push({ champ, role, why: pp(vsMe), threat })
  }
  return out.sort((x, y) => y.threat - x.threat).slice(0, n)
}
