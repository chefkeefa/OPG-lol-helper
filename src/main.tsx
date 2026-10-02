import { Component, StrictMode, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import App from './App'
import { OverlayTimers } from './components/OverlayTimers'
import { OverlayBench } from './components/OverlayBench'
import type { LiveData } from './types'
import type { Benchmarks } from './lib/statsTypes'
import { t } from './lib/i18n'
import './styles.css'

/** Content of the transparent in-game overlay window (desktop only). */
function OverlayApp() {
  const [live, setLive] = useState<LiveData | null>(null)
  const [bench, setBench] = useState<Benchmarks>({})
  const [showBench, setShowBench] = useState(true)
  useEffect(() => window.rp?.live.on(setLive), [])
  useEffect(() => window.rp?.overlay.onBenchmarks(setBench), [])
  useEffect(() => {
    window.rp?.settings.get().then((s) => setShowBench(s.overlayBenchmark))
  }, [live === null])
  return (
    <div className="ov-stack">
      <OverlayTimers live={live} />
      {showBench && <OverlayBench live={live} bench={bench} />}
    </div>
  )
}

/** Shows the error instead of a blank window if something in the interface crashes. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash">
        <h2>{t('Что-то пошло не так')}</h2>
        <p>{t('Пришлите этот текст разработчику:')}</p>
        <pre>{String(this.state.error.stack ?? this.state.error)}</pre>
        <button className="btn primary" onClick={() => location.reload()}>
          {t('Перезапустить интерфейс')}
        </button>
      </div>
    )
  }
}

const overlay = location.hash === '#overlay'
if (overlay) document.documentElement.classList.add('overlay-window')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">{overlay ? <OverlayApp /> : <App />}</MotionConfig>
    </ErrorBoundary>
  </StrictMode>,
)
