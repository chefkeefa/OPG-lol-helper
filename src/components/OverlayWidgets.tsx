import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { LiveData, RankEntry } from '../types'
import type { DesktopSettings, OverlayWidget } from '../env'
import type { Benchmarks, StatsDetail } from '../lib/statsTypes'
import { OverlayTimers } from './OverlayTimers'
import { OverlayBench } from './OverlayBench'
import { demoLive } from '../lib/objectives'
import { gameData, type GameData } from '../lib/gameData'
import { champIcon, rankEmblem } from '../lib/ddragon'
import { liveChamp } from '../lib/skins'
import { regionalOf, riot } from '../api/riot'
import { t } from '../lib/i18n'

type Live = LiveData
type Player = Live['allPlayers'][number]

export const WIDGETS: OverlayWidget[] = ['timers', 'bench', 'gold', 'respawn', 'skills', 'scout']
export const DEFAULT_WIDGETS: Record<OverlayWidget, boolean> = { timers: true, bench: true, gold: true, respawn: true, skills: true, scout: true }

/** Positions are fractions 0..1: 0 hugs the left/top edge, 1 the right/bottom one, so a widget never leaves the screen. */
export function defaultLayout(corner: DesktopSettings['overlayCorner'] = 'top-right'): Record<OverlayWidget, { x: number; y: number }> {
  const right = !corner.endsWith('left')
  const top = corner.startsWith('top')
  const side = right ? 0.99 : 0.01
  return {
    timers: { x: side, y: top ? 0.12 : 0.62 },
    bench: { x: side, y: top ? 0.42 : 0.9 },
    gold: { x: 0.5, y: 0.075 },
    respawn: { x: right ? 0.01 : 0.99, y: 0.32 },
    skills: { x: 0.5, y: 0.78 },
    scout: { x: 0.5, y: 0.32 },
  }
}

export const WIDGET_LABEL: Record<OverlayWidget, string> = {
  timers: t('Таймеры объектов'),
  bench: t('Вы и ваше среднее'),
  gold: t('Разница золота'),
  respawn: t('Таймеры возрождения'),
  skills: t('Порядок умений'),
  scout: t('Экран загрузки'),
}

const playerNames = (live: Live) => [live.activePlayer?.riotIdGameName, live.activePlayer?.riotId, live.activePlayer?.summonerName].filter(Boolean)
export function myPlayer(live: Live): Player | undefined {
  const names = playerNames(live)
  return live.allPlayers.find((p) => names.includes(p.riotIdGameName) || names.includes(p.riotId) || names.includes(p.summonerName))
}
const fmtK = (g: number) => (Math.abs(g) >= 1000 ? `${(g / 1000).toFixed(1)}K` : String(Math.round(g)))

function useGameDataOnce() {
  const [d, setD] = useState<GameData | null>(null)
  useEffect(() => {
    gameData().then(setD)
  }, [])
  return d
}

/** Gold in items per team and against your lane opponent (the live client does not expose current gold of others). */
export function OverlayGold({ live }: { live: Live | null }) {
  const gd = useGameDataOnce()
  if (!live) return null
  const me = myPlayer(live) ?? live.allPlayers[0]
  if (!me) return null
  const worth = (p: Player) => p.items.reduce((s, it) => s + (gd?.items[it.itemID]?.gold ?? it.price ?? 0) * (it.count || 1), 0)
  const team = (side: string) => live.allPlayers.filter((p) => p.team === side).reduce((s, p) => s + worth(p), 0)
  const ours = team(me.team)
  const theirs = team(me.team === 'ORDER' ? 'CHAOS' : 'ORDER')
  const diff = ours - theirs
  const opp = me.position ? live.allPlayers.find((p) => p.team !== me.team && p.position === me.position) : undefined
  const lane = opp ? worth(me) - worth(opp) : null
  return (
    <div className="ov-gold">
      <div className="ov-gold-bar">
        <span className="ally">{fmtK(ours)}</span>
        <b className={diff >= 0 ? 'good' : 'bad'}>
          {diff >= 0 ? '+' : '−'}
          {fmtK(Math.abs(diff))}
        </b>
        <i className="coin" />
        <span className="enemy">{fmtK(theirs)}</span>
      </div>
      {lane !== null && opp && (
        <div className={`ov-gold-lane ${lane >= 0 ? 'good' : 'bad'}`}>
          <img src={champIcon(liveChamp(opp))} alt="" />
          {t('линия')} {lane >= 0 ? '+' : '−'}
          {fmtK(Math.abs(lane))}
        </div>
      )}
    </div>
  )
}

