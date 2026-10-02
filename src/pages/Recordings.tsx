import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { DesktopSettings } from '../env'
import type { Moment, Recording } from '../lib/statsTypes'
import { champName } from '../lib/ddragon'
import { duration } from '../lib/stats'
import { Champ, Icon, ease, stagger, fadeUp } from '../components/ui'

const KIND: Record<Moment['kind'], { label: string; color: string }> = {
  kill: { label: 'Убийства', color: 'var(--win)' },
  multikill: { label: 'Мультикиллы', color: 'var(--gold)' },
  death: { label: 'Смерти', color: 'var(--loss)' },
  assist: { label: 'Помощь', color: 'var(--accent-2)' },
  objective: { label: 'Объекты', color: '#c48bff' },
  steal: { label: 'Кражи', color: '#ff9f43' },
}

const media = (file: string) => `rpmedia://media/${encodeURIComponent(file)}`
const gb = (b: number) => (b / 1024 ** 3).toFixed(b > 1024 ** 3 * 10 ? 0 : 1) + ' ГБ'
const dateText = (ts: number) => new Date(ts).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const DEMO: Recording[] = [
  {
    id: 'demo-1',
    file: '',
    createdAt: Date.now() - 3600_000 * 3,
    duration: 1934,
    champion: 'Ahri',
    gameMode: 'CLASSIC',
    result: 'Win',
    kda: [11, 3, 9],
    size: 2.1 * 1024 ** 3,
    clips: [],
    moments: [
      { t: 312, kind: 'kill', label: 'Первая кровь' },
      { t: 655, kind: 'objective', label: 'Дракон' },
      { t: 801, kind: 'death', label: 'Смерть от Zed' },
      { t: 1102, kind: 'multikill', label: 'Тройное убийство' },
      { t: 1430, kind: 'objective', label: 'Барон' },
      { t: 1688, kind: 'kill', label: 'Убийство: Jinx' },
    ],
  },
  {
    id: 'demo-2',
    file: '',
    createdAt: Date.now() - 3600_000 * 26,
    duration: 1611,
    champion: 'Syndra',
    gameMode: 'CLASSIC',
    result: 'Lose',
    kda: [4, 6, 7],
    size: 1.7 * 1024 ** 3,
    clips: [],
    moments: [
      { t: 520, kind: 'death', label: 'Смерть от LeeSin' },
      { t: 930, kind: 'kill', label: 'Убийство: Yasuo' },
      { t: 1250, kind: 'steal', label: 'Барон (украден)' },
    ],
  },
]

