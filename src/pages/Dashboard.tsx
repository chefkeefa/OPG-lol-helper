import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { LiveData, MatchSummary, Page, PlayerData, QueueFilter, Role } from '../types'
import { PLATFORMS, riot } from '../api/riot'
import { loadCollection } from '../api/collection'
import { championMap } from '../lib/ddragon'
import { champName, champSplash, profileIcon, rankEmblem } from '../lib/ddragon'
import { ROLES, ago, badge, championAggs, duration, kdaRatio, queueLabel, roleAggs, statCards, QUEUE_FILTERS } from '../lib/stats'
import { clock, demoLive, objectiveTimers } from '../lib/objectives'
import { Card, Champ, Counter, Icon, Img, Ring, Segmented, Sparkline, Splash, ease, fadeUp, spring, stagger } from '../components/ui'
import { champSkinSplash, liveChamp, liveSplash, matchSplash, useSkins } from '../lib/skins'
import { RoleIcon } from '../components/RoleIcon'
import { fmtNum, locale, t } from '../lib/i18n'
import { lpChanges, lpHistory } from '../lib/lp'

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
  const [role, setRole] = useState<RoleFilter>('ALL')
  const shown = useMemo(() => (role === 'ALL' ? matches : matches.filter((m) => m.role === role)), [matches, role])

  return (
    <div className="page">
      <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <h1>
          <Icon name="home" size={32} /> {t('Дашборд')}
        </h1>
        <p className="page-sub">{t('Личный хаб Rift Pulse: ваши последние игры, форма и статистика по чемпионам в одном месте.')}</p>
        <div className="push" />
        {data.source !== 'demo' && (
          <motion.button className="update" onClick={onRefresh} disabled={refreshing} whileTap={{ scale: 0.96 }}>
            <span className={`dot ${refreshing ? 'spin' : ''}`} /> {refreshing ? t('Обновляю…') : t('Обновить')}
          </motion.button>
        )}
        <Segmented id="queue" options={QUEUE_FILTERS} value={filter} onChange={setFilter} />
        <select className="ghost-select" value={count} onChange={(e) => setCount(Number(e.target.value))} title={t('Сколько игр загружать')}>
          {[20, 50, 100, 200].map((n) => (
            <option key={n} value={n}>
              {t('Последние {n} игр', { n })}
            </option>
          ))}
        </select>
        <span className="season">{t('Сезон {year}', { year: new Date().getFullYear() })}</span>
      </motion.div>

      <motion.div className="grid" variants={stagger} initial="hidden" animate="show">
        <div className="col-main">
          <Hero data={data} matches={shown} role={role} setRole={setRole} />
          <div className="row r2">
            <Showcase matches={shown} live={live} platform={data.profile.platform} demo={data.source === 'demo'} onOpen={openMatch} onLive={() => navigate('live')} onSpectate={() => navigate('spectate')} />
            <LastGame matches={shown} onOpen={openMatch} onAll={() => navigate('matches')} />
          </div>
          <div className="row r3">
            <OverlayPromo live={live} onOpen={() => navigate('overlays')} />
            <CollectionTile data={data} onOpen={() => navigate('collections')} onMastery={() => navigate('champions')} />
            <Lens matches={shown} />
          </div>
        </div>
        <div className="col-side">
          <RankCard data={data} />
          <MatchList matches={shown} onOpen={openMatch} />
          <ChampionPerformance matches={shown} onAll={() => navigate('champions')} />
        </div>
      </motion.div>
    </div>
  )
}

