import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { DesktopSettings, OverlayWidget } from '../env'
import { Card, Icon, ease, fadeUp, stagger } from '../components/ui'
import { OverlayTimers } from '../components/OverlayTimers'
import { OverlayBench } from '../components/OverlayBench'
import { DEFAULT_WIDGETS, OverlayGold, OverlayRespawn, OverlayScout, OverlaySkills, demoOverlayLive } from '../components/OverlayWidgets'
import { t } from '../lib/i18n'

type Update = <K extends keyof DesktopSettings>(k: K, v: DesktopSettings[K]) => void

const DEMO_BENCH = { '*': { games: 20, csPerMin: 7.1, kda: 3.2, kp: 0.52, visionPerMin: 0.9, deathsPerGame: 4.8 } }

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="ovc-keys">
      {keys.map((k) => (
        <kbd key={k} className="kbd">
          {k}
        </kbd>
      ))}
    </span>
  )
}

function Switch({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`switch ${on ? 'on' : ''}`} disabled={disabled} onClick={() => onChange(!on)} aria-pressed={on}>
      <motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 32 }} />
    </button>
  )
}

function WidgetCard({
  title,
  desc,
  preview,
  on,
  disabled,
  onChange,
  keys,
}: {
  title: string
  desc: string
  preview: ReactNode
  on: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  keys?: string[]
}) {
  return (
    <motion.div variants={fadeUp} className={`ovc ${on ? '' : 'off'}`}>
      <div className="ovc-preview">{preview}</div>
      <div className="ovc-body">
        <div className="ovc-head">
          <b>{title}</b>
          <Switch on={on} disabled={disabled} onChange={onChange} />
        </div>
        <p>{desc}</p>
        {keys && <Keys keys={keys} />}
      </div>
    </motion.div>
  )
}

export function Overlays({ settings, update }: { settings: DesktopSettings | null; update: Update }) {
  const [tick, setTick] = useState(1170)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    const id = setInterval(() => setTick((v) => (v >= 1300 ? 1170 : v + 1)), 1000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => window.rp?.overlay.onEdit(setEditing), [])
  const desktop = Boolean(window.rp)
  const live = demoOverlayLive(tick)
  const w = { ...DEFAULT_WIDGETS, ...settings?.overlayWidgets }
  const set = (id: OverlayWidget) => (v: boolean) => {
    update('overlayWidgets', { ...w, [id]: v })
    if (id === 'bench') update('overlayBenchmark', v)
  }
  const benchOn = w.bench && settings?.overlayBenchmark !== false

  return (
    <div className="page">
      <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <h1>
          <Icon name="layers" size={30} /> {t('Оверлеи')}
        </h1>
        <p className="page-sub">{t('Виджеты поверх игры, которые помогают быть на шаг впереди. Работают в режиме «Без рамки».')}</p>
        <div className="push" />
        <div className="ovc-actions">
          <button className={`btn ${editing ? 'primary' : ''}`} disabled={!desktop} onClick={() => window.rp?.overlay.edit()}>
            <Icon name="grid" size={15} /> {editing ? t('Выйти из редактора') : t('Редактор оверлея')} <Keys keys={['Alt', 'B']} />
          </button>
          <button className="btn" disabled={!desktop} onClick={() => window.rp?.overlay.toggle()}>
            {t('Показать/скрыть')} <Keys keys={['Ctrl', 'Shift', 'O']} />
          </button>
        </div>
      </motion.div>

      {!desktop && <p className="muted small">{t('Настройки оверлея доступны в десктоп-версии (npm run app).')}</p>}

      <Card className="ovc-master" hover={false}>
        <span>
          <b>{t('Показывать в игре автоматически')}</b>
          <span className="muted small">{t('Оверлей появляется при старте матча и скрывается после. Положение виджетов меняется в редакторе.')}</span>
        </span>
        <Switch on={Boolean(settings?.overlayEnabled)} disabled={!desktop} onChange={(v) => update('overlayEnabled', v)} />
      </Card>

      <h2 className="ovc-section">{t('В игре')}</h2>
      <p className="muted ovc-section-sub">{t('Виджеты, которые рисуются поверх вашей игры.')}</p>
      <motion.div className="ovc-grid" variants={stagger} initial="hidden" animate="show">
        <WidgetCard
          title={t('Вы и ваше среднее')}
          desc={t('Будьте себе тренером: CS, KDA, KP и обзор против ваших прошлых игр на этом чемпионе.')}
          preview={<OverlayBench live={live} bench={DEMO_BENCH} />}
          on={benchOn}
          disabled={!desktop}
          onChange={set('bench')}
        />
        <WidgetCard
          title={t('Разница золота')}
          desc={t('Кто богаче: золото в предметах у команд и против соперника по линии.')}
          preview={<OverlayGold live={live} />}
          on={w.gold}
          disabled={!desktop}
          onChange={set('gold')}
        />
        <WidgetCard
          title={t('Экран загрузки')}
          desc={t('Ранг, LP и винрейт всех десяти игроков в начале матча. Нужен ключ Riot API.')}
          preview={
            <div className="ovc-scale">
              <OverlayScout live={live} platform="euw1" demo />
            </div>
          }
          on={w.scout}
          disabled={!desktop}
          onChange={set('scout')}
          keys={['Alt', 'X']}
        />
        <WidgetCard
          title={t('Таймеры объектов')}
          desc={t('Когда появятся дракон, личинки, герольд и барон.')}
          preview={<OverlayTimers live={live} />}
          on={w.timers}
          disabled={!desktop}
          onChange={set('timers')}
          keys={['Ctrl', 'Shift', 'O']}
        />
        <WidgetCard
          title={t('Таймеры возрождения')}
          desc={t('Кто мёртв и через сколько вернётся: время для барона или пуша.')}
          preview={<OverlayRespawn live={live} />}
          on={w.respawn}
          disabled={!desktop}
          onChange={set('respawn')}
        />
        <WidgetCard
          title={t('Порядок умений')}
          desc={t('Какое умение качать следующим, по статистике игр Master+ на вашем чемпионе.')}
          preview={<OverlaySkills live={live} demo />}
          on={w.skills}
          disabled={!desktop}
          onChange={set('skills')}
        />
        <WidgetCard
          title={t('Аугменты ARAM Mayhem')}
          desc={t('Тиры аугментов прямо на карточках выбора.')}
          preview={
            <div className="ovc-aug">
              {['S', 'A', 'B'].map((tier, i) => (
                <span key={tier} className={`ovc-aug-card t-${tier}`} style={{ animationDelay: `${i * 0.15}s` }}>
                  <b>{tier}</b>
                </span>
              ))}
            </div>
          }
          on={Boolean(settings?.augmentsEnabled)}
          disabled={!desktop}
          onChange={(v) => update('augmentsEnabled', v)}
          keys={['Ctrl', 'Shift', 'A']}
        />
      </motion.div>
    </div>
  )
}
