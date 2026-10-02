import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { DraftData, DraftSession, StatsStatus } from '../lib/statsTypes'
import type { PlayerData } from '../types'
import { statsDetail, statsDraft, ROLE_LABEL, pct } from '../lib/statsApi'
import { ROLES, banSuggestions, draftOdds, inferRoles, rankPicks, type Pick, type Score } from '../lib/draft'
import { championList, championMap, champName } from '../lib/ddragon'
import { Champ, Icon, Switch, ease, fadeUp, stagger } from '../components/ui'
import { RoleIcon } from '../components/RoleIcon'
import { ChampPicker, CollectorPill, RoleTabs, StatsGate, hasData } from '../components/StatsBits'
import { t } from '../lib/i18n'

const empty = (roles: boolean): Pick[] => ROLES.map((r) => ({ champ: '', role: roles ? r : '' }))
const sign = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`

export function Draft({
  status,
  demo,
  setDemo,
  version,
  data: player,
  onSettings,
  onOpenChampion,
  toast,
}: {
  status: StatsStatus | null
  demo: boolean
  setDemo: (v: boolean) => void
  version: number
  data: PlayerData
  onSettings: () => void
  onOpenChampion: (champ: string, role: string) => void
  toast: (msg: string, kind?: 'err' | 'info') => void
}) {
  const ready = demo || hasData(status)
  const [stats, setStats] = useState<DraftData | null>(null)
  const [session, setSession] = useState<DraftSession | null>(null)
  const [ids, setIds] = useState<Record<number, string>>({})
  // sandbox: your own what-if draft, used whenever there is no champion select going on
  const [allies, setAllies] = useState<Pick[]>(() => empty(true))
  const [enemies, setEnemies] = useState<Pick[]>(() => empty(false))
  const [bans, setBans] = useState<string[]>([])
  const [myIdx, setMyIdx] = useState(2)
  const [role, setRole] = useState('')
  const [ownedOnly, setOwnedOnly] = useState(true)
  const [owned, setOwned] = useState<Set<string> | null>(null)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    championMap().then(setIds)
  }, [])
  useEffect(() => {
    if (!ready) return
    statsDraft(demo).then(setStats)
  }, [ready, demo, version])
  useEffect(() => {
    const rp = window.rp
    if (!rp?.draft) return
    rp.draft.get().then(setSession)
    return rp.draft.onSession(setSession)
  }, [])
  // champions you own, so the list does not suggest ones you cannot pick
  useEffect(() => {
    if (!session || owned || !window.rp) return
    window.rp.lcu
      .get<{ id: number }[]>('/lol-champions/v1/owned-champions-minimal')
      .then((list) => setOwned(new Set(list.map((c) => ids[c.id]).filter(Boolean))))
      .catch(() => {})
  }, [session, owned, ids])

  const live = Boolean(session && session.allies.length)
  const view = useMemo(() => {
    if (!live || !session) return { allies, enemies, bans, mine: myIdx }
    const name = (k: number) => (k ? ids[k] ?? '' : '')
    const a = session.allies.map((s) => ({ champ: name(s.champ || s.hover), role: s.role, locked: Boolean(s.champ) }))
    const e = session.enemies.map((s) => ({ champ: name(s.champ), role: '' }))
    return { allies: a, enemies: e, bans: session.bans.map(name).filter(Boolean), mine: session.allies.findIndex((s) => s.cell === session.myCell) }
  }, [live, session, ids, allies, enemies, bans, myIdx])

  const myPick = view.allies[view.mine]
  const myRole = role || myPick?.role || 'MIDDLE'
  const rolesA = useMemo(() => (stats ? inferRoles(stats, view.allies) : view.allies), [stats, view.allies])
  const rolesE = useMemo(() => (stats ? inferRoles(stats, view.enemies) : view.enemies), [stats, view.enemies])
  const others = rolesA.filter((_, i) => i !== view.mine)
  const taken = useMemo(() => new Set([...view.bans, ...rolesA.filter((_, i) => i !== view.mine).map((p) => p.champ), ...rolesE.map((p) => p.champ)].filter(Boolean)), [view.bans, rolesA, rolesE, view.mine])
  const mastery = useMemo(() => Object.fromEntries((player.mastery ?? []).map((m) => [m.champion, m.points])), [player.mastery])

  const picks = useMemo(
    () => (stats ? rankPicks(stats, myRole, others, rolesE, { taken, owned: live && ownedOnly ? owned : null, mastery }).slice(0, 12) : []),
    [stats, myRole, others, rolesE, taken, live, ownedOnly, owned, mastery],
  )
  const odds = useMemo(() => (stats ? draftOdds(stats, rolesA, rolesE) : null), [stats, rolesA, rolesE])
  const banList = useMemo(() => (stats ? banSuggestions(stats, taken, myPick?.champ ? { champ: myPick.champ, role: myRole } : null) : []), [stats, taken, myPick, myRole])
  const pool = useMemo(() => (stats ? Object.keys(stats.champs) : undefined), [stats])
  const pairsMissing = useMemo(() => stats && !Object.values(stats.champs).some((r) => Object.values(r).some((a) => a.foe && Object.keys(a.foe).length)), [stats])

  const doImport = async (s: Score) => {
    if (!window.rp?.build) return toast(t('Импорт в клиент работает в десктоп-версии программы.'), 'info')
    setBusy(s.champ)
    try {
      const d = await statsDetail(s.champ, s.role, [], demo)
      if (!d.rec) return toast(t('Пока нет статистики по этому чемпиону'))
      const key = (await championList()).find((c) => c.id === s.champ)?.key
      const build = { champion: s.champ, championKey: key, role: d.role || s.role, ...d.rec }
      const done: string[] = []
      for (const [w, label] of [['runes', t('руны')], ['items', t('предметы')], ['spells', t('заклинания')]] as const) {
        const r = await window.rp.build.import(w, build)
        if (!r.ok) return toast(`${label}: ${r.error}`)
        done.push(label)
      }
      toast(t('{champion}: в клиент импортированы {items}', { champion: champName(s.champ), items: done.join(', ') }), 'info')
    } finally {
      setBusy('')
    }
  }

  const setSlot = (side: 'a' | 'e', i: number, champ: string) => {
    const fn = side === 'a' ? setAllies : setEnemies
    fn((list) => list.map((p, j) => (j === i ? { ...p, champ } : p)))
  }
  const reset = () => {
    setAllies(empty(true))
    setEnemies(empty(false))
    setBans([])
  }

  return (
    <div className="page draft-page">
      <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <h1>
          <Icon name="target" size={28} /> {t('Помощник драфта')}
        </h1>
        <span className={`draft-mode ${live ? 'live' : ''}`}>{live ? t('Выбор чемпионов идёт') : t('Песочница: соберите драфт сами')}</span>
        <CollectorPill status={status} demo={demo} />
      </motion.div>

      {!ready ? (
        <StatsGate status={status} onDemo={() => setDemo(true)} onSettings={onSettings} />
      ) : (
        <>
          {odds && (
            <motion.div className="card draft-odds" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }}>
              <div className="draft-odds-text">
                <span className="muted small">{t('Шанс на победу драфта')}</span>
                <b className={odds.p >= 0.5 ? 'good' : 'bad'}>{pct(odds.p, 1)}</b>
                <span className="muted small">{odds.known ? t('по {n} выбранным чемпионам', { n: odds.known }) : t('пока никто не выбран')}</span>
              </div>
              <div className="draft-odds-bar">
                <motion.i className="ally" animate={{ width: `${odds.p * 100}%` }} transition={{ duration: 0.6, ease }} />
                <i className="enemy" />
              </div>
            </motion.div>
          )}
          {pairsMissing && <p className="muted small draft-note">{t('Синергия и контрпики появятся, когда сборщик скачает новые игры: старая статистика хранила только матчапы на линии.')}</p>}

          <div className="draft-grid">
            <TeamColumn
              pool={pool}
              title={t('Ваша команда')}
              side="ally"
              picks={rolesA}
              mine={view.mine}
              live={live}
              onPick={(i, c) => setSlot('a', i, c)}
              onMine={live ? undefined : setMyIdx}
            />

            <div className="draft-center">
              <div className="card">
                <div className="draft-picks-head">
                  <h3 className="card-title">
                    <Icon name="sparkle" size={16} /> {t('Лучшие пики для вас')}
                  </h3>
                  <RoleTabs
                    id="draft-role"
                    value={myRole}
                    all={false}
                    onChange={(r) => {
                      // in the sandbox the role tab also moves you to that seat
                      if (live) setRole(r)
                      else setMyIdx(ROLES.indexOf(r as (typeof ROLES)[number]))
                    }}
                  />
                </div>
                {live && owned && <Switch on={ownedOnly} onChange={setOwnedOnly} label={t('Только мои чемпионы')} />}
                <motion.div className="draft-picks" variants={stagger} initial="hidden" animate="show" key={myRole + picks.length}>
                  {picks.map((s, i) => (
                    <motion.div key={s.champ} variants={fadeUp} className="draft-pick">
                      <span className="draft-rank">{i + 1}</span>
                      <Champ name={s.champ} size={40} radius={10} />
                      <div className="draft-pick-name">
                        <b>{champName(s.champ)}</b>
                        <span className="draft-parts">
                          <em title={t('Винрейт в этой роли')}>{t('Мета')} {sign(s.meta)}</em>
                          {s.laneOpp && <em className={s.lane >= 0 ? 'good' : 'bad'}>{t('Линия против {name}', { name: champName(s.laneOpp) })} {sign(s.lane)}</em>}
                          {s.counter !== 0 && <em className={s.counter >= 0 ? 'good' : 'bad'}>{t('Против врагов')} {sign(s.counter)}</em>}
                          {s.synergy !== 0 && <em className={s.synergy >= 0 ? 'good' : 'bad'}>{t('Синергия')} {sign(s.synergy)}</em>}
                          {s.comfort > 0 && <em className="good">{t('Ваш чемпион')} {sign(s.comfort)}</em>}
                        </span>
                      </div>
                      <div className="draft-wr">
                        <b className={s.wr >= 0.5 ? 'good' : 'bad'}>{pct(s.wr, 1)}</b>
                        <span className="muted small">{t('{n} игр', { n: s.games.toLocaleString() })}</span>
                      </div>
                      <div className="draft-actions">
                        <button className="btn primary" disabled={busy === s.champ} onClick={() => doImport(s)} title={t('Руны, предметы и заклинания в клиент')}>
                          <Icon name="download" size={15} /> {t('Импорт')}
                        </button>
                        <button className="btn" onClick={() => onOpenChampion(s.champ, s.role)} title={t('Открыть билд')}>
                          <Icon name="arrow" size={15} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                  {!picks.length && <p className="muted small">{t('Нет данных по этой роли.')}</p>}
                </motion.div>
              </div>

              <div className="card">
                <h3 className="card-title">
                  <Icon name="shield" size={16} /> {t('Кого банить')}
                </h3>
                <div className="draft-bans">
                  {banList.map((b) => (
                    <button key={b.champ} className="draft-ban" onClick={() => !live && setBans((l) => (l.includes(b.champ) ? l : [...l, b.champ]))} title={ROLE_LABEL[b.role]}>
                      <Champ name={b.champ} size={36} radius={9} />
                      <span>{champName(b.champ)}</span>
                      {b.why > 0.2 && <em className="bad">{t('против вас {v}', { v: sign(-b.why) })}</em>}
                    </button>
                  ))}
                </div>
                {view.bans.length > 0 && (
                  <div className="draft-banned">
                    <span className="muted small">{t('Забанены')}</span>
                    {view.bans.map((c) => (
                      <span key={c} className="banned" onClick={() => !live && setBans((l) => l.filter((x) => x !== c))}>
                        <Champ name={c} size={24} radius={6} />
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {!live && (
                <button className="btn" onClick={reset}>
                  <Icon name="refresh" size={15} /> {t('Очистить драфт')}
                </button>
              )}
            </div>

            <TeamColumn pool={pool} title={t('Противники')} side="enemy" picks={rolesE} live={live} onPick={(i, c) => setSlot('e', i, c)} />
          </div>
          <p className="muted small draft-note">
            {t('Оценка считается по собранным играм Master+: винрейт чемпиона в роли, как он играет с вашими союзниками и против выбранных врагов. Маленькие выборки сглаживаются к нулю. Роли противников угадываются по тому, где их чемпионы играют чаще всего.')}
          </p>
        </>
      )}
    </div>
  )
}

function TeamColumn({
  title,
  side,
  picks,
  mine,
  live,
  onPick,
  onMine,
  pool,
}: {
  pool?: string[]
  title: string
  side: 'ally' | 'enemy'
  picks: (Pick & { locked?: boolean })[]
  mine?: number
  live: boolean
  onPick: (i: number, champ: string) => void
  onMine?: (i: number) => void
}) {
  return (
    <div className={`card draft-team ${side}`}>
      <h3 className="card-title">{title}</h3>
      {picks.map((p, i) => (
        <div key={i} className={`draft-slot ${i === mine ? 'me' : ''} ${p.champ ? 'filled' : ''} ${p.locked === false ? 'hover' : ''}`}>
          <span className="draft-slot-role" title={p.role ? ROLE_LABEL[p.role] : ''}>
            {p.role ? <RoleIcon role={p.role} size={18} /> : <Icon name="dot" size={12} />}
          </span>
          {live ? (
            <>
              {p.champ ? <Champ name={p.champ} size={40} radius={10} /> : <span className="draft-empty" />}
              <span className="draft-slot-name">{p.champ ? champName(p.champ) : t('Выбирает…')}</span>
            </>
          ) : (
            <ChampPicker only={pool} value={p.champ || undefined} onPick={(c) => onPick(i, c)} placeholder={side === 'ally' ? (i === mine ? t('Вы') : t('Союзник')) : t('Противник')} />
          )}
          {p.champ && !live && (
            <button className="icon-btn" onClick={() => onPick(i, '')} title={t('Убрать')}>
              <Icon name="close" size={14} />
            </button>
          )}
          {onMine && i !== mine && (
            <button className="icon-btn" onClick={() => onMine(i)} title={t('Это я')}>
              <Icon name="star" size={14} />
            </button>
          )}
          {i === mine && <AnimatePresence><motion.em className="draft-me" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{t('Вы')}</motion.em></AnimatePresence>}
        </div>
      ))}
    </div>
  )
}
