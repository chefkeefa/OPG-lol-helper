import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Agg, PairMap, RunePage, StatsDetail, StatsStatus, StatsSummary } from '../lib/statsTypes'
import { ROLE_LABEL, pct, statsDetail, statsSummary, tierRows, wrOf } from '../lib/statsApi'
import { champName, champSplash, championList } from '../lib/ddragon'
import { SHARDS, SPELL_FALLBACK, runeIcon, shardIcon, spellIcon, useGameData, type GameData } from '../lib/gameData'
import { Card, Champ, Icon, Img, Item, Skeleton, Splash, ease, spring, stagger } from '../components/ui'
import { ChampPicker, CollectorPill, PatchSelect, RoleTabs, StatsGate, TierBadge, hasData, patchList } from '../components/StatsBits'
import { locale, t } from '../lib/i18n'

const top = (m: PairMap | undefined, n = 99, min = 1) =>
  Object.entries(m ?? {})
    .filter(([, [g]]) => g >= min)
    .sort((a, b) => b[1][0] - a[1][0])
    .slice(0, n)

const ids = (k: string) => k.split('.').map(Number)

export function parsePage(key: string): RunePage {
  const n = ids(key)
  return { primaryStyleId: n[0], subStyleId: n[5], perks: [n[1], n[2], n[3], n[4], n[6], n[7], n[8], n[9], n[10]] }
}

/** Q/W/E in the order they are maxed, from a 15-level sequence. */
function maxOrder(seq: string) {
  const at: Record<string, number> = {}
  const cnt: Record<string, number> = { Q: 0, W: 0, E: 0 }
  seq.split('').forEach((c, i) => {
    if (c === 'R') return
    cnt[c]++
    if (cnt[c] === 5 && at[c] === undefined) at[c] = i
  })
  return ['Q', 'W', 'E'].sort((a, b) => (at[a] ?? 99) - (at[b] ?? 99) || cnt[b] - cnt[a])
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="ch-stat">
      <span>{label}</span>
      <b className={tone}>{value}</b>
      {sub && <em>{sub}</em>}
    </div>
  )
}

function WrLine({ g, w, total, small }: { g: number; w: number; total: number; small?: boolean }) {
  const wr = g ? w / g : 0
  return (
    <span className={`wr-line ${small ? 'small' : ''}`}>
      <b className={wr >= 0.52 ? 'good' : wr < 0.48 ? 'bad' : ''}>{pct(wr)}</b>
      <em>
        {pct(total ? g / total : 0)} · {g.toLocaleString(locale)}
      </em>
    </span>
  )
}

