import { useState } from 'react'
import { motion } from 'motion/react'
import type { DesktopSettings } from '../env'
import type { StatsStatus } from '../lib/statsTypes'
import { PLATFORMS, getStoredKey, setStoredKey } from '../api/riot'
import { Card, Icon, Switch, ease, stagger } from '../components/ui'
import { lang, locale, setLang, t } from '../lib/i18n'

export function Settings({
  settings,
  update,
  stats,
  onClearCache,
}: {
  settings: DesktopSettings | null
  update: <K extends keyof DesktopSettings>(k: K, v: DesktopSettings[K]) => void
  stats: StatsStatus | null
  onClearCache: () => void
}) {
  const desktop = Boolean(window.rp)
  const [key, setKey] = useState(desktop ? '' : getStoredKey())
  const [saved, setSaved] = useState(false)
  const [myId, setMyId] = useState<string | null>(null)
  const saveMyId = () => {
    if (myId === null) return
    const v = myId.trim()
    if (v && !v.includes('#')) return
    if (v !== (settings?.myRiotId ?? '')) update('myRiotId', v)
    setMyId(null)
  }
  const s = settings

  const saveKey = () => {
    if (desktop) update('riotApiKey', key.trim())
    else setStoredKey(key.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }
  const regions = Object.entries(PLATFORMS)
  const total = stats?.patches.reduce((n, p) => n + p.matches, 0) ?? 0

  return (
    <div className="page">
      <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <h1>
          <Icon name="gear" size={30} /> {t('Настройки')}
        </h1>
      </motion.div>
      <motion.div className="settings-grid" variants={stagger} initial="hidden" animate="show">
        <Card hover={false}>
          <h3 className="card-title">
            <Icon name="info" size={16} /> {lang === 'ru' ? 'Язык / Language' : 'Language / Язык'}
          </h3>
          <p className="muted small">{t('Язык интерфейса, имён чемпионов, рун и предметов. Программа перезагрузит окно.')}</p>
          <div className="lang-pick">
            {(['ru', 'en'] as const).map((l) => (
              <button key={l} className={lang === l ? 'on' : ''} onClick={() => lang !== l && setLang(l)}>
                {l === 'ru' ? 'Русский' : 'English'}
              </button>
            ))}
          </div>
        </Card>
        <Card hover={false}>
          <h3 className="card-title">
            <Icon name="key" size={16} /> {t('Ключ Riot API')}
          </h3>
          <p className="muted small">
            {t('Нужен для тир-листа, билдов и матчапов (программа сама собирает игры Master+ через официальный Riot API), а также для поиска игроков, лидеров и наблюдения. Свой аккаунт читается из клиента LoL без ключа. Ключ выдают бесплатно на')}{' '}
            <a href="https://developer.riotgames.com" target="_blank" rel="noreferrer">
              developer.riotgames.com
            </a>
            {t(': dev-ключ живёт 24 часа, личный (Personal API Key) не истекает.')}
          </p>
          {desktop && s?.riotApiKey && <p className="small">{t('Сохранён ключ {key}', { key: s.riotApiKey })}</p>}
          <div className="key-row">
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="RGAPI-…" />
            <motion.button className="btn primary" onClick={saveKey} whileTap={{ scale: 0.96 }}>
              {saved ? t('Сохранено') : t('Сохранить')}
            </motion.button>
          </div>
          {desktop && (
            <>
              <h3 className="card-title" style={{ marginTop: 18 }}>
                {t('Мой аккаунт')}
              </h3>
              <p className="muted small">
                {t('С ключом ваш профиль грузится сразу через Riot API, клиент LoL не нужен. Если поле пустое, берётся аккаунт, который программа видела в клиенте.')}
              </p>
              <div className="key-row">
                <input
                  value={myId ?? s?.myRiotId ?? ''}
                  onChange={(e) => setMyId(e.target.value)}
                  onBlur={saveMyId}
                  onKeyDown={(e) => e.key === 'Enter' && saveMyId()}
                  placeholder={t('Имя#ТЕГ')}
                />
                <select value={s?.platform ?? 'euw1'} onChange={(e) => update('platform', e.target.value)}>
                  {regions.map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </Card>

        <Card hover={false}>
          <h3 className="card-title">
            <Icon name="pie" size={16} /> {t('Сбор статистики')}
          </h3>
          <p className="muted small">
            {t('В фоне скачивает ранговые игры Master, Grandmaster и Challenger и считает из них тир-лист, билды, руны и матчапы. Хранятся только итоги, место на диске небольшое. Программа оставляет часть лимита ключа для поиска и других страниц.')}
          </p>
          <Switch on={Boolean(s?.collectorEnabled)} onChange={(v) => update('collectorEnabled', v)} label={t('Собирать статистику')} />
          <label className="field">
            <span>{t('Регион статистики')}</span>
            <select value={s?.collectorPlatform || s?.platform || 'euw1'} onChange={(e) => update('collectorPlatform', e.target.value)}>
              {regions.map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {stats && desktop && (
            <p className="small muted">
              {t('Собрано {n} игр', { n: total.toLocaleString(locale) })}{stats.perHour ? t(', сейчас {n} в час', { n: stats.perHour }) : ''}. {stats.error && <span className="bad">{stats.error}</span>}
            </p>
          )}
        </Card>

        <Card hover={false}>
          <h3 className="card-title">
            <Icon name="download" size={16} /> {t('Выбор чемпиона')}
          </h3>
          <Switch on={s?.autoOpenChampion ?? true} onChange={(v) => update('autoOpenChampion', v)} label={t('Открывать билд выбранного чемпиона')} />
          <Switch on={Boolean(s?.autoImportRunes)} onChange={(v) => update('autoImportRunes', v)} label={t('Импортировать руны')} hint={t('после того как вы зафиксировали выбор')} />
          <Switch on={Boolean(s?.autoImportItems)} onChange={(v) => update('autoImportItems', v)} label={t('Импортировать набор предметов')} hint={t('виден в магазине в игре')} />
          <Switch on={Boolean(s?.autoImportSpells)} onChange={(v) => update('autoImportSpells', v)} label={t('Ставить заклинания призывателя')} hint={t('Флеш остаётся на привычной клавише')} />
        </Card>

        <Card hover={false}>
          <h3 className="card-title">
            <Icon name="video" size={16} /> {t('Запись игр')}
          </h3>
          <Switch on={Boolean(s?.recordingEnabled)} onChange={(v) => update('recordingEnabled', v)} label={t('Записывать каждую игру')} />
          <Switch on={s?.recordingAudio ?? true} onChange={(v) => update('recordingAudio', v)} label={t('Записывать звук')} />
          <div className="field-row">
            <label className="field">
              <span>{t('Качество')}</span>
              <select value={s?.recordingQuality ?? 'medium'} onChange={(e) => update('recordingQuality', e.target.value as DesktopSettings['recordingQuality'])}>
                <option value="high">{t('Высокое (14 Мбит/с)')}</option>
                <option value="medium">{t('Среднее (8 Мбит/с)')}</option>
                <option value="low">{t('Экономное (4 Мбит/с)')}</option>
              </select>
            </label>
            <label className="field">
              <span>{t('Кадров/с')}</span>
              <select value={s?.recordingFps ?? 30} onChange={(e) => update('recordingFps', Number(e.target.value))}>
                <option value={30}>30</option>
                <option value={60}>60</option>
              </select>
            </label>
            <label className="field">
              <span>{t('Разрешение')}</span>
              <select value={s?.recordingResolution ?? '1920x1080'} onChange={(e) => update('recordingResolution', e.target.value)}>
                <option value="2560x1440">1440p</option>
                <option value="1920x1080">1080p</option>
                <option value="1280x720">720p</option>
              </select>
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>{t('Что записывать')}</span>
              <select value={s?.recordingSource ?? 'screen'} onChange={(e) => update('recordingSource', e.target.value as DesktopSettings['recordingSource'])}>
                <option value="screen">{t('Весь экран (надёжнее)')}</option>
                <option value="window">{t('Только окно игры (без звука)')}</option>
              </select>
            </label>
            <label className="field">
              <span>{t('Лимит папки, ГБ')}</span>
              <input type="number" min={5} max={2000} value={s?.recordingMaxGB ?? 50} onChange={(e) => update('recordingMaxGB', Math.max(5, Number(e.target.value) || 50))} />
            </label>
          </div>
          {desktop && (
            <button className="btn" onClick={() => window.rp?.rec.open()}>
              <Icon name="folder" size={16} /> {t('Открыть папку записей')}
            </button>
          )}
        </Card>

        <Card hover={false}>
          <h3 className="card-title">
            <Icon name="layers" size={16} /> {t('Оверлей')}
          </h3>
          <Switch on={Boolean(s?.overlayEnabled)} onChange={(v) => update('overlayEnabled', v)} label={t('Показывать оверлей в игре')} hint="Ctrl+Shift+O" />
          <Switch on={s?.overlayBenchmark ?? true} onChange={(v) => update('overlayBenchmark', v)} label={t('Панель «вы и ваше среднее»')} hint={t('CS, KDA, KP и обзор против ваших прошлых игр')} />
        </Card>

        <Card hover={false}>
          <h3 className="card-title">{t('Регион поиска')}</h3>
          <p className="muted small">{t('Используется для поиска игроков, лидеров и наблюдения.')}</p>
          <select value={s?.platform ?? 'euw1'} onChange={(e) => update('platform', e.target.value)}>
            {regions.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <h3 className="card-title" style={{ marginTop: 18 }}>
            {t('Кэш матчей')}
          </h3>
          <p className="muted small">{t('Сыгранные матчи хранятся локально, чтобы не тратить запросы.')}</p>
          <button className="btn" onClick={onClearCache}>
            {t('Очистить кэш')}
          </button>
        </Card>
      </motion.div>
    </div>
  )
}
