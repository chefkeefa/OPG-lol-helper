import type { LiveData } from '../types'

export interface ObjectiveTimer {
  id: 'dragon' | 'elder' | 'grubs' | 'herald' | 'baron'
  label: string
  /** seconds until spawn; 0 = alive / up */
  remaining: number
  /** full respawn window, for the progress ring */
  window: number
}

const LABEL: Record<ObjectiveTimer['id'], string> = {
  dragon: 'Дракон',
  elder: 'Древний',
  grubs: 'Личинки',
  herald: 'Герольд',
  baron: 'Барон',
}

/**
 * Summoner's Rift spawn rules (current patches): dragon 5:00 then +5:00,
 * voidgrubs 8:00 (gone at 14:45), herald 15:00 (gone at 19:45), baron 20:00 then +6:00,
 * elder 6:00 after the soul or after the previous elder.
 */
export function objectiveTimers(d: LiveData | null): ObjectiveTimer[] {
  if (!d || d.gameData.mapNumber !== 11 || !['CLASSIC', 'PRACTICETOOL'].includes(d.gameData.gameMode)) return []
  const now = d.gameData.gameTime
  const ev = [...(d.events?.Events ?? [])].filter((e) => e.EventTime <= now).sort((a, b) => a.EventTime - b.EventTime)
  const out: ObjectiveTimer[] = []
  const add = (id: ObjectiveTimer['id'], spawn: number, window: number) =>
    out.push({ id, label: LABEL[id], remaining: Math.max(0, Math.ceil(spawn - now)), window })

  const team = (killer?: string) => d.allPlayers.find((p) => [p.riotId, p.riotIdGameName, p.summonerName].includes(killer))?.team
  const dragons = ev.filter((e) => e.EventName === 'DragonKill')
  const counts: Record<string, number> = {}
  let soulAt: number | undefined
  for (const e of dragons) {
    if (e.DragonType === 'Elder') continue
    const t = team(e.KillerName)
    if (!t) continue
    counts[t] = (counts[t] ?? 0) + 1
    if (counts[t] === 4) soulAt = e.EventTime
  }
  const last = dragons.at(-1)
  if (last?.DragonType === 'Elder' || soulAt !== undefined) add('elder', (last?.EventTime ?? soulAt!) + 360, 360)
  else add('dragon', last ? last.EventTime + 300 : 300, 300)

  if (now < 885 && ev.filter((e) => e.EventName === 'HordeKill').length < 3) add('grubs', 480, 480)
  if (now < 1185 && !ev.some((e) => e.EventName === 'HeraldKill')) add('herald', 900, 900)
  const baron = ev.filter((e) => e.EventName === 'BaronKill').at(-1)
  add('baron', baron ? baron.EventTime + 360 : 1200, baron ? 360 : 1200)
  return out
}

export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

/** Fake in-progress game used by the demo and the overlay preview. */
export function demoLive(t = 1185): LiveData {
  const champs = ['Kaisa', 'Graves', 'Ahri', 'Darius', 'Braum', 'Jinx', 'Viego', 'Syndra', 'Garen', 'Thresh']
  const pos = ['BOTTOM', 'JUNGLE', 'MIDDLE', 'TOP', 'UTILITY']
  return {
    gameData: { gameTime: t, gameMode: 'CLASSIC', mapNumber: 11 },
    activePlayer: { riotIdGameName: 'mentally stable', level: 13, currentGold: 1240 },
    allPlayers: champs.map((c, i) => ({
      championName: c,
      riotIdGameName: i === 0 ? 'mentally stable' : ['Mercy9', 'Densi', 'Koussay', 'Lumen', 'Hydra', 'Velvet', 'Pyro', 'Glacier', 'Akkyo'][i - 1],
      team: i < 5 ? 'ORDER' : 'CHAOS',
      level: 9 + ((i * 3) % 6),
      position: pos[i % 5],
      scores: { kills: (i * 5) % 9, deaths: (i * 3) % 6, assists: (i * 7) % 11, creepScore: 40 + ((i * 37) % 150), wardScore: (i * 4) % 20 },
      items: [3031, 3006, 3046, 6672, 3094].slice(0, 2 + (i % 4)).map((id, slot) => ({ itemID: id, slot })),
    })),
    events: {
      Events: [
        { EventID: 1, EventName: 'GameStart', EventTime: 0 },
        { EventID: 2, EventName: 'DragonKill', EventTime: 412, KillerName: 'Densi', DragonType: 'Fire' },
        { EventID: 3, EventName: 'HordeKill', EventTime: 560, KillerName: 'Viego' },
        { EventID: 4, EventName: 'DragonKill', EventTime: 1001, KillerName: 'Viego', DragonType: 'Earth' },
      ],
    },
  }
}
