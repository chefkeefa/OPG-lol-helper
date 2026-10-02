import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { LiveData, MatchSummary, Page, PingKind, PlayerData, QueueFilter, Role } from '../types'
import { PLATFORMS, riot } from '../api/riot'
import { loadCollection } from '../api/collection'
import { champName, champSplash, champTile, championMap, profileIcon, rankEmblem } from '../lib/ddragon'
import { ROLES, championAggs, duration, kdaRatio, queueLabel, roleAggs, statCards, QUEUE_FILTERS, type StatCard } from '../lib/stats'
import { clock } from '../lib/objectives'
import { Card, Champ, Counter, Icon, Img, Item, Ring, Segmented, Sparkline, Splash, ease, fadeUp, spring, stagger, type IconName } from '../components/ui'
import { champSkinSplash, liveChamp, liveSplash, matchSplash, skinFor, useSkins } from '../lib/skins'
import { RoleIcon } from '../components/RoleIcon'
import { fmtNum, lang, locale, t } from '../lib/i18n'
import { lpChanges, lpHistory } from '../lib/lp'
import { runeIcon, spellIcon, SPELL_FALLBACK, useGameData, type GameData } from '../lib/gameData'

type RoleFilter = 'ALL' | Exclude<Role, ''>

export function Dashboard({
  data,
  matches,
  filter,
  setFilter,
  count,
  setCount,
  live,
  onRefresh,
  refreshing,
  openMatch,
  navigate,
}: {
  data: PlayerData
  matches: MatchSummary[]
  filter: QueueFilter
  setFilter: (f: QueueFilter) => void
  count: number
  setCount: (n: number) => void
  live: LiveData | null
  onRefresh: () => void
  refreshing: boolean
  openMatch: (id: string) => void
  navigate: (p: Page) => void
}) {
  useSkins()
  const gd = useGameData()
  const [role, setRole] = useState<RoleFilter>('ALL')
  const shown = useMemo(() => (role === 'ALL' ? matches : matches.filter((m) => m.role === role)), [matches, role])

  return (
    <div className="page dash">
      <PageHead
        filter={filter}
        setFilter={setFilter}
        count={count}
        setCount={setCount}
        onRefresh={data.source !== 'demo' ? onRefresh : undefined}
        refreshing={refreshing}
        navigate={navigate}
      />

      <motion.div className="dash-grid" variants={stagger} initial="hidden" animate="show">
        <Hero data={data} matches={shown} role={role} setRole={setRole} />
        <div className="dash-list">
          <MatchList matches={shown} gd={gd} onOpen={openMatch} onAll={() => navigate('matches')} />
        </div>
        <div className="dash-mid">
          <Records matches={shown} onOpen={openMatch} />
          <div className="dash-pair">
            <Behaviour matches={shown} />
            <Lens matches={shown} />
          </div>
          <Showcase matches={shown} live={live} platform={data.profile.platform} demo={data.source === 'demo'} onOpen={openMatch} onLive={() => navigate('live')} onSpectate={() => navigate('spectate')} />
          <CollectionTile data={data} onOpen={() => navigate('collections')} onMastery={() => navigate('champions')} />
        </div>
        <div className="dash-side">
          <RankCard data={data} />
          <ChampionPerformance matches={shown} onAll={() => navigate('champions')} />
          <Pings matches={shown} />
          <PlayedWith matches={shown} />
          <RoleStrip matches={matches} role={role} setRole={setRole} />
        </div>
      </motion.div>
    </div>
  )
}