export function Recordings({
  settings,
  update,
  toast,
}: {
  settings: DesktopSettings | null
  update: <K extends keyof DesktopSettings>(k: K, v: DesktopSettings[K]) => void
  toast: (t: string, tone?: 'err' | 'info') => void
}) {
  const desktop = Boolean(window.rp?.rec)
  const [list, setList] = useState<Recording[] | null>(desktop ? null : DEMO)
  const [sel, setSel] = useState<string>()
  const [recording, setRecording] = useState(false)
  const [filter, setFilter] = useState<Moment['kind'] | 'all'>('all')

  const reload = () => window.rp?.rec.list().then((l) => setList(l))
  useEffect(() => {
    if (!window.rp?.rec) return
    reload()
    window.rp.rec.status().then((s) => setRecording(s.recording))
    return window.rp.rec.onState((s) => {
      setRecording(s === 'recording')
      if (s === 'idle') reload()
    })
  }, [])
  const cur = list?.find((r) => r.id === sel) ?? list?.[0]
  const used = (list ?? []).reduce((s, r) => s + r.size, 0)

  return (
    <div className="page">
      <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <h1>
          <Icon name="video" size={28} /> Записи игр
        </h1>
        <div className="rec-head-tools">
          <AnimatePresence>
            {recording && (
              <motion.span className="rec-pill" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <i /> Идёт запись
              </motion.span>
            )}
          </AnimatePresence>
          <label className="switch-row">
            <span>Записывать игры</span>
            <button
              className={`switch ${settings?.recordingEnabled ? 'on' : ''}`}
              onClick={() => (desktop ? update('recordingEnabled', !settings?.recordingEnabled) : toast('Запись работает в десктоп-версии.', 'info'))}
            >
              <motion.i layout transition={{ type: 'spring', stiffness: 500, damping: 32 }} />
            </button>
          </label>
          {desktop && (
            <button className="btn" onClick={() => window.rp?.rec.open()}>
              <Icon name="folder" size={16} /> Папка
            </button>
          )}
        </div>
      </motion.div>

      {!desktop && <div className="banner">Пример библиотеки. Запись экрана и звука работает только в десктоп-версии.</div>}

      {list && list.length === 0 ? (
        <motion.div className="card gate" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="gate-icon">
            <Icon name="video" size={28} />
          </div>
          <h2>Записей пока нет</h2>
          <p className="muted">
            Включите «Записывать игры», и программа сама начнёт запись, когда загрузится матч, и остановит её в конце. Убийства, смерти, мультикиллы и объекты
            отмечаются на шкале видео, из любого момента можно вырезать клип.
          </p>
          {!settings?.recordingEnabled && (
            <button className="btn primary" onClick={() => update('recordingEnabled', true)}>
              Включить запись
            </button>
          )}
        </motion.div>
      ) : (
        <div className="rec-layout">
          <motion.div className="rec-list" variants={stagger} initial="hidden" animate="show">
            <div className="rec-list-head muted small">
              {list?.length ?? 0} записей · {gb(used)} из {settings?.recordingMaxGB ?? 50} ГБ
            </div>
            {list?.map((r) => (
              <motion.button key={r.id} variants={fadeUp} className={`rec-item ${cur?.id === r.id ? 'on' : ''}`} onClick={() => setSel(r.id)}>
                {cur?.id === r.id && <motion.span layoutId="rec-on" className="rec-on" />}
                {r.champion ? <Champ name={r.champion} size={44} radius={11} /> : <span className="rec-blank"><Icon name="video" /></span>}
                <span className="rec-item-text">
                  <b>
                    {r.champion ? champName(r.champion) : 'Запись'}
                    {r.result && <em className={r.result === 'Win' ? 'good' : 'bad'}>{r.result === 'Win' ? 'Победа' : 'Поражение'}</em>}
                  </b>
                  <span className="muted small">
                    {dateText(r.createdAt)} · {duration(Math.round(r.duration))}
                    {r.kda && ` · ${r.kda.join('/')}`}
                  </span>
                  <span className="rec-dots">
                    {r.moments.slice(0, 14).map((m, i) => (
                      <i key={i} style={{ background: KIND[m.kind].color }} />
                    ))}
                  </span>
                </span>
              </motion.button>
            ))}
          </motion.div>
          {cur && <Player key={cur.id} rec={cur} filter={filter} setFilter={setFilter} desktop={desktop} onChanged={reload} onDeleted={() => (setSel(undefined), reload())} toast={toast} />}
        </div>
      )}
    </div>
  )
}

