import { useState } from 'react'
import { motion } from 'motion/react'
import type { DesktopSettings } from '../env'
import type { StatsStatus } from '../lib/statsTypes'
import { PLATFORMS, getStoredKey, setStoredKey } from '../api/riot'
import { Card, Icon, Switch, ease, stagger } from '../components/ui'

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
          <Icon name="gear" size={30} /> Настройки
        </h1>
      </motion.div>
      <motion.div className="settings-grid" variants={stagger} initial="hidden" animate="show">
        <Card hover={false}>
          <h3 className="card-title">
            <Icon name="key" size={16} /> Ключ Riot API
          </h3>
          <p className="muted small">
            Нужен для тир-листа, билдов и матчапов (программа сама собирает игры Master+ через официальный Riot API), а также для поиска игроков, лидеров и
            наблюдения. Свой аккаунт читается из клиента LoL без ключа. Ключ выдают бесплатно на{' '}
            <a href="https://developer.riotgames.com" target="_blank" rel="noreferrer">
              developer.riotgames.com
            </a>
            : dev-ключ живёт 24 часа, личный (Personal API Key) не истекает.
          </p>
          {desktop && s?.riotApiKey && <p className="small">Сохранён ключ {s.riotApiKey}</p>}
          <div className="key-row">
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="RGAPI-…" />
            <motion.button className="btn primary" onClick={saveKey} whileTap={{ scale: 0.96 }}>
              {saved ? 'Сохранено' : 'Сохранить'}
            </motion.button>
          </div>
        </Card>

        <Card hover={false}>
          <h3 className="card-title">
            <Icon name="pie" size={16} /> Сбор статистики
          </h3>
          <p className="muted small">
            В фоне скачивает ранговые игры Master, Grandmaster и Challenger и считает из них тир-лист, билды, руны и матчапы. Хранятся только итоги, место на
            диске небольшое. Программа оставляет часть лимита ключа для поиска и других страниц.
          </p>
          <Switch on={Boolean(s?.collectorEnabled)} onChange={(v) => update('collectorEnabled', v)} label="Собирать статистику" />
          <label className="field">
            <span>Регион статистики</span>
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
              Собрано {total.toLocaleString('ru')} игр{stats.perHour ? `, сейчас ${stats.perHour} в час` : ''}. {stats.error && <span className="bad">{stats.error}</span>}
            </p>
          )}
        </Card>

        <Card hover={false}>
          <h3 className="card-title">
            <Icon name="download" size={16} /> Выбор чемпиона
          </h3>
          <Switch on={s?.autoOpenChampion ?? true} onChange={(v) => update('autoOpenChampion', v)} label="Открывать билд выбранного чемпиона" />
          <Switch on={Boolean(s?.autoImportRunes)} onChange={(v) => update('autoImportRunes', v)} label="Импортировать руны" hint="после того как вы зафиксировали выбор" />
          <Switch on={Boolean(s?.autoImportItems)} onChange={(v) => update('autoImportItems', v)} label="Импортировать набор предметов" hint="виден в магазине в игре" />
          <Switch on={Boolean(s?.autoImportSpells)} onChange={(v) => update('autoImportSpells', v)} label="Ставить заклинания призывателя" hint="Флеш остаётся на привычной клавише" />
        </Card>

        <Card hover={false}>
          <h3 className="card-title">
            <Icon name="video" size={16} /> Запись игр
          </h3>
          <Switch on={Boolean(s?.recordingEnabled)} onChange={(v) => update('recordingEnabled', v)} label="Записывать каждую игру" />
          <Switch on={s?.recordingAudio ?? true} onChange={(v) => update('recordingAudio', v)} label="Записывать звук" />
          <div className="field-row">
            <label className="field">
              <span>Качество</span>
              <select value={s?.recordingQuality ?? 'medium'} onChange={(e) => update('recordingQuality', e.target.value as DesktopSettings['recordingQuality'])}>
                <option value="high">Высокое (14 Мбит/с)</option>
                <option value="medium">Среднее (8 Мбит/с)</option>
                <option value="low">Экономное (4 Мбит/с)</option>
              </select>
            </label>
            <label className="field">
              <span>Кадров/с</span>
              <select value={s?.recordingFps ?? 30} onChange={(e) => update('recordingFps', Number(e.target.value))}>
                <option value={30}>30</option>
                <option value={60}>60</option>
              </select>
            </label>
            <label className="field">
              <span>Разрешение</span>
              <select value={s?.recordingResolution ?? '1920x1080'} onChange={(e) => update('recordingResolution', e.target.value)}>
                <option value="2560x1440">1440p</option>
                <option value="1920x1080">1080p</option>
                <option value="1280x720">720p</option>
              </select>
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Что записывать</span>
              <select value={s?.recordingSource ?? 'screen'} onChange={(e) => update('recordingSource', e.target.value as DesktopSettings['recordingSource'])}>
                <option value="screen">Весь экран (надёжнее)</option>
                <option value="window">Только окно игры (без звука)</option>
              </select>
            </label>
            <label className="field">
              <span>Лимит папки, ГБ</span>
              <input type="number" min={5} max={2000} value={s?.recordingMaxGB ?? 50} onChange={(e) => update('recordingMaxGB', Math.max(5, Number(e.target.value) || 50))} />
            </label>
          </div>
          {desktop && (
            <button className="btn" onClick={() => window.rp?.rec.open()}>
              <Icon name="folder" size={16} /> Открыть папку записей
            </button>
          )}
        </Card>

        <Card hover={false}>
          <h3 className="card-title">
            <Icon name="layers" size={16} /> Оверлей
          </h3>
          <Switch on={Boolean(s?.overlayEnabled)} onChange={(v) => update('overlayEnabled', v)} label="Показывать оверлей в игре" hint="Ctrl+Shift+O" />
          <Switch on={s?.overlayBenchmark ?? true} onChange={(v) => update('overlayBenchmark', v)} label="Панель «вы и ваше среднее»" hint="CS, KDA, KP и обзор против ваших прошлых игр" />
        </Card>

        <Card hover={false}>
          <h3 className="card-title">Регион поиска</h3>
          <p className="muted small">Используется для поиска игроков, лидеров и наблюдения.</p>
          <select value={s?.platform ?? 'euw1'} onChange={(e) => update('platform', e.target.value)}>
            {regions.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <h3 className="card-title" style={{ marginTop: 18 }}>
            Кэш матчей
          </h3>
          <p className="muted small">Сыгранные матчи хранятся локально, чтобы не тратить запросы.</p>
          <button className="btn" onClick={onClearCache}>
            Очистить кэш
          </button>
        </Card>
      </motion.div>
    </div>
  )
}
