// Every other player's name opens their profile. The app provides how to open one (the same
// search the title bar uses) and the server of the profile being shown.
import { createContext, useContext, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { resolveName } from '../api/leaderboard'
import { t } from '../lib/i18n'

interface Ctx {
  open: (riotId: string, platform: string) => void
  /** server of the profile on screen: other players in its matches play there too */
  platform: string
  /** the user's own server, for their live game */
  home: string
}
export const PlayerLinkContext = createContext<Ctx | null>(null)

/** Riot platform key from a game's platformId ("EUW1" → "euw1"). */
export const platformKey = (id?: string) => (id ?? '').toLowerCase()

/** "Name#TAG" of a live-client player, when the client gave the tag. */
export function liveRiotId(p: { riotId?: string; riotIdGameName?: string; riotIdTagLine?: string }) {
  if (p.riotId?.includes('#')) return p.riotId
  return p.riotIdGameName && p.riotIdTagLine ? `${p.riotIdGameName}#${p.riotIdTagLine}` : ''
}

/**
 * A name that opens that player's profile. Pass `riotId` ("Name#TAG") or `name` + `tag`; with only
 * a puuid the Riot ID is looked up first. Clicks don't reach the row around it.
 */
export function PlayerLink({
  riotId,
  name,
  tag,
  puuid,
  platform,
  home,
  className = '',
  children,
}: {
  riotId?: string
  name?: string
  tag?: string
  puuid?: string
  platform?: string
  /** the user's own server (their live game) instead of the shown profile's */
  home?: boolean
  className?: string
  children?: ReactNode
}) {
  const ctx = useContext(PlayerLinkContext)
  const id = riotId?.includes('#') ? riotId : name && tag ? `${name}#${tag}` : ''
  const label = children ?? (riotId ? riotId.split('#')[0] : name)
  if (!ctx || (!id && !puuid)) return <span className={className}>{label}</span>
  const where = platform || (home ? ctx.home : ctx.platform)
  const go = async (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (id) return ctx.open(id, where)
    try {
      const a = await resolveName(where, puuid!)
      ctx.open(`${a.gameName}#${a.tagLine}`, where)
    } catch {}
  }
  return (
    <span
      role="link"
      tabIndex={0}
      className={`plink ${className}`}
      title={t('Открыть профиль')}
      onClick={go}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && go(e)}
    >
      {label}
    </span>
  )
}