// ---------------------------------------------------------------- hero
function Hero({ data, matches, role, setRole }: { data: PlayerData; matches: MatchSummary[]; role: RoleFilter; setRole: (r: RoleFilter) => void }) {
  const cards = statCards(matches)
  const main = championAggs(matches)[0]?.champion ?? data.matches[0]?.champion
  return (
    <Card className="hero" hover={false}>
      {main && <Splash src={champSkinSplash(main)} fallback={champSplash(main)} className="hero-bg" />}
      <div className="hero-top">
        <motion.div className="avatar-wrap big" initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring, delay: 0.1 }}>
          <span className="region-tag">{PLATFORMS[data.profile.platform] ?? data.profile.platform.toUpperCase()}</span>
          <Img src={profileIcon(data.profile.iconId)} alt={data.profile.gameName} size={100} radius={14} />
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
              { id: 'ALL' as RoleFilter, label: <RoleIcon role="ALL" size={18} />, title: t('Все роли') },
              ...ROLES.map((r) => ({ id: r.id as RoleFilter, label: <RoleIcon role={r.id} size={18} />, title: r.label })),
            ]}
          />
          <span className="hero-note">{t('последние 5 игр против вашего среднего')}</span>
        </div>
      </div>
      <motion.div className="stat-grid" variants={stagger} initial="hidden" animate="show" key={`${role}-${matches.length}`}>
        {cards.map((c) => {
          const up = c.delta >= 0
          return (
            <motion.div key={c.key} className="stat" variants={fadeUp} whileHover={{ y: -2, transition: { duration: 0.2 } }}>
              <div className="stat-text">
                <div className="stat-label">{c.label}</div>
                <div className="stat-value">{matches.length ? <Counter value={c.value} format={c.fmt} /> : '–'}</div>
                <div className={`delta ${up ? 'up' : 'down'}`}>
                  <span className="delta-dot">
                    <svg width="8" height="8" viewBox="0 0 10 10">
                      <path d={up ? 'M5 1l4 6H1z' : 'M5 9L1 3h8z'} fill="currentColor" />
                    </svg>
                  </span>
                  {c.fmtDelta(c.delta)}
                </div>
              </div>
              <Sparkline data={c.series.slice(-20)} labels={pointLabels(c).slice(-20)} format={c.fmt} color={up ? 'var(--text)' : 'var(--loss)'} />
            </motion.div>
          )
        })}
      </motion.div>
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
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const pages = useMemo(() => {
    const best = [...matches].sort((a, b) => b.score - a.score).slice(0, 9)
    const out: MatchSummary[][] = []
    for (let i = 0; i < best.length; i += 3) out.push(best.slice(i, i + 3))
    return out
  }, [matches])
  const [[idx, dir], setIdx] = useState<[number, number]>([0, 0])
  const page = pages.length ? pages[((idx % pages.length) + pages.length) % pages.length] : []
  const go = (d: number) => setIdx(([i]) => [i + d, d])

  if (live) {
    const me = live.allPlayers.find((p) => [p.riotIdGameName, p.summonerName].includes(live.activePlayer?.riotIdGameName ?? live.activePlayer?.summonerName))
    const myTeam = me?.team ?? 'ORDER'
    const opp = live.allPlayers.find((p) => p.team !== myTeam && p.position === me?.position) ?? live.allPlayers.find((p) => p.team !== myTeam)
    const ally = live.allPlayers.find((p) => p.team === myTeam && p !== me)
    const panels = [me, opp, ally].filter(Boolean) as LiveData['allPlayers']
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
    const champ = (p?: Featured['participants'][number]) => (p ? champs[p.championId] ?? '' : '')
    // mid laners are the usual faces of a broadcast; fall back to the first player
    const a = blue[2] ?? blue[0]
    const b = red[2] ?? red[0]
    const secs = g.gameStartTime > 0 ? Math.max(0, (now - g.gameStartTime) / 1000) : g.gameLength
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
          <span className="rec-dot" /> <b>{clock(secs)}</b> <span className="chip">{(PLATFORMS[platform] ?? platform).toUpperCase()}</span>
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
                <Champ key={i} name={champ(p)} size={24} radius={6} />
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
                <Champ key={i} name={champ(p)} size={24} radius={6} />
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
                  {m.champion} · {m.win ? t('Победа') : t('Поражение')}
                </span>
              </div>
              <span className={`show-score ${badge(m).tone}`}>{m.score}</span>
            </button>
          ))}
        </motion.div>
      </AnimatePresence>
      <div className="show-top">
        <Icon name="star" size={15} /> <b>{t('Лучшие игры')}</b> <span className="chip">{t('по оценке')}</span>
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
            <Icon name="left" size={22} />
          </motion.button>
          <motion.button className="show-arrow right" onClick={() => go(1)} whileHover={{ x: 3 }} aria-label={t('Вперёд')}>
            <Icon name="right" size={22} />
          </motion.button>
        </>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- last game + recent list
