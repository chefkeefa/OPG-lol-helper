// Custom leaderboards: your own lists of players (friends, team, smurfs), ranked by solo queue,
// with optional Discord alerts when someone climbs, drops a division or goes on a streak.
import { useEffect, useState } from 'react'
import { regionalOf, riot } from '../api/riot'
import type { RankEntry } from '../types'
import { ladderValue } from './lp'
import { t } from './i18n'

export interface Member {
  riotId: string
  platform: string
}
export interface Row extends Member {
  puuid?: string
  iconId?: number
  tier: string
  rank: string
  lp: number
  wins: number
  losses: number
  v: number
  error?: string
}
export interface Board {
  id: string
  name: string
  members: Member[]
  /** Discord webhook for alerts and posting the table */
  webhook?: string
  alerts?: boolean
  /** last results, for "since last time" and alerts */
  last?: Record<string, Row>
  refreshedAt?: number
}

const KEY = 'riftpulse.boards'
const listeners = new Set<(b: Board[]) => void>()
export function getBoards(): Board[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}
export function saveBoards(list: Board[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {}
  listeners.forEach((f) => f(list))
}
export function useBoards() {
  const [list, setList] = useState(getBoards)
  useEffect(() => {
    listeners.add(setList)
    return () => void listeners.delete(setList)
  }, [])
  return list
}
export function updateBoard(id: string, fn: (b: Board) => Board) {
  saveBoards(getBoards().map((b) => (b.id === id ? fn(b) : b)))
}

export const memberKey = (m: Member) => `${m.riotId.toLowerCase()}@${m.platform}`
const APEX = ['MASTER', 'GRANDMASTER', 'CHALLENGER']
export const rankText = (r: Pick<Row, 'tier' | 'rank' | 'lp'>) => (r.tier ? `${r.tier}${APEX.includes(r.tier) ? '' : ' ' + r.rank} · ${r.lp} LP` : t('Без ранга'))

const puuids: Record<string, { puuid: string; at: number }> = {}
async function loadMember(m: Member): Promise<Row> {
  const [gameName, tagLine] = m.riotId.split('#')
  const regional = regionalOf(m.platform)
  try {
    let id = puuids[memberKey(m)]
    if (!id || Date.now() - id.at > 86400_000) {
      const a = await riot<{ puuid: string }>(regional === 'sea' ? 'asia' : regional, `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine ?? '')}`)
      id = puuids[memberKey(m)] = { puuid: a.puuid, at: Date.now() }
    }
    const [ranks, summoner] = await Promise.all([
      riot<RankEntry[]>(m.platform, `/lol/league/v4/entries/by-puuid/${id.puuid}`),
      riot<{ profileIconId: number }>(m.platform, `/lol/summoner/v4/summoners/by-puuid/${id.puuid}`).catch(() => null),
    ])
    const solo = ranks.find((r) => r.queueType === 'RANKED_SOLO_5x5')
    return {
      ...m,
      puuid: id.puuid,
      iconId: summoner?.profileIconId,
      tier: solo?.tier ?? '',
      rank: solo?.rank ?? '',
      lp: solo?.leaguePoints ?? 0,
      wins: solo?.wins ?? 0,
      losses: solo?.losses ?? 0,
      v: solo ? ladderValue(solo) : -1,
    }
  } catch (e) {
    return { ...m, tier: '', rank: '', lp: 0, wins: 0, losses: 0, v: -2, error: (e as Error).message }
  }
}

/** Loads every member, saves the result and returns it together with what changed. */
export async function refreshBoard(b: Board) {
  const rows: Row[] = []
  for (const m of b.members) rows.push(await loadMember(m))
  rows.sort((x, y) => y.v - x.v || y.wins - x.wins)
  const alerts: string[] = []
  for (const r of rows) {
    const before = b.last?.[memberKey(r)]
    if (!before || r.error || before.v < 0 || r.v < 0) continue
    const name = r.riotId.split('#')[0]
    if (before.tier !== r.tier || before.rank !== r.rank) {
      const up = r.v > before.v
      alerts.push(up ? t('🔼 {name} поднялся до {rank}', { name, rank: rankText(r) }) : t('🔽 {name} опустился до {rank}', { name, rank: rankText(r) }))
    } else if (Math.abs(r.v - before.v) >= 60) {
      const games = r.wins + r.losses - (before.wins + before.losses)
      alerts.push(t('{icon} {name}: {delta} LP за {games} игр ({rank})', { icon: r.v > before.v ? '📈' : '📉', name, delta: `${r.v > before.v ? '+' : ''}${r.v - before.v}`, games, rank: rankText(r) }))
    }
  }
  updateBoard(b.id, (x) => ({ ...x, last: Object.fromEntries(rows.map((r) => [memberKey(r), r])), refreshedAt: Date.now() }))
  if (b.webhook && b.alerts && alerts.length) await postDiscord(b.webhook, { content: `**${b.name}**\n${alerts.join('\n')}` }).catch(() => {})
  return { rows, alerts }
}

export const isWebhook = (u: string) => /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(u.trim())

/** Posts to a Discord webhook (through the main process in the desktop app). */
export async function postDiscord(url: string, payload: { content?: string; embeds?: unknown[] }) {
  if (!isWebhook(url)) throw new Error(t('Это не ссылка на вебхук Discord'))
  if (window.rp?.discord) {
    const r = await window.rp.discord(url.trim(), payload)
    if (!r.ok) throw new Error(r.error)
    return
  }
  const res = await fetch(url.trim(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'Rift Pulse', ...payload }) })
  if (!res.ok) throw new Error(`Discord ${res.status}`)
}

/** The whole table as one Discord message. */
export function tableMessage(b: Board, rows: Row[]) {
  const medal = ['🥇', '🥈', '🥉']
  const lines = rows.map((r, i) => {
    const games = r.wins + r.losses
    const wr = games ? Math.round((r.wins / games) * 100) : 0
    return `${medal[i] ?? `${i + 1}.`} **${r.riotId}** · ${rankText(r)}${games ? ` · ${r.wins}W ${r.losses}L (${wr}%)` : ''}`
  })
  return { content: `🏆 **${b.name}**\n${lines.join('\n')}` }
}
