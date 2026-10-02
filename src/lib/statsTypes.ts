/** [games, wins] */
export type Pair = [number, number]
export type PairMap = Record<string, Pair>

export interface Agg {
  g: number
  w: number
  core: PairMap
  boots: PairMap
  start: PairMap
  runes: PairMap
  ks: PairMap
  spells: PairMap
  skills: PairMap
  vs: PairMap
  late: PairMap
  first: PairMap
}

export interface RunePage {
  primaryStyleId: number
  subStyleId: number
  /** 4 primary, 2 secondary, 3 shards (offense, flex, defense) */
  perks: number[]
}

export interface Rec {
  runes: RunePage | null
  spells: number[]
  start: number[]
  core: number[]
  boots: number
  late: number[]
  skills: string
}

export interface StatsStatus {
  enabled: boolean
  hasKey: boolean
  platform: string
  patches: { patch: string; matches: number }[]
  queued: number
  players: number
  perHour: number
  error: string
  demo?: boolean
}

export interface StatsRow {
  champ: string
  role: string
  g: number
  w: number
}

export interface StatsSummary {
  matches: number
  bans: Record<string, number>
  rows: StatsRow[]
}

export interface StatsDetail {
  matches: number
  bans: number
  role: string | null
  roleGames: Record<string, number>
  agg: Agg | null
  rec: Rec | null
}

export interface BuildPayload {
  champion: string
  championKey?: number
  role: string
  runes?: RunePage | null
  spells?: number[]
  start?: number[]
  core?: number[]
  boots?: number
  late?: number[]
}

export interface Moment {
  t: number
  kind: 'kill' | 'death' | 'assist' | 'multikill' | 'objective' | 'steal'
  label: string
}

export interface Recording {
  id: string
  file: string
  createdAt: number
  duration: number
  champion: string
  gameMode: string
  result: string
  kda: [number, number, number] | null
  moments: Moment[]
  clips: { file: string; start: number; end: number; label: string }[]
  size: number
  error?: string
}

export interface Bench {
  games: number
  csPerMin: number
  kda: number
  kp: number
  visionPerMin: number
  deathsPerGame: number
}
/** Your own averages: per champion, plus "*" for all games */
export type Benchmarks = Record<string, Bench>
