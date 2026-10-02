// Post-game breakdown of one match: gold lead over time with objectives, the lane duel against
// your opponent, where your damage went and deep per-game numbers from match-v5 "challenges".
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import type { MatchSummary } from '../types'
import { regionalOf, riot } from '../api/riot'
import { Segmented, ease } from './ui'
import { t } from '../lib/i18n'

type P = Record<string, number | string | boolean | undefined | Record<string, number>> & {
  participantId: number
  teamId: number
  puuid: string
  championName: string
  teamPosition: string
  challenges?: Record<string, number>
}
interface Full {
  info: { gameDuration: number; participants: P[] }
}
interface Ev {
  type: string
  timestamp: number
  killerId?: number
  victimId?: number
  assistingParticipantIds?: number[]
  monsterType?: string
  monsterSubType?: string
  buildingType?: string
  teamId?: number
  killerTeamId?: number
}
interface Tl {
  info: { frames: { timestamp: number; participantFrames: Record<string, { totalGold: number; xp: number; minionsKilled: number; jungleMinionsKilled: number }>; events: Ev[] }[] }
}

const cache = new Map<string, Promise<{ match: Full; tl: Tl }>>()
function load(id: string) {
  if (!cache.has(id)) {
    const platform = id.split('_')[0].toLowerCase()
    const regional = regionalOf(platform)
    const p = Promise.all([riot<Full>(regional, `/lol/match/v5/matches/${id}`), riot<Tl>(regional, `/lol/match/v5/matches/${id}/timeline`)]).then(([match, tl]) => ({ match, tl }))
    p.catch(() => cache.delete(id))
    cache.set(id, p)
  }
  return cache.get(id)!
}

/** Example data for demo matches, so the web preview shows a full breakdown. */
function demo(m: MatchSummary): { match: Full; tl: Tl; myPid: number; oppPid: number } {
  let h = 0
  for (const ch of m.id) h = (h * 31 + ch.charCodeAt(0)) | 0
  const r = () => ((h = (h * 1103515245 + 12345) | 0) >>> 8) / 16777216
  const ps = (m.players ?? []).slice(0, 10)
  const myIdx = Math.max(0, ps.findIndex((p) => p.me))
  const myTeam = ps[myIdx]?.teamId ?? 100
  const allies = ps.filter((p) => p.teamId === myTeam)
  const enemies = ps.filter((p) => p.teamId !== myTeam)
  const ordered = [...allies, ...enemies]
  const participants: P[] = ordered.map((p, i) => ({
    participantId: i + 1,
    teamId: p.teamId,
    puuid: String(i),
    championName: p.champion,
    teamPosition: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'][i % 5],
    physicalDamageDealtToChampions: Math.round(p.damage * (0.3 + r() * 0.4)),
    magicDamageDealtToChampions: Math.round(p.damage * (0.2 + r() * 0.3)),
    trueDamageDealtToChampions: Math.round(p.damage * 0.08),
    totalDamageDealtToChampions: p.damage,
    totalDamageTaken: Math.round(15000 + r() * 25000),
    totalHealsOnTeammates: Math.round(r() * 4000),
    totalDamageShieldedOnTeammates: Math.round(r() * 3000),
    damageDealtToObjectives: Math.round(r() * 20000),
    damageDealtToBuildings: Math.round(r() * 8000),
    goldEarned: p.gold,
    totalTimeSpentDead: Math.round(30 + r() * 200),
    challenges: { laneMinionsFirst10Minutes: 60 + Math.round(r() * 30), maxCsAdvantageOnLaneOpponent: Math.round(r() * 40), soloKills: Math.round(r() * 3), damagePerMinute: p.damage / (m.durationSec / 60), goldPerMinute: p.gold / (m.durationSec / 60), killParticipation: 0.4 + r() * 0.4, visionScorePerMinute: p.vision / (m.durationSec / 60), skillshotsHit: Math.round(r() * 120), skillshotsDodged: Math.round(r() * 60), turretPlatesTaken: Math.round(r() * 4) },
  }))
  const minutes = Math.ceil(m.durationSec / 60)
  let lead = 0
  const frames = Array.from({ length: minutes + 1 }, (_, i) => {
    lead += (r() - (m.win ? 0.42 : 0.58)) * 900
    const pf: Tl['info']['frames'][number]['participantFrames'] = {}
    participants.forEach((p, j) => {
      const base = 500 + i * 380
      const side = p.teamId === myTeam ? lead / 10 : -lead / 10
      pf[j + 1] = { totalGold: Math.round(base + side + r() * 200), xp: Math.round(i * 520 + side), minionsKilled: Math.round(i * 7 + side / 40), jungleMinionsKilled: 0 }
    })
    const events: Ev[] = []
    if (i && i % 6 === 0) events.push({ type: 'ELITE_MONSTER_KILL', timestamp: i * 60000, monsterType: 'DRAGON', killerTeamId: r() > 0.5 ? myTeam : 300 - myTeam })
    if (i === 22) events.push({ type: 'ELITE_MONSTER_KILL', timestamp: i * 60000, monsterType: 'BARON_NASHOR', killerTeamId: m.win ? myTeam : 300 - myTeam })
    if (i > 12 && i % 4 === 1) events.push({ type: 'BUILDING_KILL', timestamp: i * 60000, buildingType: 'TOWER_BUILDING', teamId: r() > (m.win ? 0.3 : 0.7) ? 300 - myTeam : myTeam })
    return { timestamp: i * 60000, participantFrames: pf, events }
  })
  return { match: { info: { gameDuration: m.durationSec, participants } }, tl: { info: { frames } }, myPid: 3, oppPid: allies.length + 3 }
}

