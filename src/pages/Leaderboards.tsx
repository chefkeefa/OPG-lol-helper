import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CustomBoards } from './CustomBoards'
import { AnimatePresence, motion } from 'motion/react'
import { PLATFORMS, RiotError } from '../api/riot'
import { cachedName, loadLadder, resolveName, type ApexTier, type LadderEntry } from '../api/leaderboard'
import { rankEmblem } from '../lib/ddragon'
import { Icon, Img, Segmented, Skeleton, ease } from '../components/ui'
import type { Page } from '../types'
import { fmtNum, t } from '../lib/i18n'

const TIERS: { id: ApexTier; label: string }[] = [
  { id: 'challenger', label: 'Challenger' },
  { id: 'grandmaster', label: 'Grandmaster' },
  { id: 'master', label: 'Master' },
]

export function Leaderboards(props: { defaultPlatform: string; onOpenPlayer: (riotId: string, platform: string) => void; navigate: (p: Page) => void; toast: (msg: string, kind?: 'err' | 'info') => void }) {
  const [mode, setMode] = useState<'ladder' | 'mine'>(() => (localStorage.getItem('riftpulse.boards.mode') === 'mine' ? 'mine' : 'ladder'))
  const switcher = (
    <Segmented
      id="lb-mode"
      value={mode}
      onChange={(m) => {
        setMode(m)
        try {
          localStorage.setItem('riftpulse.boards.mode', m)
        } catch {}
      }}
      options={[
        { id: 'ladder', label: t('Лестница') },
        { id: 'mine', label: t('Свои лидерборды') },
      ]}
    />
  )
  if (mode === 'ladder') return <Ladder {...props} switcher={switcher} />
  return (
    <div className="page">
      <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <h1>
          <Icon name="trophy" size={30} /> {t('Лидеры')}
        </h1>
        <div className="push" />
        {switcher}
      </motion.div>
      <CustomBoards defaultPlatform={props.defaultPlatform} onOpenPlayer={props.onOpenPlayer} toast={props.toast} />
    </div>
  )
}

