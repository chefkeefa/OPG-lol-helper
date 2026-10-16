import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CustomBoards } from './CustomBoards'
import { AnimatePresence, motion } from 'motion/react'
import { PLATFORMS, RiotError } from '../api/riot'
import { bestChamps, cachedIcon, cachedName, demoApex, loadApex, profileIconOf, resolveName, type Apex, type ApexTier, type LadderQueue } from '../api/leaderboard'
import { championMap, profileIcon, rankEmblem } from '../lib/ddragon'
import { Champ, Counter, Icon, Img, Segmented, Skeleton, ease } from '../components/ui'
import { NavIcon } from '../components/NavIcons'
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
          <NavIcon name="trophy" size={26} /> {t('Лидеры')}
        </h1>
        <div className="push" />
        {switcher}
      </motion.div>
      <CustomBoards defaultPlatform={props.defaultPlatform} onOpenPlayer={props.onOpenPlayer} toast={props.toast} />
    </div>
  )
}

type TierPick = 'all' | ApexTier
const TIER_PICKS: { id: TierPick; label: string }[] = [{ id: 'all', label: t('Все') }, ...TIERS]
const QUEUES: { id: LadderQueue; label: string }[] = [
  { id: 'RANKED_SOLO_5x5', label: 'SoloQ' },
  { id: 'RANKED_FLEX_SR', label: 'Flex' },
]

function BestChamps({ ids, map, size = 26 }: { ids?: number[]; map: Record<number, string>; size?: number }) {
  if (!ids) return <span className="lb-champs" />
  return (
    <span className="lb-champs">
      {ids.map((id) => (map[id] ? <Champ key={id} name={map[id]} size={size} radius={7} /> : null))}
    </span>
  )
}

function Avatar({ icon }: { icon?: number }) {
  return <span className="lb-ava">{icon != null && <img src={profileIcon(icon)} alt="" loading="lazy" />}</span>
}

