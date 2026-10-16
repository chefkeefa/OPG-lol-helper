// Profile tabs next to the overview, laid out like DPM's: season table per champion and the Lens.
import { Fragment, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { MatchSummary, QueueFilter, Role } from '../types'
import { ROLES, QUEUE_FILTERS, duration, kdaRatio } from '../lib/stats'
import { champName } from '../lib/ddragon'
import { lens, lensColor, type LensCat, type LensMetric, type LensMode } from '../lib/lens'
import { t, locale } from '../lib/i18n'
import { Champ, Icon, Ring, Segmented, ease, spring } from '../components/ui'
import { RoleIcon } from '../components/RoleIcon'

type RoleFilter = 'ALL' | Exclude<Role, ''>
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

function RolePicker({ value, onChange, id }: { value: RoleFilter; onChange: (r: RoleFilter) => void; id: string }) {
  return (
    <Segmented
      id={id}
      className="icons"
      value={value}
      onChange={onChange}
      options={[
        { id: 'ALL' as RoleFilter, label: <RoleIcon role="ALL" size={15} />, title: t('Все роли') },
        ...ROLES.map((r) => ({ id: r.id as RoleFilter, label: <RoleIcon role={r.id} size={15} />, title: r.label })),
      ]}
    />
  )
}

// ---------------------------------------------------------------- champions
type SortKey = 'games' | 'wr' | 'kda' | 'csm' | 'gd15' | 'score'
interface ChampRow {
  champion: string
  games: number
  wins: number
  wr: number
  k: number
  d: number
  a: number
  kda: number
  csm: number
  gd15: number | null
  score: number
  last: MatchSummary[]
  dpm: number
  kp: number
  vpm: number
}

function rowOf(champion: string, g: MatchSummary[]): ChampRow {
  const wins = g.filter((m) => m.win).length
  const k = avg(g.map((m) => m.kills))
  const d = avg(g.map((m) => m.deaths))
  const a = avg(g.map((m) => m.assists))
  const tl = g.filter((m) => m.d15)
  return {
    champion,
    games: g.length,
    wins,
    wr: wins / g.length,
    k,
    d,
    a,
    kda: (k + a) / Math.max(1, d),
    csm: avg(g.map((m) => m.cs / Math.max(1, m.durationSec / 60))),
    gd15: tl.length ? avg(tl.map((m) => m.d15!.gold)) : null,
    score: avg(g.map((m) => m.score)),
    last: [...g].sort((x, y) => y.endedAt - x.endedAt),
    dpm: avg(g.map((m) => m.dmgPerMin)),
    kp: avg(g.map((m) => m.kp)),
    vpm: avg(g.map((m) => m.visionPerMin)),
  }
}

const wrClass = (wr: number) => (wr >= 0.55 ? 'good' : wr < 0.45 ? 'bad' : '')
const kdaClass = (k: number) => (k >= 4 ? 'great' : k >= 3 ? 'good' : k < 2 ? 'bad' : '')

export function ProfileChampions({ matches, filter, setFilter }: { matches: MatchSummary[]; filter: QueueFilter; setFilter: (f: QueueFilter) => void }) {
  const [role, setRole] = useState<RoleFilter>('ALL')
  const [sort, setSort] = useState<SortKey>('games')
  const [open, setOpen] = useState<string | null>(null)
  const shown = useMemo(() => matches.filter((m) => !m.remake && (role === 'ALL' || m.role === role)), [matches, role])
  const rows = useMemo(() => {
    const by = new Map<string, MatchSummary[]>()
    for (const m of shown) by.set(m.champion, [...(by.get(m.champion) ?? []), m])
    return [...by.entries()].map(([c, g]) => rowOf(c, g)).sort((a, b) => ((b[sort] ?? -1e9) as number) - ((a[sort] ?? -1e9) as number) || b.games - a.games)
  }, [shown, sort])
  const total = useMemo(() => (shown.length ? rowOf('*', shown) : null), [shown])
  const cols: [SortKey | null, string][] = [
    [null, t('Чемпион')],
    ['games', t('Игры')],
    ['wr', t('Винрейт')],
    ['kda', 'KDA'],
    ['csm', t('CS/мин')],
    ['gd15', t('Золото @15')],
    ['score', t('Оценка')],
    [null, t('Последние 5')],
  ]
  return (
    <motion.section className="card pc" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }}>
      <div className="pc-bar">
        <RolePicker id="pc-role" value={role} onChange={setRole} />
        <b className="pc-title">{t('Статистика за {n} игр', { n: shown.length })}</b>
        <Segmented id="pc-queue" className="small" options={QUEUE_FILTERS} value={filter} onChange={setFilter} />
      </div>
      <div className="pc-table">
        <div className="pc-head">
          <span>#</span>
          {cols.map(([k, label]) => (
            <button key={label} className={k === sort ? 'on' : ''} disabled={!k} onClick={() => k && setSort(k)}>
              {label}
              {k === sort && <Icon name="chevron" size={11} />}
            </button>
          ))}
          <span />
        </div>
        {total && (
          <div className="pc-row pc-total">
            <span />
            <span className="pc-champ">
              <span className="pc-all">
                <RoleIcon role="ALL" size={16} />
              </span>
              <b>{t('Все чемпионы')}</b>
            </span>
            <b>{total.games}</b>
            <span className="pc-wr">
              <b className={wrClass(total.wr)}>{Math.round(total.wr * 100)}%</b>
              <em>
                {total.wins}W - {total.games - total.wins}L
              </em>
            </span>
            <span className="pc-kda">
              {total.k.toFixed(1)} / {total.d.toFixed(1)} / {total.a.toFixed(1)} <b className={kdaClass(total.kda)}>({total.kda.toFixed(1)})</b>
            </span>
            <span>{total.csm.toFixed(1)}</span>
            <span>{total.gd15 === null ? '–' : `${total.gd15 >= 0 ? '+' : ''}${total.gd15.toFixed(1)}`}</span>
            <b className="pc-score">{total.score.toFixed(1)}</b>
            <span className="pc-last muted">1 2 3 4 5</span>
            <span />
          </div>
        )}
        {rows.map((r, i) => (
          <Fragment key={r.champion}>
            <motion.button
              className={`pc-row ${open === r.champion ? 'open' : ''}`}
              onClick={() => setOpen((o) => (o === r.champion ? null : r.champion))}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 14) * 0.025, duration: 0.3, ease }}
            >
              <span className="muted">{i + 1}</span>
              <span className="pc-champ">
                <Champ name={r.champion} size={26} radius={5} />
                <b>{champName(r.champion)}</b>
              </span>
              <b>{r.games}</b>
              <span className="pc-wr">
                <b className={wrClass(r.wr)}>{Math.round(r.wr * 100)}%</b>
                <em>
                  {r.wins}W - {r.games - r.wins}L
                </em>
              </span>
              <span className="pc-kda">
                {r.k.toFixed(1)} / {r.d.toFixed(1)} / {r.a.toFixed(1)} <b className={kdaClass(r.kda)}>({r.kda.toFixed(1)})</b>
              </span>
              <span>{r.csm.toFixed(1)}</span>
              <span>{r.gd15 === null ? '–' : `${r.gd15 >= 0 ? '+' : ''}${r.gd15.toFixed(1)}`}</span>
              <b className="pc-score">{r.score.toFixed(1)}</b>
              <span className="pc-last">
                {r.last.slice(0, 5).map((m) => (
                  <i key={m.id} className={m.win ? 'w' : 'l'}>
                    {m.win ? 'W' : 'L'}
                  </i>
                ))}
              </span>
              <span className="pc-chev">
                <Icon name="chevron" size={13} />
              </span>
            </motion.button>
            <AnimatePresence initial={false}>
              {open === r.champion && (
                <motion.div className="pc-more" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease }}>
                  <div className="pc-more-in">
                    <div className="pc-avgs">
                      <span>
                        <em>{t('Урон/мин')}</em>
                        <b>{r.dpm.toFixed(0)}</b>
                      </span>
                      <span>
                        <em>KP</em>
                        <b>{Math.round(r.kp * 100)}%</b>
                      </span>
                      <span>
                        <em>{t('Обзор/мин')}</em>
                        <b>{r.vpm.toFixed(2)}</b>
                      </span>
                    </div>
                    <div className="pc-games">
                      {r.last.slice(0, 8).map((m) => (
                        <span key={m.id} className={`pc-game ${m.win ? 'w' : 'l'}`}>
                          <em>{new Date(m.endedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</em>
                          <b>
                            {m.kills}/{m.deaths}/{m.assists}
                          </b>
                          <em>
                            {kdaRatio(m.kills, m.deaths, m.assists)} · {duration(m.durationSec)}
                          </em>
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Fragment>
        ))}
        {!rows.length && <p className="muted center">{t('Нет игр в этом режиме')}</p>}
      </div>
    </motion.section>
  )
}

// ---------------------------------------------------------------- lens
const CAT_COLOR: Record<LensCat, string> = {
  laning: '#f08a3c',
  fighting: '#5b7cfa',
  survival: '#e5484d',
  vision: '#f5c542',
  impact: '#3fbf7f',
  consistency: '#5fc8e8',
}
const CAT_GLYPH: Record<LensCat, string> = {
  laning: 'M4 20L20 4M4 4h7M20 20h-7',
  fighting: 'M14 4h6v6L9 21l-3-3zM4 14l6 6',
  survival: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  vision: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  impact: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.6',
  consistency: 'M3 12h4l3-8 4 16 3-8h4',
}

function CatGlyph({ cat, size = 14 }: { cat: LensCat; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={CAT_GLYPH[cat]} />
    </svg>
  )
}

function ScoreRing({ score, size = 38 }: { score: number; size?: number }) {
  const c = lensColor(score)
  return (
    <span className="lens-ring">
      <Ring value={score} color={c} size={size} stroke={4}>
        <b style={{ color: '#fff' }}>{Math.round(score)}</b>
      </Ring>
    </span>
  )
}

export function ProfileLens({ matches }: { matches: MatchSummary[] }) {
  const [mode, setMode] = useState<LensMode>('lobby')
  const [role, setRole] = useState<RoleFilter>('ALL')
  const [tab, setTab] = useState<'overview' | LensCat>('overview')
  const shown = useMemo(() => matches.filter((m) => role === 'ALL' || m.role === role), [matches, role])
  const L = useMemo(() => lens(shown, mode), [shown, mode])
  const weakest = L.cats.length ? L.cats.reduce((a, b) => (b.score < a.score ? b : a)) : null
  const cat = L.cats.find((c) => c.id === tab)
  return (
    <div className="lens-page">
      <motion.section className="card lens-head" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }}>
        <h3>
          <Icon name="eye" size={18} /> {t('Линза')}
        </h3>
        <Segmented
          id="lens-mode"
          className="small"
          value={mode}
          onChange={setMode}
          options={[
            { id: 'lobby' as LensMode, label: t('Против лобби'), title: t('Сравнение с остальными девятью игроками ваших матчей') },
            { id: 'progress' as LensMode, label: t('Мой прогресс'), title: t('Последние 10 игр против более ранних') },
          ]}
        />
        <RolePicker id="lens-role" value={role} onChange={setRole} />
        <div className="push" />
        <span className="lens-sum">
          <b>{L.games}</b>
          <em>{t('игр')}</em>
        </span>
        <span className="lens-sum">
          <b>{Math.round(L.wr * 100)}%</b>
          <em>WR</em>
        </span>
      </motion.section>
      {mode === 'lobby' && !L.comparable && L.games > 0 && <p className="banner">{t('Для сравнения с лобби нужны полные матчи (ключ Riot API). Пока показываю ваш прогресс.')}</p>}
      <div className="lens-tabs">
        <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>
          {tab === 'overview' && <motion.span layoutId="lens-tab" className="lens-tab-bg" transition={spring} />}
          <span>{t('Сводка')}</span>
        </button>
        {L.cats.map((c) => (
          <button key={c.id} className={tab === c.id ? 'on' : ''} onClick={() => setTab(c.id)} style={{ ['--cc' as string]: CAT_COLOR[c.id] }}>
            {tab === c.id && <motion.span layoutId="lens-tab" className="lens-tab-bg" transition={spring} />}
            <span>
              <CatGlyph cat={c.id} size={13} /> {c.label}
            </span>
          </button>
        ))}
      </div>
      {!L.games ? (
        <div className="card empty">{t('Нет игр в этом режиме')}</div>
      ) : tab === 'overview' ? (
        <motion.section key="ov" className="card lens-ov" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
          <div className="lens-cards">
            {L.cats.map((c, i) => (
              <motion.button
                key={c.id}
                className={`lens-card ${c === weakest && L.cats.length > 1 ? 'weak' : ''}`}
                onClick={() => setTab(c.id)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + i * 0.04, duration: 0.3, ease }}
                style={{ ['--cc' as string]: CAT_COLOR[c.id] }}
              >
                <span className="lens-card-name">
                  <CatGlyph cat={c.id} /> {c.label}
                  {c === weakest && L.cats.length > 1 && <em>{t('стоит подтянуть')}</em>}
                </span>
                <ScoreRing score={c.score} />
              </motion.button>
            ))}
          </div>
          <LensGraph cats={L.cats} overall={L.overall} onPick={setTab} />
        </motion.section>
      ) : (
        cat && <LensCategoryView key={cat.id} cat={cat.id} label={cat.label} score={cat.score} metrics={cat.metrics} mode={mode} />
      )}
    </div>
  )
}