// ---------------------------------------------------------------- page head
function PageHead({
  filter,
  setFilter,
  count,
  setCount,
  onRefresh,
  refreshing,
  navigate,
}: {
  filter: QueueFilter
  setFilter: (f: QueueFilter) => void
  count: number
  setCount: (n: number) => void
  onRefresh?: () => void
  refreshing: boolean
  navigate: (p: Page) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  const queue = QUEUE_FILTERS.find((q) => q.id === filter)
  return (
    <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
      <h1>
        <Icon name="home" size={30} /> {t('Профиль')}
      </h1>
      <p className="page-sub">{t('Личный хаб Rift Pulse: ваши последние игры, форма и статистика по чемпионам в одном месте.')}</p>
      <div className="push" />
      {onRefresh && (
        <motion.button className="update" onClick={onRefresh} disabled={refreshing} whileTap={{ scale: 0.96 }}>
          <span className={`dot ${refreshing ? 'spin' : ''}`} /> {refreshing ? t('Обновляю…') : t('Обновить')}
        </motion.button>
      )}
      <div className="head-tabs">
        <button className="on">{t('Сводка')}</button>
        <button onClick={() => navigate('champions')}>{t('Чемпионы')}</button>
        <button onClick={() => navigate('studio')}>{t('Линза')}</button>
      </div>
      <div className="head-filter" ref={box}>
        <button className={`head-filter-btn ${open ? 'on' : ''} ${filter !== 'all' ? 'set' : ''}`} onClick={() => setOpen((v) => !v)} title={t('Фильтры')}>
          <Icon name="sliders" size={18} />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div className="head-pop" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.18, ease }}>
              <div className="muted small">{t('Режим')}</div>
              <Segmented id="queue" options={QUEUE_FILTERS} value={filter} onChange={setFilter} />
              <div className="muted small">{t('Сколько игр загружать')}</div>
              <div className="head-counts">
                {[20, 50, 100, 200].map((n) => (
                  <button key={n} className={n === count ? 'on' : ''} onClick={() => setCount(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {filter !== 'all' && queue && <span className="head-chip">{queue.label}</span>}
    </motion.div>
  )
}

// ---------------------------------------------------------------- hero
function Hero({ data, matches, role, setRole }: { data: PlayerData; matches: MatchSummary[]; role: RoleFilter; setRole: (r: RoleFilter) => void }) {
  const cards = useMemo(() => statCards(matches), [matches])
  const main = useMemo(() => championAggs(matches)[0]?.champion ?? data.matches[0]?.champion, [matches, data.matches])
  return (
    <Card className="hero" hover={false}>
      {main && <Splash src={champSkinSplash(main)} fallback={champSplash(main)} className="hero-bg" position="center 22%" />}
      <div className="hero-glow" />
      <div className="hero-top">
        <motion.div className="avatar-wrap big" initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring, delay: 0.1 }}>
          <span className="region-tag">{(PLATFORMS[data.profile.platform] ?? data.profile.platform).replace(/\d+$/, '').toUpperCase()}</span>
          <Img src={profileIcon(data.profile.iconId)} alt={data.profile.gameName} size={92} radius={10} />
          <span className="lvl">{data.profile.level}</span>
        </motion.div>
        <div className="hero-id">
          <motion.h2 className="hero-name" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15, duration: 0.6, ease }}>
            {data.profile.gameName}
          </motion.h2>
          <motion.div className="hero-tag" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.22, duration: 0.6, ease }}>
            #{data.profile.tagLine}
          </motion.div>
        </div>
        <div className="hero-tools">
          <Segmented
            id="role"
            className="icons"
            value={role}
            onChange={setRole}
            options={[
              { id: 'ALL' as RoleFilter, label: <RoleIcon role="ALL" size={16} />, title: t('Все роли') },
              ...ROLES.map((r) => ({ id: r.id as RoleFilter, label: <RoleIcon role={r.id} size={16} />, title: r.label })),
            ]}
          />
          <span className="hero-note">{t('против вашего среднего')}</span>
        </div>
      </div>
      <motion.div className="stat-grid" variants={stagger} initial="hidden" animate="show" key={`${role}-${matches.length}`}>
        {cards.map((c) => (
          <StatTile key={c.key} c={c} empty={!matches.length} />
        ))}
      </motion.div>
    </Card>
  )
}

const StatTile = memo(function StatTile({ c, empty }: { c: StatCard; empty: boolean }) {
  const up = c.delta >= 0
  return (
    <motion.div className={`stat ${up ? 'up' : 'down'}`} variants={fadeUp} whileHover={{ y: -2, transition: { duration: 0.2 } }}>
      <div className="stat-text">
        <div className="stat-label">{c.label}</div>
        <div className="stat-value">{empty ? '–' : <Counter value={c.value} format={c.fmt} />}</div>
        <div className={`delta ${up ? 'up' : 'down'}`}>
          <span className="delta-dot">
            <svg width="9" height="9" viewBox="0 0 10 10">
              <path d={up ? 'M5 1.5v7M2 4.5l3-3 3 3' : 'M5 8.5v-7M2 5.5l3 3 3-3'} stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          {c.fmtDelta(c.delta)}
        </div>
      </div>
      <Sparkline data={c.series.slice(-20)} labels={pointLabels(c).slice(-20)} format={c.fmt} width={96} height={44} color={up ? 'var(--up)' : 'var(--loss)'} dot={false} />
    </motion.div>
  )
})

// ---------------------------------------------------------------- match list
function ringColor(m: MatchSummary) {
  if (m.placement === 1) return 'var(--gold)'
  if (!m.win && m.score >= 80) return 'var(--ace)'
  return m.win ? 'var(--lav)' : m.score < 40 ? 'var(--loss)' : 'var(--lav)'
}
function placeText(m: MatchSummary) {
  if (m.placement === 1) return 'MVP'
  if (!m.win && m.score >= 80) return 'ACE'
  const n = m.placement
  if (lang !== 'en') return `${n}-й`
  return `${n}${n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`
}

function SpellIcon({ id, gd, size }: { id: number; gd: GameData | null; size: number }) {
  const sp = gd?.spells[id]
  return <Img src={spellIcon(sp?.id ?? SPELL_FALLBACK[id] ?? 'SummonerFlash', gd?.version ?? '')} alt={sp?.name ?? ''} size={size} radius={4} />
}
function RuneIcon({ id, gd, size, tree }: { id?: number; gd: GameData | null; size: number; tree?: boolean }) {
  const r = id ? (tree ? gd?.trees.find((x) => x.id === id) : gd?.runes[id]) : undefined
  if (!r) return <span className="rune-blank" style={{ width: size, height: size }} />
  return <Img src={runeIcon(r.icon)} alt={r.name} size={size} radius={size} className="rune-ic" />
}

function shortAgo(ts: number) {
  const s = (Date.now() - ts) / 1000
  if (s < 3600) return t('{n} мин', { n: Math.max(1, Math.round(s / 60)) })
  if (s < 86400) return t('{n} ч', { n: Math.round(s / 3600) })
  return t('{n} д', { n: Math.round(s / 86400) })
}

