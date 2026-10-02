import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { MatchSummary } from '../types'
import { champName } from '../lib/ddragon'
import { ROLE_LABEL } from '../lib/statsApi'
import { queueLabel } from '../lib/stats'
import { Icon, ease } from '../components/ui'
import { fmtNum, locale, t } from '../lib/i18n'

interface Metric {
  id: string
  label: string
  get: (m: MatchSummary) => number
  fmt: (v: number) => string
}
const f1 = (v: number) => v.toFixed(1)
const f0 = (v: number) => fmtNum(Math.round(v))
const fp = (v: number) => `${Math.round(v * 100)}%`
const mins = (m: MatchSummary) => Math.max(1, m.durationSec / 60)

export const METRICS: Metric[] = [
  { id: 'win', label: t('Винрейт'), get: (m) => (m.win ? 1 : 0), fmt: fp },
  { id: 'kda', label: 'KDA', get: (m) => (m.kills + m.assists) / Math.max(1, m.deaths), fmt: f1 },
  { id: 'kills', label: t('Убийства'), get: (m) => m.kills, fmt: f1 },
  { id: 'deaths', label: t('Смерти'), get: (m) => m.deaths, fmt: f1 },
  { id: 'assists', label: t('Помощь'), get: (m) => m.assists, fmt: f1 },
  { id: 'kp', label: t('Участие в убийствах'), get: (m) => m.kp, fmt: fp },
  { id: 'cs', label: t('CS/мин'), get: (m) => m.cs / mins(m), fmt: f1 },
  { id: 'dmg', label: t('Урон/мин'), get: (m) => m.dmgPerMin, fmt: f0 },
  { id: 'share', label: t('Доля урона'), get: (m) => m.dmgShare, fmt: fp },
  { id: 'gold', label: t('Золото/мин'), get: (m) => m.goldPerMin, fmt: f0 },
  { id: 'vision', label: t('Обзор/мин'), get: (m) => m.visionPerMin, fmt: f1 },
  { id: 'score', label: t('Оценка'), get: (m) => m.score, fmt: f0 },
  { id: 'place', label: t('Место в игре'), get: (m) => m.placement, fmt: f1 },
  { id: 'len', label: t('Длительность, мин'), get: (m) => m.durationSec / 60, fmt: f1 },
]
const DAYS = [t('Вс'), t('Пн'), t('Вт'), t('Ср'), t('Чт'), t('Пт'), t('Сб')]
const GROUPS: { id: string; label: string; key: (m: MatchSummary) => string; order?: (a: string, b: string) => number }[] = [
  { id: 'champ', label: t('Чемпион'), key: (m) => m.champion },
  { id: 'role', label: t('Роль'), key: (m) => m.role || '—' },
  { id: 'queue', label: t('Очередь'), key: (m) => queueLabel(m.queueId, m.mode) },
  { id: 'day', label: t('День недели'), key: (m) => String(new Date(m.endedAt).getDay()), order: (a, b) => ((+a + 6) % 7) - ((+b + 6) % 7) },
  { id: 'hour', label: t('Время суток'), key: (m) => String(Math.floor(new Date(m.endedAt).getHours() / 3) * 3), order: (a, b) => +a - +b },
  { id: 'length', label: t('Длина игры'), key: (m) => String(Math.min(40, Math.floor(m.durationSec / 300) * 5)), order: (a, b) => +a - +b },
  { id: 'result', label: t('Результат'), key: (m) => (m.win ? 'Победа' : 'Поражение') },
]
const groupLabel = (g: string, k: string) =>
  g === 'champ' ? champName(k) : g === 'role' ? ROLE_LABEL[k] ?? k : g === 'day' ? DAYS[+k] : g === 'hour' ? `${k}:00–${+k + 3}:00` : g === 'length' ? (+k >= 40 ? t('40+ мин') : t('{a}–{b} мин', { a: k, b: +k + 5 })) : g === 'result' ? t(k) : k

type Kind = 'line' | 'bar' | 'scatter'
interface ChartDef {
  id: string
  kind: Kind
  y: string
  x: string
  group: string
}
const BOARD = 'riftpulse.studio.v1'
const readBoard = (): ChartDef[] => {
  try {
    return JSON.parse(localStorage.getItem(BOARD) ?? 'null') ?? DEFAULT_BOARD
  } catch {
    return DEFAULT_BOARD
  }
}
const DEFAULT_BOARD: ChartDef[] = [
  { id: 'a', kind: 'line', y: 'kda', x: 'cs', group: 'champ' },
  { id: 'b', kind: 'bar', y: 'win', x: 'cs', group: 'champ' },
  { id: 'c', kind: 'scatter', y: 'dmg', x: 'gold', group: 'champ' },
  { id: 'd', kind: 'bar', y: 'win', x: 'cs', group: 'hour' },
]
const metric = (id: string) => METRICS.find((m) => m.id === id) ?? METRICS[0]
const title = (c: ChartDef) =>
  c.kind === 'line' ? t('{metric} по играм', { metric: metric(c.y).label }) : c.kind === 'bar' ? `${metric(c.y).label}: ${GROUPS.find((g) => g.id === c.group)?.label.toLowerCase()}` : t('{y} и {x}', { y: metric(c.y).label, x: metric(c.x).label })