/** Centre score, a node per category and a dot per metric, wired like a constellation. */
function LensGraph({ cats, overall, onPick }: { cats: { id: LensCat; label: string; score: number; metrics: LensMetric[] }[]; overall: number; onPick: (c: LensCat) => void }) {
  const W = 520
  const H = 380
  const cx = W / 2
  const cy = H / 2
  const n = cats.length
  return (
    <svg className="lens-graph" viewBox={`0 0 ${W} ${H}`} aria-hidden>
      {cats.map((c, i) => {
        const ang = -Math.PI / 2 + (i / n) * Math.PI * 2
        const x = cx + Math.cos(ang) * 120
        const y = cy + Math.sin(ang) * 112
        const col = CAT_COLOR[c.id]
        const bend = (i % 2 ? 1 : -1) * 22
        const mx = (cx + x) / 2 + Math.cos(ang + Math.PI / 2) * bend
        const my = (cy + y) / 2 + Math.sin(ang + Math.PI / 2) * bend
        return (
          <g key={c.id} className="lg-cat" onClick={() => onPick(c.id)}>
            <motion.path d={`M${cx},${cy} Q${mx},${my} ${x},${y}`} stroke={col} strokeOpacity={0.55} strokeWidth={2} fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.1 + i * 0.06, duration: 0.6, ease }} />
            {c.metrics.map((m, j) => {
              const spread = c.metrics.length > 1 ? (j / (c.metrics.length - 1) - 0.5) * 1.3 : 0
              const a2 = ang + spread
              const px = x + Math.cos(a2) * 54
              const py = y + Math.sin(a2) * 50
              return (
                <g key={m.key}>
                  <motion.line x1={x} y1={y} x2={px} y2={py} stroke={col} strokeOpacity={0.35} strokeWidth={1.2} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.45 + i * 0.06, duration: 0.4 }} />
                  <motion.circle cx={px} cy={py} r={7} fill={lensColor(m.score)} fillOpacity={0.9} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6 + i * 0.06 + j * 0.03, ...spring }} style={{ transformOrigin: `${px}px ${py}px` }}>
                    <title>{`${m.label}: ${m.fmt(m.value)} (${Math.round(m.score)})`}</title>
                  </motion.circle>
                </g>
              )
            })}
            <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3 + i * 0.06, ...spring }} style={{ transformOrigin: `${x}px ${y}px` }}>
              <rect x={x - 17} y={y - 17} width={34} height={34} rx={8} fill={col} />
              <rect x={x - 17} y={y - 17} width={34} height={34} rx={8} fill="none" stroke="#fff" strokeOpacity={0.25} />
              <text x={x} y={y + 5} textAnchor="middle" className="lg-num">
                {c.score}
              </text>
              <text x={x} y={y + 31} textAnchor="middle" className="lg-label">
                {c.label}
              </text>
            </motion.g>
          </g>
        )
      })}
      <motion.g initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring }} style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <rect x={cx - 34} y={cy - 28} width={68} height={56} rx={12} fill="#1f2029" stroke="rgba(255,255,255,.14)" />
        <text x={cx} y={cy + 8} textAnchor="middle" className="lg-center">
          {Math.floor(overall)}
          <tspan className="lg-dec">.{Math.round((overall % 1) * 10)}</tspan>
        </text>
      </motion.g>
    </svg>
  )
}

