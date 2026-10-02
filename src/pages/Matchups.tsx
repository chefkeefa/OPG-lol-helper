import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { StatsDetail, StatsStatus } from '../lib/statsTypes'
import { ROLE_LABEL, pct, statsDetail } from '../lib/statsApi'
import { champName, champTile } from '../lib/ddragon'
import { Champ, Icon, Ring, Skeleton, Splash, ease } from '../components/ui'
import { ChampPicker, CollectorPill, PatchSelect, RoleTabs, StatsGate, hasData, patchList } from '../components/StatsBits'

type Sort = 'wr' | 'g' | 'delta'

export function Matchups({
  champ,
  role,
  setChamp,
  setRole,
  status,
  demo,
  setDemo,
  version,
  onSettings,
  onOpenChampion,
}: {
  champ: string
  role: string
  setChamp: (c: string) => void
  setRole: (r: string) => void
  status: StatsStatus | null
  demo: boolean
  setDemo: (v: boolean) => void
  version: number
  onSettings: () => void
  onOpenChampion: (c: string, r: string) => void
}) {
  const [patch, setPatch] = useState('')
  const [d, setD] = useState<StatsDetail | null>(null)
  const [enemy, setEnemy] = useState('')
  const [enemyD, setEnemyD] = useState<StatsDetail | null>(null)
  const [sort, setSort] = useState<{ by: Sort; desc: boolean }>({ by: 'g', desc: true })
  const ready = demo || hasData(status)

  useEffect(() => {
    if (!ready) return
    statsDetail(champ, role, patchList(status, patch), demo).then(setD)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [champ, role, patch, demo, ready, version])
  useEffect(() => {
    if (!ready || !enemy || !d?.role) return setEnemyD(null)
    statsDetail(enemy, d.role, patchList(status, patch), demo).then(setEnemyD)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enemy, d?.role, patch, demo, ready])

  const a = d?.agg
  const base = a ? a.w / a.g : 0.5
  const rows = useMemo(() => {
    if (!a) return []
    const list = Object.entries(a.vs).map(([c, [g, w]]) => ({ c, g, wr: w / g, delta: w / g - base }))
    const k: Record<Sort, (r: (typeof list)[number]) => number> = { wr: (r) => r.wr, g: (r) => r.g, delta: (r) => r.delta }
    return list.sort((x, y) => (sort.desc ? 1 : -1) * (k[sort.by](y) - k[sort.by](x)))
  }, [a, base, sort])
  const maxG = Math.max(1, ...rows.map((r) => r.g))

  // head to head: combine both sides' records of the same lane matchup
  const h2h = useMemo(() => {
    if (!a || !enemy) return null
    const mine = a.vs[enemy] ?? [0, 0]
    const theirs = enemyD?.agg?.vs[champ] ?? [0, 0]
    const g = Math.max(mine[0], theirs[0])
    if (!g) return { g: 0, wr: 0.5 }
    const wr = mine[0] >= theirs[0] ? mine[1] / mine[0] : 1 - theirs[1] / theirs[0]
    return { g, wr }
  }, [a, enemy, enemyD, champ])

  const head = (by: Sort, label: string) => (
    <button className={`th ${sort.by === by ? 'on' : ''}`} onClick={() => setSort((s) => ({ by, desc: s.by === by ? !s.desc : true }))}>
      {label}
      {sort.by === by && <Icon name="chevron" size={12} />}
    </button>
  )

  return (
    <div className="page">
      <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <h1>
          <Icon name="swords" size={28} /> Матчапы
        </h1>
        <CollectorPill status={status} demo={demo} />
      </motion.div>
      {!ready ? (
        <StatsGate status={status} onDemo={() => setDemo(true)} onSettings={onSettings} />
      ) : (
        <>
          <div className="mu-top">
            <div className="card vs-card">
              <div className="vs-side">
                <Splash src={champTile(champ)} position="center 20%" />
                <div className="vs-shade" />
                <div className="vs-content">
                  <ChampPicker value={champ} onPick={setChamp} placeholder="Ваш чемпион" />
                  {d?.role && <span className="muted small">{ROLE_LABEL[d.role]} · {a?.g.toLocaleString('ru')} игр</span>}
                </div>
              </div>
              <div className="vs-mid">
                <AnimatePresence mode="wait">
                  {h2h && h2h.g > 0 ? (
                    <motion.div key={enemy} className="vs-result" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease }}>
                      <Ring value={h2h.wr * 100} size={110} stroke={7} color={h2h.wr >= 0.5 ? 'var(--win)' : 'var(--loss)'}>
                        <b className="vs-wr">{pct(h2h.wr)}</b>
                      </Ring>
                      <span className="muted small">{h2h.g.toLocaleString('ru')} игр на линии</span>
                    </motion.div>
                  ) : (
                    <motion.div key="vs" className="vs-letters" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      VS
                      <span className="muted small">{enemy ? 'Мало игр в этом матчапе' : 'Выберите противника'}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="vs-side right">
                {enemy && <Splash src={champTile(enemy)} position="center 20%" />}
                <div className="vs-shade" />
                <div className="vs-content">
                  <ChampPicker value={enemy} onPick={setEnemy} placeholder="Противник" />
                </div>
              </div>
            </div>
          </div>

          <div className="mu-toolbar">
            <RoleTabs id="mu" value={d?.role ?? role} onChange={setRole} counts={d?.roleGames} all={false} />
            <div className="tier-tools">
              {!demo && <PatchSelect status={status} value={patch} onChange={setPatch} />}
              <button className="btn" onClick={() => onOpenChampion(champ, d?.role ?? role)}>
                Билд {champName(champ)} <Icon name="right" size={14} />
              </button>
            </div>
          </div>

          <div className="card mu-table">
            <div className="mu-trow mu-thead">
              <span className="th">Противник</span>
              {head('wr', `Винрейт ${champName(champ)}`)}
              {head('delta', 'Разница со средним')}
              {head('g', 'Игры')}
            </div>
            {!d ? (
              <Skeleton h={300} />
            ) : (
              rows.map((r, i) => (
                <motion.button
                  key={r.c}
                  layout="position"
                  className={`mu-trow ${enemy === r.c ? 'on' : ''}`}
                  onClick={() => setEnemy(r.c)}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 20) * 0.02 } }}
                >
                  <span className="tier-champ">
                    <Champ name={r.c} size={32} radius={8} />
                    <b>{champName(r.c)}</b>
                  </span>
                  <span className="tier-wr">
                    <b className={r.wr >= 0.52 ? 'good' : r.wr < 0.48 ? 'bad' : ''}>{pct(r.wr)}</b>
                    <i className="wr-bar">
                      <motion.i initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(1, (r.wr - 0.35) / 0.3)) * 100}%` }} transition={{ duration: 0.6, ease }} />
                    </i>
                  </span>
                  <span className={r.delta >= 0 ? 'good' : 'bad'}>
                    {r.delta >= 0 ? '+' : ''}
                    {(r.delta * 100).toFixed(1)}
                  </span>
                  <span className="mu-games">
                    <i style={{ width: `${(r.g / maxG) * 100}%` }} />
                    <em>{r.g.toLocaleString('ru')}</em>
                  </span>
                </motion.button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