function Ladder({
  defaultPlatform,
  onOpenPlayer,
  navigate,
  switcher,
}: {
  defaultPlatform: string
  onOpenPlayer: (riotId: string, platform: string) => void
  navigate: (p: Page) => void
  switcher: ReactNode
}) {
  const [platform, setPlatform] = useState(defaultPlatform)
  const [tier, setTier] = useState<ApexTier>('challenger')
  const [rows, setRows] = useState<LadderEntry[] | null>(null)
  const [error, setError] = useState<{ text: string; key: boolean } | null>(null)
  const [limit, setLimit] = useState(50)
  const [names, setNames] = useState<Record<string, { gameName: string; tagLine: string }>>({})
  const job = useRef(0)

  useEffect(() => {
    const id = ++job.current
    setRows(null)
    setError(null)
    setLimit(50)
    loadLadder(platform, tier)
      .then((r) => id === job.current && setRows(r))
      .catch((e) => {
        if (id !== job.current) return
        const status = e instanceof RiotError ? e.status : 0
        setError(
          status === 401 || status === 403
            ? { text: t('Для таблицы лидеров нужен действующий ключ Riot API.'), key: true }
            : { text: e instanceof RiotError ? t('Ошибка Riot API ({status}): {message}', { status: e.status, message: e.message }) : t('Не удалось загрузить таблицу.'), key: false },
        )
      })
  }, [platform, tier])

  // Look up Riot IDs for the visible rows, two at a time, keeping within the dev-key rate limit.
  useEffect(() => {
    if (!rows) return
    const id = job.current
    const todo = rows.slice(0, limit).filter((r) => !names[r.puuid])
    const cached: typeof names = {}
    for (const r of todo) {
      const c = cachedName(r.puuid)
      if (c) cached[r.puuid] = c
    }
    if (Object.keys(cached).length) setNames((n) => ({ ...n, ...cached }))
    const queue = todo.filter((r) => !cached[r.puuid])
    let stop = false
    const worker = async () => {
      while (!stop && queue.length && id === job.current) {
        const r = queue.shift()!
        try {
          const a = await resolveName(platform, r.puuid)
          if (!stop) setNames((n) => ({ ...n, [r.puuid]: a }))
        } catch (e) {
          if (e instanceof RiotError && (e.status === 401 || e.status === 403)) return
        }
      }
    }
    worker()
    worker()
    return () => {
      stop = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, limit, platform])

  return (
    <div className="page">
      <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <h1>
          <Icon name="trophy" size={30} /> {t('Лидеры')}
        </h1>
        <p className="page-sub">{t('Лучшие игроки ранговой очереди Solo/Duo по региону. Нажмите на игрока, чтобы открыть его профиль.')}</p>
        <div className="push" />
        {switcher}
        <Segmented id="ladder-tier" options={TIERS} value={tier} onChange={setTier} />
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label={t('Регион')}>
          {Object.entries(PLATFORMS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </motion.div>

      {error ? (
        <motion.div className="card ladder-error" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <p>{error.text}</p>
          {error.key && (
            <button className="btn primary" onClick={() => navigate('settings')}>
              {t('Добавить ключ в настройках')}
            </button>
          )}
        </motion.div>
      ) : (
        <motion.section className="card ladder" key={`${platform}-${tier}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease }}>
          <div className="ladder-row head">
            <span>#</span>
            <span>{t('Игрок')}</span>
            <span>LP</span>
            <span>{t('Победы / поражения')}</span>
            <span>{t('Винрейт')}</span>
          </div>
          {!rows &&
            Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="ladder-row">
                <Skeleton h={14} w={24} />
                <Skeleton h={14} w="60%" />
                <Skeleton h={14} w={50} />
                <Skeleton h={14} w={90} />
                <Skeleton h={14} w={70} />
              </div>
            ))}
          <AnimatePresence initial={false}>
            {rows?.slice(0, limit).map((r, i) => {
              const n = names[r.puuid]
              const wr = r.wins / Math.max(1, r.wins + r.losses)
              return (
                <motion.div
                  key={r.puuid}
                  className={`ladder-row ${i < 3 ? `top top${i + 1}` : ''}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i % 50, 20) * 0.02, duration: 0.35, ease } }}
                >
                  <span className="ladder-pos">{i + 1}</span>
                  <span className="ladder-player">
                    <Img src={rankEmblem(tier)} alt="" size={30} radius={0} />
                    {n ? (
                      <button onClick={() => onOpenPlayer(`${n.gameName}#${n.tagLine}`, platform)}>
                        <b>{n.gameName}</b> <span className="muted">#{n.tagLine}</span>
                      </button>
                    ) : (
                      <Skeleton h={13} w={140} />
                    )}
                    {r.hotStreak && (
                      <span className="hot" title={t('Серия побед')}>
                        <Icon name="bolt" size={13} />
                      </span>
                    )}
                  </span>
                  <span className="ladder-lp">{fmtNum(r.leaguePoints)} LP</span>
                  <span>
                    <span className="win-text">{r.wins}W</span> <span className="loss-text">{r.losses}L</span>
                  </span>
                  <span className="ladder-wr">
                    <span>{Math.round(wr * 100)}%</span>
                    <span className="wr-bar">
                      <motion.span initial={{ width: 0 }} animate={{ width: `${wr * 100}%` }} transition={{ duration: 0.8, ease }} />
                    </span>
                  </span>
                </motion.div>
              )
            })}
          </AnimatePresence>
          {rows && limit < rows.length && (
            <button className="more wide" onClick={() => setLimit((l) => l + 50)}>
              {t('Показать ещё 50')} <Icon name="chevron" size={16} />
            </button>
          )}
          {rows && !rows.length && <div className="muted pad">{t('В этой лиге пока никого нет.')}</div>}
        </motion.section>
      )}
    </div>
  )
}
