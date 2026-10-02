import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import type { MatchSummary, PlayerData } from '../types'
import { championAggs } from '../lib/stats'
import { champSplash } from '../lib/ddragon'
import { champSkinSplash, useSkins } from '../lib/skins'
import { Champ, Counter, Icon, Splash, ease, fadeUp, stagger } from '../components/ui'

type SortKey = 'games' | 'wr' | 'kda' | 'score' | 'cs' | 'dmg'

export function Champions({ data, matches }: { data: PlayerData; matches: MatchSummary[] }) {
  useSkins()
  const [sort, setSort] = useState<SortKey>('games')
  const rows = useMemo(() => {
    const aggs = championAggs(matches).map((a) => {
      const g = matches.filter((m) => m.champion === a.champion)
      return {
        ...a,
        wr: a.wins / a.games,
        kda: (a.kills + a.assists) / Math.max(1, a.deaths),
        cs: g.reduce((s, m) => s + m.cs / Math.max(1, m.durationSec / 60), 0) / g.length,
        dmg: g.reduce((s, m) => s + m.dmgPerMin, 0) / g.length,
      }
    })
    return aggs.sort((a, b) => (b[sort] as number) - (a[sort] as number))
  }, [matches, sort])
  const top = rows[0]

  const cols: [SortKey, string][] = [
    ['games', 'Игры'],
    ['wr', 'Винрейт'],
    ['kda', 'KDA'],
    ['cs', 'CS/мин'],
    ['dmg', 'Урон/мин'],
    ['score', 'Оценка'],
  ]

  return (
    <div className="page">
      <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <h1>
          <Icon name="chart" size={30} /> Чемпионы
        </h1>
        <p className="page-sub">Статистика по чемпионам за загруженные игры. Нажмите на заголовок столбца, чтобы отсортировать.</p>
      </motion.div>

      <motion.div variants={stagger} initial="hidden" animate="show" className="champs-layout">
        <div className="champs-main">
          {top && (
            <motion.section variants={fadeUp} className="card champ-hero">
              <Splash src={champSkinSplash(top.champion)} fallback={champSplash(top.champion)} position="center 20%" />
              <div className="champ-hero-shade" />
              <div className="champ-hero-body">
                <span className="chip">Лучший по «{cols.find((c) => c[0] === sort)?.[1]}»</span>
                <h2>{top.champion}</h2>
                <div className="champ-hero-stats">
                  <div>
                    <b>
                      <Counter value={top.wr * 100} format={(v) => `${Math.round(v)}%`} />
                    </b>
                    <span>винрейт</span>
                  </div>
                  <div>
                    <b>
                      <Counter value={top.kda} format={(v) => v.toFixed(2)} />
                    </b>
                    <span>KDA</span>
                  </div>
                  <div>
                    <b>{top.games}</b>
                    <span>игр</span>
                  </div>
                  <div>
                    <b>
                      <Counter value={top.score} format={(v) => v.toFixed(0)} />
                    </b>
                    <span>оценка</span>
                  </div>
                </div>
              </div>
            </motion.section>
          )}

          <motion.section variants={fadeUp} className="card table-card">
            <div className="ctable">
              <div className="ctr head">
                <span>Чемпион</span>
                {cols.map(([k, l]) => (
                  <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>
                    {l}
                    {sort === k && <motion.span layoutId="sort-ind" className="sort-ind" />}
                  </button>
                ))}
              </div>
              {rows.map((r, i) => (
                <motion.div key={r.champion} layout className="ctr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.025, layout: { duration: 0.45, ease } }}>
                  <span className="ct-champ">
                    <Champ name={r.champion} size={32} radius={8} /> {r.champion}
                  </span>
                  <span>{r.games}</span>
                  <span className="ct-wr">
                    <span className={r.wr >= 0.5 ? 'win-text' : 'loss-text'}>{Math.round(r.wr * 100)}%</span>
                    <span className="wr-bar">
                      <motion.span initial={{ width: 0 }} animate={{ width: `${r.wr * 100}%` }} transition={{ duration: 0.8, ease }} />
                    </span>
                  </span>
                  <span>
                    {r.kda.toFixed(2)}
                    <span className="muted tiny">
                      {' '}
                      {r.kills.toFixed(1)}/{r.deaths.toFixed(1)}/{r.assists.toFixed(1)}
                    </span>
                  </span>
                  <span>{r.cs.toFixed(1)}</span>
                  <span>{Math.round(r.dmg)}</span>
                  <span className="ct-score">{Math.round(r.score)}</span>
                </motion.div>
              ))}
            </div>
          </motion.section>
        </div>

        <motion.section variants={fadeUp} className="card mastery-list">
          <h3 className="card-title">
            <Icon name="sparkle" size={16} /> Мастерство
          </h3>
          {(data.mastery ?? []).map((m, i) => (
            <motion.div key={m.champion} className="ml-row" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.05, ease }}>
              <Champ name={m.champion} size={40} radius={10} />
              <div className="ml-text">
                <b>{m.champion}</b>
                <span className="muted small">Уровень {m.level}</span>
                <span className="bar-track thin">
                  <motion.span
                    className="bar-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${(m.points / (data.mastery?.[0]?.points || 1)) * 100}%` }}
                    transition={{ duration: 1, ease, delay: 0.3 + i * 0.05 }}
                  />
                </span>
              </div>
              <b className="ml-pts">{(m.points / 1000).toFixed(0)}k</b>
            </motion.div>
          ))}
          {!data.mastery?.length && <div className="muted small">Нет данных о мастерстве.</div>}
        </motion.section>
      </motion.div>
    </div>
  )
}
