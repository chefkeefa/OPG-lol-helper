import { AnimatePresence, motion } from 'motion/react'
import type { Page, PlayerData } from '../types'
import type { UpdateState } from '../env'
import { profileIcon, rankEmblem } from '../lib/ddragon'
import { Icon, Img, spring, type IconName } from './ui'
import { t } from '../lib/i18n'
import { useState } from 'react'
import { useAccounts, type Account } from '../lib/accounts'

const GROUPS: { title: string; items: { page: Page; icon: IconName; label: string }[] }[] = [
  {
    title: t('Rift Core'),
    items: [
      { page: 'dashboard', icon: 'home', label: t('Дашборд') },
      { page: 'tierlist', icon: 'chart', label: t('Тир-лист и билды') },
      { page: 'leaderboards', icon: 'trophy', label: t('Лидеры') },
    ],
  },
  {
    title: t('Приложение'),
    items: [
      { page: 'recordings', icon: 'film', label: t('Записи') },
      { page: 'overlays', icon: 'layers', label: t('Оверлеи') },
      { page: 'spectate', icon: 'tv', label: t('Наблюдение') },
      { page: 'collections', icon: 'box', label: t('Коллекция') },
    ],
  },
  {
    title: t('Аналитика'),
    items: [
      { page: 'studio', icon: 'file', label: 'Data Studio' },
      { page: 'matchups', icon: 'swords', label: t('Матчапы') },
      { page: 'champions', icon: 'pie', label: t('Мои чемпионы') },
      { page: 'matches', icon: 'list', label: t('История матчей') },
    ],
  },
  {
    title: t('В игре'),
    items: [
      { page: 'draft', icon: 'target', label: t('Драфт') },
      { page: 'live', icon: 'eye', label: t('Текущая игра') },
      { page: 'mayhem', icon: 'bolt', label: 'ARAM Mayhem' },
    ],
  },
]

/** Own mark: a speech-bubble "P" with a pulse line through it. */
function BrandMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
      <defs>
        <linearGradient id="bm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c9ccff" />
        </linearGradient>
      </defs>
      <path d="M5 6a4 4 0 0 1 4-4h10a12 12 0 0 1 0 24h-5l-7 6a1.2 1.2 0 0 1-2-.9z" fill="url(#bm)" />
      <path className="brand-pulse" d="M8.5 14.5h4l2-4.5 3.2 9 2.3-4.5h4.5" fill="none" stroke="#0e0f13" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Sidebar({
  page,
  onNavigate,
  data,
  inGame,
  recording,
  version,
  update,
  onSwitchAccount,
}: {
  page: Page
  onNavigate: (p: Page) => void
  data: PlayerData
  inGame: boolean
  recording: boolean
  version: string
  update?: UpdateState
  onSwitchAccount?: (a: Account) => void
}) {
  const accounts = useAccounts()
  const [menu, setMenu] = useState(false)
  const current = `${data.profile.gameName}#${data.profile.tagLine}`.toLowerCase()
  const solo = data.ranks.find((r) => r.queueType === 'RANKED_SOLO_5x5')
  return (
    <aside className="sidebar">
      <div className="brand drag">
        <motion.div className="brand-mark" whileHover={{ rotate: -6, scale: 1.06 }} transition={spring}>
          <BrandMark />
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
      <AnimatePresence>
        {menu && (
          <motion.div className="acc-menu" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.18 }}>
            <div className="acc-menu-title">{t('Мои аккаунты')}</div>
            {accounts.map((a) => (
              <button
                key={a.riotId + a.platform}
                className={`acc-item ${a.riotId.toLowerCase() === current ? 'on' : ''}`}
                onClick={() => {
                  setMenu(false)
                  onSwitchAccount?.(a)
                }}
              >
                {a.iconId ? <Img src={profileIcon(a.iconId)} alt="" size={28} radius={7} /> : <span className="acc-blank" />}
                <span>
                  <b>{a.riotId}</b>
                  <span className="muted small">
                    {a.platform.replace(/\d+$/, '').toUpperCase()}
                    {a.rank ? ` · ${a.rank}` : ''}
                  </span>
                </span>
              </button>
            ))}
            {!accounts.length && <p className="muted small">{t('Добавьте свои аккаунты в настройках, чтобы переключаться между ними.')}</p>}
            <button
              className="acc-add"
              onClick={() => {
                setMenu(false)
                onNavigate('settings')
              }}
            >
              <Icon name="gear" size={14} /> {t('Управлять аккаунтами')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button className="side-profile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} onClick={() => setMenu((v) => !v)} title={t('Сменить аккаунт')}>
        <div className="avatar-wrap">
          <span className="region-tag">{data.profile.platform.replace(/\d+$/, '').toUpperCase()}</span>
          <Img src={profileIcon(data.profile.iconId)} alt={data.profile.gameName} size={60} radius={10} />
          <span className="lvl">{data.profile.level}</span>
        </div>
        <div className="side-profile-text">
          <div className="side-name">{data.profile.gameName}</div>
          <div className="muted">#{data.profile.tagLine}</div>
          {solo && (
            <div className="tier-text">
              <Img src={rankEmblem(solo.tier)} alt="" size={18} radius={0} className="tier-mini" />
              {solo.tier}
            </div>
          )}
        </div>
        <Icon name="chevron" size={14} />
      </motion.button>
    </aside>
  )
}
