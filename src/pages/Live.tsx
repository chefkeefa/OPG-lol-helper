import { motion } from 'motion/react'
import type { LiveData } from '../types'
import { champSplash } from '../lib/ddragon'
import { clock, objectiveTimers } from '../lib/objectives'
import { Card, Champ, Icon, Item, Ring, Splash, ease, stagger } from '../components/ui'
import { liveChamp, liveSplash } from '../lib/skins'
import { ObjectiveGlyph } from './Dashboard'

export function Live({ live, preview, onPreview }: { live: LiveData | null; preview: boolean; onPreview: () => void }) {
  if (!live)
    return (
      <div className="page">
        <PageHead />
        <motion.div key="empty" className="card live-empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
          <motion.div className="radar" animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }} transition={{ repeat: Infinity, duration: 2.2 }}>
            <Icon name="eye" size={34} />
          </motion.div>
          <h3>Сейчас вы не в игре</h3>
          <p className="muted">
            Как только начнётся матч, здесь появятся оба состава, счёт в реальном времени и таймеры объектов.
            {!window.rp && ' Живые данные доступны только в десктоп-версии.'}
          </p>
          <button className="btn" onClick={onPreview}>
            Показать пример
          </button>
        </motion.div>
      </div>
    )

  const me = live.activePlayer?.riotIdGameName ?? live.activePlayer?.summonerName
  const myTeam = live.allPlayers.find((p) => [p.riotIdGameName, p.summonerName].includes(me))?.team ?? 'ORDER'
  const teams = [live.allPlayers.filter((p) => p.team === myTeam), live.allPlayers.filter((p) => p.team !== myTeam)]
  const kills = teams.map((t) => t.reduce((s, p) => s + p.scores.kills, 0))
  const timers = objectiveTimers(live)

  return (
    <div className="page">
      <PageHead extra={preview ? <span className="chip">пример</span> : <span className="rec-dot" />} />
      <motion.div key="grid" variants={stagger} initial="hidden" animate="show" className="live-grid">
        <Card className="live-score" hover={false}>
          <div className="ls-side">
            <span className="muted small">Ваша команда</span>
            <b className="ls-kills">{kills[0]}</b>
          </div>
          <div className="ls-clock">
            <Icon name="clock" size={16} /> {clock(live.gameData.gameTime)}
            <span className="muted small">{live.gameData.gameMode}</span>
          </div>
          <div className="ls-side right">
            <span className="muted small">Противники</span>
            <b className="ls-kills">{kills[1]}</b>
          </div>
        </Card>
        <Card className="live-timers" hover={false}>
          {timers.map((t) => (
            <div key={t.id} className="lt">
              <Ring value={t.remaining ? 100 - (t.remaining / t.window) * 100 : 100} size={46} stroke={3} color={t.remaining ? 'var(--accent)' : 'var(--win)'}>
                <ObjectiveGlyph id={t.id} />
              </Ring>
              <div>
                <b>{t.remaining ? clock(t.remaining) : 'Доступен'}</b>
                <span className="muted small">{t.label}</span>
              </div>
            </div>
          ))}
          {!timers.length && <span className="muted">Таймеры доступны только на Ущелье призывателей</span>}
        </Card>
        {teams.map((team, ti) => (
          <Card key={ti} className={`live-team ${ti ? 'enemy' : 'ally'}`} hover={false}>
            {team.map((p, i) => (
              <motion.div
                key={p.championName + i}
                className={`lp ${[p.riotIdGameName, p.summonerName].includes(me) ? 'me' : ''} ${p.isDead ? 'dead' : ''}`}
                initial={{ opacity: 0, x: ti ? 16 : -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.05, duration: 0.45, ease }}
              >
                <Splash src={liveSplash(p)} fallback={champSplash(liveChamp(p))} className="lp-bg" position="center 22%" />
                <div className="lp-champ">
                  <Champ name={liveChamp(p)} size={44} radius={10} />
                  <span className="champ-lvl">{p.level}</span>
                </div>
                <div className="lp-name">
                  <b>{p.riotIdGameName ?? p.summonerName}</b>
                  <span className="muted small">
                    {p.championName}
                    {p.isDead && p.respawnTimer ? ` · воскрешение ${Math.ceil(p.respawnTimer)}с` : ''}
                  </span>
                </div>
                <div className="lp-kda">
                  <span>
                    {p.scores.kills} / <span className="d">{p.scores.deaths}</span> / {p.scores.assists}
                  </span>
                  <span className="muted small">{p.scores.creepScore} CS</span>
                </div>
                <div className="items">
                  {Array.from({ length: 7 }, (_, s) => (
                    <Item key={s} id={p.items.find((it) => it.slot === s)?.itemID ?? 0} size={22} />
                  ))}
                </div>
              </motion.div>
            ))}
          </Card>
        ))}
      </motion.div>
    </div>
  )
}

const PageHead = ({ extra }: { extra?: React.ReactNode }) => (
  <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
    <h1>
      <Icon name="eye" size={30} /> Текущая игра {extra}
    </h1>
  </motion.div>
)
