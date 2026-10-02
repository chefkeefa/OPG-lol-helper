import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { LiveData, Page, PlayerData, QueueFilter } from './types'
import type { ClientStatus, DesktopSettings, UpdateState } from './env'
import { RiotError, getStoredKey, loadPlayer, proxyConfig } from './api/riot'
import { loadFromClient } from './api/client'
import { mockPlayer } from './data/mock'
import { benchmarks, filterMatches } from './lib/stats'
import { useDDragon } from './lib/ddragon'
import { demoLive } from './lib/objectives'
import { Sidebar } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { ease } from './components/ui'
import { Dashboard } from './pages/Dashboard'
import { Matches } from './pages/Matches'
import { Champions } from './pages/Champions'
import { Live } from './pages/Live'
import { Overlays } from './pages/Overlays'
import { Settings } from './pages/Settings'
import { Leaderboards } from './pages/Leaderboards'
import { TierList } from './pages/TierList'
import { Champion } from './pages/Champion'
import { Matchups } from './pages/Matchups'
import { Recordings } from './pages/Recordings'
import { Spectate } from './pages/Spectate'
import { Collections } from './pages/Collections'
import { Studio } from './pages/Studio'
import { championMap } from './lib/ddragon'
import { statsStatus } from './lib/statsApi'
import type { StatsStatus } from './lib/statsTypes'

const LAST = 'riftpulse.last'
// the signed-in account, remembered so it can be loaded via Riot API while League is closed
const ME = 'riftpulse.me'
const readMe = (): { riotId: string; platform: string } | null => {
  try {
    return JSON.parse(localStorage.getItem(ME) ?? 'null')
  } catch {
    return null
  }
}
const readLast = (): { riotId: string; platform: string } | null => {
  try {
    return JSON.parse(localStorage.getItem(LAST) ?? 'null')
  } catch {
    return null
  }
}

function errorText(e: unknown) {
  if (e instanceof RiotError) {
    if (e.status === 401) return 'Нет ключа Riot API. Добавьте его в настройках, чтобы искать других игроков.'
    if (e.status === 403) return 'Ключ Riot API недействителен или истёк (dev-ключ живёт 24 часа).'
    if (e.status === 404) return 'Игрок не найден. Проверьте Riot ID и регион.'
    if (e.status === 429) return 'Превышен лимит запросов Riot API, подождите пару минут.'
    return `Ошибка Riot API (${e.status}): ${e.message}`
  }
  if (window.rp) return 'Не удалось получить данные из клиента League of Legends. Убедитесь, что он запущен и вы вошли в аккаунт.'
  return 'Не удалось связаться с локальным прокси. Запустите приложение через npm run dev или npm run app.'
}

const WEB_SETTINGS: DesktopSettings = {
  riotApiKey: '',
  myRiotId: '',
  platform: 'euw1',
  overlayEnabled: false,
  overlayCorner: 'top-right',
  overlayScale: 1,
  overlayBenchmark: true,
  collectorEnabled: false,
  collectorPlatform: '',
  autoOpenChampion: true,
  autoImportRunes: true,
  autoImportItems: true,
  autoImportSpells: false,
  recordingEnabled: false,
  recordingFolder: '',
  recordingQuality: 'medium',
  recordingFps: 30,
  recordingResolution: '1920x1080',
  recordingAudio: true,
  recordingSource: 'screen',
  recordingMaxGB: 50,
}
const POS: Record<string, string> = { top: 'TOP', jungle: 'JUNGLE', middle: 'MIDDLE', bottom: 'BOTTOM', utility: 'UTILITY' }