function LastGame({ matches, onOpen, onAll }: { matches: MatchSummary[]; onOpen: (id: string) => void; onAll: () => void }) {
  const m = matches[0]
  if (!m) return <Card className="last empty">{t('Нет игр в этом режиме')}</Card>
  return (
    <Card className="last">
      <button className="last-main" onClick={() => onOpen(m.id)}>
        <Splash src={matchSplash(m)} fallback={champSplash(m.champion)} position="center 15%" />
        <div className="last-shade" />
        <div className="last-top">
          <span className={`result ${m.win ? 'win' : 'loss'}`}>{m.win ? t('ПОБЕДА') : t('ПОРАЖЕНИЕ')}</span>
          <span className="chip">{duration(m.durationSec)}</span>
        </div>
        <div className="last-bottom">
          <div className="last-who">
            <Champ name={m.champion} size={38} radius={19} />
            <div>
              <b>{t('Полная игра')}</b>
              <div className="muted small">
                {queueLabel(m.queueId, m.mode)} · {ago(m.endedAt)}
              </div>
            </div>
          </div>
          <div className="last-kda">
            {m.kills} / <span className="d">{m.deaths}</span> / {m.assists} <span className="accent">{kdaRatio(m.kills, m.deaths, m.assists)} KDA</span>
          </div>
        </div>
      </button>
      <div className="last-list">
        {matches.slice(1, 5).map((g, i) => (
          <motion.button
            key={g.id}
            className="last-row"
            onClick={() => onOpen(g.id)}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 + i * 0.06, duration: 0.4, ease }}
            whileHover={{ x: 3 }}
          >
            <div className="thumb">
              <Champ name={g.champion} size={46} radius={8} />
              <span className="dur">{duration(g.durationSec)}</span>
            </div>
            <div>
              <div className={g.win ? '' : 'loss-text'}>{g.champion}</div>
              <div className="muted small">{ago(g.endedAt)}</div>
            </div>
          </motion.button>
        ))}
        <button className="see-all" onClick={onAll}>
          {t('Все игры')} <Icon name="right" size={14} />
        </button>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- bottom row
function OverlayPromo({ live, onOpen }: { live: LiveData | null; onOpen: () => void }) {
  const [tick, setT] = useState(1185)
  useEffect(() => {
    if (live) return
    const id = setInterval(() => setT((v) => (v >= 1260 ? 1185 : v + 1)), 1000)
    return () => clearInterval(id)
  }, [live])
  const timers = objectiveTimers(live ?? demoLive(tick)).slice(0, 3)
  return (
    <Card className="promo" onClick={onOpen}>
      <div className="promo-timers">
        {timers.map((x) => (
          <div key={x.id} className="mini-timer">
            <Ring value={x.remaining ? 100 - (x.remaining / x.window) * 100 : 100} size={30} stroke={2.5} color={x.remaining ? 'var(--accent)' : 'var(--win)'}>
              <ObjectiveGlyph id={x.id} />
            </Ring>
            <b>{x.remaining ? clock(x.remaining) : 'UP'}</b>
          </div>
        ))}
      </div>
      <div className="promo-panel">
        <div className="promo-brand">
          <Icon name="bolt" size={12} /> RIFT PULSE
        </div>
        {[
          ['CS', '7.1 / 6.2'],
          ['GPM', '452 / 392'],
          ['KDA', '7.2 / 2.8'],
          ['KP%', '37 / 35'],
        ].map(([k, v]) => (
          <div key={k} className="promo-line">
            <span>{k}</span>
            <b>{v}</b>
            <Sparkline data={[3, 4, 3.5, 5, 4.6, 6, 5.8]} width={34} height={10} color="var(--accent-2)" dot={false} />
          </div>
        ))}
      </div>
      <div className="promo-foot">
        {t('Оверлеи')} <Icon name="arrow" size={14} />
      </div>
    </Card>
  )
}

export function ObjectiveGlyph({ id }: { id: string }) {
  const d: Record<string, string> = {
    dragon: 'M4 14c3-1 4-5 8-6 3-1 6 1 8 3-2 0-3 1-4 2 1 2 0 5-3 6-1-2-3-2-5-1-1-2-2-3-4-4z',
    elder: 'M4 14c3-1 4-5 8-6 3-1 6 1 8 3-2 0-3 1-4 2 1 2 0 5-3 6-1-2-3-2-5-1-1-2-2-3-4-4z',
    baron: 'M12 3c3 2 6 5 6 9a6 6 0 0 1-12 0c0-4 3-7 6-9zM9 12h.01M15 12h.01',
    herald: 'M12 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM12 9v3l2 2',
    grubs: 'M6 14a3 3 0 1 1 6 0 3 3 0 0 1-6 0zM12 10a3 3 0 1 1 6 0 3 3 0 0 1-6 0z',
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d[id]} />
    </svg>
  )
}

