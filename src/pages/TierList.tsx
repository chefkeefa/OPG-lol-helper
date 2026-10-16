import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { StatsStatus, StatsSummary } from '../lib/statsTypes'
import { ROLE_LABEL, TIER_COLOR, pct, statsSummary, tierRows, type TierRow } from '../lib/statsApi'
import { champTile, championList, rankEmblem } from '../lib/ddragon'
import { PLATFORMS } from '../api/riot'
import { locale, t } from '../lib/i18n'
import { Icon, Img, Skeleton, Splash, ease } from '../components/ui'
import { NavIcon } from '../components/NavIcons'
import { RoleIcon } from '../components/RoleIcon'
import { CollectorPill, PatchSelect, RoleTabs, StatsGate, hasData, patchList } from '../components/StatsBits'

type Sort = 'tier' | 'wr' | 'pr' | 'br' | 'g'

export function TierList({
  status,
  demo,
  setDemo,
  onOpen,
  onSettings,
  onMayhem,
  version,
}: {
  status: StatsStatus | null
  demo: boolean
  setDemo: (v: boolean) => void
  onOpen: (champ: string, role: string) => void
  onSettings: () => void
  onMayhem: () => void
  version: number
}) {
  const [role, setRole] = useState('')
  const [patch, setPatch] = useState('')
  const [sort, setSort] = useState<{ by: Sort; desc: boolean }>({ by: 'tier', desc: true })
  const [q, setQ] = useState('')
  const [data, setData] = useState<StatsSummary | null>(null)
  const [prev, setPrev] = useState<StatsSummary | null>(null)
  const [curOnly, setCurOnly] = useState<StatsSummary | null>(null)
  const [offMeta, setOffMeta] = useState(false)
  const [names, setNames] = useState<Record<string, string>>({})
  const ready = demo || hasData(status)

  useEffect(() => {
    championList().then((l) => setNames(Object.fromEntries(l.map((c) => [c.id, c.name]))))
  }, [])
  useEffect(() => {
    if (!ready) return
    statsSummary(patchList(status, patch), demo).then(setData)
    // winrate change: the shown patch against the one before it
    const list = status?.patches.map((p) => p.patch) ?? []
    const cur = patch && patch !== '*' ? patch : list[0]
    const before = list[list.indexOf(cur) + 1]
    if (!demo && cur && before && patch !== '*')
      Promise.all([statsSummary([cur], false), statsSummary([before], false)]).then(([a, b]) => {
        setPrev(b)
        // compare like with like: the newest patch alone, not the two-patch default sample
        if (!patch) setCurOnly(a)
      })
    else {
      setPrev(null)
      setCurOnly(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, patch, demo, version])

  /** winrate change against the previous patch, per champion and role (only with enough games on both) */
  const delta = useMemo(() => {
    const out: Record<string, number> = {}
    if ((demo || !window.rp?.stats) && data) {
      for (const r of data.rows) out[r.champ + r.role] = (((r.champ.charCodeAt(0) * 7 + r.g) % 31) - 15) / 1000
      return out
    }
    const now = curOnly ?? data
    if (!now || !prev) return out
    const old = Object.fromEntries(prev.rows.map((r) => [r.champ + r.role, r]))
    for (const r of now.rows) {
      const o = old[r.champ + r.role]
      if (o && o.g >= 30 && r.g >= 30) out[r.champ + r.role] = r.w / r.g - o.w / o.g
    }
    return out
  }, [data, prev, curOnly, demo])

  /** share of a champion's games played in each role (99.8% = their main role) */
  const share = useMemo(() => {
    const total: Record<string, number> = {}
    for (const r of data?.rows ?? []) total[r.champ] = (total[r.champ] ?? 0) + r.g
    return (r: { champ: string; g: number }) => r.g / Math.max(1, total[r.champ] ?? 0)
  }, [data])

  const rows = useMemo(() => {
    if (!data) return []
    const s = q.trim().toLowerCase()
    const list = tierRows(data).filter(
      (r) => (!role || r.role === role) && (offMeta || s || share(r) >= 0.1) && (!s || r.champ.toLowerCase().includes(s) || names[r.champ]?.toLowerCase().includes(s)),
    )
    const key: Record<Sort, (r: TierRow) => number> = { tier: (r) => r.score, wr: (r) => r.wr, pr: (r) => r.pr, br: (r) => r.br, g: (r) => r.g }
    return list.sort((a, b) => (sort.desc ? 1 : -1) * (key[sort.by](b) - key[sort.by](a)))
  }, [data, role, q, sort, names, offMeta, share])

  const head = (by: Sort, label: string) => (
    <button className={`th ${sort.by === by ? 'on' : ''}`} onClick={() => setSort((s) => ({ by, desc: s.by === by ? !s.desc : true }))}>
      {label}
      {sort.by === by && <Icon name="chevron" size={12} />}
    </button>
  )

  return (
    <div className="page">
      <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <h1>
          <NavIcon name="chart" size={26} /> {t('Тир-лист')}
        </h1>
        <p className="page-sub">{t('Тир-листы по играм Master+: следите за метой и лучшими чемпионами для своей роли.')}</p>
        <div className="push" />
        <CollectorPill status={status} demo={demo} />
        <div className="head-tabs">
          <button className="on">
            <span>Ranked</span>
          </button>
          <button onClick={onMayhem}>
            <span>ARAM Mayhem</span>
          </button>
        </div>
      </motion.div>

      {!ready ? (
        <StatsGate status={status} onDemo={() => setDemo(true)} onSettings={onSettings} />
      ) : (
        <>
          <motion.div className="card tier-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }}>
            <div className="tier-toolbar">
              <RoleTabs id="tier" value={role} onChange={setRole} />
              <span className="tier-chip" title={t('Ранговые игры Master, Grandmaster и Challenger')}>
                <Img src={rankEmblem('MASTER')} alt="" size={18} radius={0} />
                MASTER+
              </span>
              <span className="tier-chip">
                <Icon name="eye" size={14} />
                {(PLATFORMS[status?.platform ?? ''] ?? status?.platform ?? 'EUW').replace(/\d+$/, '').toUpperCase()}
              </span>
              {!demo && <PatchSelect status={status} value={patch} onChange={setPatch} />}
              <label className="offmeta" title={t('Показывать редкие роли: чемпион играет на этой позиции реже чем в 10% игр')}>
                <button className={`switch ${offMeta ? 'on' : ''}`} onClick={() => setOffMeta(!offMeta)} aria-pressed={offMeta}>
                  <motion.i layout transition={{ type: 'spring', stiffness: 500, damping: 32 }} />
                </button>
                <span>Off-meta</span>
              </label>
              <div className="push" />
              {demo && (
                <button className="btn" onClick={() => setDemo(false)}>
                  {t('Выйти из примера')}
                </button>
              )}
              <div className="search-mini">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Найти чемпиона…')} />
                <Icon name="search" size={15} />
              </div>
            </div>

            <div className="tier-table">
              <div className="tier-row tier-head">
                <span>{t('Ранг')}</span>
                <span>{t('Чемпион')}</span>
                <span>{t('Роль')}</span>
                {head('tier', t('Тир'))}
                {head('wr', t('Винрейт'))}
                {head('pr', t('Пикрейт'))}
                {head('br', t('Банрейт'))}
                {head('g', t('Игры'))}
              </div>
              {!data ? (
                Array.from({ length: 10 }, (_, i) => (
                  <div key={i} className="tier-row">
                    <Skeleton h={28} />
                  </div>
                ))
              ) : (
                <AnimatePresence initial={false}>
                  {rows.map((r, i) => {
                    const d = delta[r.champ + r.role]
                    const on = (k: Sort) => (sort.by === k ? 'col-on' : '')
                    return (
                      <motion.button
                        layout="position"
                        key={r.champ + r.role}
                        className="tier-row"
                        onClick={() => onOpen(r.champ, r.role)}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease, delay: Math.min(i, 20) * 0.015 } }}
                        exit={{ opacity: 0, transition: { duration: 0.12 } }}
                      >
                        <span className="tier-rank">{i + 1}</span>
                        <span className="tier-champ">
                          <span className="tier-art">
                            <Splash src={champTile(r.champ)} position="center 22%" />
                          </span>
                          <b>{names[r.champ] ?? r.champ}</b>
                        </span>
                        <span className="tier-lane" title={ROLE_LABEL[r.role]}>
                          <RoleIcon role={r.role} size={15} />
                          <em>{pct(share(r))}</em>
                        </span>
                        <b className={`tier-letter ${on('tier')}`} style={{ color: TIER_COLOR[r.tier] }}>
                          {r.tier}
                        </b>
                        <span className={`tier-wr-num ${on('wr')}`}>
                          <b>{pct(r.wr)}</b>
                          {d !== undefined && (
                            <em className={d > 0.0005 ? 'good' : d < -0.0005 ? 'bad' : ''}>
                              {d >= 0 ? '+' : '−'}
                              {pct(Math.abs(d))}
                            </em>
                          )}
                        </span>
                        <b className={on('pr')}>{pct(r.pr)}</b>
                        <span className={on('br')}>{pct(r.br)}</span>
                        <span className={`muted ${on('g')}`}>{r.g.toLocaleString(locale)}</span>
                      </motion.button>
                    )
                  })}
                </AnimatePresence>
              )}
              {data && !rows.length && <p className="muted pad">{t('Ничего не найдено.')}</p>}
            </div>
          </motion.div>
          <p className="small muted foot-note">
            {t('Ранговые одиночные игры Master, Grandmaster и Challenger. Тир учитывает винрейт с поправкой на размер выборки, пикрейт и банрейт; тиры считаются отдельно для каждой роли.')}
          </p>
        </>
      )}
    </div>
  )
}