export default function App() {
  useDDragon()
  const [data, setData] = useState<PlayerData>(() => mockPlayer())
  const [filter, setFilter] = useState<QueueFilter>('all')
  const [count, setCount] = useState(() => {
    try {
      return Number(localStorage.getItem('riftpulse.count')) || 50
    } catch {
      return 50
    }
  })
  const [progress, setProgress] = useState<number | null>(null)
  const [toast, setToast] = useState<{ text: string; tone: 'err' | 'info' } | null>(null)
  const [client, setClient] = useState<ClientStatus | null>(window.rp ? { connected: false, phase: 'None' } : null)
  const [live, setLive] = useState<LiveData | null>(null)
  const [livePreview, setLivePreview] = useState(false)
  const [settings, setSettings] = useState<DesktopSettings | null>(window.rp ? null : { ...WEB_SETTINGS, platform: readLast()?.platform ?? 'euw1' })
  const [version, setVersion] = useState('0.3.0')
  const [upd, setUpd] = useState<UpdateState>({ state: 'idle', version: '' })
  useEffect(() => {
    const u = window.rp?.update
    if (!u) return
    u.state().then(setUpd).catch(() => {})
    return u.onState(setUpd)
  }, [])
  const [openId, setOpenId] = useState<string>()
  const [champ, setChamp] = useState('')
  const [champRole, setChampRole] = useState('')
  const [fromChampSelect, setFromChampSelect] = useState(false)
  const [stats, setStats] = useState<StatsStatus | null>(null)
  const [statsVersion, setStatsVersion] = useState(0)
  const [demoStats, setDemoStats] = useState(!window.rp)
  const [recording, setRecording] = useState(false)
  const [hist, setHist] = useState<{ stack: Page[]; i: number }>({ stack: ['dashboard'], i: 0 })
  const page = hist.stack[hist.i]
  const viewing = useRef<{ kind: 'client' } | { kind: 'riot'; riotId: string; platform: string; self?: boolean } | null>(null)
  const mainRef = useRef<HTMLDivElement>(null)

  const navigate = useCallback((p: Page) => {
    setHist(({ stack, i }) => (stack[i] === p ? { stack, i } : { stack: [...stack.slice(0, i + 1), p], i: i + 1 }))
  }, [])
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [page])

  const showToast = (text: string, tone: 'err' | 'info' = 'err') => {
    setToast({ text, tone })
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 6000)
  }

  const run = useCallback(async (job: (p: (d: number, t: number) => void) => Promise<PlayerData>) => {
    setProgress(0.05)
    try {
      const d = await job((done, total) => setProgress(0.15 + (done / Math.max(1, total)) * 0.85))
      setData(d)
      setOpenId(undefined)
      return true
    } catch (e) {
      showToast(errorText(e))
      return false
    } finally {
      setProgress(null)
    }
  }, [])

  const loadSelf = useCallback(() => {
    viewing.current = { kind: 'client' }
    return run(async (p) => {
      const d = await loadFromClient(count, p)
      try {
        localStorage.setItem(ME, JSON.stringify({ riotId: `${d.profile.gameName}#${d.profile.tagLine}`, platform: d.profile.platform }))
      } catch {}
      // follow the account's server everywhere else (search, collector, spectate)
      window.rp?.settings.get().then((st) => {
        if (st.platform !== d.profile.platform) {
          window.rp?.settings.set('platform', d.profile.platform).then(() => window.rp?.settings.get().then(setSettings))
        }
      })
      return d
    })
  }, [run, count])

  // League is closed: show the remembered own account through the Riot API
  const settingsRef = useRef<DesktopSettings | null>(null)
  settingsRef.current = settings
  // own account: the Riot ID from Settings, else the one remembered from the client
  const myAccount = useCallback((st = settingsRef.current) => {
    const id = st?.myRiotId?.trim()
    if (id && id.includes('#')) return { riotId: id, platform: st?.platform || 'euw1' }
    return readMe()
  }, [])

  const loadSelfOffline = useCallback(() => {
    const me = myAccount()
    if (!me) return Promise.resolve(false)
    viewing.current = { kind: 'riot', ...me, self: true }
    return run((p) => loadPlayer(me.riotId, me.platform, count, p))
  }, [run, count])

  const search = useCallback(
    async (riotId: string, platform: string) => {
      const ok = await run((p) => loadPlayer(riotId, platform, count, p))
      if (ok) {
        viewing.current = { kind: 'riot', riotId, platform }
        try {
          localStorage.setItem(LAST, JSON.stringify({ riotId, platform }))
        } catch {}
        navigate('dashboard')
      }
    },
    [run, count, navigate],
  )

  const refresh = useCallback(() => {
    const v = viewing.current
    if (v?.kind === 'client') return loadSelf()
    if (v?.kind === 'riot') return run((p) => loadPlayer(v.riotId, v.platform, count, p))
    if (client?.connected) return loadSelf()
    if (settings?.riotApiKey && myAccount()) return loadSelfOffline()
    showToast('Сейчас показаны демо-данные. Запустите клиент LoL или найдите игрока через поиск.', 'info')
  }, [loadSelf, loadSelfOffline, myAccount, run, count, client, settings])

  // first load
  useEffect(() => {
    const rp = window.rp
    if (rp) {
      rp.version().then(setVersion)
      Promise.all([rp.settings.get(), rp.lcu.status()]).then(([st, s]) => {
        setSettings(st)
        setClient(s)
        // with a key the own account comes straight from the Riot API, without waiting for League
        if (st.riotApiKey && myAccount(st)) loadSelfOffline()
        else if (s.connected) loadSelf()
      })
      rp.live.get().then((d) => d && setLive(d))
      const offLive = rp.live.on(setLive)
      return offLive
    }
    const last = readLast()
    proxyConfig().then((p) => {
      if (p && last && (p.serverKey || getStoredKey())) search(last.riotId, last.platform)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // react to the League client starting / a game ending
  const prevPhase = useRef('None')
  useEffect(() => {
    const rp = window.rp
    if (!rp) return
    return rp.lcu.onStatus((s) => {
      setClient((old) => {
        if (s.connected && !old?.connected) {
          const v = viewing.current
          const viaApi = Boolean(settingsRef.current?.riotApiKey && myAccount())
          if (!viaApi && (v?.kind !== 'riot' || v.self)) loadSelf()
          if (viaApi && !v) loadSelfOffline()
        }
        return s
      })
      if (prevPhase.current === 'InProgress' && s.phase !== 'InProgress') {
        const v = viewing.current
        if (v?.kind === 'client') setTimeout(loadSelf, 15000) // give the client time to publish the finished game
        else if (v?.kind === 'riot' && v.self) setTimeout(loadSelfOffline, 90000) // match-v5 publishes a bit later
      }
      prevPhase.current = s.phase
    })
  }, [loadSelf])

  useEffect(() => {
    try {
      localStorage.setItem('riftpulse.count', String(count))
    } catch {}
  }, [count])

  // reload when the requested game count changes
  const firstCount = useRef(true)
  useEffect(() => {
    if (firstCount.current) {
      firstCount.current = false
      return
    }
    if (viewing.current) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  const updateSetting = useCallback(<K extends keyof DesktopSettings>(k: K, v: DesktopSettings[K]) => {
    setSettings((s) => (s ? { ...s, [k]: v } : s))
    if (window.rp)
      window.rp.settings.set(k, v).then(() => {
        if (k === 'riotApiKey' || k === 'myRiotId' || k === 'platform')
          window.rp?.settings.get().then((st) => {
            setSettings(st)
            settingsRef.current = st
            const v = viewing.current
            if (k !== 'platform' && st.riotApiKey && myAccount(st) && (!v || v.kind === 'client' || v.self)) loadSelfOffline()
          })
      })
    else if (k === 'platform') {
      try {
        localStorage.setItem(LAST, JSON.stringify({ ...readLast(), platform: v }))
      } catch {}
    }
  }, [])

  // champion select → open that champion's build page; report automatic imports
  const autoOpen = useRef(true)
  autoOpen.current = settings?.autoOpenChampion ?? true
  useEffect(() => {
    const rp = window.rp
    if (!rp) return
    const off1 = rp.lcu.onChampSelect(async ({ championId, position }) => {
      if (!autoOpen.current) return
      const id = (await championMap())[championId]
      if (!id) return
      setChamp(id)
      setChampRole(POS[position] ?? '')
      setFromChampSelect(true)
      navigate('champion')
    })
    const off2 = rp.build.onAutoImport((r) =>
      showToast(r.ok ? `${r.champion}: в клиент импортированы ${r.done?.join(', ')}` : `${r.champion}: ${r.error}`, r.ok ? 'info' : 'err'),
    )
    const off3 = rp.rec.onState((st) => setRecording(st === 'recording'))
    return () => {
      off1()
      off2()
      off3()
    }
  }, [navigate])

  // statistics collector status
  useEffect(() => {
    const load = () => statsStatus().then(setStats)
    load()
    const t = setInterval(load, 20000)
    const off = window.rp?.stats.onUpdate(() => {
      load()
      setStatsVersion((v) => v + 1)
    })
    return () => {
      clearInterval(t)
      off?.()
    }
  }, [])

  // your per-champion averages feed the "you vs your average" overlay
  useEffect(() => {
    if (window.rp && data.source !== 'demo') window.rp.overlay.setBenchmarks(benchmarks(data.matches))
  }, [data])

  const openChampion = useCallback(
    (c: string, r: string) => {
      setChamp(c)
      setChampRole(r)
      setFromChampSelect(false)
      navigate('champion')
    },
    [navigate],
  )
  const openMatchups = useCallback(
    (c: string, r: string) => {
      setChamp(c)
      setChampRole(r)
      navigate('matchups')
    },
    [navigate],
  )
  const shownChamp = champ || data.matches[0]?.champion || 'Ahri'

  const matches = useMemo(() => filterMatches(data.matches, filter), [data, filter])
  const shownLive = live ?? (livePreview ? demoLive() : null)
  const openMatch = (id: string) => {
    setOpenId(id)
    navigate('matches')
  }

  return (
    <div className="app">
      <Sidebar page={page} onNavigate={navigate} data={data} inGame={Boolean(live)} recording={recording} version={version} update={upd} />
      <div className="main-wrap">
        <TitleBar
          canBack={hist.i > 0}
          canForward={hist.i < hist.stack.length - 1}
          onBack={() => setHist((h) => ({ ...h, i: Math.max(0, h.i - 1) }))}
          onForward={() => setHist((h) => ({ ...h, i: Math.min(h.stack.length - 1, h.i + 1) }))}
          onRefresh={refresh}
          onSearch={search}
          onSettings={() => navigate('settings')}
          client={client}
          refreshing={progress !== null}
          platform={settings?.platform ?? 'euw1'}
        />
        <AnimatePresence>
          {progress !== null && (
            <motion.div className="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { delay: 0.2 } }}>
              <motion.span animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.4, ease }} />
            </motion.div>
          )}
        </AnimatePresence>
        <main className="main" ref={mainRef}>
          {data.source === 'demo' && progress === null && (
            <motion.div className="banner" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
              {window.rp
                ? 'Демо-данные. Запустите клиент League of Legends, и приложение само подтянет ваш аккаунт.'
                : 'Демо-данные. Это веб-версия: для вашего аккаунта запустите десктоп-версию (npm run app) или найдите игрока через поиск сверху.'}
            </motion.div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
              transition={{ duration: 0.32, ease }}
            >
              {page === 'dashboard' && (
                <Dashboard
                  data={data}
                  matches={matches}
                  filter={filter}
                  setFilter={setFilter}
                  count={count}
                  setCount={setCount}
                  live={live}
                  onRefresh={refresh}
                  refreshing={progress !== null}
                  openMatch={openMatch}
                  navigate={navigate}
                />
              )}
              {page === 'matches' && <Matches matches={matches} filter={filter} setFilter={setFilter} openId={openId} setOpenId={setOpenId} />}
              {page === 'champions' && <Champions data={data} matches={matches} />}
              {page === 'studio' && <Studio matches={matches} />}
              {page === 'tierlist' && (
                <TierList status={stats} demo={demoStats} setDemo={setDemoStats} onOpen={openChampion} onSettings={() => navigate('settings')} version={statsVersion} />
              )}
              {page === 'champion' && (
                <Champion
                  champ={shownChamp}
                  role={champRole}
                  setChamp={(c) => {
                    setChamp(c)
                    setChampRole('')
                    setFromChampSelect(false)
                  }}
                  setRole={setChampRole}
                  status={stats}
                  demo={demoStats}
                  setDemo={setDemoStats}
                  version={statsVersion}
                  fromChampSelect={fromChampSelect}
                  onSettings={() => navigate('settings')}
                  onMatchups={openMatchups}
                  toast={showToast}
                />
              )}
              {page === 'matchups' && (
                <Matchups
                  champ={shownChamp}
                  role={champRole}
                  setChamp={(c) => {
                    setChamp(c)
                    setChampRole('')
                  }}
                  setRole={setChampRole}
                  status={stats}
                  demo={demoStats}
                  setDemo={setDemoStats}
                  version={statsVersion}
                  onSettings={() => navigate('settings')}
                  onOpenChampion={openChampion}
                />
              )}
              {page === 'recordings' && <Recordings settings={settings} update={updateSetting} toast={showToast} />}
              {page === 'spectate' && <Spectate defaultPlatform={settings?.platform ?? 'euw1'} toast={showToast} />}
              {page === 'collections' && <Collections data={data} connected={Boolean(client?.connected)} />}
              {page === 'leaderboards' && <Leaderboards defaultPlatform={settings?.platform ?? 'euw1'} onOpenPlayer={search} navigate={navigate} />}
              {page === 'live' && <Live live={shownLive} preview={!live && livePreview} onPreview={() => setLivePreview(true)} />}
              {page === 'overlays' && <Overlays settings={settings} update={updateSetting} />}
              {page === 'settings' && (
                <Settings
                  settings={settings}
                  update={updateSetting}
                  stats={stats}
                  onClearCache={() => {
                    try {
                      localStorage.removeItem('riftpulse.matches.v1')
                    } catch {}
                    showToast('Кэш очищен', 'info')
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <AnimatePresence>
        {toast && (
          <motion.div
            className={`toast ${toast.tone}`}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={() => setToast(null)}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
