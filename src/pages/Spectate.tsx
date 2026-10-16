import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { PLATFORMS, RiotError, regionalOf, riot } from '../api/riot'
import { loadApex, type Apex, type LadderEntry } from '../api/leaderboard'
import { championMap, champName, champTile, rankEmblem } from '../lib/ddragon'
import { queueLabel } from '../lib/stats'
import { fmtNum, t } from '../lib/i18n'
import { Icon, Img, Skeleton, ease, fadeUp, stagger } from '../components/ui'
import { NavIcon } from '../components/NavIcons'

interface SpecPlayer {
  puuid: string
  championId: number
  teamId: number
  riotId?: string
}
interface SpecGame {
  gameId: number
  gameMode: string
  gameQueueConfigId: number
  gameStartTime: number
  gameLength: number
  participants: SpecPlayer[]
  platformId: string
  /** whose game it is, for the label */
  owner?: string
}

type Known = Record<string, LadderEntry>

const DEMO_CHAMPS = [
  ['Yone', 'Viego', 'Viktor', 'Ezreal', 'Lulu', 'Camille', 'Nocturne', 'Ahri', 'Jinx', 'Braum'],
  ['Gwen', 'Kayn', 'Zoe', 'Jhin', 'Thresh', 'Darius', 'Talon', 'Sylas', 'Caitlyn', 'Leona'],
  ['Aatrox', 'LeeSin', 'Orianna', 'Kaisa', 'Nautilus', 'KSante', 'Elise', 'Syndra', 'Xayah', 'Rakan'],
  ['Renekton', 'Graves', 'Hwei', 'Varus', 'Alistar', 'Jax', 'Sejuani', 'Azir', 'Ashe', 'Bard'],
]
const DEMO_NAMES = ['Koalachan', 'TwTv Cas', 'Mercy9', 'Hydra', 'Lilipp', 'APP', 'MonkeyKing', 'Peng', 'MagiFelix', 'Targamas']
function demoGames(): { games: SpecGame[]; known: Known; champs: Record<number, string>; apex: Apex } {
  const champs: Record<number, string> = {}
  const known: Known = {}
  const games = DEMO_CHAMPS.map((list, gi) => ({
    gameId: gi + 1,
    gameMode: 'CLASSIC',
    gameQueueConfigId: 420,
    gameStartTime: Date.now() - (8 + gi * 6) * 60_000,
    gameLength: 0,
    platformId: gi % 2 ? 'KR' : 'EUW1',
    participants: list.map((c, i) => {
      const id = 1000 + gi * 10 + i
      champs[id] = c
      const puuid = `demo-${gi}-${i}`
      if ((i + gi) % 3 !== 1) known[puuid] = { puuid, leaguePoints: 2300 - gi * 260 - i * 13, wins: 200, losses: 170, tier: gi < 1 ? 'challenger' : 'grandmaster' }
      return { puuid, championId: id, teamId: i < 5 ? 100 : 200, riotId: `${DEMO_NAMES[(i + gi * 3) % 10]}#${gi}` }
    }),
  }))
  return { games, known, champs, apex: { all: Object.values(known), cutoff: { challenger: 1085, grandmaster: 671 } } }
}


