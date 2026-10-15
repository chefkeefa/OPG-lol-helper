// Data Studio catalogue: how Master+ games go as a whole, from the collector's world() numbers.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { WorldData, WorldSums } from '../lib/statsTypes'
import { ROLE_LABEL, hasCollector, pct, statsStatus, statsWorld } from '../lib/statsApi'
import { loadApex, demoApex, type Apex } from '../api/leaderboard'
import { champName, profileIcon, rankEmblem } from '../lib/ddragon'
import { SPELL_FALLBACK, spellIcon, useGameData } from '../lib/gameData'
import { RoleIcon } from '../components/RoleIcon'
import { Champ, Counter, Icon, Img, Skeleton, ease, fadeUp, stagger } from '../components/ui'
import { fmtNum, t } from '../lib/i18n'

type Section = 'overview' | 'match' | 'mech' | 'combat' | 'lane' | 'obj'
const SECTIONS: { id: Section; label: string; color: string }[] = [
  { id: 'overview', label: t('Обзор'), color: '#7f82f6' },
  { id: 'match', label: t('Матч'), color: '#f6c94e' },
  { id: 'mech', label: t('Механика и заклинания'), color: '#4fd1c5' },
  { id: 'combat', label: t('Бой'), color: '#f0545c' },
  { id: 'lane', label: t('Линия и фарм'), color: '#8fdc7a' },
  { id: 'obj', label: t('Объекты и обзор'), color: '#b77bff' },
]
const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']