export function Studio({ matches }: { matches: MatchSummary[] }) {
  const [board, setBoard] = useState<ChartDef[]>(readBoard)
  const [draft, setDraft] = useState<ChartDef>({ id: 'draft', kind: 'bar', y: 'kda', x: 'cs', group: 'champ' })
  const save = (b: ChartDef[]) => {
    setBoard(b)
    try {
      localStorage.setItem(BOARD, JSON.stringify(b))
    } catch {}
  }
  const set = (k: keyof ChartDef, v: string) => setDraft((d) => ({ ...d, [k]: v }))

  return (
    <div className="page">
      <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <h1>
          <Icon name="pie" size={28} /> Data Studio
        </h1>
        <span className="muted small">{t('{n} игр в выборке', { n: matches.length })}</span>
      </motion.div>

      <div className="card studio-builder">
        <div className="studio-controls">
          <label>
            <span>{t('Тип')}</span>
            <div className="kind-pick">
              {(
                [
                  ['line', t('Линия')],
                  ['bar', t('Столбцы')],
                  ['scatter', t('Точки')],
                ] as const
              ).map(([k, l]) => (
                <button key={k} className={draft.kind === k ? 'on' : ''} onClick={() => set('kind', k)}>
                  {l}
                </button>
              ))}
            </div>
          </label>
          <label>
            <span>{t('Показатель')}</span>
            <select value={draft.y} onChange={(e) => set('y', e.target.value)}>
              {METRICS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {draft.kind === 'bar' && (
            <label>
              <span>{t('Группировать по')}</span>
              <select value={draft.group} onChange={(e) => set('group', e.target.value)}>
                {GROUPS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {draft.kind === 'scatter' && (
            <label>
              <span>{t('По оси X')}</span>
              <select value={draft.x} onChange={(e) => set('x', e.target.value)}>
                {METRICS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <motion.button className="btn primary" whileTap={{ scale: 0.96 }} onClick={() => save([{ ...draft, id: String(Date.now()) }, ...board])}>
            <Icon name="star" size={15} /> {t('На доску')}
          </motion.button>
        </div>
        <div className="studio-preview">
          <h3 className="card-title">{title(draft)}</h3>
          <Chart def={draft} matches={matches} height={260} />
        </div>
      </div>

      <div className="section-head">
        <h2>{t('Моя доска')}</h2>
        <button className="link-btn" onClick={() => save(DEFAULT_BOARD)}>
          {t('Сбросить')}
        </button>
      </div>
      <motion.div className="studio-board" layout>
        <AnimatePresence>
          {board.map((c) => (
            <motion.div key={c.id} layout className="card studio-tile" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.35, ease }}>
              <div className="card-head">
                <h3 className="card-title">{title(c)}</h3>
                <button className="icon-btn" title={t('Убрать')} onClick={() => save(board.filter((x) => x.id !== c.id))}>
                  <Icon name="close" size={14} />
                </button>
              </div>
              <Chart def={c} matches={matches} height={190} />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

function Chart({ def, matches, height }: { def: ChartDef; matches: MatchSummary[]; height: number }) {
  const y = metric(def.y)
  const x = metric(def.x)
  const chrono = useMemo(() => [...matches].sort((a, b) => a.endedAt - b.endedAt), [matches])
  if (!matches.length) return <p className="muted">{t('Нет игр для графика.')}</p>
  if (def.kind === 'line')
    return (
      <LineChart
        values={chrono.map(y.get)}
        labels={chrono.map((m) => `${new Date(m.endedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })} · ${champName(m.champion)}`)}
        fmt={y.fmt}
        height={height}
      />
    )
  if (def.kind === 'scatter') return <Scatter points={chrono.map((m) => ({ x: x.get(m), y: y.get(m), win: m.win }))} fx={x.fmt} fy={y.fmt} height={height} />
  const g = GROUPS.find((q) => q.id === def.group) ?? GROUPS[0]
  const buckets: Record<string, number[]> = {}
  for (const m of matches) (buckets[g.key(m)] ||= []).push(y.get(m))
  let rows = Object.entries(buckets).map(([k, vs]) => ({ k, label: groupLabel(g.id, k), v: vs.reduce((a, b) => a + b, 0) / vs.length, n: vs.length }))
  rows = g.order ? rows.sort((a, b) => g.order!(a.k, b.k)) : rows.sort((a, b) => b.n - a.n).slice(0, 10)
  return <Bars rows={rows} fmt={y.fmt} height={height} />
}

const W = 600
function LineChart({ values, labels, fmt, height }: { values: number[]; labels: string[]; fmt: (v: number) => string; height: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const H = height
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const px = (i: number) => 36 + (i / Math.max(1, values.length - 1)) * (W - 48)
  const py = (v: number) => H - 26 - ((v - min) / span) * (H - 44)
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  // rolling average over 5 games
  const roll = values.map((_, i) => {
    const s = values.slice(Math.max(0, i - 4), i + 1)
    return s.reduce((a, b) => a + b, 0) / s.length
  })
  const path = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ')
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="chart"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const x = ((e.clientX - r.left) / r.width) * W
        setHover(Math.max(0, Math.min(values.length - 1, Math.round(((x - 36) / (W - 48)) * (values.length - 1)))))
      }}
      onMouseLeave={() => setHover(null)}
    >
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={36} x2={W - 12} y1={py(min + span * t)} y2={py(min + span * t)} className="grid" />
          <text x={30} y={py(min + span * t) + 4} className="axis" textAnchor="end">
            {fmt(min + span * t)}
          </text>
        </g>
      ))}
      <line x1={36} x2={W - 12} y1={py(avg)} y2={py(avg)} className="avg-line" />
      <motion.path d={path(values)} className="line-raw" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease }} />
      <motion.path d={path(roll)} className="line-main" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease, delay: 0.15 }} />
      {values.map((v, i) => (
        <circle key={i} cx={px(i)} cy={py(v)} r={hover === i ? 5 : 2.4} className={hover === i ? 'pt on' : 'pt'} />
      ))}
      {hover !== null && (
        <g className="chart-tip" transform={`translate(${Math.min(W - 150, Math.max(4, px(hover) - 70))}, ${Math.max(2, py(values[hover]) - 52)})`}>
          <line x1={px(hover) - Math.min(W - 150, Math.max(4, px(hover) - 70))} x2={px(hover) - Math.min(W - 150, Math.max(4, px(hover) - 70))} y1={44} y2={H} className="spark-cursor" />
          <rect width={140} height={40} rx={8} />
          <text x={70} y={16} textAnchor="middle" className="tip-label">
            {labels[hover]}
          </text>
          <text x={70} y={33} textAnchor="middle" className="tip-value">
            {fmt(values[hover])}
          </text>
        </g>
      )}
      <rect x={0} y={0} width={W} height={H} fill="transparent" />
    </svg>
  )
}

function Bars({ rows, fmt, height }: { rows: { k: string; label: string; v: number; n: number }[]; fmt: (v: number) => string; height: number }) {
  const max = Math.max(...rows.map((r) => r.v), 0.0001)
  return (
    <div className="bars" style={{ height }}>
      {rows.map((r, i) => (
        <div key={r.k} className="bar-col" title={`${r.label}: ${fmt(r.v)} (${t('{n} игр', { n: r.n })})`}>
          <b>{fmt(r.v)}</b>
          <div className="bar-track">
            <motion.i initial={{ height: 0 }} animate={{ height: `${(r.v / max) * 100}%` }} transition={{ duration: 0.7, ease, delay: i * 0.04 }} />
          </div>
          <span>{r.label}</span>
          <em>{r.n}</em>
        </div>
      ))}
    </div>
  )
}

function Scatter({ points, fx, fy, height }: { points: { x: number; y: number; win: boolean }[]; fx: (v: number) => string; fy: (v: number) => string; height: number }) {
  const H = height
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const px = (v: number) => 40 + ((v - x0) / (x1 - x0 || 1)) * (W - 56)
  const py = (v: number) => H - 26 - ((v - y0) / (y1 - y0 || 1)) * (H - 44)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart">
      <line x1={40} x2={W - 12} y1={H - 26} y2={H - 26} className="grid" />
      <line x1={40} x2={40} y1={12} y2={H - 26} className="grid" />
      <text x={40} y={H - 8} className="axis">
        {fx(x0)}
      </text>
      <text x={W - 12} y={H - 8} className="axis" textAnchor="end">
        {fx(x1)}
      </text>
      <text x={34} y={py(y1) + 4} className="axis" textAnchor="end">
        {fy(y1)}
      </text>
      <text x={34} y={py(y0) + 4} className="axis" textAnchor="end">
        {fy(y0)}
      </text>
      {points.map((p, i) => (
        <motion.circle
          key={i}
          cx={px(p.x)}
          cy={py(p.y)}
          r={4.5}
          className={p.win ? 'pt-win' : 'pt-loss'}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.85 }}
          transition={{ delay: i * 0.012, type: 'spring', stiffness: 400, damping: 20 }}
        >
          <title>
            {fx(p.x)} · {fy(p.y)} · {p.win ? t('победа') : t('поражение')}
          </title>
        </motion.circle>
      ))}
    </svg>
  )
}