export function Champion({
  champ,
  role,
  setChamp,
  setRole,
  status,
  demo,
  setDemo,
  version,
  fromChampSelect,
  onSettings,
  onMatchups,
  toast,
}: {
  champ: string
  role: string
  setChamp: (c: string) => void
  setRole: (r: string) => void
  status: StatsStatus | null
  demo: boolean
  setDemo: (v: boolean) => void
  version: number
  fromChampSelect: boolean
  onSettings: () => void
  onMatchups: (champ: string, role: string) => void
  toast: (text: string, tone?: 'err' | 'info') => void
}) {
  const gd = useGameData()
  const [patch, setPatch] = useState('')
  const [d, setD] = useState<StatsDetail | null>(null)
  const [sum, setSum] = useState<StatsSummary | null>(null)
  const [name, setName] = useState(champ)
  const [key, setKey] = useState(0)
  const [sel, setSel] = useState<{ runes?: string; core?: string; spells?: string; start?: string; boots?: string }>({})
  const ready = demo || hasData(status)

  useEffect(() => {
    championList().then((l) => {
      const c = l.find((x) => x.id === champ)
      setName(c?.name ?? champ)
      setKey(c?.key ?? 0)
    })
    setSel({})
  }, [champ, role])
  useEffect(() => {
    if (!ready) return
    const p = patchList(status, patch)
    statsDetail(champ, role, p, demo).then(setD)
    statsSummary(p, demo).then(setSum)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [champ, role, patch, demo, ready, version])

  const a: Agg | null = d?.agg ?? null
  const shownRole = d?.role ?? role
  const tier = useMemo(() => (sum ? tierRows(sum).find((r) => r.champ === champ && r.role === shownRole) : undefined), [sum, champ, shownRole])

  const pick = {
    runes: sel.runes ?? top(a?.runes, 1)[0]?.[0],
    core: sel.core ?? top(a?.core, 1)[0]?.[0],
    spells: sel.spells ?? top(a?.spells, 1)[0]?.[0],
    start: sel.start ?? top(a?.start, 1)[0]?.[0],
    boots: sel.boots ?? top(a?.boots, 1)[0]?.[0],
  }
  const late = top(a?.late, 8)
    .map(([k, v]) => [Number(k), v] as const)
    .filter(([id]) => !pick.core || !ids(pick.core).includes(id))
    .slice(0, 6)

  const payload = () => ({
    champion: champ,
    championKey: key,
    role: shownRole ?? '',
    runes: pick.runes ? parsePage(pick.runes) : null,
    spells: pick.spells ? ids(pick.spells) : [],
    start: pick.start ? ids(pick.start) : [],
    core: pick.core ? ids(pick.core) : [],
    boots: Number(pick.boots) || 0,
    late: late.map(([id]) => id),
  })

  const doImport = async (what: ('runes' | 'items' | 'spells')[]) => {
    if (!window.rp?.build) return toast(t('Импорт в клиент работает в десктоп-версии программы.'), 'info')
    const label = { runes: t('Руны'), items: t('Предметы'), spells: t('Заклинания') }
    const ok: string[] = []
    for (const w of what) {
      const r = await window.rp.build.import(w, payload())
      if (!r.ok) return toast(`${label[w]}: ${r.error}`)
      ok.push(label[w].toLowerCase())
    }
    toast(t('Импортировано в клиент: {list}', { list: ok.join(', ') }), 'info')
  }

  return (
    <div className="page champ-page">
      <div className="ch-hero">
        <Splash src={champSplash(champ)} position="center 18%" />
        <div className="ch-hero-shade" />
        <motion.div className="ch-hero-body" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }} key={champ}>
          <div className="ch-id">
            <Champ name={champ} size={84} radius={20} />
            <div>
              <div className="ch-name-row">
                <h1>{name}</h1>
                {tier && <TierBadge tier={tier.tier} size={34} />}
              </div>
              <div className="ch-sub">
                {shownRole ? `${ROLE_LABEL[shownRole]} · ` : ''}Master+ {fromChampSelect && <span className="cs-tag">{t('из выбора чемпионов')}</span>}
              </div>
            </div>
          </div>
          <div className="ch-tools">
            <ChampPicker value={champ} onPick={setChamp} />
            {!demo && ready && <PatchSelect status={status} value={patch} onChange={setPatch} />}
            <CollectorPill status={status} demo={demo} />
          </div>
        </motion.div>
        {ready && d && (
          <motion.div className="ch-hero-foot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
            <RoleTabs id="champ" value={shownRole ?? ''} onChange={setRole} counts={d.roleGames} all={false} />
            {a && (
              <div className="ch-stats">
                <Stat label={t('Винрейт')} value={pct(a.w / a.g, 2)} tone={a.w / a.g >= 0.52 ? 'good' : a.w / a.g < 0.48 ? 'bad' : ''} />
                <Stat label={t('Пикрейт')} value={pct(a.g / d.matches)} />
                <Stat label={t('Банрейт')} value={pct(d.bans / d.matches)} />
                <Stat label={t('Игр')} value={a.g.toLocaleString(locale)} sub={tier ? t('#{rank} в роли', { rank: tier.rank }) : undefined} />
              </div>
            )}
            <div className="ch-import">
              <motion.button className="btn primary" whileTap={{ scale: 0.96 }} onClick={() => doImport(['runes', 'items', 'spells'])} disabled={!a}>
                <Icon name="download" size={16} /> {t('Всё в клиент')}
              </motion.button>
              <button className="btn" onClick={() => doImport(['runes'])} disabled={!a}>
                {t('Руны')}
              </button>
              <button className="btn" onClick={() => doImport(['items'])} disabled={!a}>
                {t('Предметы')}
              </button>
              <button className="btn" onClick={() => doImport(['spells'])} disabled={!a}>
                {t('Заклинания')}
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {!ready ? (
        <StatsGate status={status} onDemo={() => setDemo(true)} onSettings={onSettings} />
      ) : !d ? (
        <div className="ch-grid">
          <Skeleton h={420} r={16} />
          <Skeleton h={420} r={16} />
        </div>
      ) : !a ? (
        <div className="card gate">
          <h2>{t('Пока мало игр на {name}', { name })}</h2>
          <p className="muted">{t('Сборщик ещё не встретил этого чемпиона в выбранных патчах. Загляните позже или выберите «Все патчи».')}</p>
        </div>
      ) : (
        <motion.div className="ch-grid" variants={stagger} initial="hidden" animate="show" key={champ + shownRole + patch}>
          <div className="ch-col">
            <Card hover={false} className="runes-card">
              <CardHead title={t('Руны')} right={pick.runes && <WrLine g={a.runes[pick.runes][0]} w={a.runes[pick.runes][1]} total={a.g} />} />
              {pick.runes && gd ? <RuneTree page={parsePage(pick.runes)} gd={gd} /> : <Skeleton h={300} />}
              <div className="alt-list">
                {top(a.runes, 4).map(([k, [g, w]]) => {
                  const p = parsePage(k)
                  return (
                    <button key={k} className={`alt ${k === pick.runes ? 'on' : ''}`} onClick={() => setSel((s) => ({ ...s, runes: k }))}>
                      <RuneImg id={p.perks[0]} gd={gd} size={30} />
                      <RuneImg id={p.subStyleId} gd={gd} size={20} />
                      <span className="alt-name">{gd?.runes[p.perks[0]]?.name ?? p.perks[0]}</span>
                      <WrLine g={g} w={w} total={a.g} small />
                    </button>
                  )
                })}
              </div>
            </Card>

            <Card hover={false}>
              <CardHead title={t('Порядок навыков')} />
              <SkillOrder a={a} />
            </Card>
          </div>

          <div className="ch-col">
            <div className="ch-pair">
              <Card hover={false}>
                <CardHead title={t('Заклинания')} />
                <div className="opt-list">
                  {top(a.spells, 3).map(([k, [g, w]]) => (
                    <Opt key={k} on={k === pick.spells} onClick={() => setSel((s) => ({ ...s, spells: k }))} right={<WrLine g={g} w={w} total={a.g} small />}>
                      {ids(k).map((id) => (
                        <SpellImg key={id} id={id} gd={gd} />
                      ))}
                    </Opt>
                  ))}
                </div>
              </Card>
              <Card hover={false}>
                <CardHead title={t('Стартовые предметы')} />
                <div className="opt-list">
                  {top(a.start, 3).map(([k, [g, w]]) => (
                    <Opt key={k} on={k === pick.start} onClick={() => setSel((s) => ({ ...s, start: k }))} right={<WrLine g={g} w={w} total={a.g} small />}>
                      {ids(k).map((id, i) => (
                        <ItemTip key={i} id={id} gd={gd} />
                      ))}
                    </Opt>
                  ))}
                </div>
              </Card>
            </div>

            <Card hover={false}>
              <CardHead title={t('Основная сборка')} right={<span className="muted small">{t('первые три легендарных предмета')}</span>} />
              <div className="opt-list">
                {top(a.core, 5).map(([k, [g, w]]) => (
                  <Opt key={k} on={k === pick.core} onClick={() => setSel((s) => ({ ...s, core: k }))} right={<WrLine g={g} w={w} total={a.g} small />}>
                    {ids(k).map((id, i) => (
                      <span key={i} className="core-step">
                        {i > 0 && <Icon name="right" size={14} />}
                        <ItemTip id={id} gd={gd} size={38} />
                      </span>
                    ))}
                  </Opt>
                ))}
              </div>
            </Card>

            <div className="ch-pair">
              <Card hover={false}>
                <CardHead title={t('Ботинки')} />
                <div className="opt-list">
                  {top(a.boots, 3).map(([k, [g, w]]) => (
                    <Opt key={k} on={k === pick.boots} onClick={() => setSel((s) => ({ ...s, boots: k }))} right={<WrLine g={g} w={w} total={a.g} small />}>
                      <ItemTip id={Number(k)} gd={gd} />
                      <span className="opt-name">{gd?.items[Number(k)]?.name}</span>
                    </Opt>
                  ))}
                </div>
              </Card>
              <Card hover={false}>
                <CardHead title={t('Поздняя игра')} right={<span className="muted small">{t('4–6 предмет')}</span>} />
                <div className="late-grid">
                  {late.map(([id, [g, w]]) => (
                    <div key={id} className="late-item">
                      <ItemTip id={id} gd={gd} size={40} />
                      <b className={wrOf([g, w]) >= 0.52 ? 'good' : wrOf([g, w]) < 0.48 ? 'bad' : ''}>{pct(wrOf([g, w]))}</b>
                      <em>{g.toLocaleString(locale)}</em>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <Card hover={false}>
              <CardHead
                title={t('Матчапы')}
                right={
                  <button className="link-btn" onClick={() => onMatchups(champ, shownRole ?? '')}>
                    {t('Все матчапы')} <Icon name="right" size={14} />
                  </button>
                }
              />
              <MatchupColumns a={a} />
            </Card>
          </div>
        </motion.div>
      )}
    </div>
  )
}

function CardHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="card-head">
      <h3 className="card-title">{title}</h3>
      {right}
    </div>
  )
}

function Opt({ on, onClick, children, right }: { on: boolean; onClick: () => void; children: ReactNode; right: ReactNode }) {
  return (
    <button className={`opt ${on ? 'on' : ''}`} onClick={onClick}>
      {on && <motion.span className="opt-glow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />}
      <span className="opt-body">{children}</span>
      {right}
    </button>
  )
}

export function ItemTip({ id, gd, size = 32 }: { id: number; gd: GameData | null; size?: number }) {
  const it = gd?.items[id]
  return (
    <span className="tip-wrap" data-tip={it ? `${it.name} · ${t('{n} з.', { n: it.gold })}` : String(id)}>
      <Item id={id} size={size} />
    </span>
  )
}

export function SpellImg({ id, gd, size = 30 }: { id: number; gd: GameData | null; size?: number }) {
  const sp = gd?.spells[id]
  return <Img src={spellIcon(sp?.id ?? SPELL_FALLBACK[id] ?? 'SummonerFlash', gd?.version ?? '')} alt={sp?.name ?? String(id)} size={size} radius={7} />
}

function RuneImg({ id, gd, size = 28, dim }: { id: number; gd: GameData | null; size?: number; dim?: boolean }) {
  const r = gd?.runes[id]
  return (
    <span className={`rune ${dim ? 'dim' : ''}`} data-tip={r ? `${r.name}${r.desc ? ' — ' + r.desc : ''}` : undefined}>
      <Img src={r ? runeIcon(r.icon) : ''} alt={r?.name ?? String(id)} size={size} radius={size} />
    </span>
  )
}

/** Both rune trees with every option shown and the chosen ones lit, plus the stat shards. */
export function RuneTree({ page, gd }: { page: RunePage; gd: GameData }) {
  const primary = gd.trees.find((t) => t.id === page.primaryStyleId)
  const secondary = gd.trees.find((t) => t.id === page.subStyleId)
  const chosen = new Set(page.perks.slice(0, 6))
  if (!primary || !secondary) return <p className="muted">{t('Руны загружаются…')}</p>
  return (
    <div className="rune-tree">
      <div className="rune-col">
        <div className="rune-tree-head">
          <Img src={runeIcon(primary.icon)} alt={primary.name} size={26} radius={26} />
          <b>{primary.name}</b>
        </div>
        {primary.slots.map((slot, i) => (
          <motion.div key={i} className={`rune-row ${i === 0 ? 'keystones' : ''}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.06 }}>
            {slot.map((r) => (
              <RuneImg key={r.id} id={r.id} gd={gd} size={i === 0 ? 46 : 32} dim={!chosen.has(r.id)} />
            ))}
          </motion.div>
        ))}
      </div>
      <div className="rune-col">
        <div className="rune-tree-head">
          <Img src={runeIcon(secondary.icon)} alt={secondary.name} size={26} radius={26} />
          <b>{secondary.name}</b>
        </div>
        {secondary.slots.slice(1).map((slot, i) => (
          <motion.div key={i} className="rune-row" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.06 }}>
            {slot.map((r) => (
              <RuneImg key={r.id} id={r.id} gd={gd} size={30} dim={!chosen.has(r.id)} />
            ))}
          </motion.div>
        ))}
        <div className="shards">
          {SHARDS.map((row, i) => (
            <div key={i} className="rune-row">
              {row.map((s) => (
                <span key={s.id + '-' + i} className={`shard ${page.perks[6 + i] === s.id ? '' : 'dim'}`} data-tip={s.name}>
                  <Img src={shardIcon(s.icon)} alt={s.name} size={22} radius={22} />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function SkillOrder({ a }: { a: Pick<Agg, 'g' | 'skills'> }) {
  const seqs = top(a.skills, 3)
  const [i, setI] = useState(0)
  const cur = seqs[i] ?? seqs[0]
  if (!cur) return <p className="muted">{t('Нет данных о прокачке.')}</p>
  const seq = cur[0]
  return (
    <div className="skills">
      <div className="max-orders">
        {seqs.map(([s, [g, w]], idx) => (
          <button key={s} className={`max-order ${idx === i ? 'on' : ''}`} onClick={() => setI(idx)}>
            {maxOrder(s).map((k, j) => (
              <span key={k} className="max-step">
                {j > 0 && <Icon name="right" size={12} />}
                <i className={`sk sk-${k}`}>{k}</i>
              </span>
            ))}
            <WrLine g={g} w={w} total={a.g} small />
          </button>
        ))}
      </div>
      <div className="skill-grid">
        {(['Q', 'W', 'E', 'R'] as const).map((k) => (
          <div key={k} className="skill-line">
            <i className={`sk sk-${k}`}>{k}</i>
            {Array.from({ length: 15 }, (_, lvl) => (
              <AnimatePresence key={lvl} mode="popLayout">
                {seq[lvl] === k ? (
                  <motion.span key={seq + lvl} className={`lvl on sk-${k}`} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring, delay: lvl * 0.02 }}>
                    {lvl + 1}
                  </motion.span>
                ) : (
                  <span className="lvl" />
                )}
              </AnimatePresence>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function MatchupColumns({ a, onPick }: { a: Agg; onPick?: (c: string) => void }) {
  const min = Math.max(5, a.g * 0.01)
  const list = top(a.vs, 99, min).map(([c, [g, w]]) => ({ c, g, wr: w / g }))
  const hard = [...list].sort((x, y) => x.wr - y.wr).slice(0, 6)
  const easy = [...list].sort((x, y) => y.wr - x.wr).slice(0, 6)
  const col = (title: string, rows: typeof list, tone: string) => (
    <div className="mu-col">
      <div className={`mu-title ${tone}`}>{title}</div>
      {rows.map((r, i) => (
        <motion.button key={r.c} className="mu-row" onClick={() => onPick?.(r.c)} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
          <Champ name={r.c} size={30} radius={8} />
          <span className="mu-name">{champName(r.c)}</span>
          <b className={r.wr >= 0.5 ? 'good' : 'bad'}>{pct(r.wr)}</b>
          <em>{r.g}</em>
        </motion.button>
      ))}
      {!rows.length && <p className="muted small">{t('Мало игр')}</p>}
    </div>
  )
  return (
    <div className="mu-cols">
      {col(t('Сложные'), hard, 'bad')}
      {col(t('Лёгкие'), easy, 'good')}
    </div>
  )
}