function LensCategoryView({ cat, label, score, metrics, mode }: { cat: LensCat; label: string; score: number; metrics: LensMetric[]; mode: LensMode }) {
  const groups = useMemo(() => {
    const by = new Map<string, LensMetric[]>()
    for (const m of metrics) by.set(m.group, [...(by.get(m.group) ?? []), m])
    return [...by.entries()].map(([name, ms]) => ({ name, ms, score: Math.round(avg(ms.map((m) => m.score))) }))
  }, [metrics])
  const [sel, setSel] = useState<string | null>(null)
  const [metric, setMetric] = useState(metrics[0]?.key)
  const list = sel ? groups.find((g) => g.name === sel)?.ms ?? metrics : metrics
  const m = list.find((x) => x.key === metric) ?? list[0]
  const baseLabel = mode === 'lobby' ? t('у лобби') : t('раньше')
  return (
    <motion.section className="card lens-cat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} style={{ ['--cc' as string]: CAT_COLOR[cat] }}>
      <div className="lens-groups">
        <button className={`lens-group big ${sel === null ? 'on' : ''}`} onClick={() => setSel(null)}>
          <span>
            <CatGlyph cat={cat} size={18} />
            <b>
              {label}: {t('всё')}
            </b>
          </span>
          <ScoreRing score={score} size={44} />
        </button>
        {groups.map((g) => (
          <button key={g.name} className={`lens-group ${sel === g.name ? 'on' : ''}`} onClick={() => setSel(g.name)}>
            <span>
              <b>{g.name}</b>
              <em>{g.ms.map((x) => x.label).join(', ')}</em>
            </span>
            <ScoreRing score={g.score} />
          </button>
        ))}
      </div>
      <div className="lens-right">
        <div className="lens-title">
          <CatGlyph cat={cat} /> {label} · {sel ?? t('всё')}
        </div>
        <div className="lens-metrics">
          {list.map((x) => {
            const better = x.lower ? x.value <= x.base : x.value >= x.base
            return (
              <button key={x.key} className={`lens-metric ${m?.key === x.key ? 'on' : ''}`} onClick={() => setMetric(x.key)}>
                <em>{x.label}</em>
                <b>
                  {x.fmt(x.value)} <i className={better ? 'up' : 'down'}>{better ? '▲' : '▼'}</i>
                </b>
                <span className="muted">
                  {baseLabel}: {x.fmt(x.base)}
                </span>
              </button>
            )
          })}
        </div>
        {m && <MetricBars m={m} baseLabel={baseLabel} />}
      </div>
    </motion.section>
  )
}

