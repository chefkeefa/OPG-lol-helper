import { motion } from 'motion/react'
import type { LiveData } from '../types'
import type { Bench, Benchmarks } from '../lib/statsTypes'
import { liveChamp } from '../lib/skins'

/** "You vs your average" panel of the in-game overlay. */
export function OverlayBench({ live, bench }: { live: LiveData | null; bench: Benchmarks }) {
  if (!live) return null
  const me = live.activePlayer
  const names = [me?.riotIdGameName, me?.riotId, me?.summonerName].filter(Boolean)
  const p = live.allPlayers.find((x) => names.includes(x.riotIdGameName) || names.includes(x.riotId) || names.includes(x.summonerName))
  if (!p) return null
  const id = liveChamp(p)
  const b: Bench | undefined = (bench[id]?.games ?? 0) >= 3 ? bench[id] : bench['*']
  if (!b) return null
  const min = Math.max(1, live.gameData.gameTime / 60)
  const teamKills = live.allPlayers.filter((x) => x.team === p.team).reduce((s, x) => s + x.scores.kills, 0)
  const s = p.scores
  const rows: { label: string; now: number; avg: number; fmt: (v: number) => string; lowerBetter?: boolean }[] = [
    { label: 'CS/мин', now: s.creepScore / min, avg: b.csPerMin, fmt: (v) => v.toFixed(1) },
    { label: 'KDA', now: (s.kills + s.assists) / Math.max(1, s.deaths), avg: b.kda, fmt: (v) => v.toFixed(1) },
    { label: 'KP', now: teamKills ? (s.kills + s.assists) / teamKills : 0, avg: b.kp, fmt: (v) => `${Math.round(v * 100)}%` },
    { label: 'Обзор/мин', now: s.wardScore / min, avg: b.visionPerMin, fmt: (v) => v.toFixed(2) },
  ]
  return (
    <div className="ov ov-bench">
      <div className="ov-bench-head">
        Вы и ваше среднее
        <em>{bench[id]?.games >= 3 ? p.championName : 'все чемпионы'}</em>
      </div>
      {rows.map((r) => {
        const ratio = r.avg ? r.now / r.avg : 1
        const good = r.lowerBetter ? ratio <= 1 : ratio >= 1
        return (
          <div key={r.label} className="ov-bench-row">
            <span className="ov-label">{r.label}</span>
            <b className={good ? 'good' : 'bad'}>{r.fmt(r.now)}</b>
            <span className="ov-avg">{r.fmt(r.avg)}</span>
            <i className="ov-bar">
              <motion.i animate={{ width: `${Math.min(100, ratio * 50)}%` }} transition={{ duration: 0.6 }} className={good ? 'good' : 'bad'} />
            </i>
          </div>
        )
      })}
    </div>
  )
}
