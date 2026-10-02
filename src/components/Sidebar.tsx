import { AnimatePresence, motion } from 'motion/react'
import type { Page, PlayerData } from '../types'
import type { UpdateState } from '../env'
import { profileIcon } from '../lib/ddragon'
import { Icon, Img, spring, type IconName } from './ui'
import { t } from '../lib/i18n'

const GROUPS: { title: string; items: { page: Page; icon: IconName; label: string }[] }[] = [
  {
    title: t('Основное'),
    items: [
      { page: 'dashboard', icon: 'home', label: t('Дашборд') },
      { page: 'matches', icon: 'film', label: t('История матчей') },
      { page: 'champions', icon: 'chart', label: t('Мои чемпионы') },
      { page: 'studio', icon: 'pie', label: 'Data Studio' },
    ],
  },
  {
    title: t('Статистика'),
    items: [
      { page: 'tierlist', icon: 'list', label: t('Тир-лист') },
      { page: 'champion', icon: 'shield', label: t('Билды и руны') },
      { page: 'matchups', icon: 'swords', label: t('Матчапы') },
      { page: 'leaderboards', icon: 'trophy', label: t('Лидеры') },
    ],
  },
  {
    title: t('Приложение'),
    items: [
      { page: 'live', icon: 'eye', label: t('Текущая игра') },
      { page: 'recordings', icon: 'video', label: t('Записи') },
      { page: 'spectate', icon: 'tv', label: t('Наблюдение') },
      { page: 'collections', icon: 'box', label: t('Коллекция') },
      { page: 'overlays', icon: 'layers', label: t('Оверлеи') },
    ],
  },
  { title: t('Система'), items: [{ page: 'settings', icon: 'gear', label: t('Настройки') }] },
]

export function Sidebar({
  page,
  onNavigate,
  data,
  inGame,
  recording,
  version,
  update,
}: {
  page: Page
  onNavigate: (p: Page) => void
  data: PlayerData
  inGame: boolean
  recording: boolean
  version: string
  update?: UpdateState
}) {
  const solo = data.ranks.find((r) => r.queueType === 'RANKED_SOLO_5x5')
  return (
    <aside className="sidebar">
      <div className="brand drag">
        <motion.div className="brand-mark" whileHover={{ rotate: -8, scale: 1.06 }} transition={spring}>
          <Icon name="bolt" size={22} />
        </motion.div>
        <div>
          <div className="brand-name">Rift Pulse</div>
          <button
            className="brand-sub brand-check"
            title={update?.state === 'error' ? t('Ошибка обновления: {error}', { error: update.error ?? '' }) : t('Проверить обновления')}
            onClick={() => window.rp?.update?.check()}
          >
            APP V.{version}
            <span className={`upd-note ${update?.state ?? ''}`}>
              {update?.state === 'checking'
                ? ` · ${t('проверяю…')}`
                : update?.state === 'latest'
                  ? ` · ${t('последняя')}`
                  : update?.state === 'error'
                    ? ` · ${t('ошибка')}`
                    : ''}
            </span>
          </button>
        </div>
      </div>
      <AnimatePresence>
        {update && (update.state === 'downloading' || update.state === 'ready') && (
          <motion.button
            key={update.state}
            className={`update-pill ${update.state}`}
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={spring}
            disabled={update.state !== 'ready'}
            onClick={() => window.rp?.update.install()}
          >
            {update.state === 'ready' ? (
              <>{t('Обновление v{version} готово', { version: update.version ?? '' })} · <b>{t('Перезапустить')}</b></>
            ) : (
              <>{t('Скачиваю обновление v{version}…', { version: update.version ?? '' })}</>
            )}
          </motion.button>
        )}
      </AnimatePresence>
      <nav>
        {GROUPS.map((g) => (
          <div key={g.title} className="nav-group">
            <div className="nav-title">{g.title}</div>
            {g.items.map((it) => {
              const active = it.page === page
              return (
                <div key={it.page}>
                  <button className={`nav-item ${active ? 'active' : ''}`} onClick={() => onNavigate(it.page)}>
                    {active && <motion.span layoutId="nav-active" className="nav-active" transition={spring} />}
                    <Icon name={it.icon} />
                    <span>{it.label}</span>
                    {it.page === 'live' && inGame && <span className="live-dot" title={t('Идёт игра')} />}
                    {it.page === 'recordings' && recording && <span className="live-dot rec" title={t('Идёт запись')} />}
                  </button>
                  {it.page === 'dashboard' && (
                    <button className={`nav-sub ${active ? 'on' : ''}`} onClick={() => onNavigate('dashboard')}>
                      <Img src={profileIcon(data.profile.iconId)} alt="" size={18} radius={5} />
                      <span>
                        {data.profile.gameName} <span className="muted">#{data.profile.tagLine}</span>
                      </span>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </nav>
      <motion.div className="side-profile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <div className="avatar-wrap">
          <span className="region-tag">{data.profile.platform.replace(/\d+$/, '').toUpperCase()}</span>
          <Img src={profileIcon(data.profile.iconId)} alt={data.profile.gameName} size={56} radius={12} />
          <span className="lvl">{data.profile.level}</span>
        </div>
        <div className="side-profile-text">
          <div className="side-name">{data.profile.gameName}</div>
          <div className="muted">#{data.profile.tagLine}</div>
          {solo && <div className="tier-text">{solo.tier}</div>}
        </div>
      </motion.div>
    </aside>
  )
}
