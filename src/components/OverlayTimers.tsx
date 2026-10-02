import { AnimatePresence, motion } from 'motion/react'
import type { LiveData } from '../types'
import { clock, objectiveTimers } from '../lib/objectives'
import { Ring } from './ui'
import { ObjectiveGlyph } from '../pages/Dashboard'

/** Compact timer stack used by the in-game overlay window and its preview. */
export function OverlayTimers({ live }: { live: LiveData | null }) {
  const timers = objectiveTimers(live)
  if (!live) return null
  return (
    <div className="ov">
      <div className="ov-clock">{clock(live.gameData.gameTime)}</div>
      <AnimatePresence initial={false}>
        {timers.map((t) => {
          const up = t.remaining === 0
          const soon = !up && t.remaining <= 45
          return (
            <motion.div
              key={t.id}
              layout
              className={`ov-row ${up ? 'up' : ''} ${soon ? 'soon' : ''}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.35 }}
            >
              <Ring value={up ? 100 : 100 - (t.remaining / t.window) * 100} size={28} stroke={2.5} color={up ? 'var(--win)' : soon ? 'var(--gold)' : 'var(--accent)'}>
                <ObjectiveGlyph id={t.id} />
              </Ring>
              <span className="ov-label">{t.label}</span>
              <b>{up ? 'UP' : clock(t.remaining)}</b>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
