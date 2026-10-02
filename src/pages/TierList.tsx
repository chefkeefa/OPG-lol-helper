import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { StatsStatus, StatsSummary } from '../lib/statsTypes'
import { ROLE_LABEL, pct, statsSummary, tierRows, type TierRow } from '../lib/statsApi'
import { championList } from '../lib/ddragon'
import { locale, t } from '../lib/i18n'
import { Champ, Icon, Skeleton, ease } from '../components/ui'
import { RoleIcon } from '../components/RoleIcon'
import { CollectorPill, PatchSelect, RoleTabs, StatsGate, TierBadge, hasData, patchList } from '../components/StatsBits'

type Sort = 'tier' | 'wr' | 'pr' | 'br' | 'g'

export function TierList({
  status,
  demo,
  setDemo,
  onOpen,
  onSettings,
  version,
}: {
  status: StatsStatus | null
  demo: boolean
  setDemo: (v: boolean) => void
  onOpen: (champ: string, role: string) => void
  onSettings: () => void
  version: number
}) {
  const [role, setRole] = useState('')
  const [patch, setPatch] = useState('')
  const [sort, setSort] = useState<{ by: Sort; desc: boolean }>({ by: 'tier', desc: true })
  const [q, setQ] = useState('')
  const [data, setData] = useState<StatsSummary | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const ready = demo || hasData(status)

  useEffect(() => {
    championList().then((l) => setNames(Object.fromEntries(l.map((c) => [c.id, c.name]))))
  }, [])
  useEffect(() => {
    if (!ready) return
    statsSummary(patchList(status, patch), demo).then(setData)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, patch, demo, version])

  const rows = useMemo(() => {
    if (!data) return []
    const s = q.trim().toLowerCase()
    const list = tierRows(data).filter((r) => (!role || r.role === role) && (!s || r.champ.toLowerCase().includes(s) || names[r.champ]?.toLowerCase().includes(s)))
    const key: Record<Sort, (r: TierRow) => number> = { tier: (r) => r.score, wr: (r) => r.wr, pr: (r) => r.pr, br: (r) => r.br, g: (r) => r.g }
    return list.sort((a, b) => (sort.desc ? 1 : -1) * (key[sort.by](b) - key[sort.by](a)))
  }, [data, role, q, sort, names])

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
          <Icon name="list" size={28} /> {t('Тир-лист')}
        </h1>
        <CollectorPill status={status} demo={demo} />
      </motion.div>

      {!ready ? (
        <StatsGate status={status} onDemo={() => setDemo(true)} onSettings={onSettings} />
      ) : (
        <>
          <motion.div className="tier-toolbar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <RoleTabs id="tier" value={role} onChange={setRole} />
            <div className="tier-tools">
              <div className="search-mini">
                <Icon name="search" size={15} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Чемпион')} />
              </div>
              {!demo && <PatchSelect status={status} value={patch} onChange={setPatch} />}
              {demo && (
                <button className="btn" onClick={() => setDemo(false)}>
                  {t('Выйти из примера')}
                </button>
              )}
            </div>
          </motion.div>

          <div className="card tier-table">
            <div className="tier-row tier-head">
              <span>#</span>
              {head('tier', t('Тир'))}
              <span>{t('Чемпион')}</span>
              <span>{t('Роль')}</span>
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
                {rows.map((r, i) => (
                  <motion.button
                    layout="position"
                    key={r.champ + r.role}
                    className="tier-row"
                    onClick={() => onOpen(r.champ, r.role)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease, delay: Math.min(i, 20) * 0.018 } }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  >
                    <span className="muted">{i + 1}</span>
                    <TierBadge tier={r.tier} />
                    <span className="tier-champ">
                      <Champ name={r.champ} size={36} radius={9} />
                      <b>{names[r.champ] ?? r.champ}</b>
                    </span>
                    <span className="tier-role" title={ROLE_LABEL[r.role]}>
                      <RoleIcon role={r.role} size={18} />
                    </span>
                    <span className="tier-wr">
                      <b className={r.wr >= 0.52 ? 'good' : r.wr < 0.48 ? 'bad' : ''}>{pct(r.wr, 2)}</b>
                      <i className="wr-bar">
                        <motion.i initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(1, (r.wr - 0.4) / 0.2)) * 100}%` }} transition={{ duration: 0.7, ease }} />
                      </i>
                    </span>
                    <span>{pct(r.pr)}</span>
                    <span>{pct(r.br)}</span>
                    <span className="muted">{r.g.toLocaleString(locale)}</span>
                  </motion.button>
                ))}
              </AnimatePresence>
            )}
            {data && !rows.length && <p className="muted pad">{t('Ничего не найдено.')}</p>}
          </div>
          <p className="small muted foot-note">
            {t('Ранговые одиночные игры Master, Grandmaster и Challenger. Тир учитывает винрейт с поправкой на размер выборки, пикрейт и банрейт; тиры считаются отдельно для каждой роли.')}
          </p>
        </>
      )}
    </div>
  )
}