/** Last games of one metric as bars against the baseline line. */
function MetricBars({ m, baseLabel }: { m: LensMetric; baseLabel: string }) {
  const s = m.series
  const max = Math.max(...s.map(Math.abs), Math.abs(m.base), 0.0001)
  const neg = s.some((v) => v < 0) || m.base < 0
  const H = 110
  const zero = neg ? H / 2 : H
  const y = (v: number) => zero - (v / max) * (neg ? H / 2 : H)
  return (
    <div className="lens-bars">
      <div className="lens-bars-val">
        <b>{m.fmt(m.value)}</b>
        <em>{m.label}</em>
      </div>
      <svg viewBox={`0 0 ${Math.max(1, s.length) * 16} ${H}`} preserveAspectRatio="none">
        {s.map((v, i) => {
          const good = m.lower ? v <= m.base : v >= m.base
          const top = Math.min(y(v), zero)
          return (
            <motion.rect
              key={i}
              x={i * 16 + 3}
              width={10}
              rx={3}
              fill={good ? '#9fd27f' : '#f0646a'}
              initial={{ y: zero, height: 0 }}
              animate={{ y: top, height: Math.max(1.5, Math.abs(y(v) - zero)) }}
              transition={{ delay: i * 0.015, duration: 0.35, ease }}
            />
          )
        })}
        <line x1={0} x2={s.length * 16} y1={y(m.base)} y2={y(m.base)} stroke="#fff" strokeOpacity={0.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="muted small">
        {t('Последние {n} игр. Пунктир: {base} ({v}).', { n: s.length, base: baseLabel, v: m.fmt(m.base) })}
      </p>
    </div>
  )
}
