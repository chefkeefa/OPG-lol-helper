// In-game widgets added after studying DPM 1.9.11: objective buffs, win probability, next item.
import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import type { LiveData } from '../types'
import type { StatsDetail } from '../lib/statsTypes'
import { gameData, type GameData } from '../lib/gameData'
import { champIcon, itemIcon } from '../lib/ddragon'
import { liveChamp } from '../lib/skins'
import { ObjectiveGlyph } from './ObjectiveGlyph'
import { t } from '../lib/i18n'

type Live = LiveData
type Player = Live['allPlayers'][number]

const names = (p: Player) => [p.riotIdGameName, p.summonerName, p.riotId?.split('#')[0], p.championName, p.rawChampionName].filter(Boolean) as string[]
const byName = (live: Live, name?: string) => (name ? live.allPlayers.find((p) => names(p).includes(name)) : undefined)
function mine(live: Live) {
  const n = [live.activePlayer?.riotIdGameName, live.activePlayer?.riotId?.split('#')[0], live.activePlayer?.summonerName].filter(Boolean)
  return live.allPlayers.find((p) => names(p).some((x) => n.includes(x))) ?? live.allPlayers[0]
}
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function useGameData() {
  const [d, setD] = useState<GameData | null>(null)
  useEffect(() => {
    gameData().then(setD)
  }, [])
  return d
}

/** Baron and Elder buffs: which team holds them, how long is left and who already lost it. */
export function OverlayBuffs({ live }: { live: Live | null }) {
  if (!live) return null
  const me = mine(live)
  const now = live.gameData.gameTime
  const ev = live.events?.Events ?? []
  const buffs = (
    [
      ['baron', 'BaronKill', 180],
      ['elder', 'DragonKill', 150],
    ] as const
  )
    .map(([id, name, len]) => {
      const e = [...ev].reverse().find((x) => x.EventName === name && (id !== 'elder' || x.DragonType === 'Elder'))
      if (!e || now - e.EventTime >= len) return null
      const team = byName(live, e.KillerName)?.team
      if (!team) return null
      // a buff ends on death: everyone who died after the take, or was dead at the time, has lost it
      const lost = new Set(ev.filter((x) => x.EventName === 'ChampionKill' && x.EventTime >= e.EventTime).map((x) => x.VictimName))
      const holders = live.allPlayers.filter((p) => p.team === team)
      return { id, team, left: len - (now - e.EventTime), len, holders, lost }
    })
    .filter((b): b is NonNullable<typeof b> => !!b)
  if (!buffs.length) return null
  return (
    <div className="ov-buffs">
      {buffs.map((b) => (
        <motion.div key={b.id} className={`ov-buff ${b.id} ${b.team === me?.team ? 'ally' : 'enemy'}`} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <span className="ov-buff-ico">
            <ObjectiveGlyph id={b.id} />
          </span>
          <b>{clock(b.left)}</b>
          <i className="ov-buff-bar">
            <i style={{ width: `${(b.left / b.len) * 100}%` }} />
          </i>
          <span className="ov-buff-team">
            {b.holders.map((p) => (
              <img key={p.championName} src={champIcon(liveChamp(p))} alt="" className={p.isDead || names(p).some((n) => b.lost.has(n)) ? 'lost' : ''} />
            ))}
          </span>
        </motion.div>
      ))}
    </div>
  )
}

/**
 * Win chance from what the live client exposes: item gold, kills, towers, inhibitors, dragons and
 * active buffs. A plain logistic estimate whose weights grow less important for gold as the game goes on.
 */
export function winChance(live: Live) {
  const me = mine(live)
  const us = me?.team ?? 'ORDER'
  const gd = live.allPlayers.reduce((s, p) => s + (p.team === us ? 1 : -1) * p.items.reduce((a, it) => a + (it.price ?? 0) * (it.count || 1), 0), 0)
  const kills = live.allPlayers.reduce((s, p) => s + (p.team === us ? 1 : -1) * p.scores.kills, 0)
  let towers = 0
  let inhibs = 0
  let drakes = 0
  const now = live.gameData.gameTime
  let buff = 0
  for (const e of live.events?.Events ?? []) {
    const side = (id?: string) => (id?.includes('_T1') ? 'ORDER' : id?.includes('_T2') ? 'CHAOS' : null)
    if (e.EventName === 'TurretKilled') towers += side(e.TurretKilled) === us ? -1 : side(e.TurretKilled) ? 1 : 0
    if (e.EventName === 'InhibKilled') inhibs += side(e.InhibKilled) === us ? -1 : side(e.InhibKilled) ? 1 : 0
    const team = byName(live, e.KillerName)?.team
    if (!team) continue
    const sign = team === us ? 1 : -1
    if (e.EventName === 'DragonKill' && e.DragonType !== 'Elder') drakes += sign
    if (e.EventName === 'BaronKill' && now - e.EventTime < 180) buff += sign * 0.7
    if (e.EventName === 'DragonKill' && e.DragonType === 'Elder' && now - e.EventTime < 150) buff += sign * 1.0
  }
  const minutes = Math.max(1, now / 60)
  const z = (gd / 1000) * (0.32 * Math.min(1, 18 / minutes) + 0.08) + kills * 0.035 + towers * 0.18 + inhibs * 0.45 + drakes * 0.14 + buff
  return 1 / (1 + Math.exp(-z))
}

