import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { MatchSummary, QueueFilter } from '../types'
import { QUEUE_FILTERS, ago, badge, duration, kdaRatio, queueLabel } from '../lib/stats'
import { champSplash } from '../lib/ddragon'
import { matchSplash, useSkins } from '../lib/skins'
import { Champ, Icon, Item, Ring, Segmented, Splash, ease, fadeUp, stagger } from '../components/ui'
import { t } from '../lib/i18n'

export function Matches({
  matches,
  filter,
  setFilter,
  openId,
  setOpenId,
}: {
  matches: MatchSummary[]
  filter: QueueFilter
  setFilter: (f: QueueFilter) => void
  openId?: string
  setOpenId: (id?: string) => void
}) {
  useSkins()
  const wins = matches.filter((m) => m.win).length
  return (
    <div className="page">
      <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <h1>
          <Icon name="film" size={30} /> {t('История матчей')}
        </h1>
        <p className="page-sub">
          {t('{n} игр · {w}W {l}L · нажмите на игру, чтобы раскрыть составы и статистику всех десяти игроков.', { n: matches.length, w: wins, l: matches.length - wins })}
        </p>
        <div className="push" />
        <Segmented id="queue-m" options={QUEUE_FILTERS} value={filter} onChange={setFilter} />
      </motion.div>
      <motion.div className="history" variants={stagger} initial="hidden" animate="show">
        {matches.map((m) => (
          <MatchRow key={m.id} m={m} open={m.id === openId} onToggle={() => setOpenId(m.id === openId ? undefined : m.id)} />
        ))}
        {!matches.length && <div className="card empty">{t('Нет игр в этом режиме')}</div>}
      </motion.div>
    </div>
  )
}

function MatchRow({ m, open, onToggle }: { m: MatchSummary; open: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 120)
  }, [open])
  const b = badge(m)
  return (
    <motion.div ref={ref} variants={fadeUp} layout className={`hrow ${m.win ? 'win' : 'loss'} ${open ? 'open' : ''}`}>
      <button className="hrow-head" onClick={onToggle}>
        <Splash src={matchSplash(m)} fallback={champSplash(m.champion)} className="hrow-bg" position="center 25%" />
        <span className="hrow-stripe" />
        <div className="hrow-meta">
          <b className={m.win ? 'win-text' : 'loss-text'}>{m.win ? t('Победа') : t('Поражение')}</b>
          <span>{queueLabel(m.queueId, m.mode)}</span>
          <span className="muted small">
            {duration(m.durationSec)} · {ago(m.endedAt)}
          </span>
        </div>
        <div className="hrow-champ">
          <Champ name={m.champion} size={52} radius={12} />
          <span className="champ-lvl">{m.champLevel}</span>
        </div>
        <div className="hrow-kda">
          <div className="big">
            {m.kills} / <span className="d">{m.deaths}</span> / {m.assists}
          </div>
          <div className="muted small">{kdaRatio(m.kills, m.deaths, m.assists)} KDA</div>
        </div>
        <div className="hrow-stats">
          <span>
            <b>{m.cs}</b> CS ({(m.cs / Math.max(1, m.durationSec / 60)).toFixed(1)})
          </span>
          <span>
            <b>{Math.round(m.kp * 100)}%</b> KP
          </span>
          <span>
            <b>{Math.round(m.dmgPerMin)}</b> {t('урон/мин')}
          </span>
        </div>
        <div className="items">
          {m.items.map((id, i) => (
            <Item key={i} id={id} size={26} />
          ))}
        </div>
        <div className="hrow-teams">
          <div>
            {[m.champion, ...m.allies].map((c, i) => (
              <Champ key={i} name={c} size={20} radius={5} />
            ))}
          </div>
          <div>
            {m.enemies.map((c, i) => (
              <Champ key={i} name={c} size={20} radius={5} />
            ))}
          </div>
        </div>
        <Ring value={m.score} size={48} color={m.placement === 1 ? 'var(--gold)' : m.win ? 'var(--text)' : 'var(--loss)'}>
          <b>{m.score}</b>
          <span className={`badge ${b.tone}`}>{b.text}</span>
        </Ring>
        <motion.span className="hrow-chev" animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.3, ease }}>
          <Icon name="chevron" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="hrow-detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.45, ease }}
          >
            <Scoreboard m={m} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function Scoreboard({ m }: { m: MatchSummary }) {
  const ps = m.players
  if (!ps?.length) return <div className="muted pad">{t('Подробности недоступны для этой игры. Обновите данные, чтобы загрузить составы.')}</div>
  const myTeam = ps.find((p) => p.me)?.teamId
  const teams = [ps.filter((p) => p.teamId === myTeam), ps.filter((p) => p.teamId !== myTeam)]
  const maxDmg = Math.max(...ps.map((p) => p.damage), 1)
  return (
    <div className="scoreboard">
      {teams.map((team, ti) => {
        const won = ti === 0 ? m.win : !m.win
        return (
          <div key={ti} className="sb-team">
            <div className={`sb-head ${won ? 'win-text' : 'loss-text'}`}>
              <b>{ti === 0 ? t('Ваша команда') : t('Противники')}</b> · {won ? t('Победа') : t('Поражение')} · {t('{n} убийств', { n: team.reduce((s, p) => s + p.kills, 0) })}
              <span className="sb-cols">
                <span>KDA</span>
                <span>{t('Урон')}</span>
                <span>CS</span>
                <span>{t('Обзор')}</span>
                <span>{t('Предметы')}</span>
                <span>{t('Оценка')}</span>
              </span>
            </div>
            {team.map((p, i) => (
              <motion.div
                key={i}
                className={`sb-row ${p.me ? 'me' : ''}`}
                initial={{ opacity: 0, x: ti ? 10 : -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.04 + ti * 0.1, duration: 0.35, ease }}
              >
                <div className="sb-player">
                  <Champ name={p.champion} size={30} radius={7} />
                  <span>{p.name}</span>
                </div>
                <span className="sb-kda">
                  {p.kills}/{p.deaths}/{p.assists}
                </span>
                <span className="sb-dmg">
                  <span>{(p.damage / 1000).toFixed(1)}k</span>
                  <span className="sb-bar">
                    <motion.span initial={{ width: 0 }} animate={{ width: `${(p.damage / maxDmg) * 100}%` }} transition={{ duration: 0.8, ease, delay: 0.2 }} />
                  </span>
                </span>
                <span>{p.cs}</span>
                <span>{p.vision}</span>
                <span className="items">
                  {p.items.map((id, j) => (
                    <Item key={j} id={id} size={20} />
                  ))}
                </span>
                <span className="sb-score">{p.score}</span>
              </motion.div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