/** owned skins from the last collection snapshot, like DPM's collections tile; mastery until one exists */
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
              <span className="muted">
                {t('{champ}, уровень {level}', { champ: top.champion, level: top.level })}
              </span>
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

function Lens({ matches }: { matches: MatchSummary[] }) {
  const cards = statCards(matches)
  const [i, setI] = useState(1)
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % cards.length), 7000)
    return () => clearInterval(id)
  }, [cards.length])
  const c = cards[i]
  const pct = c.key === 'score' ? c.value : null
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
          <Sparkline data={c.series} labels={pointLabels(c)} format={c.fmt} width={260} height={90} color="var(--gold)" stretch />
          <div className="muted small">{c.label}</div>
          <div className="lens-title">{t('Среднее за {n} игр', { n: matches.length })}</div>
          <div className="lens-value">
            {matches.length ? <Counter value={c.value} format={c.fmt} /> : '–'}
            {pct !== null && <span>/100</span>}
          </div>
        </motion.div>
      </AnimatePresence>
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
    <Card className="rank">
      <AnimatePresence mode="wait">
        <motion.div key={q} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.3, ease }} className="rank-inner">
          <div>
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
                  <span className="muted">
                    {e.wins}W - {e.losses}L ({wr}%)
                  </span>
                </div>
              </>
            ) : (
              <div className="rank-tier muted">{t('Без ранга')}</div>
            )}
          </div>
          {e && (
            <motion.div className="emblem" initial={{ scale: 0.6, rotate: -10, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={spring}>
              <Img src={rankEmblem(e.tier)} alt={e.tier} size={150} radius={0} />
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
      <LpTrend data={data} queue={q} />
    </Card>
  )
}

/** LP over time from the snapshots the app keeps, plus the last LP gains and losses. */
function LpTrend({ data, queue }: { data: PlayerData; queue: string }) {
  const list = useMemo(() => lpHistory(data, queue), [data, queue])
  const changes = useMemo(() => lpChanges(list).slice(-8).reverse(), [list])
  if (list.length < 2)
    return <p className="lp-empty muted small">{t('График LP появится после следующих игр: программа запоминает ваш ранг при каждой загрузке профиля.')}</p>
  const week = list.filter((s) => s.at >= Date.now() - 7 * 86400_000)
  const delta = week.length ? list[list.length - 1].v - week[0].v : 0
  const dateFmt = (ts: number) => new Date(ts).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  return (
    <div className="lp-trend">
      <div className="lp-trend-head">
        <span className="muted small">{t('LP за время')}</span>
        {week.length > 1 && <b className={delta >= 0 ? 'good' : 'bad'}>{t('{v} LP за 7 дней', { v: `${delta >= 0 ? '+' : ''}${delta}` })}</b>}
      </div>
      <Sparkline
        data={list.map((s) => s.v)}
        width={300}
        height={70}
        stretch
        dot={false}
        color="var(--accent-2)"
        labels={list.map((s) => `${dateFmt(s.at)} · ${s.tier} ${['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(s.tier) ? '' : s.rank}`)}
        format={(v) => `${list.find((s) => s.v === v)?.lp ?? ''} LP`}
      />
      {changes.length > 0 && (
        <div className="lp-changes">
          {changes.map((c, i) => (
            <span key={i} className={c.delta >= 0 ? 'good' : 'bad'} title={dateFmt(c.at)}>
              {c.delta >= 0 ? '+' : ''}
              {c.delta}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function ringColor(m: MatchSummary) {
  if (!m.win) return m.score >= 80 ? 'var(--accent-2)' : 'var(--loss)'
  return m.placement === 1 ? 'var(--gold)' : 'var(--text)'
}

function MatchList({ matches, onOpen }: { matches: MatchSummary[]; onOpen: (id: string) => void }) {
  const [limit, setLimit] = useState(6)
  if (!matches.length) return <Card className="empty">{t('Нет игр в этом режиме')}</Card>
  return (
    <motion.section className="match-list" variants={fadeUp}>
      <AnimatePresence initial={false} mode="popLayout">
        {matches.slice(0, limit).map((m, i) => {
          const b = badge(m)
          return (
            <motion.button
              layout
              key={m.id}
              className={`match ${m.win ? 'win' : 'loss'}`}
              onClick={() => onOpen(m.id)}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: Math.min(i, 8) * 0.04, duration: 0.4, ease } }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
              whileHover={{ x: -3 }}
            >
              <div className="match-meta">
                <div>
                  <b>{duration(m.durationSec)}</b> <span className="muted">{ago(m.endedAt)}</span>
                </div>
                <div className="match-queue">{queueLabel(m.queueId, m.mode)}</div>
              </div>
              <div className="match-champ">
                <Champ name={m.champion} size={42} radius={10} />
                {m.allies[0] && (
                  <span className="match-duo">
                    <Champ name={m.allies[0]} size={20} radius={5} />
                  </span>
                )}
              </div>
              <div className="match-kda">
                <div>
                  {m.kills} <span className="muted">/</span> <span className="d">{m.deaths}</span> <span className="muted">/</span> {m.assists}
                </div>
                <div className="muted small">{kdaRatio(m.kills, m.deaths, m.assists)} KDA</div>
              </div>
              <Ring value={m.score} color={ringColor(m)} size={44}>
                <b>{m.score}</b>
                <span className={`badge ${b.tone}`}>{b.text}</span>
              </Ring>
            </motion.button>
          )
        })}
      </AnimatePresence>
      {limit < matches.length && (
        <motion.button className="more" onClick={() => setLimit((l) => l + 6)} aria-label={t('Показать ещё')} animate={{ y: [0, 3, 0] }} transition={{ repeat: Infinity, duration: 1.8 }}>
          <Icon name="chevron" />
          <Icon name="chevron" />
        </motion.button>
      )}
    </motion.section>
  )
}

function ChampionPerformance({ matches, onAll }: { matches: MatchSummary[]; onAll: () => void }) {
  const aggs = championAggs(matches)
  const top = aggs.slice(0, 3)
  const podium = [top[1], top[0], top[2]].filter(Boolean)
  const roles = roleAggs(matches)
  return (
    <Card className="champ-perf">
      <h3 className="card-title center">
        <Icon name="swords" size={16} /> {t('Чемпионы')}
      </h3>
      <div className="podium">
        {podium.map((c, i) => (
          <motion.div
            key={c.champion}
            className={`podium-item ${c === top[0] ? 'first' : ''}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: c === top[0] ? -10 : 0 }}
            transition={{ delay: 0.2 + i * 0.08, ...spring }}
          >
            <Champ name={c.champion} size={c === top[0] ? 56 : 44} />
            <div className="podium-name">{c.champion}</div>
            <div className="podium-wl">
              {c.wins}W - {c.games - c.wins}L
            </div>
            <div className="muted small">
              {c.kills.toFixed(1)} / {c.deaths.toFixed(1)} / {c.assists.toFixed(1)}
            </div>
          </motion.div>
        ))}
      </div>
      <div className="champ-more">
        {aggs.slice(3, 8).map((c) => (
          <motion.span key={c.champion} title={`${c.champion}: ${c.wins}W ${c.games - c.wins}L`} whileHover={{ y: -3, scale: 1.08 }}>
            <Champ name={c.champion} size={28} radius={7} />
          </motion.span>
        ))}
        <button className="pill" onClick={onAll}>
          {t('ВСЕ')}
        </button>
      </div>
      <div className="roles">
        {roles.map((r) => (
          <div key={r.id} className={`role ${r.games ? '' : 'dim'}`} title={r.label}>
            <RoleIcon role={r.id} size={24} />
            <span className="role-name">{r.label}</span>
            <b>{r.games ? `${Math.round((r.wins / r.games) * 100)}%` : '–'}</b>
            <span className="muted tiny">{t('{n} игр', { n: r.games })}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

/** "16 авг · Ahri" for every point of a stat card's series */
function pointLabels(c: { dates: number[]; champs: string[] }) {
  return c.dates.map((d, i) => `${new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short' })} · ${champName(c.champs[i])}`)
}