const MatchRow = memo(function MatchRow({ m, i, gd, onOpen }: { m: MatchSummary; i: number; gd: GameData | null; onOpen: (id: string) => void }) {
  const color = ringColor(m)
  const items = m.items.slice(0, 6)
  return (
    <motion.button
      className={`match ${m.win ? 'win' : 'loss'}`}
      onClick={() => onOpen(m.id)}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0, transition: { delay: Math.min(i, 10) * 0.035, duration: 0.4, ease } }}
    >
      <Splash src={champTile(m.champion, skinFor(m.champion, m.endedAt, m.durationSec))} fallback={champTile(m.champion)} className="match-art" position="center 30%" />
      <div className="match-meta">
        <div>
          <b>{duration(m.durationSec)}</b> <span className="muted">{shortAgo(m.endedAt)}</span>
        </div>
        <div className="match-queue">{queueLabel(m.queueId, m.mode)}</div>
      </div>
      <div className="match-champ">
        <span className="match-portrait">
          <Champ name={m.champion} size={40} radius={8} />
          <span className="champ-lvl">{m.champLevel}</span>
          {m.keystone && gd?.runes[m.keystone] && (
            <span className="match-keystone">
              <RuneIcon id={m.keystone} gd={gd} size={18} />
            </span>
          )}
        </span>
        {m.spells && (
          <span className="match-spells">
            {m.spells.map((s, j) => (
              <SpellIcon key={j} id={s} gd={gd} size={19} />
            ))}
          </span>
        )}
      </div>
      <div className="match-kda">
        <div className="kda-line">
          {m.kills} <span className="sl">/</span> <span className="d">{m.deaths}</span> <span className="sl">/</span> {m.assists}
        </div>
        <div className="kda-ratio">
          <b>{kdaRatio(m.kills, m.deaths, m.assists)}</b> KDA
        </div>
      </div>
      <div className="match-build">
        {[0, 1, 2].map((j) => (
          <Item key={j} id={items[j] ?? 0} size={21} />
        ))}
        <Item id={m.items[6] ?? 0} size={21} />
        {[3, 4, 5].map((j) => (
          <Item key={j} id={items[j] ?? 0} size={21} />
        ))}
        <RuneIcon id={m.subStyle} gd={gd} size={17} tree />
      </div>
      <span className="match-ring" style={{ ['--rc' as string]: color }}>
        <Ring value={m.score} color={color} size={46} stroke={3.5}>
          <b>{m.score}</b>
          <span className="badge">{placeText(m)}</span>
        </Ring>
      </span>
    </motion.button>
  )
})

function MatchList({ matches, gd, onOpen, onAll }: { matches: MatchSummary[]; gd: GameData | null; onOpen: (id: string) => void; onAll: () => void }) {
  const [limit, setLimit] = useState(12)
  if (!matches.length) return <Card className="empty">{t('Нет игр в этом режиме')}</Card>
  return (
    <motion.section className="match-list" variants={fadeUp}>
      {matches.slice(0, limit).map((m, i) => (
        <MatchRow key={m.id} m={m} i={i} gd={gd} onOpen={onOpen} />
      ))}
      <div className="match-more">
        {limit < matches.length && (
          <button className="btn ghost" onClick={() => setLimit((l) => l + 10)}>
            {t('Показать ещё')} <Icon name="chevron" size={14} />
          </button>
        )}
        <button className="btn ghost" onClick={onAll}>
          {t('Все игры')} <Icon name="right" size={14} />
        </button>
      </div>
    </motion.section>
  )
}

// ---------------------------------------------------------------- records and behaviour
const MULTI = ['', '', 'Double', 'Triple', 'Quadra', 'Penta']

