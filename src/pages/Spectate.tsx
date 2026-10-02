import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { PLATFORMS, RiotError, regionalOf, riot } from '../api/riot'
import { cachedName, loadLadder } from '../api/leaderboard'
import { championMap, champName } from '../lib/ddragon'
import { queueLabel } from '../lib/stats'
import { Champ, Icon, Skeleton, ease, fadeUp, stagger } from '../components/ui'

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

const DEMO: SpecGame[] = [
  {
    gameId: 1,
    gameMode: 'CLASSIC',
    gameQueueConfigId: 420,
    gameStartTime: Date.now() - 14 * 60_000,
    gameLength: 840,
    platformId: 'EUW1',
    owner: 'Challenger #1',
    participants: [
      ['Aatrox', 100], ['LeeSin', 100], ['Ahri', 100], ['Kaisa', 100], ['Nautilus', 100],
      ['KSante', 200], ['Viego', 200], ['Syndra', 200], ['Jinx', 200], ['Lulu', 200],
    ].map(([c, t], i) => ({ puuid: String(i), championId: 0, teamId: t as number, riotId: `${c}#demo` })),
  },
]

export function Spectate({ defaultPlatform, toast }: { defaultPlatform: string; toast: (t: string, tone?: 'err' | 'info') => void }) {
  const [platform, setPlatform] = useState(defaultPlatform)
  const [featured, setFeatured] = useState<SpecGame[] | null>(null)
  const [top, setTop] = useState<SpecGame[] | null>(null)
  const [scan, setScan] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<SpecGame | null | 'none'>(null)
  const [champs, setChamps] = useState<Record<number, string>>({})
  const [err, setErr] = useState('')
  const desktop = Boolean(window.rp)

  useEffect(() => {
    championMap().then(setChamps)
  }, [])
  useEffect(() => {
    setFeatured(null)
    setErr('')
    riot<{ gameList: SpecGame[] }>(platform, '/lol/spectator/v5/featured-games')
      .then((r) => setFeatured(r.gameList))
      .catch((e) => {
        if (!desktop) {
          setFeatured(DEMO)
          setErr('Пример. Для настоящих игр нужна десктоп-версия или ключ Riot API.')
        } else {
          setFeatured([])
          setErr(e instanceof RiotError && (e.status === 401 || e.status === 403) ? 'Нужен действующий ключ Riot API (Настройки).' : 'Не удалось загрузить игры.')
        }
      })
  }, [platform, desktop])

  const scanTop = async () => {
    setTop([])
    setScan(0)
    try {
      const ladder = (await loadLadder(platform, 'challenger')).slice(0, 30)
      let done = 0
      for (const p of ladder) {
        try {
          const g = await riot<SpecGame>(platform, `/lol/spectator/v5/active-games/by-summoner/${p.puuid}`)
          const n = cachedName(p.puuid)
          setTop((t) => [...(t ?? []).filter((x) => x.gameId !== g.gameId), { ...g, owner: n ? `${n.gameName} · ${p.leaguePoints} LP` : `${p.leaguePoints} LP` }])
        } catch {}
        setScan(++done / ladder.length)
      }
    } catch (e) {
      toast(e instanceof RiotError ? `Riot API ${e.status}` : 'Не удалось получить таблицу лидеров')
    } finally {
      setScan(null)
    }
  }

  const lookup = async () => {
    const [name, tag] = q.split('#').map((s) => s.trim())
    if (!name || !tag) return toast('Введите Riot ID в формате Имя#Тег', 'info')
    setFound(null)
    try {
      const acc = await riot<{ puuid: string }>(regionalOf(platform), `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`)
      const g = await riot<SpecGame>(platform, `/lol/spectator/v5/active-games/by-summoner/${acc.puuid}`)
      setFound({ ...g, owner: `${name}#${tag}` })
    } catch (e) {
      if (e instanceof RiotError && e.status === 404) setFound('none')
      else toast(e instanceof RiotError ? `Riot API ${e.status}: ${e.message}` : 'Ошибка')
    }
  }

  const watch = async (g: SpecGame) => {
    if (!window.rp) return toast('Наблюдение запускается через клиент LoL в десктоп-версии.', 'info')
    const p = g.participants.find((x) => x.puuid) ?? g.participants[0]
    const r = await window.rp.spectate(p.puuid, p.riotId?.split('#')[0] ?? '')
    toast(r.ok ? 'Запускаю наблюдение в клиенте…' : `Не удалось: ${r.error}`, r.ok ? 'info' : 'err')
  }

  const card = (g: SpecGame) => <GameCard key={g.gameId} g={g} champs={champs} onWatch={() => watch(g)} />

  return (
    <div className="page">
      <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <h1>
          <Icon name="tv" size={28} /> Наблюдение
        </h1>
        <select className="plain-select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
          {Object.entries(PLATFORMS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </motion.div>

      <div className="spec-search card">
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lookup()} placeholder="Найти игру игрока: Имя#Тег" />
        <button className="btn primary" onClick={lookup}>
          Найти
        </button>
      </div>
      <AnimatePresence mode="wait">
        {found === 'none' && (
          <motion.p key="none" className="muted pad" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            Игрок сейчас не в игре.
          </motion.p>
        )}
        {found && found !== 'none' && (
          <motion.div key="found" className="spec-grid" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {card(found)}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="section-head">
        <h2>Топ Challenger в игре</h2>
        <button className="btn" onClick={scanTop} disabled={scan !== null}>
          {scan !== null ? `Проверяю… ${Math.round(scan * 100)}%` : 'Проверить топ-30'}
        </button>
      </div>
      {top && (
        <motion.div className="spec-grid" variants={stagger} initial="hidden" animate="show">
          {top.map(card)}
          {!top.length && scan === null && <p className="muted">Никто из топ-30 сейчас не играет.</p>}
        </motion.div>
      )}

      <div className="section-head">
        <h2>Избранные игры</h2>
      </div>
      {err && <p className="muted">{err}</p>}
      {!featured ? (
        <div className="spec-grid">
          <Skeleton h={180} r={14} />
          <Skeleton h={180} r={14} />
        </div>
      ) : (
        <motion.div className="spec-grid" variants={stagger} initial="hidden" animate="show">
          {featured.map(card)}
        </motion.div>
      )}
    </div>
  )
}

function GameCard({ g, champs, onWatch }: { g: SpecGame; champs: Record<number, string>; onWatch: () => void }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const elapsed = g.gameStartTime ? Math.max(0, Math.floor((now - g.gameStartTime) / 1000)) : g.gameLength
  const team = (id: number) => g.participants.filter((p) => p.teamId === id)
  const champ = (p: SpecPlayer) => champs[p.championId] ?? p.riotId?.split('#')[0] ?? ''
  return (
    <motion.div className="card spec-card" variants={fadeUp}>
      <div className="spec-card-head">
        <span>
          <b>{queueLabel(g.gameQueueConfigId)}</b>
          {g.owner && <em className="muted"> · {g.owner}</em>}
        </span>
        <span className="live-time">
          <i /> {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
        </span>
      </div>
      <div className="spec-teams">
        {[100, 200].map((t) => (
          <div key={t} className={`spec-team ${t === 100 ? 'blue' : 'red'}`}>
            {team(t).map((p, i) => (
              <span key={i} className="spec-p" title={p.riotId}>
                <Champ name={champ(p)} size={30} radius={8} />
                <span>{p.riotId?.split('#')[0] ?? champName(champ(p))}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
      <motion.button className="btn primary spec-watch" whileTap={{ scale: 0.96 }} onClick={onWatch}>
        <Icon name="eye" size={16} /> Смотреть
      </motion.button>
    </motion.div>
  )
}