function Player({
  rec,
  filter,
  setFilter,
  desktop,
  onChanged,
  onDeleted,
  toast,
}: {
  rec: Recording
  filter: Moment['kind'] | 'all'
  setFilter: (f: Moment['kind'] | 'all') => void
  desktop: boolean
  onChanged: () => void
  onDeleted: () => void
  toast: (t: string, tone?: 'err' | 'info') => void
}) {
  const v = useRef<HTMLVideoElement>(null)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [src, setSrc] = useState(rec.file ? media(rec.file) : '')
  const [busy, setBusy] = useState(false)
  const len = rec.duration || 1
  const moments = rec.moments.filter((m) => filter === 'all' || m.kind === filter)

  const seek = (s: number) => {
    if (v.current) v.current.currentTime = Math.max(0, s)
    setT(Math.max(0, s))
  }
  const toggle = () => {
    const el = v.current
    if (!el || !src) return
    if (el.paused) el.play()
    else el.pause()
  }
  const clip = async (start: number, end: number, label: string) => {
    if (!desktop) return toast('Клипы сохраняются в десктоп-версии.', 'info')
    setBusy(true)
    try {
      await window.rp!.rec.clip(rec.id, start, end, label)
      toast('Клип сохранён', 'info')
      onChanged()
    } catch (e) {
      toast(`Не удалось сохранить клип: ${String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div className="card rec-player" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }}>
      <div className="video-box" onClick={toggle}>
        {src ? (
          <video
            ref={v}
            src={src}
            onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            preload="metadata"
          />
        ) : (
          <div className="video-empty">
            <Icon name="video" size={40} />
            <span>Здесь будет видео матча</span>
          </div>
        )}
        <AnimatePresence>
          {!playing && src && (
            <motion.span className="video-play" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.2 }}>
              <Icon name="play" size={34} />
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="timeline">
        <div
          className="timeline-track"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            seek(((e.clientX - r.left) / r.width) * len)
          }}
        >
          <span className="timeline-fill" style={{ width: `${(t / len) * 100}%` }} />
          {moments.map((m, i) => (
            <motion.i
              key={i}
              className="timeline-mark"
              title={`${duration(Math.round(m.t))} ${m.label}`}
              style={{ left: `${(m.t / len) * 100}%`, background: KIND[m.kind].color }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: 0.2 + i * 0.03 }}
              onClick={(e) => {
                e.stopPropagation()
                seek(m.t - 5)
              }}
            />
          ))}
        </div>
        <div className="timeline-row">
          <button className="icon-btn" onClick={toggle}>
            <Icon name={playing ? 'pause' : 'play'} size={16} />
          </button>
          <span className="muted small">
            {duration(Math.round(t))} / {duration(Math.round(len))}
          </span>
          <span className="grow" />
          <button className="btn small" disabled={busy || !src} onClick={() => clip(Math.max(0, t - 15), t + 5, '')}>
            <Icon name="scissors" size={14} /> Клип последних 20 с
          </button>
          {desktop && (
            <>
              <button className="icon-btn" title="Показать в папке" onClick={() => window.rp?.rec.open(rec.file)}>
                <Icon name="folder" size={16} />
              </button>
              <button
                className="icon-btn danger"
                title="Удалить запись"
                onClick={async () => {
                  if (!confirm('Удалить эту запись?')) return
                  await window.rp?.rec.remove(rec.id)
                  onDeleted()
                }}
              >
                <Icon name="trash" size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="moments-head">
        <h3 className="card-title">Моменты</h3>
        <div className="moment-filters">
          {(['all', ...Object.keys(KIND)] as const).map((k) => {
            const n = k === 'all' ? rec.moments.length : rec.moments.filter((m) => m.kind === k).length
            if (!n) return null
            return (
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k as Moment['kind'] | 'all')}>
                {k !== 'all' && <i style={{ background: KIND[k as Moment['kind']].color }} />}
                {k === 'all' ? 'Все' : KIND[k as Moment['kind']].label} <em>{n}</em>
              </button>
            )
          })}
        </div>
      </div>
      <div className="moments">
        {moments.map((m, i) => (
          <motion.div key={i} className="moment" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.025 }}>
            <i style={{ background: KIND[m.kind].color }} />
            <button className="moment-time" onClick={() => seek(m.t - 5)}>
              {duration(Math.round(m.t))}
            </button>
            <span>{m.label}</span>
            <button className="link-btn" disabled={busy} onClick={() => clip(Math.max(0, m.t - 10), m.t + 6, m.label)}>
              <Icon name="scissors" size={13} /> Клип
            </button>
          </motion.div>
        ))}
        {!moments.length && <p className="muted small">Моментов нет.</p>}
      </div>

      {rec.clips.length > 0 && (
        <>
          <h3 className="card-title">Клипы</h3>
          <div className="clips">
            {rec.clips.map((c) => (
              <button key={c.file} className="clip" onClick={() => setSrc(media('clips/' + c.file))}>
                <Icon name="play" size={14} />
                <span>{c.label || `Клип ${duration(Math.round(c.start))}`}</span>
                <em className="muted">{Math.round(c.end - c.start)} с</em>
              </button>
            ))}
            {src !== media(rec.file) && rec.file && (
              <button className="clip" onClick={() => setSrc(media(rec.file))}>
                <Icon name="left" size={14} /> Вся игра
              </button>
            )}
          </div>
        </>
      )}
      {rec.error && <p className="small bad">Запись прервалась: {rec.error}</p>}
    </motion.div>
  )
}