function Records({ matches, onOpen }: { matches: MatchSummary[]; onOpen: (id: string) => void }) {
  const list = useMemo(() => {
    const ms = matches.filter((m) => !m.remake)
    if (!ms.length) return []
    const top = (f: (m: MatchSummary) => number, pool = ms) => pool.reduce((a, b) => (f(b) > f(a) ? b : a), pool[0])
    const sr = ms.filter((m) => m.role)
    const out: { key: string; icon: IconName; label: string; m: MatchSummary; value: string }[] = [
      { key: 'kills', icon: 'swords', label: t('Убийства'), m: top((m) => m.kills), value: '' },
      { key: 'kda', icon: 'star', label: 'KDA', m: top((m) => (m.kills + m.assists) / Math.max(1, m.deaths) + (m.deaths ? 0 : 0.01)), value: '' },
      { key: 'dmg', icon: 'bolt', label: t('Урон/мин'), m: top((m) => m.dmgPerMin), value: '' },
      { key: 'cs', icon: 'chart', label: t('CS/мин'), m: top((m) => m.cs / Math.max(1, m.durationSec / 60), sr.length ? sr : ms), value: '' },
      { key: 'multi', icon: 'trophy', label: t('Мультикилл'), m: top((m) => m.largestMultiKill * 1000 + m.kills), value: '' },
      { key: 'long', icon: 'clock', label: t('Долгая игра'), m: top((m) => m.durationSec), value: '' },
    ]
    for (const r of out) {
      const m = r.m
      r.value =
        r.key === 'kills'
          ? String(m.kills)
          : r.key === 'kda'
            ? kdaRatio(m.kills, m.deaths, m.assists)
            : r.key === 'dmg'
              ? fmtNum(Math.round(m.dmgPerMin))
              : r.key === 'cs'
                ? (m.cs / Math.max(1, m.durationSec / 60)).toFixed(1)
                : r.key === 'multi'
                  ? MULTI[m.largestMultiKill] || `${m.largestMultiKill}×`
                  : duration(m.durationSec)
    }
    return out
  }, [matches])
  const best = useMemo(() => [...matches].sort((a, b) => b.score - a.score)[0], [matches])
  return (
    <Card className="records">
      {best && <Splash src={matchSplash(best)} fallback={champSplash(best.champion)} className="records-bg" position="center 20%" />}
      <h3 className="card-title center">
        <Icon name="medal" size={17} /> {t('Рекорды')}
      </h3>
      {list.length ? (
        <div className="records-grid">
          {list.map((r, i) => (
            <motion.button
              key={r.key}
              className="record"
              onClick={() => onOpen(r.m.id)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.05, duration: 0.45, ease }}
              whileHover={{ y: -2 }}
            >
              <Champ name={r.m.champion} size={34} radius={8} />
              <span className="record-text">
                <span className="record-label">{r.label}</span>
                <b className="record-value">{r.value}</b>
                <span className="record-date">{new Date(r.m.endedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</span>
              </span>
            </motion.button>
          ))}
        </div>
      ) : (
        <p className="muted small center">{t('Нет игр в этом режиме')}</p>
      )}
    </Card>
  )
}

function Behaviour({ matches }: { matches: MatchSummary[] }) {
  const s = useMemo(() => {
    const ms = matches.filter((m) => !m.remake).sort((a, b) => a.endedAt - b.endedAt)
    let best = 0
    let run = 0
    let afterLoss = 0
    let afterLossWins = 0
    ms.forEach((m, i) => {
      run = m.win ? run + 1 : 0
      best = Math.max(best, run)
      if (i > 0 && !ms[i - 1].win) {
        afterLoss++
        if (m.win) afterLossWins++
      }
    })
    const last = ms[ms.length - 1]
    let cur = 0
    for (let i = ms.length - 1; i >= 0 && ms[i].win === last?.win; i--) cur++
    const deaths = ms.length ? ms.reduce((a, m) => a + m.deaths, 0) / ms.length : 0
    return { cur, curWin: last?.win ?? true, best, tilt: afterLoss ? afterLossWins / afterLoss : null, deaths, n: ms.length }
  }, [matches])
  return (
    <Card className="behaviour">
      <h3 className="card-title center">
        <Icon name="brain" size={16} /> {t('Поведение')}
      </h3>
      {s.n ? (
        <div className="beh-list">
          <div className="beh">
            <span className="muted">{t('Серия')}</span>
            <b className={s.curWin ? 'good' : 'bad'}>{s.curWin ? t('{n} поб.', { n: s.cur }) : t('{n} пор.', { n: s.cur })}</b>
          </div>
          <div className="beh">
            <span className="muted">{t('Рекорд')}</span>
            <b>{t('{n} поб.', { n: s.best })}</b>
          </div>
          <div className="beh" title={t('Как часто вы выигрываете следующую игру после поражения')}>
            <span className="muted">{t('После пораж.')}</span>
            <b className={s.tilt === null ? '' : s.tilt >= 0.5 ? 'good' : 'bad'}>{s.tilt === null ? '–' : `${Math.round(s.tilt * 100)}%`}</b>
          </div>
          <div className="beh">
            <span className="muted">{t('Смертей')}</span>
            <b>{s.deaths.toFixed(1)}</b>
          </div>
        </div>
      ) : (
        <p className="muted small center">{t('Нет игр в этом режиме')}</p>
      )}
    </Card>
  )
}

function Lens({ matches }: { matches: MatchSummary[] }) {
  const cards = useMemo(() => statCards(matches), [matches])
  const [i, setI] = useState(1)
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % cards.length), 7000)
    return () => clearInterval(id)
  }, [cards.length])
  const c = cards[i % cards.length]
  return (
    <Card className="lens">
      <div className="card-head">
        <h3 className="card-title">
          <Icon name="eye" size={16} /> {t('Линза')}
        </h3>
        <div className="lens-nav">
          <button onClick={() => setI((v) => (v - 1 + cards.length) % cards.length)} aria-label={t('Предыдущая метрика')}>
            <Icon name="left" size={14} />
          </button>
          <button onClick={() => setI((v) => (v + 1) % cards.length)} aria-label={t('Следующая метрика')}>
            <Icon name="right" size={14} />
          </button>
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={c.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease }} className="lens-body">
          <Sparkline data={c.series} labels={pointLabels(c)} format={c.fmt} width={200} height={54} color="var(--gold)" stretch />
          <div className="muted small">{c.label}</div>
          <div className="lens-value">{matches.length ? <Counter value={c.value} format={c.fmt} /> : '–'}</div>
        </motion.div>
      </AnimatePresence>
    </Card>
  )
}

// ---------------------------------------------------------------- showcase (live / best games carousel)
interface Featured {
  gameId: number
  gameMode: string
  gameQueueConfigId: number
  gameLength: number
  gameStartTime: number
  participants: { championId: number; teamId: number; riotId?: string }[]
}

