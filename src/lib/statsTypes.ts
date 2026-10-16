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
  /** the region shown, or 'all' when every collected region is merged */
  platform: string
  /** every collected region with its own numbers */
  regions?: { platform: string; matches: number; perHour: number; error: string }[]
  patches: { patch: string; matches: number }[]
  queued: number
  players: number
  perHour: number
  error: string
  demo?: boolean
  /** ARAM Mayhem games collected */
  mayhem?: number
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
  kind: 'kill' | 'death' | 'assist' | 'multikill' | 'objective' | 'steal' | 'ace' | 'fight' | 'mark'
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

export interface MayhemChamp {
  g: number
  w: number
  aug: PairMap
  core: PairMap
  boots: PairMap
  spells: PairMap
  skills: PairMap
  runes: PairMap
  first: PairMap
}

/** ARAM Mayhem aggregates: augments overall and per champion, plus builds. */
export interface MayhemData {
  matches: number
  patches: string[]
  aug: PairMap
  champs: Record<string, MayhemChamp>
}

export interface AugTier {
  id: number
  name: string
  icon: string
  rarity: 'silver' | 'gold' | 'prismatic'
  games: number
  champGames: number
  /** smoothed win rate used for the tier */
  wr: number
  rawWr: number
  tier: string
}

export interface AugTiers {
  matches: number
  champion: string
  rows: AugTier[]
}

/** What the augment overlay window draws. */
export interface AugOverlayState {
  cards: (AugTier & { x: number; y: number })[]
  panel: AugTiers | null
  champion: string
}

/** Per champion or role totals for the Data Studio catalogue (divide by g or min). */
export interface WorldSums {
  g: number
  w: number
  /** game minutes played */
  min: number
  k: number
  d: number
  a: number
  solo: number
  /** seconds spent dead */
  dead: number
  fb: number
  penta: number
  quadra: number
  cs: number
  plates: number
  dodged: number
  casts: number
  /** jungle CS before 10 minutes */
  jcs: number
  vision: number
  cw: number
  pings: number
  /** wins and losses by surrender */
  sw: number
  sl: number
  /** games and wins under 22 minutes / over 35 minutes */
  eg: number
  ew: number
  lg: number
  lw: number
}

export interface WorldData {
  games: number
  /** all games of the patches, for ban rates */
  matches: number
  patches: string[]
  durSum: number
  /** minute → games */
  dur: Record<string, number>
  early: number
  late: number
  surr: number
  /** surrendered before 21 minutes */
  earlySurr: number
  hour: Record<string, number>
  day: Record<string, number>
  icons: PairMap
  /** level bucket of 50 → players */
  level: Record<string, number>
  pings: Record<string, number>
  flash: { D: Pair; F: Pair; role: Record<string, { D: number; F: number }> }
  pairs: PairMap
  first: PairMap
  champs: Record<string, WorldSums>
  roles: Record<string, WorldSums>
  bans: Record<string, number>
}