const f1 = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const f2 = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })
const fp = (v: number) => pct(v)
const mmss = (sec: number) => {
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const per = (n: number, d: number) => (d ? n / d : 0)

interface ChampMetric {
  /** value of a champion or role, from its totals */
  get: (s: WorldSums) => number
  fmt: (v: number) => string
  /** how many games a champion needs to be listed */
  sample?: (s: WorldSums) => number
  unit: string
  /** what the two lists are called */
  hi?: string
  lo?: string
}

interface StatDef {
  id: string
  section: Section
  icon: Parameters<typeof Icon>[0]['name']
  title: string
  sub: string
  /** the number on the card and in the header */
  head: (w: WorldData) => string
  metric?: ChampMetric
}

const tot = (w: WorldData) => sumAll(Object.values(w.roles))
function sumAll(list: WorldSums[]): WorldSums {
  const out = {} as WorldSums
  for (const s of list) for (const [k, v] of Object.entries(s)) out[k as keyof WorldSums] = (out[k as keyof WorldSums] ?? 0) + v
  return out
}

const champMetric = (get: (s: WorldSums) => number, fmt: (v: number) => string, unit: string, extra: Partial<ChampMetric> = {}): ChampMetric => ({ get, fmt, unit, ...extra })

const STATS: StatDef[] = [
  { id: 'ladder', section: 'overview', icon: 'trophy', title: t('Вершина ладдера'), sub: t('Master, Grandmaster и Challenger'), head: () => '' },
  { id: 'icons', section: 'overview', icon: 'star', title: t('Иконки профиля'), sub: t('Самые популярные у игроков'), head: (w) => t('{n} разных', { n: fmtNum(Object.keys(w.icons).length) }) },
  { id: 'level', section: 'overview', icon: 'medal', title: t('Уровень призывателя'), sub: t('Сколько наиграли до Master+'), head: (w) => t('медиана {n}', { n: median(w.level) }) },
  { id: 'bans', section: 'overview', icon: 'close', title: t('Чаще всего банят'), sub: t('Доля игр с баном чемпиона'), head: (w) => topBan(w) },
  { id: 'hour', section: 'overview', icon: 'clock', title: t('Когда играют'), sub: t('По часам и дням недели (ваше время)'), head: (w) => peakHour(w) },

  { id: 'duration', section: 'match', icon: 'clock', title: t('Длительность игры'), sub: t('Средняя и распределение'), head: (w) => mmss(per(w.durSum, w.games)) },
  {
    id: 'early', section: 'match', icon: 'bolt', title: t('Короткие игры'), sub: t('Меньше 22 минут'), head: (w) => fp(per(w.early, w.games)),
    metric: champMetric((s) => per(s.ew, s.eg), fp, t('побед в коротких играх'), { sample: (s) => s.eg, hi: t('Сильнее всех в начале'), lo: t('Слабее всех в начале') }),
  },
  {
    id: 'late', section: 'match', icon: 'shield', title: t('Долгие игры'), sub: t('Больше 35 минут'), head: (w) => fp(per(w.late, w.games)),
    metric: champMetric((s) => per(s.lw, s.lg), fp, t('побед в долгих играх'), { sample: (s) => s.lg, hi: t('Сильнее всех в поздней игре'), lo: t('Слабее всех в поздней игре') }),
  },
  {
    id: 'surrWin', section: 'match', icon: 'flag', title: t('Победы сдачей'), sub: t('Соперники сдались'), head: (w) => fp(per(w.surr, w.games)),
    metric: champMetric((s) => per(s.sw, s.w), fp, t('побед — сдача соперника'), { sample: (s) => s.w, hi: t('Чаще всего заставляют сдаться'), lo: t('Реже всего') }),
  },
  {
    id: 'surrLose', section: 'match', icon: 'flag', title: t('Поражения сдачей'), sub: t('Доля игр со сдачей до 21 минуты'), head: (w) => fp(per(w.earlySurr, w.games)),
    metric: champMetric((s) => per(s.sl, s.g - s.w), fp, t('поражений — своя сдача'), { sample: (s) => s.g - s.w, hi: t('Команда сдаётся чаще всего'), lo: t('Команда держится дольше всех') }),
  },

  {
    id: 'pings', section: 'mech', icon: 'target', title: t('Пинги'), sub: t('Сколько и каких меток ставят'), head: (w) => t('{n} за игру', { n: f1(per(tot(w).pings, tot(w).g)) }),
    metric: champMetric((s) => per(s.pings, s.g), f1, t('пингов за игру'), { hi: t('Пингуют больше всех'), lo: t('Пингуют меньше всех') }),
  },
  {
    id: 'casts', section: 'mech', icon: 'wand', title: t('Умения'), sub: t('Применений в минуту'), head: (w) => f1(per(tot(w).casts, tot(w).min)),
    metric: champMetric((s) => per(s.casts, s.min), f1, t('умений в минуту')),
  },
  {
    id: 'dodged', section: 'mech', icon: 'sparkle', title: t('Увороты'), sub: t('Скиллшотов за игру'), head: (w) => f1(per(tot(w).dodged, tot(w).g)),
    metric: champMetric((s) => per(s.dodged, s.g), f1, t('уворотов за игру'), { hi: t('Уворачиваются чаще всех'), lo: t('Уворачиваются реже всех') }),
  },
  { id: 'flash', section: 'mech', icon: 'bolt', title: t('Флэш: D или F'), sub: t('На какой клавише держат'), head: (w) => `D ${fp(per(w.flash.D[0], w.flash.D[0] + w.flash.F[0]))}` },
  { id: 'spells', section: 'mech', icon: 'layers', title: t('Пары заклинаний'), sub: t('Популярность и винрейт'), head: (w) => t('{n} пар', { n: Object.keys(w.pairs).length }) },

  { id: 'kda', section: 'combat', icon: 'swords', title: 'KDA', sub: t('Убийства и помощь на смерть'), head: (w) => f2(kda(tot(w))), metric: champMetric(kda, f2, 'KDA') },
  { id: 'kills', section: 'combat', icon: 'swords', title: t('Убийства'), sub: t('За игру'), head: (w) => f1(per(tot(w).k, tot(w).g)), metric: champMetric((s) => per(s.k, s.g), f1, t('убийств за игру')) },
  {
    id: 'solo', section: 'combat', icon: 'target', title: t('Соло-убийства'), sub: t('Один на один'), head: (w) => f2(per(tot(w).solo, tot(w).g)),
    metric: champMetric((s) => per(s.solo, s.g), f2, t('соло-убийств за игру')),
  },
  {
    id: 'deaths', section: 'combat', icon: 'close', title: t('Смерти'), sub: t('За игру'), head: (w) => f1(per(tot(w).d, tot(w).g)),
    metric: champMetric((s) => per(s.d, s.g), f1, t('смертей за игру'), { hi: t('Умирают чаще всех'), lo: t('Умирают реже всех') }),
  },
  {
    id: 'dead', section: 'combat', icon: 'clock', title: t('Время смерти'), sub: t('Сколько игры провели мёртвым'), head: (w) => mmss(per(tot(w).dead, tot(w).g)),
    metric: champMetric((s) => per(s.dead, s.g), mmss, t('мёртвым за игру')),
  },
  {
    id: 'fb', section: 'combat', icon: 'bolt', title: t('Первая кровь'), sub: t('Побед у команды, взявшей её'), head: (w) => fp(wr(w.first.blood)),
    metric: champMetric((s) => per(s.fb, s.g), fp, t('игр с первой кровью')),
  },
  {
    id: 'penta', section: 'combat', icon: 'star', title: t('Пентакиллы'), sub: t('На 1000 игр чемпиона'), head: (w) => f2(per(tot(w).penta, tot(w).g) * 1000),
    metric: champMetric((s) => per(s.penta, s.g) * 1000, f2, t('пентакиллов на 1000 игр'), { lo: t('Реже всех') }),
  },

  { id: 'cs', section: 'lane', icon: 'chart', title: t('CS в минуту'), sub: t('Миньоны и лесные монстры'), head: (w) => f1(per(tot(w).cs, tot(w).min)), metric: champMetric((s) => per(s.cs, s.min), f1, t('CS в минуту')) },
  {
    id: 'plates', section: 'lane', icon: 'shield', title: t('Пластины'), sub: t('Снятых пластин башен за игру'), head: (w) => f2(per(tot(w).plates, tot(w).g)),
    metric: champMetric((s) => per(s.plates, s.g), f2, t('пластин за игру')),
  },
  {
    id: 'jungle', section: 'lane', icon: 'grid', title: t('Лес к 10 минуте'), sub: t('Лесных монстров у лесников'), head: (w) => f1(per(w.roles.JUNGLE?.jcs ?? 0, w.roles.JUNGLE?.g ?? 0)),
    metric: champMetric((s) => per(s.jcs, s.g), f1, t('монстров к 10 минуте'), { sample: (s) => (s.jcs > s.g * 20 ? s.g : 0), hi: t('Быстрее всех чистят лес'), lo: t('Медленнее всех') }),
  },

  { id: 'first', section: 'obj', icon: 'flag', title: t('Первые объекты'), sub: t('Как часто они решают игру'), head: (w) => t('башня {n}', { n: fp(wr(w.first.tower)) }) },
  {
    id: 'vision', section: 'obj', icon: 'eye', title: t('Обзор'), sub: t('Очков обзора в минуту'), head: (w) => f2(per(tot(w).vision, tot(w).min)),
    metric: champMetric((s) => per(s.vision, s.min), f2, t('обзора в минуту')),
  },
  {
    id: 'cw', section: 'obj', icon: 'eye', title: t('Контрольные тотемы'), sub: t('Поставлено за игру'), head: (w) => f1(per(tot(w).cw, tot(w).g)),
    metric: champMetric((s) => per(s.cw, s.g), f1, t('тотемов за игру')),
  },
]

function kda(s: WorldSums) {
  return (s.k + s.a) / Math.max(1, s.d)
}
const wr = (p?: [number, number]) => (p && p[0] ? p[1] / p[0] : 0)
function median(h: Record<string, number>) {
  const list = Object.entries(h).map(([k, v]) => [+k, v]).sort((a, b) => a[0] - b[0])
  const total = list.reduce((s, [, v]) => s + v, 0)
  let acc = 0
  for (const [k, v] of list) if ((acc += v) >= total / 2) return k + 25
  return 0
}
function topBan(w: WorldData) {
  const top = Object.entries(w.bans).sort((a, b) => b[1] - a[1])[0]
  return top ? `${champName(top[0])} ${fp(per(top[1], w.matches))}` : '—'
}
function peakHour(w: WorldData) {
  const top = Object.entries(w.hour).sort((a, b) => b[1] - a[1])[0]
  return top ? t('пик в {h}:00', { h: top[0] }) : '—'
}

export function StudioCatalog() {
  const [demo, setDemo] = useState(!hasCollector())
  const [w, setW] = useState<WorldData | null>(null)
  const [view, setView] = useState<string>('home')
  const [platform, setPlatform] = useState('euw1')

  useEffect(() => {
    let on = true
    statsWorld(demo).then((d) => on && setW(d))
    if (!demo) statsStatus().then((s) => on && setPlatform(s.platform))
    const off = !demo ? window.rp?.stats.onUpdate(() => statsWorld(false).then((d) => on && setW(d))) : undefined
    return () => {
      on = false
      off?.()
    }
  }, [demo])

  const open = (id: string) => {
    setView(id)
    document.querySelector('main.main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const stat = STATS.find((s) => s.id === view)

  if (!w)
    return (
      <div className="ds">
        <Skeleton h={420} r={14} />
      </div>
    )

  if (w.games < 30 && !demo)
    return (
      <div className="card ds-empty">
        <Icon name="pie" size={34} />
        <b>{t('Каталог наполняется')}</b>
        <p className="muted">{t('Сборщик статистики считает игры Master+ в фоне. Для каталога нужно хотя бы 30 игр, сейчас {n}. Включите сбор в настройках, если он выключен.', { n: w.games })}</p>
        <button className="btn" onClick={() => setDemo(true)}>
          {t('Показать пример')}
        </button>
      </div>
    )

  return (
    <div className="ds">
      <nav className="ds-nav">
        <button className={`ds-nav-home ${view === 'home' ? 'on' : ''}`} onClick={() => open('home')}>
          {t('Все разделы')}
        </button>
        {SECTIONS.map((sec) => (
          <div key={sec.id} className="ds-nav-sec" style={{ ['--sec' as string]: sec.color }}>
            <span>{sec.label}</span>
            {STATS.filter((s) => s.section === sec.id).map((s) => (
              <button key={s.id} className={view === s.id ? 'on' : ''} onClick={() => open(s.id)}>
                {view === s.id && <motion.i layoutId="ds-nav-dot" className="ds-nav-dot" />}
                {s.title}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="ds-main">
        {demo && (
          <div className="banner">
            {t('Пример данных.')}{' '}
            {hasCollector() && (
              <button className="link-btn" onClick={() => setDemo(false)}>
                {t('Вернуть мои данные')}
              </button>
            )}
          </div>
        )}
        <AnimatePresence mode="wait">
          {!stat ? (
            <motion.div key="home" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease }}>
              <Home w={w} onOpen={open} />
            </motion.div>
          ) : (
            <motion.div key={stat.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease }}>
              <StatView def={stat} w={w} platform={platform} demo={demo} onBack={() => open('home')} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function Home({ w, onOpen }: { w: WorldData; onOpen: (id: string) => void }) {
  const T = tot(w)
  return (
    <div className="ds-home">
      <div className="ds-hero">
        <h2>{t('Как играют на Master+')}</h2>
        <p className="muted">{t('{n} игр одиночной очереди · патчи {p}', { n: fmtNum(w.games), p: w.patches.join(', ') || '—' })}</p>
        <div className="ds-hero-stats">
          <HeroStat label={t('Средняя игра')} value={mmss(per(w.durSum, w.games))} />
          <HeroStat label={t('Кончаются сдачей')} value={fp(per(w.surr, w.games))} />
          <HeroStat label="KDA" value={f2(kda(T))} />
          <HeroStat label={t('Флэш на D')} value={fp(per(w.flash.D[0], w.flash.D[0] + w.flash.F[0]))} />
        </div>
      </div>
      {SECTIONS.map((sec) => (
        <section key={sec.id} className="ds-sec" style={{ ['--sec' as string]: sec.color }}>
          <h3>{sec.label}</h3>
          <motion.div className="ds-cards" variants={stagger} initial="hidden" animate="show">
            {STATS.filter((s) => s.section === sec.id).map((s) => (
              <motion.button key={s.id} variants={fadeUp} className="ds-card" whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }} onClick={() => onOpen(s.id)}>
                <span className="ds-card-ico">
                  <Icon name={s.icon} size={20} />
                </span>
                <span className="ds-card-text">
                  <b>{s.title}</b>
                  <em>{s.sub}</em>
                </span>
                {s.head(w) && <strong>{s.head(w)}</strong>}
                <Icon name="right" size={16} />
              </motion.button>
            ))}
          </motion.div>
        </section>
      ))}
    </div>
  )
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ds-hero-stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

function StatView({ def, w, platform, demo, onBack }: { def: StatDef; w: WorldData; platform: string; demo: boolean; onBack: () => void }) {
  const sec = SECTIONS.find((s) => s.id === def.section)!
  const head = def.head(w)
  let body: ReactNode = null
  if (def.id === 'ladder') body = <Ladder platform={platform} demo={demo} />
  else if (def.id === 'icons') body = <Icons w={w} />
  else if (def.id === 'level') body = <Hist data={Object.entries(w.level).map(([k, v]) => ({ k, label: +k >= 1000 ? '1000+' : k, v }))} fmt={(v) => fmtNum(v)} unit={t('игроков')} />
  else if (def.id === 'bans') body = <Bans w={w} />
  else if (def.id === 'hour') body = <Hours w={w} />
  else if (def.id === 'duration') body = <Duration w={w} />
  else if (def.id === 'flash') body = <Flash w={w} />
  else if (def.id === 'spells') body = <Spells w={w} />
  else if (def.id === 'first') body = <Firsts w={w} />
  return (
    <div className="ds-stat" style={{ ['--sec' as string]: sec.color }}>
      <button className="link-btn ds-back" onClick={onBack}>
        <Icon name="left" size={14} /> {t('Все разделы')}
      </button>
      <div className="ds-stat-head">
        <span className="ds-card-ico big">
          <Icon name={def.icon} size={26} />
        </span>
        <div>
          <em>{sec.label}</em>
          <h2>{def.title}</h2>
          <p className="muted">{def.sub}</p>
        </div>
        {head && <strong className="ds-stat-num">{head}</strong>}
      </div>
      {def.id === 'pings' && <Pings w={w} />}
      {body}
      {def.metric && <ChampBoard w={w} m={def.metric} />}
    </div>
  )
}

/** Value by role, then the champions with the highest and lowest value. */
function ChampBoard({ w, m }: { w: WorldData; m: ChampMetric }) {
  const total = tot(w)
  const minG = Math.max(15, (total.g / 10) * 0.004)
  const rows = Object.entries(w.champs)
    .filter(([, s]) => (m.sample ? m.sample(s) : s.g) >= minG * (m.sample ? 0.3 : 1))
    .map(([champ, s]) => ({ champ, v: m.get(s), g: s.g }))
    .sort((a, b) => b.v - a.v)
  const roles = ROLES.filter((r) => w.roles[r]).map((r) => ({ r, v: m.get(w.roles[r]) }))
  const maxRole = Math.max(...roles.map((x) => x.v), 1e-9)
  const max = Math.max(...rows.map((x) => x.v), 1e-9)
  return (
    <>
      <div className="card ds-roles">
        <h4>{t('По ролям')}</h4>
        <div className="ds-role-bars">
          {roles.map((x, i) => (
            <div key={x.r} className="ds-role-bar">
              <span className="ds-role-name">
                <RoleIcon role={x.r} size={18} /> {ROLE_LABEL[x.r]}
              </span>
              <span className="ds-track">
                <motion.i initial={{ width: 0 }} animate={{ width: `${(x.v / maxRole) * 100}%` }} transition={{ duration: 0.7, ease, delay: i * 0.05 }} />
              </span>
              <b>{m.fmt(x.v)}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="ds-lists">
        <ChampList title={m.hi ?? t('Больше всего')} rows={rows.slice(0, 10)} max={max} m={m} />
        <ChampList title={m.lo ?? t('Меньше всего')} rows={rows.slice(-10).reverse()} max={max} m={m} />
      </div>
      <p className="muted small">{t('Чемпионы с выборкой от {n} игр. Значение: {unit}.', { n: Math.round(minG), unit: m.unit })}</p>
    </>
  )
}

function ChampList({ title, rows, max, m }: { title: string; rows: { champ: string; v: number; g: number }[]; max: number; m: ChampMetric }) {
  return (
    <div className="card ds-list">
      <h4>{title}</h4>
      <motion.ol variants={stagger} initial="hidden" animate="show">
        {rows.map((r, i) => (
          <motion.li key={r.champ} variants={fadeUp}>
            <span className="ds-rank">{i + 1}</span>
            <Champ name={r.champ} size={30} />
            <span className="ds-list-name">
              <b>{champName(r.champ)}</b>
              <em>{t('{n} игр', { n: fmtNum(r.g) })}</em>
            </span>
            <span className="ds-track thin">
              <motion.i initial={{ width: 0 }} animate={{ width: `${Math.max(3, (r.v / max) * 100)}%` }} transition={{ duration: 0.7, ease, delay: i * 0.03 }} />
            </span>
            <strong>{m.fmt(r.v)}</strong>
          </motion.li>
        ))}
      </motion.ol>
    </div>
  )
}

/** Vertical bars with a label under each; `mark` highlights some keys. */
function Hist({ data, fmt, unit, mark, height = 220 }: { data: { k: string; label: string; v: number }[]; fmt: (v: number) => string; unit: string; mark?: (k: string) => boolean; height?: number }) {
  const max = Math.max(...data.map((d) => d.v), 1)
  const total = data.reduce((s, d) => s + d.v, 0)
  const [hover, setHover] = useState<number | null>(null)
  const h = hover === null ? null : data[hover]
  return (
    <div className="card ds-hist">
      <div className="ds-hist-tip">{h ? `${h.label}: ${fmt(h.v)} ${unit} · ${fp(per(h.v, total))}` : ' '}</div>
      <div className="ds-hist-bars" style={{ height }} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <div key={d.k} className={`ds-hcol ${mark?.(d.k) ? 'mark' : ''} ${hover === i ? 'on' : ''}`} onMouseEnter={() => setHover(i)}>
            <motion.i initial={{ height: 0 }} animate={{ height: `${(d.v / max) * 100}%` }} transition={{ duration: 0.6, ease, delay: i * 0.012 }} />
          </div>
        ))}
      </div>
      <div className="ds-hist-labels">
        {data.map((d, i) => (
          <span key={d.k}>{i % Math.ceil(data.length / 12) === 0 ? d.label : ''}</span>
        ))}
      </div>
    </div>
  )
}

function Duration({ w }: { w: WorldData }) {
  const data = Object.entries(w.dur)
    .map(([k, v]) => ({ k, label: +k >= 50 ? '50+' : k, v }))
    .sort((a, b) => +a.k - +b.k)
  return (
    <>
      <div className="ds-kpis">
        <Kpi label={t('Средняя игра')} value={mmss(per(w.durSum, w.games))} />
        <Kpi label={t('Короче 22 минут')} value={fp(per(w.early, w.games))} />
        <Kpi label={t('Дольше 35 минут')} value={fp(per(w.late, w.games))} />
        <Kpi label={t('Сдались до 21 минуты')} value={fp(per(w.earlySurr, w.games))} />
      </div>
      <Hist data={data} fmt={fmtNum} unit={t('игр')} mark={(k) => k === '15' || k === '20'} />
      <p className="muted small">{t('Пики на 15 и 20 минутах — это сдачи: раньше голосовать нельзя.')}</p>
    </>
  )
}

function Kpi({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card ds-kpi">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

const DAYS = [t('Пн'), t('Вт'), t('Ср'), t('Чт'), t('Пт'), t('Сб'), t('Вс')]
function Hours({ w }: { w: WorldData }) {
  const hours = Array.from({ length: 24 }, (_, h) => ({ k: String(h), label: `${h}:00`, v: w.hour[h] ?? 0 }))
  const days = DAYS.map((label, i) => ({ k: String((i + 1) % 7), label, v: w.day[(i + 1) % 7] ?? 0 }))
  const dmax = Math.max(...days.map((d) => d.v), 1)
  return (
    <>
      <Hist data={hours} fmt={fmtNum} unit={t('игр')} />
      <div className="card ds-days">
        {days.map((d, i) => (
          <div key={d.k} className="ds-day">
            <span className="ds-day-bar">
              <motion.i initial={{ scaleY: 0 }} animate={{ scaleY: d.v / dmax }} transition={{ duration: 0.6, ease, delay: i * 0.05 }} />
            </span>
            <b>{d.label}</b>
            <em>{fp(per(d.v, w.games))}</em>
          </div>
        ))}
      </div>
    </>
  )
}

function Icons({ w }: { w: WorldData }) {
  const total = Object.values(w.icons).reduce((s, [n]) => s + n, 0)
  const list = Object.entries(w.icons)
    .sort((a, b) => b[1][0] - a[1][0])
    .slice(0, 24)
  return (
    <motion.div className="ds-icons" variants={stagger} initial="hidden" animate="show">
      {list.map(([id, [n]], i) => (
        <motion.div key={id} variants={fadeUp} className="card ds-icon">
          <span className="ds-rank">{i + 1}</span>
          <Img src={profileIcon(+id)} alt="" size={64} radius={14} />
          <b>{fp(per(n, total))}</b>
          <em>{t('{n} раз', { n: fmtNum(n) })}</em>
        </motion.div>
      ))}
    </motion.div>
  )
}

function Bans({ w }: { w: WorldData }) {
  const list = Object.entries(w.bans)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([champ, n]) => ({ champ, v: per(n, w.matches), g: n }))
  const max = Math.max(...list.map((r) => r.v), 1e-9)
  return <ChampList title={t('Доля игр с баном')} rows={list} max={max} m={{ get: () => 0, fmt: fp, unit: '' }} />
}

function Flash({ w }: { w: WorldData }) {
  const all = w.flash.D[0] + w.flash.F[0]
  const d = per(w.flash.D[0], all)
  return (
    <>
      <div className="card ds-flash">
        <div className="ds-flash-keys">
          <span className="ds-key">
            <kbd>D</kbd>
            <b>
              <Counter value={d * 100} format={(v) => `${v.toFixed(1)}%`} />
            </b>
            <em>{t('винрейт {wr}', { wr: fp(wr(w.flash.D)) })}</em>
          </span>
          <span className="ds-key r">
            <kbd>F</kbd>
            <b>
              <Counter value={(1 - d) * 100} format={(v) => `${v.toFixed(1)}%`} />
            </b>
            <em>{t('винрейт {wr}', { wr: fp(wr(w.flash.F)) })}</em>
          </span>
        </div>
        <div className="ds-split">
          <motion.i className="d" initial={{ width: '50%' }} animate={{ width: `${d * 100}%` }} transition={{ duration: 0.9, ease }} />
          <i className="f" />
        </div>
        <p className="muted small">{t('Доля игроков с Флэшем, которые держат его на D или на F. Игроки без Флэша не считаются.')}</p>
      </div>
      <div className="card ds-roles">
        <h4>{t('По ролям')}</h4>
        <div className="ds-role-bars">
          {ROLES.filter((r) => w.flash.role[r]).map((r, i) => {
            const x = w.flash.role[r]
            const share = per(x.D, x.D + x.F)
            return (
              <div key={r} className="ds-role-bar">
                <span className="ds-role-name">
                  <RoleIcon role={r} size={18} /> {ROLE_LABEL[r]}
                </span>
                <span className="ds-split small">
                  <motion.i className="d" initial={{ width: '50%' }} animate={{ width: `${share * 100}%` }} transition={{ duration: 0.8, ease, delay: i * 0.05 }} />
                  <i className="f" />
                </span>
                <b>
                  D {pct(share, 0)} · F {pct(1 - share, 0)}
                </b>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function Spells({ w }: { w: WorldData }) {
  const gd = useGameData()
  const all = Object.values(w.pairs).reduce((s, [n]) => s + n, 0)
  const list = Object.entries(w.pairs)
    .sort((a, b) => b[1][0] - a[1][0])
    .slice(0, 12)
  const max = Math.max(...list.map(([, [n]]) => n), 1)
  const icon = (id: number) => <Img src={spellIcon(gd?.spells[id]?.id ?? SPELL_FALLBACK[id] ?? 'SummonerFlash', gd?.version ?? '')} alt={gd?.spells[id]?.name ?? ''} size={30} radius={7} />
  return (
    <div className="card ds-list">
      <h4>{t('Самые частые пары')}</h4>
      <motion.ol variants={stagger} initial="hidden" animate="show">
        {list.map(([key, p], i) => {
          const [a, b] = key.split('.').map(Number)
          return (
            <motion.li key={key} variants={fadeUp}>
              <span className="ds-rank">{i + 1}</span>
              <span className="ds-pair">
                {icon(a)}
                {icon(b)}
              </span>
              <span className="ds-list-name">
                <b>
                  {gd?.spells[a]?.name ?? a} + {gd?.spells[b]?.name ?? b}
                </b>
                <em>{t('винрейт {wr}', { wr: fp(wr(p)) })}</em>
              </span>
              <span className="ds-track thin">
                <motion.i initial={{ width: 0 }} animate={{ width: `${(p[0] / max) * 100}%` }} transition={{ duration: 0.7, ease, delay: i * 0.03 }} />
              </span>
              <strong>{fp(per(p[0], all))}</strong>
            </motion.li>
          )
        })}
      </motion.ol>
    </div>
  )
}

const PING_LABEL: Record<string, string> = {
  basicPings: t('Простая метка'),
  onMyWayPings: t('Уже иду'),
  enemyMissingPings: t('Враг пропал'),
  dangerPings: t('Опасность'),
  assistMePings: t('Нужна помощь'),
  pushPings: t('Пушить'),
  getBackPings: t('Назад'),
  enemyVisionPings: t('Вражеский тотем'),
  allInPings: t('Все в атаку'),
  needVisionPings: t('Нужен обзор'),
  holdPings: t('Держать'),
  commandPings: t('Команда'),
  visionClearedPings: t('Обзор зачищен'),
  retreatPings: t('Отступаем'),
}
function Pings({ w }: { w: WorldData }) {
  const players = tot(w).g || 1
  const list = Object.entries(w.pings)
    .filter(([k]) => PING_LABEL[k])
    .map(([k, v]) => ({ k, v: v / players }))
    .sort((a, b) => b.v - a.v)
  const max = Math.max(...list.map((x) => x.v), 1e-9)
  return (
    <div className="card ds-roles">
      <h4>{t('Пингов одного игрока за игру')}</h4>
      <div className="ds-role-bars">
        {list.map((x, i) => (
          <div key={x.k} className="ds-role-bar">
            <span className="ds-role-name">{PING_LABEL[x.k]}</span>
            <span className="ds-track">
              <motion.i initial={{ width: 0 }} animate={{ width: `${(x.v / max) * 100}%` }} transition={{ duration: 0.7, ease, delay: i * 0.03 }} />
            </span>
            <b>{f2(x.v)}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

const FIRST_LABEL: Record<string, string> = {
  blood: t('Первая кровь'),
  tower: t('Первая башня'),
  dragon: t('Первый дракон'),
  grubs: t('Первые личинки'),
  herald: t('Герольд'),
  atakhan: t('Атакан'),
  baron: t('Первый барон'),
  inhib: t('Первый ингибитор'),
}
function Firsts({ w }: { w: WorldData }) {
  const list = Object.keys(FIRST_LABEL)
    .filter((k) => w.first[k]?.[0])
    .map((k) => ({ k, wr: wr(w.first[k]), share: per(w.first[k][0], w.games) }))
  return (
    <motion.div className="ds-firsts" variants={stagger} initial="hidden" animate="show">
      {list.map((x) => (
        <motion.div key={x.k} variants={fadeUp} className="card ds-first">
          <span className="ds-ring" style={{ ['--p' as string]: x.wr }}>
            <b>{pct(x.wr, 0)}</b>
          </span>
          <span>
            <b>{FIRST_LABEL[x.k]}</b>
            <em>{t('команда побеждает в {wr} игр', { wr: pct(x.wr, 0) })}</em>
            {x.share < 0.99 && <em>{t('случается в {p} игр', { p: pct(x.share, 0) })}</em>}
          </span>
        </motion.div>
      ))}
    </motion.div>
  )
}

const TIER_COLOR: Record<string, string> = { challenger: '#f4c874', grandmaster: '#ff5c6c', master: '#b77bff' }
function Ladder({ platform, demo }: { platform: string; demo: boolean }) {
  const [apex, setApex] = useState<Apex | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (demo || !window.rp) {
      setApex(demoApex())
      return
    }
    loadApex(platform, 'RANKED_SOLO_5x5')
      .then(setApex)
      .catch((e) => setErr(e.message))
  }, [platform, demo])
  const tiers = useMemo(() => {
    if (!apex) return []
    return (['challenger', 'grandmaster', 'master'] as const).map((tier) => {
      const list = apex.all.filter((e) => e.tier === tier)
      const games = list.reduce((s, e) => s + e.wins + e.losses, 0)
      const wins = list.reduce((s, e) => s + e.wins, 0)
      return { tier, n: list.length, games: per(games, list.length), wr: per(wins, games) }
    })
  }, [apex])
  if (err) return <p className="muted">{err}</p>
  if (!apex) return <Skeleton h={300} r={14} />
  const step = 100
  const top = Math.max(...apex.all.map((e) => e.leaguePoints), 0)
  const buckets = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => {
    const list = apex.all.filter((e) => Math.floor(e.leaguePoints / step) === i)
    return { k: String(i * step), label: String(i * step), v: list.length }
  })
  const cut = apex.cutoff
  return (
    <>
      <motion.div className="ds-ladder" variants={stagger} initial="hidden" animate="show">
        {tiers.map((x) => (
          <motion.div key={x.tier} variants={fadeUp} className="card ds-tier" style={{ ['--tier' as string]: TIER_COLOR[x.tier] }}>
            <Img src={rankEmblem(x.tier)} alt="" size={58} radius={0} />
            <span>
              <em>{x.tier.toUpperCase()}</em>
              <b>
                <Counter value={x.n} format={(v) => fmtNum(Math.round(v))} />
              </b>
              <small>
                {t('{n} игр в среднем', { n: Math.round(x.games) })} · {t('винрейт {wr}', { wr: fp(x.wr) })}
              </small>
              {x.tier !== 'master' && cut[x.tier] != null && <small>{t('порог {lp} LP', { lp: fmtNum(cut[x.tier]!) })}</small>}
            </span>
          </motion.div>
        ))}
      </motion.div>
      <Hist data={buckets} fmt={fmtNum} unit={t('игроков')} mark={(k) => (cut.grandmaster != null && +k <= cut.grandmaster && +k + step > cut.grandmaster) || (cut.challenger != null && +k <= cut.challenger && +k + step > cut.challenger)} />
      <p className="muted small">{t('Игроки по LP, шаг 100. Отмечены пороги Grandmaster и Challenger. Ниже Master Riot не отдаёт всю лестницу целиком.')}</p>
    </>
  )
}