function WinBox({ wins, losses }: { wins: number; losses: number }) {
  const wr = wins / Math.max(1, wins + losses)
  return (
    <span className="lb-wrbox">
      <span>
        {wins}
        <em>W</em> – {losses}
        <em>L</em>
      </span>
      <b className={wr >= 0.6 ? 'hi' : wr >= 0.57 ? 'mid' : ''}>{Math.round(wr * 100)}%</b>
    </span>
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
  const [tier, setTier] = useState<TierPick>('all')
  const [queue, setQueue] = useState<LadderQueue>('RANKED_SOLO_5x5')
  const [apex, setApex] = useState<Apex | null>(null)
  const [demo, setDemo] = useState(false)
  const [error, setError] = useState<{ text: string; key: boolean } | null>(null)
  const [limit, setLimit] = useState(50)
  const [names, setNames] = useState<Record<string, { gameName: string; tagLine: string }>>({})
  const [best, setBest] = useState<Record<string, number[]>>({})
  const [icons, setIcons] = useState<Record<string, number>>({})
  const [champs, setChamps] = useState<Record<number, string>>({})
  const job = useRef(0)

  useEffect(() => {
    championMap().then(setChamps)
  }, [])
  useEffect(() => {
    const id = ++job.current
    setApex(null)
    setError(null)
    setLimit(50)
    loadApex(platform, queue)
      .then((r) => id === job.current && (setApex(r), setDemo(false)))
      .catch((e) => {
        if (id !== job.current) return
        const status = e instanceof RiotError ? e.status : 0
        // the web preview has no key: show what the page looks like with made-up players
        if (!window.rp && (status === 401 || status === 403 || !status)) {
          setApex(demoApex())
          setDemo(true)
          return
        }
        setError(
          status === 401 || status === 403
            ? { text: t('Для таблицы лидеров нужен действующий ключ Riot API.'), key: true }
            : { text: e instanceof RiotError ? t('Ошибка Riot API ({status}): {message}', { status: e.status, message: e.message }) : t('Не удалось загрузить таблицу.'), key: false },
        )
      })
  }, [platform, queue])

  const rows = useMemo(() => (apex ? (tier === 'all' ? apex.all : apex.all.filter((e) => e.tier === tier)) : null), [apex, tier])

  // Look up Riot IDs for the visible rows (and the best champions of the top 20), two at a time,
  // keeping within the dev-key rate limit.
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
    // the best champions of the top 20 first, then the names of every visible row
    const queueJobs: (() => Promise<void>)[] = []
    for (const r of rows.slice(0, 20)) if (!best[r.puuid]) queueJobs.push(() => bestChamps(platform, r.puuid).then((b) => setBest((x) => ({ ...x, [r.puuid]: b }))))
    for (const r of todo) if (!cached[r.puuid]) queueJobs.push(() => resolveName(platform, r.puuid).then((a) => setNames((n) => ({ ...n, [r.puuid]: a }))))
    // profile icons last: they are the least important part of a row
    const knownIcons: Record<string, number> = {}
    for (const r of rows.slice(0, limit)) {
      if (icons[r.puuid] != null) continue
      const c = cachedIcon(r.puuid)
      if (c != null) knownIcons[r.puuid] = c
      else queueJobs.push(() => profileIconOf(platform, r.puuid).then((i) => setIcons((x) => ({ ...x, [r.puuid]: i }))))
    }
    if (Object.keys(knownIcons).length) setIcons((x) => ({ ...x, ...knownIcons }))
    let stop = false
    const worker = async () => {
      while (!stop && queueJobs.length && id === job.current) {
        try {
          await queueJobs.shift()!()
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

  const podium = rows?.slice(0, 3) ?? []
  const region = PLATFORMS[platform] ?? platform.toUpperCase()
  const nameOf = (puuid: string) => names[puuid]
  const open = (puuid: string) => {
    const n = nameOf(puuid)
    if (n && !demo) onOpenPlayer(`${n.gameName}#${n.tagLine}`, platform)
  }

  return (
    <div className="page">
      <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <h1>
          <NavIcon name="trophy" size={26} /> {t('Лидеры')}
        </h1>
        <p className="page-sub">{t('Лучшие игроки региона. Нажмите на игрока, чтобы открыть его профиль.')}</p>
        <div className="push" />
        {switcher}
        <Segmented id="ladder-queue" options={QUEUES} value={queue} onChange={setQueue} />
      </motion.div>

      {demo && <div className="banner">{t('Пример данных: для настоящей таблицы добавьте ключ Riot API в настройках десктоп-версии.')}</div>}

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
        <motion.section className="card lb-board" key={`${platform}-${queue}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease }}>
          <div className="lb-tools">
            <Segmented id="ladder-tier" options={TIER_PICKS} value={tier} onChange={setTier} />
            <div className="push" />
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label={t('Регион')}>
              {Object.entries(PLATFORMS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="lb-cutoffs">
            {(['challenger', 'grandmaster'] as const).map((tr) => (
              <div key={tr} className="lb-cutoff">
                <span>{tr === 'challenger' ? t('Порог Challenger') : t('Порог Grandmaster')}</span>
                <b>
                  <Img src={rankEmblem(tr)} alt="" size={28} radius={0} />
                  {apex?.cutoff[tr] != null ? <Counter value={apex.cutoff[tr]!} format={(v) => fmtNum(Math.round(v))} /> : '—'} <em>LP</em>
                </b>
              </div>
            ))}
          </div>

          <div className="lb-podium">
            {podium.map((r, i) => {
              const n = nameOf(r.puuid)
              const g = r.wins + r.losses
              return (
                <motion.button
                  key={r.puuid}
                  className={`lb-podium-card p${i + 1}`}
                  onClick={() => open(r.puuid)}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * i, duration: 0.5, ease }}
                >
                  <div className="lb-podium-top">
                    <span className="lb-place">{i + 1}</span>
                    <span className="lb-region">{region}</span>
                    <Avatar icon={icons[r.puuid]} />
                    <span className="lb-podium-name">
                      {n ? (
                        <>
                          <b>{n.gameName}</b>
                          <span className="muted">#{n.tagLine}</span>
                        </>
                      ) : (
                        <Skeleton h={14} w={120} />
                      )}
                    </span>
                  </div>
                  <div className="lb-podium-lp">
                    <Img src={rankEmblem(r.tier ?? 'challenger')} alt="" size={44} radius={0} />
                    <Counter value={r.leaguePoints} format={(v) => fmtNum(Math.round(v))} /> <em>LP</em>
                  </div>
                  <div className="lb-podium-wl">
                    {r.wins}
                    <em>W</em> – {r.losses}
                    <em>L</em> <span>({Math.round((r.wins / Math.max(1, g)) * 100)}%)</span>
                  </div>
                  <div className="lb-podium-foot">
                    <span>
                      <b>{fmtNum(g)}</b> {t('игр')}
                    </span>
                    <BestChamps ids={best[r.puuid]} map={champs} size={28} />
                  </div>
                </motion.button>
              )
            })}
          </div>

          <div className="ladder-row lb-row head">
            <span>#</span>
            <span>{t('Игрок')}</span>
            <span>{t('Ранг')}</span>
            <span>{t('Винрейт')}</span>
            <span>{t('Лучшие чемпионы')}</span>
          </div>
          {!rows &&
            Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="ladder-row lb-row">
                <Skeleton h={14} w={24} />
                <Skeleton h={14} w="60%" />
                <Skeleton h={14} w={70} />
                <Skeleton h={14} w={130} />
                <Skeleton h={14} w={90} />
              </div>
            ))}
          <AnimatePresence initial={false}>
            {rows?.slice(3, limit).map((r, j) => {
              const i = j + 3
              const n = nameOf(r.puuid)
              return (
                <motion.div
                  key={r.puuid}
                  className="ladder-row lb-row"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(j % 50, 20) * 0.02, duration: 0.35, ease } }}
                >
                  <span className="ladder-pos">{i + 1}</span>
                  <span className="ladder-player">
                    <span className="lb-region">{region}</span>
                    <Avatar icon={icons[r.puuid]} />
                    {n ? (
                      <button className="lb-name" onClick={() => open(r.puuid)}>
                        <b>{n.gameName}</b>
                        <span className="muted">#{n.tagLine}</span>
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
                  <span className="ladder-lp">
                    <Img src={rankEmblem(r.tier ?? 'challenger')} alt="" size={26} radius={0} />
                    {fmtNum(r.leaguePoints)} LP
                  </span>
                  <WinBox wins={r.wins} losses={r.losses} />
                  <BestChamps ids={best[r.puuid]} map={champs} />
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
