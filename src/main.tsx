import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import App from './App'
import { AugmentOverlay } from './components/AugmentOverlay'
import { OverlayApp } from './components/OverlayWidgets'
import { t } from './lib/i18n'
import './fonts.css'
import './styles.css'

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
const augments = location.hash === '#augments'
if (overlay || augments) document.documentElement.classList.add('overlay-window')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">{augments ? <AugmentOverlay /> : overlay ? <OverlayApp /> : <App />}</MotionConfig>
    </ErrorBoundary>
  </StrictMode>,
)
