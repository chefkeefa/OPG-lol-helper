import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { AugOverlayState, AugTier } from '../lib/statsTypes'
import { TIER_COLOR, pct } from '../lib/statsApi'
import { champName } from '../lib/ddragon'
import { Img } from './ui'
import { t } from '../lib/i18n'

export const RARITY_LABEL: Record<AugTier['rarity'], string> = { prismatic: t('Призматические'), gold: t('Золотые'), silver: t('Серебряные') }
export const RARITY_COLOR: Record<AugTier['rarity'], string> = { prismatic: '#d58cff', gold: '#f3c74f', silver: '#c3cad6' }

/** Full-screen, click-through window: a tier under each offered augment card, and the tier list. */
export function AugmentOverlay() {
  const [st, setSt] = useState<AugOverlayState>({ cards: [], panel: null, champion: '' })
  useEffect(() => window.rp?.aug.onState(setSt), [])
  const best = st.cards.reduce<AugTier | null>((b, c) => (c.tier && (!b || c.wr > b.wr) ? c : b), null)
  return (
    <div className="aug-ov">
      <AnimatePresence>
        {st.cards.map((c) => (
          // the outer box centres the badge under the title; motion owns the inner transform
          <div key={c.id} className="aug-anchor" style={{ left: c.x, top: c.y + 8 }}>
            <motion.div
              className={`aug-badge ${best?.id === c.id ? 'best' : ''}`}
              style={{ borderColor: TIER_COLOR[c.tier] ?? '#666' }}
              initial={{ opacity: 0, y: -6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <b style={{ color: TIER_COLOR[c.tier] ?? '#aaa' }}>{c.tier || '?'}</b>
              <span>{c.games ? pct(c.wr, 1) : t('нет данных')}</span>
              {best?.id === c.id && <em>{t('Лучший выбор')}</em>}
            </motion.div>
          </div>
        ))}
      </AnimatePresence>
      <AnimatePresence>
        {st.panel && (
          <motion.div className="aug-panel" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
            <h3>
              {t('Аугменты')}
              {st.champion && <span> · {champName(st.champion)}</span>}
            </h3>
            {(['prismatic', 'gold', 'silver'] as const).filter((r) => st.panel!.rows.some((x) => x.rarity === r && x.tier)).map((r) => (
              <div key={r} className="aug-panel-group">
                <h4 style={{ color: RARITY_COLOR[r] }}>{RARITY_LABEL[r]}</h4>
                {st.panel!.rows
                  .filter((x) => x.rarity === r && x.tier)
                  .slice(0, 8)
                  .map((x) => (
                    <div key={x.id} className="aug-panel-row">
                      <b style={{ color: TIER_COLOR[x.tier] }}>{x.tier}</b>
                      {x.icon ? <Img src={x.icon} alt="" size={20} radius={5} /> : <i />}
                      <span>{x.name}</span>
                      <em>{pct(x.wr, 1)}</em>
                    </div>
                  ))}
              </div>
            ))}
            <p>Ctrl+Shift+T</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
