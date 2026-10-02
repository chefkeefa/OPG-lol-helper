import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import type { AugTiers, MayhemData, PairMap, StatsStatus } from '../lib/statsTypes'
import { augTiers, pct, statsMayhem, TIER_COLOR } from '../lib/statsApi'
import { championList, champName } from '../lib/ddragon'
import { useGameData } from '../lib/gameData'
import { Champ, Card, Icon, Img, Segmented, ease, fadeUp, stagger } from '../components/ui'
import { ChampPicker, TierBadge } from '../components/StatsBits'
import { RARITY_COLOR, RARITY_LABEL } from '../components/AugmentOverlay'
import { ItemTip, RuneTree, SkillOrder, SpellImg, parsePage } from './Champion'
import { t } from '../lib/i18n'

type Tab = 'augments' | 'champions'
type Rarity = 'all' | 'prismatic' | 'gold' | 'silver'

const top = (m: PairMap | undefined, n = 1) => Object.entries(m ?? {}).sort((a, b) => b[1][0] - a[1][0]).slice(0, n)
const ids = (k: string) => k.split('.').map(Number)
const TIERS: [string, number][] = [
  ['S+', 0.06],
  ['S', 0.2],
  ['A', 0.42],
  ['B', 0.68],
  ['C', 0.88],
  ['D', 1],
]