/** Who is dead and when they come back. */
export function OverlayRespawn({ live }: { live: Live | null }) {
  if (!live) return null
  const me = myPlayer(live) ?? live.allPlayers[0]
  const dead = live.allPlayers.filter((p) => p.isDead && (p.respawnTimer ?? 0) > 0).sort((a, b) => (a.respawnTimer ?? 0) - (b.respawnTimer ?? 0))
  return (
    <div className="ov-respawn">
      <AnimatePresence initial={false}>
        {dead.map((p) => (
          <motion.div
            key={p.championName + p.team}
            layout
            className={`ov-dead ${p.team === me?.team ? 'ally' : 'enemy'}`}
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            transition={{ duration: 0.3 }}
          >
            <img src={champIcon(liveChamp(p))} alt="" />
            <b>{Math.ceil(p.respawnTimer ?? 0)}</b>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

const KEYS = ['Q', 'W', 'E', 'R'] as const
/** Next skill to level, from the order most high-elo players use on this champion. */
export function OverlaySkills({ live, demo }: { live: Live | null; demo?: boolean }) {
  const [order, setOrder] = useState('')
  const me = live ? myPlayer(live) : undefined
  const champ = me ? liveChamp(me) : ''
  useEffect(() => {
    if (demo) return setOrder('QEWQQRQEQEREEWW')
    if (!champ || !window.rp) return
    window.rp.stats
      .detail(champ, '', [])
      .then((d: StatsDetail) => setOrder(d.rec?.skills ?? ''))
      .catch(() => setOrder(''))
  }, [champ, demo])
  if (!live || !me) return null
  const lv = live.activePlayer?.abilities
  const levels = KEYS.map((k) => lv?.[k]?.abilityLevel ?? 0)
  const spent = levels.reduce((a, b) => a + b, 0)
  const level = live.activePlayer?.level ?? me.level
  const free = Math.max(0, level - spent)
  const next = order[spent] as (typeof KEYS)[number] | undefined
  if (!order) return null
  return (
    <div className={`ov-skills ${free ? 'ready' : ''}`}>
      {KEYS.map((k, i) => (
        <div key={k} className={`ov-skill ${next === k ? 'next' : ''} ${k === 'R' ? 'ult' : ''}`}>
          <span className="key">{k}</span>
          <span className="pips">
            {Array.from({ length: k === 'R' ? 3 : 5 }, (_, j) => (
              <i key={j} className={j < levels[i] ? 'on' : ''} />
            ))}
          </span>
          {next === k && free > 0 && (
            <motion.em initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              +{free}
            </motion.em>
          )}
        </div>
      ))}
      <div className="ov-skill-order">
        {order
          .slice(0, 15)
          .split('')
          .map((c, i) => (
            <span key={i} className={i < spent ? 'done' : i === spent ? 'now' : ''}>
              {c}
            </span>
          ))}
      </div>
    </div>
  )
}

type Scout = { rank?: RankEntry | null; error?: boolean }
const TIER_SHORT: Record<string, string> = {
  IRON: 'I',
  BRONZE: 'B',
  SILVER: 'S',
  GOLD: 'G',
  PLATINUM: 'P',
  EMERALD: 'E',
  DIAMOND: 'D',
  MASTER: 'M',
  GRANDMASTER: 'GM',
  CHALLENGER: 'C',
}
const DEMO_RANKS: RankEntry[] = [
  { queueType: 'RANKED_SOLO_5x5', tier: 'MASTER', rank: 'I', leaguePoints: 97, wins: 91, losses: 80 },
  { queueType: 'RANKED_SOLO_5x5', tier: 'DIAMOND', rank: 'I', leaguePoints: 54, wins: 63, losses: 58 },
  { queueType: 'RANKED_SOLO_5x5', tier: 'GRANDMASTER', rank: 'I', leaguePoints: 412, wins: 140, losses: 121 },
]

/** Ranks of all ten players: shown at the start of a game and on Alt+X. */
export function OverlayScout({ live, platform, demo }: { live: Live | null; platform: string; demo?: boolean }) {
  const [info, setInfo] = useState<Record<string, Scout>>({})
  const asked = useRef('')
  const ids = live?.allPlayers.map((p) => p.riotId || '').join('|') ?? ''
  useEffect(() => {
    if (!live || demo || !window.rp || asked.current === ids) return
    asked.current = ids
    const regional = regionalOf(platform)
    for (const p of live.allPlayers) {
      const [name, tag] = (p.riotId || '').split('#')
      if (!name || !tag) continue
      riot<{ puuid: string }>(regional, `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`)
        .then((a) => riot<RankEntry[]>(platform, `/lol/league/v4/entries/by-puuid/${a.puuid}`))
        .then((r) => setInfo((s) => ({ ...s, [p.riotId!]: { rank: r.find((x) => x.queueType === 'RANKED_SOLO_5x5') ?? null } })))
        .catch(() => setInfo((s) => ({ ...s, [p.riotId!]: { error: true } })))
    }
  }, [ids, live, platform, demo])
  if (!live) return null
  const me = myPlayer(live) ?? live.allPlayers[0]
  const col = (mine: boolean) =>
    live.allPlayers
      .filter((p) => (p.team === me?.team) === mine)
      .map((p, i) => {
        const r = demo ? DEMO_RANKS[i % 3] : info[p.riotId || '']?.rank
        const games = r ? r.wins + r.losses : 0
        return (
          <div key={p.championName + p.team} className="ov-scout-row">
            <img src={champIcon(liveChamp(p))} alt="" />
            <span className="who">
              <b>{p.riotIdGameName || p.summonerName || p.championName}</b>
              <em>{p.championName}</em>
            </span>
            {r ? (
              <span className="rk">
                <img src={rankEmblem(r.tier)} alt="" />
                <b>
                  {TIER_SHORT[r.tier] ?? r.tier}
                  {['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(r.tier) ? '' : r.rank === 'I' ? '1' : r.rank === 'II' ? '2' : r.rank === 'III' ? '3' : '4'} · {r.leaguePoints} LP
                </b>
                <em className={r.wins / Math.max(1, games) >= 0.5 ? 'good' : 'bad'}>
                  {Math.round((r.wins / Math.max(1, games)) * 100)}% · {games}
                </em>
              </span>
            ) : (
              <span className="rk muted">{r === null ? t('без ранга') : '…'}</span>
            )}
          </div>
        )
      })
  return (
    <div className="ov-scout">
      <div className="ov-scout-col ally">{col(true)}</div>
      <div className="ov-scout-col enemy">{col(false)}</div>
    </div>
  )
}

/** Demo game for the editor and the previews: one enemy dead, skill points to spend. */
export function demoOverlayLive(tick = 1185): Live {
  const d = demoLive(tick)
  d.activePlayer = { ...d.activePlayer!, level: 9, abilities: { Q: { abilityLevel: 4 }, W: { abilityLevel: 1 }, E: { abilityLevel: 2 }, R: { abilityLevel: 1 } } }
  const PRICE: Record<number, number> = { 3031: 3450, 3006: 1100, 3046: 2600, 6672: 3000, 3094: 2650 }
  d.allPlayers = d.allPlayers.map((p, i) => ({
    ...p,
    items: p.items.map((it) => ({ ...it, price: PRICE[it.itemID] ?? 1000, count: 1 })),
    scores: i === 0 ? { kills: 6, deaths: 2, assists: 7, creepScore: Math.round((tick / 60) * 7.6), wardScore: Math.round((tick / 60) * 0.8) } : p.scores,
    riotId: `${p.riotIdGameName}#EUW`,
    isDead: i === 6 || i === 8 || i === 2,
    respawnTimer: i === 6 ? 24 - (tick % 24) : i === 8 ? 31 - (tick % 31) : i === 2 ? 12 - (tick % 12) : 0,
  }))
  return d
}

// ------------------------------------------------------------- the overlay window

function Placed({
  id,
  pos,
  edit,
  onMove,
  children,
}: {
  id: OverlayWidget
  pos: { x: number; y: number }
  edit: boolean
  onMove: (id: OverlayWidget, pos: { x: number; y: number }) => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const p = drag ?? pos
  const down = (e: React.PointerEvent) => {
    if (!edit || !ref.current) return
    const el = ref.current
    const W = window.innerWidth - el.offsetWidth
    const H = window.innerHeight - el.offsetHeight
    const startLeft = pos.x * W
    const startTop = pos.y * H
    const sx = e.clientX
    const sy = e.clientY
    el.setPointerCapture(e.pointerId)
    let last = pos
    const move = (ev: PointerEvent) => {
      last = {
        x: Math.min(1, Math.max(0, (startLeft + ev.clientX - sx) / Math.max(1, W))),
        y: Math.min(1, Math.max(0, (startTop + ev.clientY - sy) / Math.max(1, H))),
      }
      setDrag(last)
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      setDrag(null)
      onMove(id, last)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  return (
    <div
      ref={ref}
      className={`ovw ${edit ? 'edit' : ''} ${drag ? 'dragging' : ''}`}
      style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: `translate(${-p.x * 100}%, ${-p.y * 100}%)` }}
      onPointerDown={down}
    >
      {edit && <span className="ovw-label">{WIDGET_LABEL[id]}</span>}
      {children}
    </div>
  )
}

/** Content of the transparent in-game overlay window (desktop only). */
export function OverlayApp() {
  const [live, setLive] = useState<Live | null>(null)
  const [bench, setBench] = useState<Benchmarks>({})
  const [s, setS] = useState<DesktopSettings | null>(null)
  const [edit, setEdit] = useState(false)
  const [scout, setScout] = useState(false)
  const [tick, setTick] = useState(1185)
  useEffect(() => window.rp?.live.on(setLive), [])
  useEffect(() => window.rp?.overlay.onBenchmarks(setBench), [])
  useEffect(() => window.rp?.overlay.onEdit(setEdit), [])
  useEffect(() => window.rp?.overlay.onScout(setScout), [])
  useEffect(() => window.rp?.overlay.onSettings(setS), [])
  useEffect(() => {
    window.rp?.settings.get().then(setS)
  }, [])
  useEffect(() => {
    if (!edit || live) return
    const id = setInterval(() => setTick((v) => v + 1), 1000)
    return () => clearInterval(id)
  }, [edit, live])
  useEffect(() => {
    if (!edit) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && window.rp?.overlay.edit(false)
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [edit])
  if (!s) return null
  const demo = edit && !live
  const shown = demo ? demoOverlayLive(tick) : live
  const on = { ...DEFAULT_WIDGETS, ...s.overlayWidgets, bench: (s.overlayWidgets?.bench ?? true) && s.overlayBenchmark !== false }
  const layout = { ...defaultLayout(s.overlayCorner), ...s.overlayLayout }
  const move = (id: OverlayWidget, pos: { x: number; y: number }) => {
    const next = { ...s.overlayLayout, [id]: pos }
    setS({ ...s, overlayLayout: next })
    window.rp?.settings.set('overlayLayout', next)
  }
  const early = (shown?.gameData.gameTime ?? 999) < 60
  const content: Record<OverlayWidget, ReactNode> = {
    timers: <OverlayTimers live={shown} />,
    bench: <OverlayBench live={shown} bench={demo ? { '*': { games: 20, csPerMin: 7.1, kda: 3.2, kp: 0.52, visionPerMin: 0.9, deathsPerGame: 4.8 } } : bench} />,
    gold: <OverlayGold live={shown} />,
    respawn: <OverlayRespawn live={shown} />,
    skills: <OverlaySkills live={shown} demo={demo} />,
    scout: edit || scout || early ? <OverlayScout live={shown} platform={s.platform} demo={demo} /> : null,
  }
  return (
    <div className={`ov-screen ${edit ? 'editing' : ''}`}>
      {edit && (
        <motion.div className="ov-editbar" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <b>{t('Редактор оверлея')}</b>
          <span>{t('Перетащите виджеты на нужное место. Alt+B или Esc — сохранить и выйти.')}</span>
          <button
            className="btn ghost"
            onClick={() => {
              setS({ ...s, overlayLayout: {} })
              window.rp?.settings.set('overlayLayout', {})
            }}
          >
            {t('Сбросить')}
          </button>
          <button className="btn primary" onClick={() => window.rp?.overlay.edit(false)}>
            {t('Готово')}
          </button>
        </motion.div>
      )}
      {WIDGETS.filter((w) => on[w]).map((w) => (
        <Placed key={w} id={w} pos={layout[w]} edit={edit} onMove={move}>
          {content[w]}
        </Placed>
      ))}
    </div>
  )
}
