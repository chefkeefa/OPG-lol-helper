import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { ClientStatus } from '../env'
import { PLATFORMS } from '../api/riot'
import { Icon, ease } from './ui'
import { lang, setLang, t } from '../lib/i18n'

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
          placeholder={t('Поиск игрока: Имя#ТЕГ')}
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