export function OverlayWinProb({ live }: { live: Live | null }) {
  if (!live || live.gameData.gameTime < 120) return null
  const p = winChance(live)
  const ours = Math.round(p * 100)
  return (
    <div className="ov-win">
      <span className="ov-win-title">{t('Шанс победы')}</span>
      <div className="ov-win-nums">
        <b className="ally">
          {ours}
          <em>%</em>
        </b>
        <b className="enemy">
          {100 - ours}
          <em>%</em>
        </b>
      </div>
      <i className="ov-win-bar">
        <motion.i animate={{ width: `${ours}%` }} transition={{ duration: 0.6 }} />
      </i>
    </div>
  )
}

const DEMO_COST: Record<number, number> = { 3046: 2600, 3094: 2650, 3036: 3000, 3072: 3200 }
const DEMO_NAME: Record<number, string> = { 3046: 'Phantom Dancer', 3094: 'Rapid Firecannon', 3036: "Lord Dominik's Regards", 3072: 'Bloodthirster' }

/** The next core item of the high-elo build you don't own yet, and how close your gold is. */
export function OverlayNextItem({ live, demo }: { live: Live | null; demo?: boolean }) {
  const gd = useGameData()
  const [plan, setPlan] = useState<number[]>([])
  const me = live ? mine(live) : undefined
  const champ = me ? liveChamp(me) : ''
  useEffect(() => {
    if (demo) return setPlan([3031, 3006, 3046, 3094, 3036, 3072])
    if (!champ || !window.rp) return
    window.rp.stats
      .detail(champ, '', [])
      .then((d: StatsDetail) => setPlan(d.rec ? [...d.rec.core, d.rec.boots, ...d.rec.late].filter(Boolean) : []))
      .catch(() => setPlan([]))
  }, [champ, demo])
  if (!live || !me || !plan.length) return null
  const owned = new Set(me.items.map((i) => i.itemID))
  const next = plan.find((id) => !owned.has(id))
  if (!next) return null
  const cost = gd?.items[next]?.gold ?? (demo ? DEMO_COST[next] ?? 0 : 0)
  const gold = live.activePlayer?.currentGold ?? 0
  const ready = cost > 0 && gold >= cost
  return (
    <motion.div className={`ov-next ${ready ? 'ready' : ''}`} key={next} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
      <img src={itemIcon(next)} alt="" />
      <span>
        <em>{t('Следующий предмет')}</em>
        <b>{gd?.items[next]?.name ?? DEMO_NAME[next] ?? next}</b>
        {cost > 0 && (
          <i className="ov-next-bar">
            <i style={{ width: `${Math.min(1, gold / cost) * 100}%` }} />
          </i>
        )}
      </span>
      {cost > 0 && <strong>{ready ? t('Можно купить') : `${Math.round(gold)} / ${cost}`}</strong>}
    </motion.div>
  )
}

/** Demo events so the previews and the editor show a Baron and Elder in progress. */
export function withDemoBuffs(live: Live): Live {
  const now = live.gameData.gameTime
  return {
    ...live,
    events: {
      Events: [
        ...live.events.Events,
        { EventID: 90, EventName: 'BaronKill', EventTime: now - 64, KillerName: live.allPlayers[1]?.riotIdGameName },
        { EventID: 93, EventName: 'DragonKill', EventTime: now - 35, KillerName: live.allPlayers[6]?.riotIdGameName, DragonType: 'Elder' },
        { EventID: 91, EventName: 'ChampionKill', EventTime: now - 20, KillerName: live.allPlayers[7]?.riotIdGameName, VictimName: live.allPlayers[4]?.riotIdGameName },
        { EventID: 92, EventName: 'TurretKilled', EventTime: now - 300, KillerName: live.allPlayers[0]?.riotIdGameName, TurretKilled: 'Turret_T2_R_03_A' },
      ],
    },
  }
}
