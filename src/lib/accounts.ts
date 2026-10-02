// Your own accounts (main and smurfs). Each is remembered with what was last seen of it, so the
// switcher can show icons and ranks without loading every account.
import { useEffect, useState } from 'react'
import type { PlayerData } from '../types'

export interface Account {
  riotId: string
  platform: string
  puuid?: string
  iconId?: number
  rank?: string
  seenAt?: number
}

const KEY = 'riftpulse.accounts'
const listeners = new Set<(a: Account[]) => void>()

export function getAccounts(): Account[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}
function save(list: Account[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {}
  listeners.forEach((f) => f(list))
}

const same = (a: Account, riotId: string, platform: string) => a.riotId.toLowerCase() === riotId.toLowerCase() && a.platform === platform

export function addAccount(riotId: string, platform: string) {
  const list = getAccounts()
  if (!list.some((a) => same(a, riotId, platform))) save([...list, { riotId: riotId.trim(), platform }])
}
export function removeAccount(riotId: string, platform: string) {
  save(getAccounts().filter((a) => !same(a, riotId, platform)))
}

/** An own account was loaded: add it if new and refresh what the switcher shows. */
export function noteAccount(d: PlayerData) {
  if (d.source === 'demo' || !d.profile.gameName) return
  const riotId = `${d.profile.gameName}#${d.profile.tagLine}`
  const solo = d.ranks.find((r) => r.queueType === 'RANKED_SOLO_5x5')
  const entry: Account = {
    riotId,
    platform: d.profile.platform,
    puuid: d.profile.puuid,
    iconId: d.profile.iconId,
    rank: solo ? `${solo.tier} ${['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(solo.tier) ? '' : solo.rank} · ${solo.leaguePoints} LP` : '',
    seenAt: Date.now(),
  }
  const list = getAccounts()
  const i = list.findIndex((a) => (a.puuid && a.puuid === entry.puuid) || same(a, riotId, entry.platform))
  if (i >= 0) list[i] = { ...list[i], ...entry }
  else list.push(entry)
  save(list)
}

export function useAccounts() {
  const [list, setList] = useState(getAccounts)
  useEffect(() => {
    listeners.add(setList)
    return () => void listeners.delete(setList)
  }, [])
  return list
}