export function Mayhem({
  status,
  demo,
  setDemo,
  version,
  onSettings,
  toast,
}: {
  status: StatsStatus | null
  demo: boolean
  setDemo: (v: boolean) => void
  version: number
  onSettings: () => void
  toast: (msg: string, kind?: 'err' | 'info') => void
}) {
  const [tab, setTab] = useState<Tab>('augments')
  const [data, setData] = useState<MayhemData | null>(null)
  const [tiers, setTiers] = useState<AugTiers | null>(null)
  const [champ, setChamp] = useState('')
  const [rarity, setRarity] = useState<Rarity>('all')
  const gd = useGameData()
  const ready = demo || (status?.mayhem ?? 0) >= 50

  useEffect(() => {
    if (ready) statsMayhem(demo).then(setData)
  }, [ready, demo, version])
  useEffect(() => {
    if (ready) augTiers(champ, demo).then(setTiers)
  }, [ready, demo, champ, version])

  // champions ranked by smoothed win rate, with tiers
  const champs = useMemo(() => {
    if (!data) return []
    const rows = Object.entries(data.champs)
      .filter(([, a]) => a.g >= 20)
      .map(([c, a]) => ({ champ: c, g: a.g, wr: a.w / a.g, score: (a.w + 40) / (a.g + 80), tier: 'D' }))
      .sort((a, b) => b.score - a.score)
    rows.forEach((r, i) => (r.tier = TIERS.find(([, lim]) => (i + 0.5) / rows.length <= lim)![0]))
    return rows
  }, [data])
  useEffect(() => {
    if (tab === 'champions' && !champ && champs[0]) setChamp(champs[0].champ)
  }, [tab, champ, champs])

  const a = champ ? data?.champs[champ] : undefined
  const tierRank = (x: string) => TIERS.findIndex(([k]) => k === x)
  const augRows = (tiers?.rows ?? []).filter((r) => r.tier && (rarity === 'all' || r.rarity === rarity)).sort((x, y) => tierRank(x.tier) - tierRank(y.tier) || y.wr - x.wr)
  const champAugs = (tiers?.rows ?? []).filter((r) => r.champGames >= 5).slice(0, 8)

  const doImport = async () => {
    if (!a || !champ) return
    if (!window.rp?.build) return toast(t('Импорт в клиент работает в десктоп-версии программы.'), 'info')
    const key = (await championList()).find((c) => c.id === champ)?.key
    const core = top(a.core)[0]?.[0]
    const runes = top(a.runes)[0]?.[0]
    const build = {
      champion: champ,
      championKey: key,
      role: 'ARAM',
      runes: runes ? parsePage(runes) : null,
      spells: top(a.spells)[0] ? ids(top(a.spells)[0][0]) : [],
      core: core ? ids(core) : [],
      boots: Number(top(a.boots)[0]?.[0]) || 0,
    }
    const done: string[] = []
    for (const [w, label] of [['runes', t('руны')], ['items', t('предметы')], ['spells', t('заклинания')]] as const) {
      if (w === 'runes' && !build.runes) continue
      const r = await window.rp.build.import(w, build)
      if (!r.ok) return toast(`${label}: ${r.error}`)
      done.push(label)
    }
    toast(t('{champion}: в клиент импортированы {items}', { champion: champName(champ), items: done.join(', ') }), 'info')
  }

  return (
    <div className="page mayhem-page">
      <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <h1>
          <Icon name="bolt" size={28} /> ARAM Mayhem
        </h1>
        {data && <span className="muted small">{t('{n} игр Mayhem', { n: data.matches.toLocaleString() })}</span>}
        <div className="grow" />
        {demo && (
          <button className="btn" onClick={() => setDemo(false)}>
            {t('Выйти из примера')}
          </button>
        )}
      </motion.div>

      {!ready ? (
        <div className="card gate">
          <h3>{t('Статистика Mayhem ещё собирается')}</h3>
          <p className="muted">
            {t('Программа скачивает игры ARAM Mayhem через Riot API вместе с ранговыми: из них считаются тиры аугментов, билды и прокачка. Нужны ключ Riot API и включённый сбор Mayhem в настройках. Собрано: {n}.', { n: status?.mayhem ?? 0 })}
          </p>
          <div className="gate-actions">
            <button className="btn primary" onClick={() => setDemo(true)}>
              {t('Показать пример')}
            </button>
            <button className="btn" onClick={onSettings}>
              {t('Настройки')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <Card hover={false} className="mayhem-hint">
            <Icon name="info" size={16} />
            <span>
              {t('В игре Mayhem программа сама читает карточки аугментов с экрана и подписывает под каждой тир. Ctrl+Shift+A прочитает карточки сразу, Ctrl+Shift+T покажет весь тир-лист. Игра должна быть в режиме «без рамки» или «в окне».')}
            </span>
          </Card>
          <div className="mayhem-toolbar">
            <Segmented
              id="mayhem-tab"
              value={tab}
              onChange={setTab}
              options={[
                { id: 'augments', label: t('Аугменты') },
                { id: 'champions', label: t('Чемпионы и билды') },
              ]}
            />
            <ChampPicker value={champ || undefined} onPick={setChamp} only={data ? Object.keys(data.champs) : undefined} placeholder={t('Для чемпиона…')} />
            {champ && (
              <button className="btn" onClick={() => setChamp('')}>
                <Icon name="close" size={14} /> {t('Все чемпионы')}
              </button>
            )}
          </div>

          {tab === 'augments' ? (
            <div className="card">
              <div className="mayhem-rarity">
                <Segmented
                  id="mayhem-rarity"
                  value={rarity}
                  onChange={setRarity}
                  options={[
                    { id: 'all', label: t('Все') },
                    { id: 'prismatic', label: RARITY_LABEL.prismatic },
                    { id: 'gold', label: RARITY_LABEL.gold },
                    { id: 'silver', label: RARITY_LABEL.silver },
                  ]}
                />
                {champ && <span className="muted small">{t('Тиры с учётом игр на {name}', { name: champName(champ) })}</span>}
              </div>
              <motion.div className="aug-table" variants={stagger} initial="hidden" animate="show" key={rarity + champ}>
                <div className="aug-row aug-head">
                  <span>{t('Тир')}</span>
                  <span>{t('Аугмент')}</span>
                  <span>{t('Редкость')}</span>
                  <span>{t('Винрейт')}</span>
                  <span>{t('Игры')}</span>
                </div>
                {augRows.slice(0, 120).map((r) => (
                  <motion.div key={r.id} variants={fadeUp} className="aug-row">
                    <TierBadge tier={r.tier} size={30} />
                    <span className="aug-name">
                      {r.icon ? <Img src={r.icon} alt="" size={30} radius={7} /> : <i className="aug-dot" style={{ background: RARITY_COLOR[r.rarity] }} />}
                      <b>{r.name}</b>
                    </span>
                    <span style={{ color: RARITY_COLOR[r.rarity] }}>{RARITY_LABEL[r.rarity]}</span>
                    <span className={r.wr >= 0.5 ? 'good' : 'bad'}>{pct(r.wr, 1)}</span>
                    <span className="muted">
                      {r.games.toLocaleString()}
                      {champ && r.champGames ? ` · ${r.champGames}` : ''}
                    </span>
                  </motion.div>
                ))}
                {!augRows.length && <p className="muted small">{t('Нет данных по аугментам.')}</p>}
              </motion.div>
            </div>
          ) : (
            <div className="mayhem-champs">
              <div className="card mayhem-list">
                {champs.map((c) => (
                  <button key={c.champ} className={`mayhem-champ ${champ === c.champ ? 'on' : ''}`} onClick={() => setChamp(c.champ)}>
                    <TierBadge tier={c.tier} size={24} />
                    <Champ name={c.champ} size={30} radius={8} />
                    <span>{champName(c.champ)}</span>
                    <em className={c.wr >= 0.5 ? 'good' : 'bad'}>{pct(c.wr, 1)}</em>
                  </button>
                ))}
              </div>
              {a && (
                <motion.div className="mayhem-build" key={champ} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }}>
                  <div className="card mayhem-build-head">
                    <Champ name={champ} size={56} radius={14} />
                    <div>
                      <h2>{champName(champ)}</h2>
                      <span className="muted small">
                        {t('{n} игр', { n: a.g.toLocaleString() })} · <span className={a.w / a.g >= 0.5 ? 'good' : 'bad'}>{pct(a.w / a.g, 1)}</span>
                      </span>
                    </div>
                    <div className="grow" />
                    <button className="btn primary" onClick={doImport}>
                      <Icon name="download" size={15} /> {t('Импорт в клиент')}
                    </button>
                  </div>
                  <div className="mayhem-build-grid">
                    <div className="card">
                      <h3 className="card-title">{t('Лучшие аугменты')}</h3>
                      {champAugs.map((r) => (
                        <div key={r.id} className="aug-mini">
                          <b style={{ color: TIER_COLOR[r.tier] }}>{r.tier || '–'}</b>
                          {r.icon ? <Img src={r.icon} alt="" size={24} radius={6} /> : <i className="aug-dot" style={{ background: RARITY_COLOR[r.rarity] }} />}
                          <span>{r.name}</span>
                          <em>{pct(r.wr, 1)}</em>
                        </div>
                      ))}
                      {!champAugs.length && <p className="muted small">{t('Мало игр с аугментами на этом чемпионе.')}</p>}
                    </div>
                    <div className="card">
                      <h3 className="card-title">{t('Предметы')}</h3>
                      {top(a.core, 2).map(([k, [g, w]]) => (
                        <div key={k} className="build-line">
                          {ids(k).map((id, i) => (
                            <span key={i} className="build-step">
                              {i > 0 && <Icon name="right" size={12} />}
                              <ItemTip id={id} gd={gd} size={34} />
                            </span>
                          ))}
                          <em className="muted small">
                            {pct(w / g, 1)} · {g}
                          </em>
                        </div>
                      ))}
                      <div className="build-line">
                        {top(a.boots).map(([k]) => (
                          <ItemTip key={k} id={Number(k)} gd={gd} size={34} />
                        ))}
                        {top(a.spells).map(([k]) => ids(k).map((id) => <SpellImg key={id} id={id} gd={gd} size={34} />))}
                      </div>
                    </div>
                    <div className="card">
                      <h3 className="card-title">{t('Руны')}</h3>
                      {gd && top(a.runes)[0] ? <RuneTree page={parsePage(top(a.runes)[0][0])} gd={gd} /> : <p className="muted small">{t('Нет данных о рунах.')}</p>}
                    </div>
                    <div className="card">
                      <h3 className="card-title">{t('Прокачка умений')}</h3>
                      <SkillOrder a={a} />
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