export function Spectate({ defaultPlatform, toast }: { defaultPlatform: string; toast: (t: string, tone?: 'err' | 'info') => void }) {
  const [platform, setPlatform] = useState(defaultPlatform)
  const [games, setGames] = useState<SpecGame[] | null>(null)
  const [apex, setApex] = useState<Apex | null>(null)
  const [scan, setScan] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'rank' | 'time' | 'known'>('rank')
  const [found, setFound] = useState<SpecGame | null | 'none'>(null)
  const [champs, setChamps] = useState<Record<number, string>>({})
  const [err, setErr] = useState('')
  const [demo, setDemo] = useState(false)
  const job = useRef(0)
  const desktop = Boolean(window.rp)

  useEffect(() => {
    championMap().then((m) => setChamps((c) => ({ ...m, ...c })))
  }, [])

  // live games of the region's best players: the apex ladder, then the top 40 by LP one by one
  useEffect(() => {
    const id = ++job.current
    setGames(null)
    setErr('')
    setDemo(false)
    ;(async () => {
      let a: Apex
      try {
        a = await loadApex(platform, 'RANKED_SOLO_5x5')
      } catch (e) {
        if (id !== job.current) return
        if (!desktop) {
          const d = demoGames()
          setChamps((c) => ({ ...c, ...d.champs }))
          setApex(d.apex)
          setGames(d.games)
          setDemo(true)
          return
        }
        setGames([])
        setErr(e instanceof RiotError && (e.status === 401 || e.status === 403) ? t('Нужен действующий ключ Riot API (Настройки).') : t('Не удалось загрузить игры.'))
        return
      }
      if (id !== job.current) return
      setApex(a)
      setGames([])
      const top = [...a.all].sort((x, y) => y.leaguePoints - x.leaguePoints).slice(0, 40)
      const seen = new Set<string>()
      let done = 0
      setScan(0)
      const queue = [...top]
      const worker = async () => {
        while (queue.length && id === job.current) {
          const p = queue.shift()!
          if (!seen.has(p.puuid)) {
            try {
              const g = await riot<SpecGame>(platform, `/lol/spectator/v5/active-games/by-summoner/${p.puuid}`)
              for (const x of g.participants) seen.add(x.puuid)
              if (id === job.current) setGames((list) => (list?.some((x) => x.gameId === g.gameId) ? list : [...(list ?? []), g]))
            } catch {}
          }
          if (id === job.current) setScan(++done / top.length)
        }
      }
      await Promise.all([worker(), worker()])
      if (id === job.current) setScan(null)
    })()
  }, [platform, desktop])

  const known = useMemo<Known>(() => Object.fromEntries((apex?.all ?? []).map((e) => [e.puuid, e])), [apex])

  const lookup = async () => {
    const [name, tag] = q.split('#').map((s) => s.trim())
    if (!name || !tag) return
    setFound(null)
    try {
      const acc = await riot<{ puuid: string }>(regionalOf(platform), `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`)
      const g = await riot<SpecGame>(platform, `/lol/spectator/v5/active-games/by-summoner/${acc.puuid}`)
      setFound({ ...g, owner: `${name}#${tag}` })
    } catch (e) {
      if (e instanceof RiotError && e.status === 404) setFound('none')
      else toast(e instanceof RiotError ? `Riot API ${e.status}: ${e.message}` : t('Ошибка'))
    }
  }

  const watch = async (g: SpecGame) => {
    if (!window.rp || demo) return toast(t('Наблюдение запускается через клиент LoL в десктоп-версии.'), 'info')
    const p = g.participants.find((x) => known[x.puuid]) ?? g.participants.find((x) => x.puuid) ?? g.participants[0]
    const r = await window.rp.spectate(p.puuid, p.riotId?.split('#')[0] ?? '')
    toast(r.ok ? t('Запускаю наблюдение в клиенте…') : t('Не удалось: {error}', { error: r.error ?? '' }), r.ok ? 'info' : 'err')
  }

  const avgLp = (g: SpecGame) => {
    const k = g.participants.map((p) => known[p.puuid]).filter(Boolean)
    return k.length ? k.reduce((s, e) => s + e.leaguePoints, 0) / k.length : 0
  }
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = (games ?? []).filter(
      (g) => !s || s.includes('#') || g.participants.some((p) => p.riotId?.toLowerCase().includes(s) || (champs[p.championId] ?? '').toLowerCase().includes(s) || champName(champs[p.championId] ?? '').toLowerCase().includes(s)),
    )
    const knownCount = (g: SpecGame) => g.participants.filter((p) => known[p.puuid]).length
    const key = { rank: avgLp, time: (g: SpecGame) => -g.gameStartTime, known: knownCount }[sort]
    return list.sort((a, b) => key(b) - key(a))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, q, sort, known, champs])

  return (
    <div className="page">
      <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <h1>
          <NavIcon name="tv" size={26} /> {t('Наблюдение')}
        </h1>
        <p className="page-sub">{t('Живые ранговые игры лучших игроков региона.')}</p>
        <div className="push" />
        {scan !== null && <span className="collector-pill on">{t('Ищу игры… {pct}%', { pct: Math.round(scan * 100) })}</span>}
      </motion.div>

      <div className="spec-tools">
        <div className="spec-search card">
          <Icon name="search" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && q.includes('#') && lookup()} placeholder={t('Игрок или чемпион (Имя#Тег — найти любую игру)')} />
          {q.includes('#') && (
            <button className="btn primary" onClick={lookup}>
              {t('Найти')}
            </button>
          )}
        </div>
        <label className="select-pill">
          <span>{t('Регион')}</span>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {Object.entries(PLATFORMS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="select-pill">
          <span>{t('Сортировка')}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="rank">{t('Самые сильные')}</option>
            <option value="known">{t('Больше известных игроков')}</option>
            <option value="time">{t('Недавно начались')}</option>
          </select>
        </label>
      </div>

      {demo && <div className="banner">{t('Пример. Для настоящих игр нужна десктоп-версия или ключ Riot API.')}</div>}
      {err && <p className="muted">{err}</p>}

      <AnimatePresence mode="wait">
        {found === 'none' && (
          <motion.p key="none" className="muted pad" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {t('Игрок сейчас не в игре.')}
          </motion.p>
        )}
        {found && found !== 'none' && (
          <motion.div key="found" className="spec-list" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <GameRow g={found} champs={champs} known={known} apex={apex} platform={platform} onWatch={() => watch(found)} />
          </motion.div>
        )}
      </AnimatePresence>

      {!games ? (
        <div className="spec-list">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={140} r={12} />
          ))}
        </div>
      ) : (
        <motion.div className="spec-list" variants={stagger} initial="hidden" animate="show">
          {shown.map((g) => (
            <GameRow key={g.gameId} g={g} champs={champs} known={known} apex={apex} platform={platform} onWatch={() => watch(g)} />
          ))}
          {!shown.length && scan === null && !err && <p className="muted pad">{t('Сейчас никто из топа региона не играет.')}</p>}
        </motion.div>
      )}
    </div>
  )
}

