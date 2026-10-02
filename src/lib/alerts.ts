// A Discord message after each of your games: result, champion, KDA and the LP it was worth.
import type { PlayerData } from '../types'
import { postDiscord } from './boards'
import { lpChanges, lpHistory } from './lp'
import { queueLabel, kdaRatio } from './stats'
import { champName } from './ddragon'
import { t } from './i18n'

const KEY = 'riftpulse.discord.last'

export async function gameAlert(d: PlayerData, webhook: string) {
  const m = d.matches[0]
  if (!m || d.source === 'demo' || m.remake) return
  let seen: Record<string, string> = {}
  try {
    seen = JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {}
  const prev = seen[d.profile.puuid]
  if (prev === m.id) return
  seen[d.profile.puuid] = m.id
  try {
    localStorage.setItem(KEY, JSON.stringify(seen))
  } catch {}
  // the first time only remembers where we are, so old games are not posted
  if (!prev || Date.now() - m.endedAt > 6 * 3600_000) return
  const lp = lpChanges(lpHistory(d, m.queueId === 440 ? 'RANKED_FLEX_SR' : 'RANKED_SOLO_5x5')).at(-1)
  const lpText = (m.queueId === 420 || m.queueId === 440) && lp && Math.abs(lp.at - Date.now()) < 3600_000 ? ` · ${lp.delta >= 0 ? '+' : ''}${lp.delta} LP` : ''
  const minutes = Math.max(1, m.durationSec / 60)
  const line = [
    `${m.win ? '✅' : '❌'} **${d.profile.gameName}** · ${m.win ? t('Победа') : t('Поражение')} · ${queueLabel(m.queueId, m.mode)}`,
    `${champName(m.champion)} · ${m.kills}/${m.deaths}/${m.assists} (${kdaRatio(m.kills, m.deaths, m.assists)} KDA) · ${(m.cs / minutes).toFixed(1)} CS/${t('мин')} · ${Math.round(m.kp * 100)}% KP${lpText}`,
  ]
  await postDiscord(webhook, { content: line.join('\n') })
}