/** a live high-elo game from the official spectator feed, refreshed every few minutes */
function useFeatured(platform: string, enabled: boolean) {
  const [game, setGame] = useState<{ g: Featured; champs: Record<number, string> } | null>(null)
  useEffect(() => {
    if (!enabled) return
    let off = false
    const load = () =>
      Promise.all([riot<{ gameList: Featured[] }>(platform, '/lol/spectator/v5/featured-games'), championMap()])
        .then(([r, champs]) => {
          const list = (r.gameList ?? []).filter((g) => g.participants?.length === 10)
          const g = list.find((x) => x.gameQueueConfigId === 420) ?? list[0]
          if (!off) setGame(g ? { g, champs } : null)
        })
        .catch(() => !off && setGame(null))
    load()
    const id = setInterval(load, 4 * 60_000)
    return () => {
      off = true
      clearInterval(id)
    }
  }, [platform, enabled])
  return game
}

/** game clock that ticks once a second; only mounted while a live game is on screen */
function LiveClock({ start, fallback }: { start: number; fallback: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return <b>{clock(start > 0 ? Math.max(0, (now - start) / 1000) : fallback)}</b>
}

function Showcase({
  matches,
  live,
  platform,
  demo,
  onOpen,
  onLive,
  onSpectate,
}: {
  matches: MatchSummary[]
  live: LiveData | null
  platform: string
  demo: boolean
  onOpen: (id: string) => void
  onLive: () => void
  onSpectate: () => void
}) {
  const featured = useFeatured(platform, Boolean(window.rp) && !demo && !live)
  const [tab, setTab] = useState<'live' | 'best'>('live')
  const pages = useMemo(() => {
    const best = [...matches].sort((a, b) => b.score - a.score).slice(0, 6)
    const out: MatchSummary[][] = []
    for (let i = 0; i < best.length; i += 2) out.push(best.slice(i, i + 2))
    return out
  }, [matches])
  const [[idx, dir], setIdx] = useState<[number, number]>([0, 0])
  const page = pages.length ? pages[((idx % pages.length) + pages.length) % pages.length] : []
  const go = (d: number) => setIdx(([i]) => [i + d, d])

  if (live) {
    const me = live.allPlayers.find((p) => [p.riotIdGameName, p.summonerName].includes(live.activePlayer?.riotIdGameName ?? live.activePlayer?.summonerName))
    const myTeam = me?.team ?? 'ORDER'
    const opp = live.allPlayers.find((p) => p.team !== myTeam && p.position === me?.position) ?? live.allPlayers.find((p) => p.team !== myTeam)
    const panels = [me, opp].filter(Boolean) as LiveData['allPlayers']
    return (
      <Card className="showcase">
        <div className="show-panels">
          {panels.map((p, i) => (
            <div key={i} className={`show-panel p${i}`}>
              <Splash src={liveSplash(p)} fallback={champSplash(liveChamp(p))} position="center 18%" />
              <div className="show-shade" />
              <div className="show-who">
                <b>{p.riotIdGameName ?? p.summonerName}</b>
                <span>{p.championName}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="show-top">
          <span className="rec-dot" /> <b>{clock(live.gameData.gameTime)}</b> <span className="chip">{live.gameData.gameMode}</span>
        </div>
        <div className="show-mid">
          <span className="vs-text">VS</span>
        </div>
        <motion.button className="watch" onClick={onLive} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
          <Icon name="eye" size={15} /> {t('Открыть игру')}
        </motion.button>
      </Card>
    )
  }

  if (featured && tab === 'live') {
    const { g, champs } = featured
    const blue = g.participants.filter((p) => p.teamId === 100)
    const red = g.participants.filter((p) => p.teamId === 200)
    const name = (p?: Featured['participants'][number]) => (p?.riotId ?? '').split('#')[0] || '—'
    const champ = (p?: Featured['participants'][number]) => (p ? (champs[p.championId] ?? '') : '')
    // mid laners are the usual faces of a broadcast; fall back to the first player
    const a = blue[2] ?? blue[0]
    const b = red[2] ?? red[0]
    return (
      <Card className="showcase featured">
        <div className="show-panels">
          {[a, b].map((p, i) => (
            <div key={i} className={`show-panel p${i}`}>
              <Splash src={champSplash(champ(p))} position="center 18%" />
              <div className="show-shade" />
            </div>
          ))}
        </div>
        <div className="show-top">
          <span className="rec-dot" /> <LiveClock start={g.gameStartTime} fallback={g.gameLength} /> <span className="chip">{(PLATFORMS[platform] ?? platform).toUpperCase()}</span>
          <div className="push" />
          <button className="chip ghost" onClick={() => setTab('best')}>
            {t('Лучшие игры')} <Icon name="right" size={11} />
          </button>
        </div>
        <div className="feat-row">
          <div className="feat-side">
            <b>{name(a)}</b>
            <span className="muted">{champName(champ(a))}</span>
            <div className="feat-team">
              {blue.map((p, i) => (
                <Champ key={i} name={champ(p)} size={20} radius={5} />
              ))}
            </div>
          </div>
          <div className="feat-mid">
            <span className="vs-text">VS</span>
            <motion.button className="watch" onClick={onSpectate} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Icon name="eye" size={15} /> {t('Смотреть')}
            </motion.button>
          </div>
          <div className="feat-side right">
            <b>{name(b)}</b>
            <span className="muted">{champName(champ(b))}</span>
            <div className="feat-team">
              {red.map((p, i) => (
                <Champ key={i} name={champ(p)} size={20} radius={5} />
              ))}
            </div>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="showcase">
      <AnimatePresence initial={false} custom={dir} mode="popLayout">
        <motion.div
          key={idx}
          className="show-panels"
          custom={dir}
          initial={{ x: dir >= 0 ? '30%' : '-30%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: dir >= 0 ? '-30%' : '30%', opacity: 0 }}
          transition={{ duration: 0.55, ease }}
        >
          {page.map((m, i) => (
            <button key={m.id} className={`show-panel p${i}`} onClick={() => onOpen(m.id)}>
              <Splash src={matchSplash(m)} fallback={champSplash(m.champion)} position="center 18%" />
              <div className="show-shade" />
              <div className="show-who">
                <b>
                  {m.kills}/{m.deaths}/{m.assists}
                </b>
                <span>
                  {champName(m.champion)} · {m.win ? t('Победа') : t('Поражение')}
                </span>
              </div>
              <span className={`show-score ${m.placement === 1 ? 'mvp' : ''}`}>{m.score}</span>
            </button>
          ))}
        </motion.div>
      </AnimatePresence>
      <div className="show-top">
        <Icon name="star" size={15} /> <b>{t('Лучшие игры')}</b>
        {featured && (
          <>
            <div className="push" />
            <button className="chip ghost" onClick={() => setTab('live')}>
              <span className="rec-dot" /> {t('В эфире')}
            </button>
          </>
        )}
      </div>
      {pages.length > 1 && (
        <>
          <motion.button className="show-arrow left" onClick={() => go(-1)} whileHover={{ x: -3 }} aria-label={t('Назад')}>
            <Icon name="left" size={20} />
          </motion.button>
          <motion.button className="show-arrow right" onClick={() => go(1)} whileHover={{ x: 3 }} aria-label={t('Вперёд')}>
            <Icon name="right" size={20} />
          </motion.button>
        </>
      )}
    </Card>
  )
}

/** owned skins from the last collection snapshot; mastery until one exists */
function CollectionTile({ data, onOpen, onMastery }: { data: PlayerData; onOpen: () => void; onMastery: () => void }) {
  const [col, setCol] = useState<{ owned: number; total: number; art: string } | null>(null)
  useEffect(() => {
    if (!window.rp) return
    let off = false
    loadCollection(false)
      .then((c) => {
        if (off || c.source === 'demo' || !c.skins.length) return
        const owned = c.skins.filter((s) => s.owned)
        const pick = [...owned].sort((a, b) => b.acquired - a.acquired)[0] ?? c.skins[0]
        setCol({ owned: owned.length, total: c.skins.length, art: pick?.loadScreen ? champSplash(pick.champ, pick.num) : '' })
      })
      .catch(() => {})
    return () => {
      off = true
    }
  }, [])
  if (!col) return <MasteryCard data={data} onOpen={onMastery} />
  return (
    <Card className="mastery collection-tile" onClick={onOpen}>
      {col.art && <Splash src={col.art} position="center 20%" />}
      <div className="mastery-shade" />
      <div className="mastery-body">
        <div className="mastery-title">
          <Icon name="sparkle" size={14} /> {t('Коллекция')} <Icon name="arrow" size={13} />
        </div>
        <div className="mastery-row">
          <span className="muted">{t('Скины')}</span>
          <b>
            <Counter value={col.owned} /> <span className="muted">/ {col.total}</span>
          </b>
        </div>
        <div className="bar-track">
          <motion.div className="bar-fill" initial={{ width: 0 }} animate={{ width: `${(col.owned / Math.max(1, col.total)) * 100}%` }} transition={{ duration: 1.1, ease, delay: 0.3 }} />
        </div>
      </div>
    </Card>
  )
}

function MasteryCard({ data, onOpen }: { data: PlayerData; onOpen: () => void }) {
  const top = data.mastery?.[0]
  const all = data.mastery ?? []
  const total = all.reduce((s, m) => s + m.points, 0)
  return (
    <Card className="mastery" onClick={onOpen}>
      {top && <Splash src={champSkinSplash(top.champion)} fallback={champSplash(top.champion)} position="center 15%" />}
      <div className="mastery-shade" />
      <div className="mastery-body">
        <div className="mastery-title">
          <Icon name="sparkle" size={14} /> {t('Мастерство')} <Icon name="arrow" size={13} />
        </div>
        {top ? (
          <>
            <div className="mastery-row">
              <span className="muted">{t('{champ}, уровень {level}', { champ: champName(top.champion), level: top.level })}</span>
              <b>
                <Counter value={top.points} format={(v) => fmtNum(Math.round(v))} />
                <span className="muted"> / {Math.round(total / 1000)}k</span>
              </b>
            </div>
            <div className="bar-track">
              <motion.div className="bar-fill" initial={{ width: 0 }} animate={{ width: `${(top.points / Math.max(1, total)) * 100}%` }} transition={{ duration: 1.1, ease, delay: 0.3 }} />
            </div>
          </>
        ) : (
          <div className="muted small">{t('Данные о мастерстве появятся после загрузки профиля')}</div>
        )}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- right column
function RankCard({ data }: { data: PlayerData }) {
  const [q, setQ] = useState<'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR'>('RANKED_SOLO_5x5')
  const e = data.ranks.find((r) => r.queueType === q)
  const wr = e ? Math.round((e.wins / Math.max(1, e.wins + e.losses)) * 100) : 0
  const apex = e && ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(e.tier)
  return (
    <Card className={`rank tier-${(e?.tier ?? 'none').toLowerCase()}`}>
      <AnimatePresence mode="wait">
        <motion.div key={q} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.3, ease }} className="rank-inner">
          {e && (
            <motion.div className="emblem" initial={{ scale: 0.7, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={spring}>
              <Img src={rankEmblem(e.tier)} alt={e.tier} size={230} radius={0} />
            </motion.div>
          )}
          <div className="rank-text">
            <button className="rank-queue" onClick={() => setQ(q === 'RANKED_SOLO_5x5' ? 'RANKED_FLEX_SR' : 'RANKED_SOLO_5x5')} title={t('Переключить очередь')}>
              {q === 'RANKED_SOLO_5x5' ? 'Solo/Duo' : 'Flex'} <Icon name="chevron" size={12} />
            </button>
            {e ? (
              <>
                <div className="rank-tier">
                  {e.tier} {apex ? '' : e.rank}
                </div>
                <div className="rank-lp">
                  <Counter value={e.leaguePoints} /> LP{' '}
                  <span className="rank-wl">
                    {e.wins}W - {e.losses}L ({wr}%)
                  </span>
                </div>
              </>
            ) : (
              <div className="rank-tier muted">{t('Без ранга')}</div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
      <LpTrend data={data} queue={q} />
    </Card>
  )
}

/** LP over time from the snapshots the app keeps, plus the last LP gains and losses. */
function LpTrend({ data, queue }: { data: PlayerData; queue: string }) {
  const list = useMemo(() => lpHistory(data, queue), [data, queue])
  const changes = useMemo(() => lpChanges(list).slice(-6).reverse(), [list])
  if (list.length < 2) return null
  const week = list.filter((s) => s.at >= Date.now() - 7 * 86400_000)
  const delta = week.length ? list[list.length - 1].v - week[0].v : 0
  const dateFmt = (ts: number) => new Date(ts).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  return (
    <div className="lp-trend">
      <Sparkline
        data={list.map((s) => s.v)}
        width={300}
        height={42}
        stretch
        dot={false}
        color="var(--lav)"
        labels={list.map((s) => `${dateFmt(s.at)} · ${s.tier} ${['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(s.tier) ? '' : s.rank}`)}
        format={(v) => `${list.find((s) => s.v === v)?.lp ?? ''} LP`}
      />
      <div className="lp-trend-foot">
        {week.length > 1 && <b className={delta >= 0 ? 'good' : 'bad'}>{t('{v} LP за 7 дней', { v: `${delta >= 0 ? '+' : ''}${delta}` })}</b>}
        <div className="lp-changes">
          {changes.map((c, i) => (
            <span key={i} className={c.delta >= 0 ? 'good' : 'bad'} title={dateFmt(c.at)}>
              {c.delta >= 0 ? '+' : ''}
              {c.delta}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function ChampionPerformance({ matches, onAll }: { matches: MatchSummary[]; onAll: () => void }) {
  const aggs = useMemo(() => championAggs(matches), [matches])
  const top = aggs.slice(0, 3)
  const podium = [top[1], top[0], top[2]].filter(Boolean)
  return (
    <Card className="champ-perf">
      <h3 className="card-title center">
        <Icon name="wand" size={16} /> {t('Чемпионы')}
      </h3>
      <div className="podium">
        {podium.map((c, i) => (
          <motion.div
            key={c.champion}
            className={`podium-item ${c === top[0] ? 'first' : ''}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: c === top[0] ? -8 : 0 }}
            transition={{ delay: 0.2 + i * 0.08, ...spring }}
          >
            <span className="podium-art">
              <Champ name={c.champion} size={c === top[0] ? 46 : 38} radius={8} />
            </span>
            <div className="podium-name">{champName(c.champion)}</div>
            <div className="podium-wl">
              {c.wins}W - {c.games - c.wins}L
            </div>
            <div className="podium-kda">
              {c.kills.toFixed(1)} / {c.deaths.toFixed(1)} / {c.assists.toFixed(1)}
            </div>
          </motion.div>
        ))}
      </div>
      <div className="champ-more">
        {aggs.slice(3, 8).map((c) => (
          <motion.span key={c.champion} title={`${champName(c.champion)}: ${c.wins}W ${c.games - c.wins}L`} whileHover={{ y: -3, scale: 1.08 }}>
            <Champ name={c.champion} size={26} radius={13} />
          </motion.span>
        ))}
        <button className="pill" onClick={onAll}>
          {t('ВСЕ')}
        </button>
      </div>
    </Card>
  )
}

/** Ping glyphs drawn in the in-game colours. */
const PING: { k: PingKind; label: string; color: string; d: string }[] = [
  { k: 'onMyWay', label: t('Иду'), color: '#4fb6ff', d: 'M12 3v13M6 11l6 7 6-7' },
  { k: 'push', label: t('Давим'), color: '#4fe08a', d: 'M6 21V4M6 4h11l-3 4 3 4H6' },
  { k: 'enemyMissing', label: t('Пропал'), color: '#ffd23f', d: 'M9 8a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.4-1.5 2.4v1M12 19h.01' },
  { k: 'assistMe', label: t('Помогите'), color: '#3fe0a0', d: 'M12 3l3 6h6l-5 4 2 7-6-4-6 4 2-7-5-4h6z' },
  { k: 'getBack', label: t('Назад'), color: '#ff4d5e', d: 'M12 3l8 9-8 9-8-9z' },
  { k: 'needVision', label: t('Нужен обзор'), color: '#58e07a', d: 'M12 3c3 3 5 6 5 9a5 5 0 0 1-10 0c0-3 2-6 5-9zM12 10v5' },
]

function Pings({ matches }: { matches: MatchSummary[] }) {
  const agg = useMemo(() => {
    const withP = matches.filter((m) => m.pings)
    const sum: Record<string, number> = {}
    for (const m of withP) for (const p of PING) sum[p.k] = (sum[p.k] ?? 0) + (m.pings?.[p.k] ?? 0)
    return { n: withP.length, sum }
  }, [matches])
  return (
    <Card className="pings">
      <h3 className="card-title center">
        <Icon name="flag" size={16} /> {t('Пинги')}
      </h3>
      {agg.n ? (
        <div className="ping-grid">
          {PING.map((p, i) => (
            <motion.div key={p.k} className="ping" title={p.label} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.04, ...spring }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={p.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 6px ${p.color}88)` }}>
                <path d={p.d} />
              </svg>
              <b>
                <Counter value={agg.sum[p.k] ?? 0} format={(v) => fmtNum(Math.round(v))} />
              </b>
              <span className="muted">({((agg.sum[p.k] ?? 0) / agg.n).toFixed(1)})</span>
            </motion.div>
          ))}
        </div>
      ) : (
        <p className="muted small center">{t('Пинги приходят из Riot API: добавьте ключ в настройках, и они появятся после обновления.')}</p>
      )}
    </Card>
  )
}

function PlayedWith({ matches }: { matches: MatchSummary[] }) {
  const mates = useMemo(() => {
    const map = new Map<string, { name: string; tag: string; games: number; wins: number; champ: string }>()
    for (const m of matches) {
      const me = m.players?.find((p) => p.me)
      if (!me) continue
      for (const p of m.players!) {
        if (p.me || p.teamId !== me.teamId || !p.name || p.name === '—') continue
        const key = p.puuid ?? `${p.name}#${p.tag ?? ''}`.toLowerCase()
        const x = map.get(key) ?? { name: p.name, tag: p.tag ?? '', games: 0, wins: 0, champ: p.champion }
        x.games++
        if (m.win) x.wins++
        map.set(key, x)
      }
    }
    return [...map.values()]
      .filter((x) => x.games >= 2)
      .sort((a, b) => b.games - a.games || b.wins - a.wins)
      .slice(0, 4)
  }, [matches])
  return (
    <Card className="played">
      <h3 className="card-title center">
        <Icon name="users" size={16} /> {t('Играли вместе')}
      </h3>
      {mates.length ? (
        <div className="played-table">
          <div className="played-head">
            <span>{t('Игрок')}</span>
            <span>{t('игр')}</span>
            <span>{t('винрейт')}</span>
          </div>
          {mates.map((x, i) => {
            const wr = Math.round((x.wins / x.games) * 100)
            return (
              <motion.div key={x.name + x.tag} className="played-row" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.05, duration: 0.4, ease }}>
                <Champ name={x.champ} size={28} radius={6} />
                <span className="played-name">
                  <b>{x.name}</b>
                  {x.tag && <span className="muted">#{x.tag}</span>}
                </span>
                <b className="played-games">{x.games}</b>
                <span className="played-wr">
                  <b className={wr >= 50 ? 'good' : 'bad'}>{wr}%</b>
                  <span className="muted">
                    {x.wins}W - {x.games - x.wins}L
                  </span>
                </span>
              </motion.div>
            )
          })}
        </div>
      ) : (
        <p className="muted small center">{t('Пока не с кем: здесь появятся игроки, с которыми вы сыграли хотя бы две игры.')}</p>
      )}
    </Card>
  )
}

function RoleStrip({ matches, role, setRole }: { matches: MatchSummary[]; role: RoleFilter; setRole: (r: RoleFilter) => void }) {
  const roles = useMemo(() => roleAggs(matches), [matches])
  const most = roles.reduce((a, b) => (b.games > a.games ? b : a), roles[0])
  return (
    <motion.div className="role-strip" variants={fadeUp}>
      {roles.map((r) => (
        <button
          key={r.id}
          className={`role ${r.games ? '' : 'dim'} ${role === r.id || (role === 'ALL' && r === most && r.games) ? 'on' : ''}`}
          title={r.label}
          onClick={() => setRole(role === r.id ? 'ALL' : r.id)}
        >
          <RoleIcon role={r.id} size={26} />
          <b>{r.games ? `${Math.round((r.wins / r.games) * 100)}%` : '–'}</b>
          <span className="tiny">{t('{n} игр', { n: r.games })}</span>
        </button>
      ))}
    </motion.div>
  )
}

/** "16 авг · Ahri" for every point of a stat card's series */
function pointLabels(c: { dates: number[]; champs: string[] }) {
  return c.dates.map((d, i) => `${new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short' })} · ${champName(c.champs[i])}`)
}
