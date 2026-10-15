import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { ClientStatus } from '../env'
import type { Page } from '../types'
import { PLATFORMS } from '../api/riot'
import { championList, profileIcon, type ChampionInfo } from '../lib/ddragon'
import { getAccounts } from '../lib/accounts'
import { Champ, Icon, Img, ease, type IconName } from './ui'
import { NAV_GROUPS } from './Sidebar'
import { lang, setLang, t } from '../lib/i18n'

// players opened from the search, newest first
const RECENT = 'riftpulse.recentSearch'
type Recent = { riotId: string; platform: string }
function readRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT) ?? '[]')
  } catch {
    return []
  }
}
function noteRecent(r: Recent) {
  const list = [r, ...readRecent().filter((x) => x.riotId.toLowerCase() !== r.riotId.toLowerCase() || x.platform !== r.platform)].slice(0, 6)
  try {
    localStorage.setItem(RECENT, JSON.stringify(list))
  } catch {}
}

type Hit =
  | { kind: 'player'; riotId: string; platform: string; iconId?: number; note: string }
  | { kind: 'champ'; champ: ChampionInfo }
  | { kind: 'page'; page: Page; icon: IconName; label: string }
const norm = (s: string) => s.toLowerCase().replace(/[\s'.&]/g, '')

const PHASE: Record<string, string> = {
  None: t('Клиент LoL подключён'),
  Lobby: t('В лобби'),
  Matchmaking: t('Поиск игры'),
  ReadyCheck: t('Игра найдена'),
  ChampSelect: t('Выбор чемпионов'),
  InProgress: t('В игре'),
  WaitingForStats: t('Ожидание статистики'),
  EndOfGame: t('Игра окончена'),
  Reconnect: t('Переподключение'),
}

export function TitleBar({
  canBack,
  canForward,
  onBack,
  onForward,
  onRefresh,
  onSearch,
  onChampion,
  onPage,
  onSettings,
  client,
  refreshing,
  platform,
}: {
  canBack: boolean
  canForward: boolean
  onBack: () => void
  onForward: () => void
  onRefresh: () => void
  onSearch: (riotId: string, platform: string) => void
  onChampion: (id: string) => void
  onPage: (p: Page) => void
  onSettings: () => void
  client: ClientStatus | null
  refreshing: boolean
  platform: string
}) {
  const [q, setQ] = useState('')
  const [plat, setPlat] = useState(platform)
  const [focus, setFocus] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const [champs, setChamps] = useState<ChampionInfo[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    setPlat(platform)
  }, [platform])
  useEffect(() => {
    if (focus && !champs.length) championList().then(setChamps)
  }, [focus, champs.length])
  useEffect(() => window.rp?.window.onState((s) => setMaximized(s.maximized)), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        input.current?.focus()
        input.current?.select()
      }
      if (e.key === 'Escape') input.current?.blur()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const valid = /^.+#.+$/.test(q.trim())

  const groups = useMemo(() => {
    const query = norm(q)
    const out: { title: string; hits: Hit[] }[] = []
    const players: Hit[] = []
    if (valid) players.push({ kind: 'player', riotId: q.trim(), platform: plat, note: t('Открыть профиль · {region}', { region: PLATFORMS[plat] ?? plat }) })
    const known = [...readRecent().map((r) => ({ ...r, note: t('Недавний поиск') })), ...getAccounts().map((a) => ({ ...a, note: t('Ваш аккаунт') }))]
    const seen = new Set(players.map((h) => (h.kind === 'player' ? h.riotId.toLowerCase() : '')))
    for (const a of known) {
      const key = a.riotId.toLowerCase()
      if (seen.has(key) || (query && !norm(a.riotId).includes(query))) continue
      seen.add(key)
      players.push({ kind: 'player', riotId: a.riotId, platform: a.platform, iconId: 'iconId' in a ? (a.iconId as number | undefined) : undefined, note: `${a.note} · ${PLATFORMS[a.platform] ?? a.platform}` })
    }
    if (players.length) out.push({ title: t('Игроки'), hits: players.slice(0, 5) })
    if (query && !valid) {
      const starts = champs.filter((c) => norm(c.name).startsWith(query) || norm(c.id).startsWith(query))
      const inner = champs.filter((c) => !starts.includes(c) && (norm(c.name).includes(query) || norm(c.id).includes(query)))
      const list = [...starts, ...inner].slice(0, 6)
      if (list.length) out.push({ title: t('Чемпионы'), hits: list.map((champ) => ({ kind: 'champ', champ })) })
    }
    if (query.length >= 2 && !valid) {
      const pages = NAV_GROUPS.flatMap((g) => g.items).filter((i) => norm(i.label).includes(query))
      if (pages.length) out.push({ title: t('Разделы'), hits: pages.slice(0, 4).map((i) => ({ kind: 'page', page: i.page, icon: i.icon, label: i.label })) })
    }
    return out
  }, [q, plat, valid, champs])
  const flat = groups.flatMap((g) => g.hits)
  useEffect(() => setActive(0), [q])

  const choose = (h: Hit | undefined) => {
    if (!h) return
    if (h.kind === 'player') {
      noteRecent({ riotId: h.riotId, platform: h.platform })
      onSearch(h.riotId, h.platform)
    } else if (h.kind === 'champ') onChampion(h.champ.id)
    else onPage(h.page)
    setQ('')
    input.current?.blur()
  }
  const open = focus && (flat.length > 0 || q.trim().length > 0)

  return (
    <header className="titlebar drag">
      <div className="nav-buttons no-drag">
        <button disabled={!canBack} onClick={onBack} title={t('Назад')}>
          <Icon name="left" />
        </button>
        <button disabled={!canForward} onClick={onForward} title={t('Вперёд')}>
          <Icon name="right" />
        </button>
        <button onClick={onRefresh} title={t('Обновить')}>
          <motion.span animate={{ rotate: refreshing ? 360 : 0 }} transition={refreshing ? { repeat: Infinity, duration: 0.9, ease: 'linear' } : { duration: 0 }} style={{ display: 'grid' }}>
            <Icon name="refresh" />
          </motion.span>
        </button>
      </div>

      <motion.form
        className={`search no-drag ${focus ? 'focus' : ''}`}
        animate={{ width: focus ? 680 : 620 }}
        transition={{ duration: 0.35, ease }}
        onSubmit={(e) => {
          e.preventDefault()
          choose(flat[active])
        }}
      >
        <Icon name="search" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              const n = flat.length || 1
              setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : n - 1)) % n)
            }
          }}
          placeholder={t('Игрок Имя#ТЕГ, чемпион или раздел')}
        />
        <AnimatePresence initial={false}>
          {focus || q ? (
            <motion.select
              key="plat"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              value={plat}
              onChange={(e) => setPlat(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label={t('Регион')}
            >
              {Object.entries(PLATFORMS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </motion.select>
          ) : (
            <motion.kbd key="kbd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              Ctrl <span>K</span>
            </motion.kbd>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {open && (
            <motion.div
              className="search-drop"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.18, ease }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {groups.map((g) => (
                <div key={g.title} className="sd-group">
                  <span className="sd-title">{g.title}</span>
                  {g.hits.map((h) => {
                    const i = flat.indexOf(h)
                    return (
                      <button type="button" key={i} className={`sd-hit ${i === active ? 'on' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => choose(h)}>
                        {i === active && <motion.span layoutId="sd-active" className="sd-bg" transition={{ type: 'spring', stiffness: 600, damping: 40 }} />}
                        {h.kind === 'player' ? (
                          <>
                            {h.iconId ? <Img src={profileIcon(h.iconId)} alt="" size={28} radius={8} /> : <span className="sd-ico"><Icon name="users" size={16} /></span>}
                            <span className="sd-text">
                              <b>{h.riotId}</b>
                              <em>{h.note}</em>
                            </span>
                          </>
                        ) : h.kind === 'champ' ? (
                          <>
                            <Champ name={h.champ.id} size={28} />
                            <span className="sd-text">
                              <b>{h.champ.name}</b>
                              <em>{t('Сборки, руны и матчапы')}</em>
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="sd-ico">
                              <Icon name={h.icon} size={16} />
                            </span>
                            <span className="sd-text">
                              <b>{h.label}</b>
                            </span>
                          </>
                        )}
                        {i === active && <kbd className="sd-enter">Enter</kbd>}
                      </button>
                    )
                  })}
                </div>
              ))}
              {!valid && q.trim() && <p className="sd-hint">{t('Чтобы найти игрока, введите имя с тегом: Имя#EUW')}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.form>

      <div className="title-right no-drag">
        {client && (
          <div className={`client-pill ${client.connected ? 'on' : ''}`} title={client.connected ? t('Данные берутся из запущенного клиента') : t('Без клиента: профиль и игры идут через Riot API')}>
            <span className="pulse" />
            {client.connected ? PHASE[client.phase] ?? client.phase : t('Клиент не найден')}
          </div>
        )}
        <button className="tb-icon lang-btn" onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')} title={t('Сменить язык')}>
          {lang === 'ru' ? 'RU' : 'EN'}
        </button>
        <button className="tb-icon" onClick={onSettings} title={t('Настройки')}>
          <Icon name="gear" />
        </button>
        {window.rp && (
          <div className="win-controls">
            <button onClick={() => window.rp?.window.minimize()} title={t('Свернуть')}>
              <Icon name="min" size={16} />
            </button>
            <button onClick={() => window.rp?.window.maximize()} title={maximized ? t('Восстановить') : t('Развернуть')}>
              <Icon name={maximized ? 'restore' : 'max'} size={14} />
            </button>
            <button className="close" onClick={() => window.rp?.window.close()} title={t('Закрыть')}>
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
