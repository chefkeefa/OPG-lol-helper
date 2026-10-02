import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import type { DesktopSettings } from '../env'
import { demoLive } from '../lib/objectives'
import { Card, Icon, Segmented, ease, stagger } from '../components/ui'
import { OverlayTimers } from '../components/OverlayTimers'

export function Overlays({ settings, update }: { settings: DesktopSettings | null; update: <K extends keyof DesktopSettings>(k: K, v: DesktopSettings[K]) => void }) {
  const [t, setT] = useState(1170)
  useEffect(() => {
    const id = setInterval(() => setT((v) => (v >= 1300 ? 1170 : v + 1)), 1000)
    return () => clearInterval(id)
  }, [])
  const desktop = Boolean(window.rp)

  return (
    <div className="page">
      <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <h1>
          <Icon name="layers" size={30} /> Оверлеи
        </h1>
        <p className="page-sub">Прозрачное окно поверх игры с таймерами дракона, личинок, герольда и барона. Работает в режиме «Без рамки».</p>
      </motion.div>
      <motion.div className="overlay-layout" variants={stagger} initial="hidden" animate="show">
        <Card className="overlay-preview" hover={false}>
          <div className="fake-game">
            <div className={`fake-pos ${settings?.overlayCorner ?? 'top-right'}`}>
              <OverlayTimers live={demoLive(t)} />
            </div>
            <span className="fake-label">предпросмотр</span>
          </div>
        </Card>
        <Card className="overlay-settings" hover={false}>
          <h3 className="card-title">Таймеры объектов</h3>
          {!desktop && <p className="muted small">Настройки оверлея доступны в десктоп-версии (npm run app).</p>}
          <label className="switch-row">
            <span>
              <b>Показывать в игре автоматически</b>
              <span className="muted small">Окно появляется при старте матча и скрывается после</span>
            </span>
            <button
              className={`switch ${settings?.overlayEnabled ? 'on' : ''}`}
              disabled={!desktop}
              onClick={() => update('overlayEnabled', !settings?.overlayEnabled)}
              aria-pressed={settings?.overlayEnabled}
            >
              <motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 32 }} />
            </button>
          </label>
          <div className="field">
            <span className="muted small">Угол экрана</span>
            <Segmented
              id="corner"
              value={settings?.overlayCorner ?? 'top-right'}
              onChange={(v) => desktop && update('overlayCorner', v)}
              options={[
                { id: 'top-left', label: '↖' },
                { id: 'top-right', label: '↗' },
                { id: 'bottom-left', label: '↙' },
                { id: 'bottom-right', label: '↘' },
              ]}
            />
          </div>
          <div className="field">
            <span className="muted small">Горячая клавиша</span>
            <div>
              <kbd className="kbd">Ctrl</kbd> + <kbd className="kbd">Shift</kbd> + <kbd className="kbd">O</kbd> показать или скрыть
            </div>
          </div>
          <button className="btn" disabled={!desktop} onClick={() => window.rp?.overlay.toggle()}>
            Показать/скрыть сейчас
          </button>
        </Card>
      </motion.div>
    </div>
  )
}