function GameRow({
  g,
  champs,
  known,
  apex,
  platform,
  onWatch,
}: {
  g: SpecGame
  champs: Record<number, string>
  known: Known
  apex: Apex | null
  platform: string
  onWatch: () => void
}) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const elapsed = g.gameStartTime ? Math.max(0, Math.floor((now - g.gameStartTime) / 1000)) : g.gameLength
  const k = g.participants.map((p) => known[p.puuid]).filter(Boolean)
  const avg = k.length ? Math.round(k.reduce((s, e) => s + e.leaguePoints, 0) / k.length) : 0
  const tier = !k.length ? '' : apex?.cutoff.challenger != null && avg >= apex.cutoff.challenger ? 'challenger' : apex?.cutoff.grandmaster != null && avg >= apex.cutoff.grandmaster ? 'grandmaster' : 'master'
  const team = (id: number) => g.participants.filter((p) => p.teamId === id)
  const region = PLATFORMS[g.platformId?.toLowerCase()] ?? PLATFORMS[platform] ?? g.platformId
  return (
    <motion.div className={`card spec-row t-${tier || 'none'}`} variants={fadeUp}>
      <div className="spec-row-info">
        <div className="spec-row-time">
          <span className="live-time">
            <i /> {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
          </span>
          <span className="spec-region">{region}</span>
        </div>
        {tier ? (
          <div className="spec-avg">
            <Img src={rankEmblem(tier)} alt="" size={40} radius={0} />
            <span>
              <em>{t('в среднем')}</em>
              <b>{tier.toUpperCase()}</b>
              <strong>{fmtNum(avg)} LP</strong>
            </span>
          </div>
        ) : (
          <div className="spec-avg muted small">{queueLabel(g.gameQueueConfigId)}</div>
        )}
      </div>
      <div className="spec-row-teams">
        {[100, 200].map((side, si) => [
          si === 1 && <span key="vs" className="spec-vs">VS</span>,
          <div key={side} className={`spec-side ${si ? 'red' : 'blue'}`}>
            {team(side).map((p, i) => {
              const c = champs[p.championId] ?? ''
              const isKnown = Boolean(known[p.puuid])
              return (
                <span key={p.puuid || i} className={`spec-tile ${isKnown ? 'known' : ''}`} title={`${p.riotId ?? ''}${isKnown ? ` · ${fmtNum(known[p.puuid].leaguePoints)} LP` : ''}`}>
                  <span className="spec-face">{c && <img src={champTile(c)} alt="" loading="lazy" />}</span>
                  <b>{p.riotId?.split('#')[0] || champName(c)}</b>
                </span>
              )
            })}
          </div>,
        ])}
      </div>
      <div className="spec-row-side">
        <span className="muted small">{t('{n} известных игроков', { n: k.length })}</span>
        <motion.button className="btn primary spec-watch" whileTap={{ scale: 0.96 }} onClick={onWatch}>
          <Icon name="eye" size={16} /> {t('Смотреть')}
        </motion.button>
      </div>
    </motion.div>
  )
}
