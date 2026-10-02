import { useEffect, useState } from 'react'
import type { SkinLog } from '../env'
import type { MatchSummary } from '../types'
import { championMap, champSplash } from './ddragon'

/**
 * Riot's match data does not say which skin was used, so the desktop app notes it in champion
 * select and during the game. Games are matched by champion and time; any other game on that
 * champion falls back to the skin you used last on it.
 */
let log: SkinLog = { games: [] }
let keys: Record<number, string> = {}
const subs = new Set<() => void>()
let started = false

function start() {
  if (started || !window.rp?.skins) return
  started = true
  const set = (s: SkinLog) => {
    log = s && Array.isArray(s.games) ? s : { games: [] }
    subs.forEach((f) => f())
  }
  window.rp.skins.get().then(set).catch(() => {})
  window.rp.skins.onUpdate(set)
  championMap()
    .then((m) => {
      keys = m
      subs.forEach((f) => f())
    })
    .catch(() => {})
}

const champOf = (g: SkinLog['games'][number]) => g.champ || (g.key ? keys[g.key] : '') || ''

/** Re-renders when the skin log changes. */
export function useSkins() {
  const [, bump] = useState(0)
  useEffect(() => {
    start()
    const f = () => bump((n) => n + 1)
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  }, [])
}

export function skinFor(champion: string, endedAt?: number, durationSec = 0): number {
  const games = log.games.filter((g) => champOf(g) === champion)
  if (!games.length) return 0
  if (endedAt) {
    const start = endedAt - durationSec * 1000 - 20 * 60_000
    const hit = [...games].reverse().find((g) => g.at >= start && g.at <= endedAt)
    if (hit) return hit.num
  }
  return games[games.length - 1].num
}

/** splash art of the skin used in that game (base art if unknown) */
export const matchSplash = (m: Pick<MatchSummary, 'champion' | 'endedAt' | 'durationSec'>) => champSplash(m.champion, skinFor(m.champion, m.endedAt, m.durationSec))
export const champSkinSplash = (champion: string) => champSplash(champion, skinFor(champion))

/** live client players: championName is localized, rawChampionName carries the Data Dragon id */
export function liveChamp(p: { championName: string; rawChampionName?: string }) {
  const raw = (p.rawChampionName ?? '').replace('game_character_displayname_', '')
  const id = raw || p.championName
  return id === 'FiddleSticks' ? 'Fiddlesticks' : id
}
export const liveSplash = (p: { championName: string; rawChampionName?: string; skinID?: number }) => champSplash(liveChamp(p), p.skinID ?? 0)
