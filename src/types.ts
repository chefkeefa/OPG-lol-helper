export type Role = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY' | ''

/** One game from the tracked player's point of view, already normalized. */
export interface MatchSummary {
  id: string
  queueId: number
  endedAt: number
  durationSec: number
  win: boolean
  remake: boolean
  champion: string
  champLevel: number
  role: Role
  kills: number
  deaths: number
  assists: number
  cs: number
  kp: number
  dmgPerMin: number
  dmgShare: number
  goldPerMin: number
  visionPerMin: number
  /** 0–100, relative to the best performer in the game */
  score: number
  /** 1–10 by score across all ten players */
  placement: number
  largestMultiKill: number
  items: number[]
  allies: string[]
  enemies: string[]
  /** All ten players, own team first; absent in older cached entries */
  players?: PlayerLine[]
}

export interface PlayerLine {
  name: string
  champion: string
  teamId: number
  me: boolean
  kills: number
  deaths: number
  assists: number
  cs: number
  damage: number
  gold: number
  vision: number
  score: number
  items: number[]
}

export interface RankEntry {
  queueType: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR' | string
  tier: string
  rank: string
  leaguePoints: number
  wins: number
  losses: number
}

export interface Profile {
  gameName: string
  tagLine: string
  platform: string
  level: number
  iconId: number
  puuid: string
}

export interface PlayerData {
  profile: Profile
  ranks: RankEntry[]
  matches: MatchSummary[]
  /** where the data came from */
  source: 'demo' | 'client' | 'riot'
  fetchedAt: number
  mastery?: { champion: string; level: number; points: number }[]
}

export type Page =
  | 'dashboard'
  | 'matches'
  | 'champions'
  | 'studio'
  | 'tierlist'
  | 'champion'
  | 'matchups'
  | 'leaderboards'
  | 'live'
  | 'recordings'
  | 'spectate'
  | 'collections'
  | 'overlays'
  | 'settings'

export interface LiveData {
  gameData: { gameTime: number; gameMode: string; mapNumber: number; mapTerrain?: string }
  activePlayer?: { riotId?: string; riotIdGameName?: string; summonerName?: string; level: number; currentGold: number }
  allPlayers: {
    championName: string
    riotId?: string
    riotIdGameName?: string
    summonerName?: string
    team: 'ORDER' | 'CHAOS'
    level: number
    position?: string
    isDead?: boolean
    respawnTimer?: number
    scores: { kills: number; deaths: number; assists: number; creepScore: number; wardScore: number }
    items: { itemID: number; slot: number }[]
  }[]
  events: { Events: { EventID: number; EventName: string; EventTime: number; KillerName?: string; DragonType?: string }[] }
}

export type QueueFilter = 'all' | 'solo' | 'flex' | 'aram' | 'normal'
