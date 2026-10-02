import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { ClientStatus } from '../env'
import { PLATFORMS } from '../api/riot'
import { Icon, ease } from './ui'

const PHASE: Record<string, string> = {
  None: 'Клиент LoL подключён',
  Lobby: 'В лобби',
  Matchmaking: 'Поиск игры',
  ReadyCheck: 'Игра найдена',
  ChampSelect: 'Выбор чемпионов',
  InProgress: 'В игре',
  WaitingForStats: 'Ожидание статистики',
  EndOfGame: 'Игра окончена',
  Reconnect: 'Переподключение',
}

export function TitleBar({
  canBack,
  canForward,
  onBack,
  onForward,
  onRefresh,
  onSearch,
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

  useEffect(() => {
    setPlat(platform)
  }, [platform])
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

  return (
    <header className="titlebar drag">
      <div className="nav-buttons no-drag">
        <button disabled={!canBack} onClick={onBack} title="Назад">
          <Icon name="left" />
        </button>
        <button disabled={!canForward} onClick={onForward} title="Вперёд">
          <Icon name="right" />
        </button>
        <button onClick={onRefresh} title="Обновить">
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
          if (valid) {
            onSearch(q.trim(), plat)
            input.current?.blur()
          }
        }}
      >
        <Icon name="search" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          placeholder="Поиск игрока: Имя#ТЕГ"
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
              aria-label="Регион"
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
      </motion.form>

      <div className="title-right no-drag">
        {client && (
          <div className={`client-pill ${client.connected ? 'on' : ''}`} title={client.connected ? 'Данные берутся из запущенного клиента' : 'Запустите клиент League of Legends'}>
            <span className="pulse" />
            {client.connected ? PHASE[client.phase] ?? client.phase : 'Клиент не найден'}
          </div>
        )}
        <button className="tb-icon" onClick={onSettings} title="Настройки">
          <Icon name="gear" />
        </button>
        {window.rp && (
          <div className="win-controls">
            <button onClick={() => window.rp?.window.minimize()} title="Свернуть">
              <Icon name="min" size={16} />
            </button>
            <button onClick={() => window.rp?.window.maximize()} title={maximized ? 'Восстановить' : 'Развернуть'}>
              <Icon name={maximized ? 'restore' : 'max'} size={14} />
            </button>
            <button className="close" onClick={() => window.rp?.window.close()} title="Закрыть">
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
