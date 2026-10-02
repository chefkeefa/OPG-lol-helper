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
  /** teammates (any role) and enemies (any role) this champion played with / against */
  with?: PairMap
  foe?: PairMap
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
  kind: 'kill' | 'death' | 'assist' | 'multikill' | 'objective' | 'steal' | 'ace' | 'fight'
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
  /** cut down to the chosen moments; segments are its parts on its own timeline, from = where each part starts in the game */
  highlights?: boolean
  segments?: { start: number; end: number; from: number; label: string }[]
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

/** Compact statistics for the draft assistant. */
export interface DraftData {
  matches: number
  bans: Record<string, number>
  champs: Record<string, Record<string, { g: number; w: number; vs: PairMap; with?: PairMap; foe?: PairMap }>>
}

export interface DraftSlot {
  cell: number
  /** locked champion key, 0 if none yet */
  champ: number
  /** hovered champion key */
  hover: number
  role: string
}

/** Champion select as the client reports it. */
export interface DraftSession {
  myCell: number
  queueId: number
  phase: string
  allies: DraftSlot[]
  enemies: DraftSlot[]
  bans: number[]
}