const num = (v: unknown) => (typeof v === 'number' ? v : 0)
const k = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))

export function MatchBreakdown({ m }: { m: MatchSummary }) {
  const [data, setData] = useState<{ match: Full; tl: Tl } | null>(null)
  const [error, setError] = useState('')
  const [duel, setDuel] = useState<'gold' | 'cs' | 'xp'>('gold')
  const lcuOnly = m.id.startsWith('LCU_')

  const example = m.id.startsWith('DEMO_')
  const ids = useMemo(() => (example ? demo(m) : null), [example, m])
  const myPid = ids?.myPid ?? m.myPid
  const oppPid = ids?.oppPid ?? m.oppPid
  useEffect(() => {
    if (lcuOnly) return
    if (ids) return setData(ids)
    load(m.id)
      .then(setData)
      .catch((e) => setError(e.status === 401 || e.status === 403 ? t('Нужен ключ Riot API: разбор берёт таймлайн матча из Riot API.') : e.message))
  }, [m.id, lcuOnly, ids])

  const view = useMemo(() => {
    if (!data || !myPid) return null
    const ps = data.match.info.participants
    const me = ps.find((p) => p.participantId === myPid)
    if (!me) return null
    const opp = ps.find((p) => p.participantId === oppPid)
    const mine = (pid: string | number) => ps.find((p) => p.participantId === Number(pid))?.teamId === me.teamId
    const frames = data.tl.info.frames
    const lead = frames.map((f) => {
      let d = 0
      for (const [pid, pf] of Object.entries(f.participantFrames)) d += mine(pid) ? pf.totalGold : -pf.totalGold
      return { t: f.timestamp / 60000, v: d }
    })
    const duelOf = (key: 'gold' | 'cs' | 'xp') =>
      opp
        ? frames.map((f) => {
            const a = f.participantFrames[me.participantId]
            const b = f.participantFrames[opp.participantId]
            const val = (x: typeof a) => (key === 'gold' ? x.totalGold : key === 'xp' ? x.xp : x.minionsKilled + x.jungleMinionsKilled)
            return { t: f.timestamp / 60000, v: a && b ? val(a) - val(b) : 0 }
          })
        : []
    const marks: { t: number; ours: boolean; kind: string }[] = []
    for (const f of frames)
      for (const e of f.events) {
        const at = e.timestamp / 60000
        if (e.type === 'ELITE_MONSTER_KILL') marks.push({ t: at, ours: e.killerTeamId ? e.killerTeamId === me.teamId : mine(e.killerId ?? 0), kind: e.monsterType === 'BARON_NASHOR' ? 'baron' : e.monsterType === 'DRAGON' ? 'dragon' : e.monsterType === 'RIFTHERALD' ? 'herald' : 'grubs' })
        else if (e.type === 'BUILDING_KILL') marks.push({ t: at, ours: e.teamId !== me.teamId, kind: e.buildingType === 'INHIBITOR_BUILDING' ? 'inhib' : 'tower' })
        else if (e.type === 'CHAMPION_KILL' && (e.killerId === me.participantId || e.victimId === me.participantId)) marks.push({ t: at, ours: e.killerId === me.participantId, kind: e.killerId === me.participantId ? 'kill' : 'death' })
      }
    const team = ps.filter((p) => p.teamId === me.teamId)
    const sum = (key: string) => team.reduce((s, p) => s + num(p[key]), 0)
    const share = (key: string) => ({ mine: num(me[key]), team: sum(key) })
    return { me, opp, lead, duelOf, marks, team, share, minutes: data.match.info.gameDuration / 60 }
  }, [data, myPid, oppPid])

  if (lcuOnly) return <div className="muted pad">{t('Эта игра пришла из клиента без Riot API, разбор для неё недоступен.')}</div>
  if (error) return <div className="muted pad">{error}</div>
  if (!view) return <div className="muted pad">{data ? t('Не нашёл вас в этом матче. Обновите данные профиля.') : t('Загружаю таймлайн матча…')}</div>

  const { me, opp, share } = view
  const c = me.challenges ?? {}
  const dmg = [
    { label: t('Физический'), v: num(me.physicalDamageDealtToChampions), color: '#ff8a5c' },
    { label: t('Магический'), v: num(me.magicDamageDealtToChampions), color: '#7b9cff' },
    { label: t('Чистый'), v: num(me.trueDamageDealtToChampions), color: '#eef0fa' },
  ]
  const dmgTotal = Math.max(1, dmg.reduce((s, d) => s + d.v, 0))
  const shares = [
    { label: t('Урон по чемпионам'), ...share('totalDamageDealtToChampions') },
    { label: t('Полученный урон'), ...share('totalDamageTaken') },
    { label: t('Лечение и щиты союзникам'), mine: num(me.totalHealsOnTeammates) + num(me.totalDamageShieldedOnTeammates), team: view.team.reduce((s, p) => s + num(p.totalHealsOnTeammates) + num(p.totalDamageShieldedOnTeammates), 0) },
    { label: t('Урон по объектам'), ...share('damageDealtToObjectives') },
    { label: t('Урон по башням'), ...share('damageDealtToBuildings') },
    { label: t('Золото'), ...share('goldEarned') },
  ]
  const lens: [string, string][] = (
    [
      [t('CS к 10 минуте'), c.laneMinionsFirst10Minutes !== undefined ? String(Math.round(num(c.laneMinionsFirst10Minutes) + num(c.jungleCsBefore10Minutes))) : ''],
      [t('Макс. отрыв по CS от соперника'), c.maxCsAdvantageOnLaneOpponent !== undefined ? `+${Math.round(num(c.maxCsAdvantageOnLaneOpponent))}` : ''],
      [t('Одиночные убийства'), c.soloKills !== undefined ? String(c.soloKills) : ''],
      [t('Урон в минуту'), c.damagePerMinute !== undefined ? k(num(c.damagePerMinute)) : ''],
      [t('Золото в минуту'), c.goldPerMinute !== undefined ? String(Math.round(num(c.goldPerMinute))) : ''],
      [t('Участие в убийствах'), c.killParticipation !== undefined ? `${Math.round(num(c.killParticipation) * 100)}%` : ''],
      [t('Обзор в минуту'), c.visionScorePerMinute !== undefined ? num(c.visionScorePerMinute).toFixed(2) : ''],
      [t('Контрольных вардов'), me.controlWardsPlaced !== undefined ? String(me.controlWardsPlaced) : c.controlWardsPlaced !== undefined ? String(c.controlWardsPlaced) : ''],
      [t('Попаданий скиллшотами'), c.skillshotsHit !== undefined ? String(c.skillshotsHit) : ''],
      [t('Увернулся от скиллшотов'), c.skillshotsDodged !== undefined ? String(c.skillshotsDodged) : ''],
      [t('Пластины башен'), c.turretPlatesTaken !== undefined ? String(c.turretPlatesTaken) : ''],
      [t('Время мёртвым'), me.totalTimeSpentDead !== undefined ? `${Math.floor(num(me.totalTimeSpentDead) / 60)}:${String(num(me.totalTimeSpentDead) % 60).padStart(2, '0')}` : ''],
      [t('Убийств под своей башней'), c.killsUnderOwnTurret !== undefined ? String(c.killsUnderOwnTurret) : ''],
      [t('Эффективность урона (на 1 золото)'), c.damagePerMinute !== undefined && c.goldPerMinute ? (num(c.damagePerMinute) / num(c.goldPerMinute)).toFixed(2) : ''],
    ] as [string, string][]
  ).filter(([, v]) => v)

  return (
    <motion.div className="breakdown" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease }}>
      <div className="bd-block">
        <h4>{t('Преимущество команды по золоту')}</h4>
        <LineChart points={view.lead} marks={view.marks} minutes={view.minutes} />
      </div>
      {opp && (
        <div className="bd-block">
          <div className="bd-head">
            <h4>{t('Линия: вы против {name}', { name: String(opp.championName) })}</h4>
            <Segmented
              id={`duel-${m.id}`}
              value={duel}
              onChange={setDuel}
              options={[
                { id: 'gold', label: t('Золото') },
                { id: 'cs', label: 'CS' },
                { id: 'xp', label: t('Опыт') },
              ]}
            />
          </div>
          <LineChart points={view.duelOf(duel)} minutes={view.minutes} small />
        </div>
      )}
      <div className="bd-grid">
        <div className="bd-block">
          <h4>{t('Ваш урон по чемпионам')}</h4>
          <div className="bd-stack">
            {dmg.map((d) => (
              <motion.i key={d.label} style={{ background: d.color }} initial={{ width: 0 }} animate={{ width: `${(d.v / dmgTotal) * 100}%` }} transition={{ duration: 0.7, ease }} />
            ))}
          </div>
          <div className="bd-legend">
            {dmg.map((d) => (
              <span key={d.label}>
                <i style={{ background: d.color }} /> {d.label} {k(d.v)} ({Math.round((d.v / dmgTotal) * 100)}%)
              </span>
            ))}
          </div>
          <h4 style={{ marginTop: 14 }}>{t('Ваша доля в команде')}</h4>
          {shares.map((s) => (
            <div key={s.label} className="bd-share">
              <span>{s.label}</span>
              <span className="bd-bar">
                <motion.i initial={{ width: 0 }} animate={{ width: `${s.team ? (s.mine / s.team) * 100 : 0}%` }} transition={{ duration: 0.7, ease }} />
              </span>
              <b>{s.team ? Math.round((s.mine / s.team) * 100) : 0}%</b>
              <em>{k(s.mine)}</em>
            </div>
          ))}
        </div>
        <div className="bd-block">
          <h4>{t('Подробная статистика')}</h4>
          <div className="bd-lens">
            {lens.map(([label, v]) => (
              <div key={label}>
                <b>{v}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

const MARK: Record<string, string> = { dragon: '🐉', baron: '👾', herald: '🦀', grubs: '🪲', tower: '🗼', inhib: '💠', kill: '⚔', death: '✖' }

function LineChart({ points, marks = [], minutes, small }: { points: { t: number; v: number }[]; marks?: { t: number; ours: boolean; kind: string }[]; minutes: number; small?: boolean }) {
  const W = 900
  const H = small ? 140 : 190
  const pad = 26
  const max = Math.max(500, ...points.map((p) => Math.abs(p.v)))
  const x = (t: number) => pad + (t / Math.max(1, minutes)) * (W - pad * 2)
  const y = (v: number) => H / 2 - (v / max) * (H / 2 - 14)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const area = points.length ? `${line} L${x(points[points.length - 1].t)},${H / 2} L${x(points[0].t)},${H / 2} Z` : ''
  const id = useMemo(() => Math.random().toString(36).slice(2), [])
  return (
    <svg className="bd-chart" viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <clipPath id={`up-${id}`}>
          <rect x="0" y="0" width={W} height={H / 2} />
        </clipPath>
        <clipPath id={`down-${id}`}>
          <rect x="0" y={H / 2} width={W} height={H / 2} />
        </clipPath>
      </defs>
      {Array.from({ length: Math.floor(minutes / 5) + 1 }, (_, i) => i * 5).map((m) => (
        <g key={m}>
          <line x1={x(m)} x2={x(m)} y1={6} y2={H - 6} className="bd-grid-line" />
          <text x={x(m)} y={H - 1} className="bd-tick">
            {m}
          </text>
        </g>
      ))}
      <line x1={pad} x2={W - pad} y1={H / 2} y2={H / 2} className="bd-zero" />
      <path d={area} className="bd-area up" clipPath={`url(#up-${id})`} />
      <path d={area} className="bd-area down" clipPath={`url(#down-${id})`} />
      <path d={line} className="bd-line" />
      <text x={4} y={14} className="bd-tick start">
        +{k(max)}
      </text>
      <text x={4} y={H - 12} className="bd-tick start">
        −{k(max)}
      </text>
      {marks.map((mk, i) => (
        <text key={i} x={x(mk.t)} y={mk.ours ? 16 : H - 16} className={`bd-mark ${mk.ours ? 'ours' : 'theirs'}`}>
          {MARK[mk.kind]}
        </text>
      ))}
    </svg>
  )
}
