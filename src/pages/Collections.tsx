import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { PlayerData } from '../types'
import { TIERS, loadCollection, type CollectionData, type SkinItem, type Tier, type WardItem } from '../api/collection'
import { Counter, Icon, Img, Segmented, Skeleton, ease } from '../components/ui'

type Tab = 'skins' | 'wards' | 'champs'
type Own = 'all' | 'owned' | 'missing'
type Group = 'year' | 'champ' | 'tier' | 'set' | 'none'
type Sort = 'acquired' | 'name' | 'price' | 'tier'
type Size = 'auto' | 's' | 'm' | 'l'

const DD = 'https://ddragon.leagueoflegends.com/cdn/img/champion'
const tierOf = (t: Tier) => TIERS.find((x) => x.id === t) ?? TIERS[0]
const tierRank = (t: Tier) => TIERS.findIndex((x) => x.id === t)
const rp = (n: number) => n.toLocaleString('ru')

function Gem({ tier, size = 14 }: { tier: Tier; size?: number }) {
  const c = tierOf(tier).color
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d="M8 1l6 7-6 7-6-7z" fill={c} />
      <path d="M8 1l6 7H2z" fill="#fff" opacity="0.28" />
    </svg>
  )
}

/** Loading-screen art from Data Dragon, falling back to CommunityDragon. */
function SkinArt({ s }: { s: SkinItem }) {
  const [src, setSrc] = useState(`${DD}/loading/${s.champ}_${s.num}.jpg`)
  const [ok, setOk] = useState(false)
  return (
    <>
      <img
        src={src}
        alt={s.name}
        loading="lazy"
        draggable={false}
        className={ok ? 'on' : ''}
        onLoad={() => setOk(true)}
        onError={() => s.loadScreen && src !== s.loadScreen && setSrc(s.loadScreen)}
      />
      {!ok && <span className="skin-ph">{s.champName.slice(0, 2)}</span>}
    </>
  )
}

function Check({ on, onChange, children, count }: { on: boolean; onChange: () => void; children: ReactNode; count?: string }) {
  return (
    <button className={`fcheck ${on ? 'on' : ''}`} onClick={onChange}>
      <i>{on && <Icon name="check" size={12} />}</i>
      <span>{children}</span>
      {count && <em>{count}</em>}
    </button>
  )
}

export function Collections({ data, connected }: { data: PlayerData; connected: boolean }) {
  const [col, setCol] = useState<CollectionData | null>(null)
  const [tab, setTab] = useState<Tab>('skins')
  // filters
  const [q, setQ] = useState('')
  const [own, setOwn] = useState<Own>('owned')
  const [champ, setChamp] = useState('')
  const [set, setSet] = useState(0)
  const [tiers, setTiers] = useState<Tier[]>([])
  const [avail, setAvail] = useState<('available' | 'legacy')[]>([])
  // view
  const [group, setGroup] = useState<Group>('year')
  const [sort, setSort] = useState<Sort>('acquired')
  const [desc, setDesc] = useState(true)
  const [size, setSize] = useState<Size>('auto')

  useEffect(() => {
    let off = false
    setCol(null)
    loadCollection(Boolean(window.rp && connected))
      .then((c) => !off && setCol(c))
      .catch(() => !off && setCol({ skins: [], wards: [], sets: {}, champions: [], source: 'demo' }))
    return () => {
      off = true
    }
  }, [connected])

  const filters = (q ? 1 : 0) + (own !== 'all' ? 1 : 0) + (champ ? 1 : 0) + (set ? 1 : 0) + tiers.length + avail.length
  const reset = () => {
    setQ('')
    setOwn('all')
    setChamp('')
    setSet(0)
    setTiers([])
    setAvail([])
  }
  const toggle = <T,>(list: T[], v: T, fn: (l: T[]) => void) => fn(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const skins = col?.skins ?? []
  // everything except the filter being counted, so counts stay meaningful
  const base = useMemo(() => {
    const s = q.trim().toLowerCase()
    return skins.filter(
      (k) =>
        (!s || k.name.toLowerCase().includes(s) || k.champName.toLowerCase().includes(s)) &&
        (!champ || k.champ === champ) &&
        (!set || k.sets.includes(set)) &&
        (!avail.length || avail.includes(k.legacy ? 'legacy' : 'available')),
    )
  }, [skins, q, champ, set, avail])
  const shown = useMemo(() => {
    const list = base.filter((k) => (own === 'all' || (own === 'owned' ? k.owned : !k.owned)) && (!tiers.length || tiers.includes(k.tier)))
    const dir = desc ? -1 : 1
    const by: Record<Sort, (a: SkinItem, b: SkinItem) => number> = {
      acquired: (a, b) => (a.acquired - b.acquired) * dir || a.name.localeCompare(b.name, 'ru'),
      name: (a, b) => a.name.localeCompare(b.name, 'ru') * -dir,
      price: (a, b) => (a.price - b.price) * dir,
      tier: (a, b) => (tierRank(a.tier) - tierRank(b.tier)) * dir || a.name.localeCompare(b.name, 'ru'),
    }
    return list.sort(by[sort])
  }, [base, own, tiers, sort, desc])

  const groups = useMemo(() => {
    if (group === 'none') return [{ key: 'all', title: 'Все образы', items: shown, total: shown.length }]
    const key = (k: SkinItem): [string, string] => {
      if (group === 'year') return k.owned && k.acquired ? [String(new Date(k.acquired).getFullYear()), `Получены в ${new Date(k.acquired).getFullYear()}`] : k.owned ? ['0', 'Дата неизвестна'] : ['-', 'Нет в коллекции']
      if (group === 'champ') return [k.champName, k.champName]
      if (group === 'tier') return [String(9 - tierRank(k.tier)), tierOf(k.tier).label]
      const sid = k.sets[0]
      return [col?.sets[sid] ?? 'Без сета', col?.sets[sid] ?? 'Без сета']
    }
    const map = new Map<string, { key: string; title: string; items: SkinItem[] }>()
    for (const k of shown) {
      const [id, title] = key(k)
      if (!map.has(id)) map.set(id, { key: id, title, items: [] })
      map.get(id)!.items.push(k)
    }
    const all = [...map.values()]
    all.sort((a, b) => (group === 'year' || group === 'tier' ? b.key.localeCompare(a.key) : a.title.localeCompare(b.title, 'ru')))
    return all.map((g) => ({ ...g, total: g.items.length }))
  }, [shown, group, col])

  const owned = skins.filter((k) => k.owned)
  const spent = owned.reduce((n, k) => n + k.price, 0)
  const champOptions = useMemo(() => [...new Map(skins.map((k) => [k.champ, k.champName])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'ru')), [skins])
  const setOptions = useMemo(() => {
    const count: Record<number, [number, number]> = {}
    for (const k of skins)
      for (const s of k.sets) {
        const c = (count[s] ||= [0, 0])
        c[1]++
        if (k.owned) c[0]++
      }
    return Object.entries(count)
      .map(([id, c]) => ({ id: Number(id), name: col?.sets[Number(id)] ?? `#${id}`, c }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [skins, col])

  return (
    <div className="page coll-page">
      <motion.div className="page-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <h1>
          <Icon name="box" size={28} /> Коллекция
        </h1>
        <span className="coll-sub muted small">Все ваши образы, тотемы и чемпионы в одном месте</span>
        {col?.source === 'demo' && <span className="collector-pill demo">Пример: запустите клиент LoL</span>}
        <div className="coll-tabs">
          <Segmented
            id="coll-tab"
            value={tab}
            onChange={setTab}
            options={[
              { id: 'skins', label: 'Образы' },
              { id: 'wards', label: 'Тотемы' },
              { id: 'champs', label: 'Чемпионы' },
            ]}
          />
        </div>
      </motion.div>

      {!col ? (
        <div className="coll-layout">
          <Skeleton h={600} r={14} />
          <div className="skin-wall">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} h={220} r={10} />
            ))}
          </div>
        </div>
      ) : tab === 'skins' ? (
        <div className="coll-layout">
          <motion.aside className="filters" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, ease }}>
            <div className="filters-head">
              <b>
                <Icon name="list" size={16} /> Фильтры {filters > 0 && <em>{filters}</em>}
              </b>
              <button className="link-btn" onClick={reset}>
                Сбросить
              </button>
            </div>
            <div className="search-mini wide">
              <Icon name="search" size={15} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти образ" />
            </div>
            <div className="own-pick">
              {(
                [
                  ['all', 'Все'],
                  ['owned', 'Есть'],
                  ['missing', 'Нет'],
                ] as const
              ).map(([id, l]) => (
                <button key={id} className={own === id ? 'on' : ''} onClick={() => setOwn(id)}>
                  {own === id && <motion.span layoutId="own-pick" className="own-bg" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                  <span>{l}</span>
                </button>
              ))}
            </div>
            <div className="f-title">Чемпион</div>
            <select value={champ} onChange={(e) => setChamp(e.target.value)}>
              <option value="">Все чемпионы</option>
              {champOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <div className="f-title">Сет</div>
            <select value={set} onChange={(e) => setSet(Number(e.target.value))}>
              <option value={0}>Все сеты</option>
              {setOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.c[0]}/{s.c[1]}
                </option>
              ))}
            </select>
            <div className="f-title">Тир</div>
            {TIERS.map((t) => {
              const all = base.filter((k) => k.tier === t.id)
              if (!all.length) return null
              return (
                <Check key={t.id} on={tiers.includes(t.id)} onChange={() => toggle(tiers, t.id, setTiers)} count={`${all.filter((k) => k.owned).length}/${all.length}`}>
                  <Gem tier={t.id} /> {t.label}
                </Check>
              )
            })}
            <div className="f-title">Доступность</div>
            {(
              [
                ['available', 'В продаже', false],
                ['legacy', 'Легаси', true],
              ] as const
            ).map(([id, label, legacy]) => {
              const all = skins.filter((k) => k.legacy === legacy)
              return (
                <Check key={id} on={avail.includes(id)} onChange={() => toggle(avail, id, setAvail)} count={`${all.filter((k) => k.owned).length}/${all.length}`}>
                  {label}
                </Check>
              )
            })}
          </motion.aside>

          <div className="coll-main">
            <motion.div className="card coll-summary" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
              <div className="coll-summary-left">
                <b className="coll-big">
                  <Counter value={owned.length} format={(v) => Math.round(v).toLocaleString('ru')} />
                  <em> / {skins.length.toLocaleString('ru')}</em>
                </b>
                <i className="coll-bar">
                  <motion.i initial={{ width: 0 }} animate={{ width: `${skins.length ? (owned.length / skins.length) * 100 : 0}%` }} transition={{ duration: 1.1, ease, delay: 0.2 }} />
                </i>
                <span className="muted small">
                  Образов в коллекции · собрано {skins.length ? Math.round((owned.length / skins.length) * 100) : 0}%
                </span>
              </div>
              <div className="coll-summary-right">
                <b className="coll-big">
                  <Counter value={spent} format={(v) => rp(Math.round(v))} />
                  <em> RP</em>
                </b>
                <span className="muted small">стоят ваши образы</span>
              </div>
            </motion.div>

            <div className="coll-toolbar">
              <span className="muted">{shown.length.toLocaleString('ru')} образов</span>
              <span className="grow" />
              <label className="select-pill">
                <span>Группа</span>
                <select value={group} onChange={(e) => setGroup(e.target.value as Group)}>
                  <option value="year">Год получения</option>
                  <option value="champ">Чемпион</option>
                  <option value="tier">Тир</option>
                  <option value="set">Сет</option>
                  <option value="none">Без групп</option>
                </select>
              </label>
              <label className="select-pill">
                <span>Сортировка</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="acquired">Дата получения</option>
                  <option value="name">Название</option>
                  <option value="price">Цена</option>
                  <option value="tier">Тир</option>
                </select>
              </label>
              <label className="select-pill">
                <span>Размер</span>
                <select value={size} onChange={(e) => setSize(e.target.value as Size)}>
                  <option value="auto">Авто</option>
                  <option value="s">Маленький</option>
                  <option value="m">Средний</option>
                  <option value="l">Большой</option>
                </select>
              </label>
              <button className={`icon-btn bordered ${desc ? '' : 'flip'}`} title={desc ? 'По убыванию' : 'По возрастанию'} onClick={() => setDesc((d) => !d)}>
                <Icon name="chevron" size={16} />
              </button>
            </div>

            {groups.map((g) => (
              <section key={g.key + group} className="skin-group">
                <h2>
                  {g.title} <em>{g.items.filter((k) => k.owned).length} / {g.total}</em>
                </h2>
                <div className={`skin-wall size-${size}`}>
                  {g.items.map((k, i) => (
                    <motion.div
                      key={k.id}
                      className={`skin-card ${k.owned ? '' : 'missing'}`}
                      initial={i < 30 ? { opacity: 0, y: 12 } : false}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease, delay: Math.min(i, 30) * 0.02 }}
                      whileHover={{ y: -4 }}
                    >
                      <SkinArt s={k} />
                      <span className="skin-gem" title={tierOf(k.tier).label}>
                        <Gem tier={k.tier} size={13} />
                      </span>
                      <span className="skin-info">
                        <b>{k.name}</b>
                        <em>{k.price ? `${rp(k.price)} RP` : k.owned ? 'Получен' : k.legacy ? 'Легаси' : 'Особый'}</em>
                      </span>
                    </motion.div>
                  ))}
                </div>
              </section>
            ))}
            {!shown.length && <p className="muted pad">Ничего не найдено. Попробуйте сбросить фильтры.</p>}
          </div>
        </div>
      ) : tab === 'wards' ? (
        <Wards wards={col.wards} />
      ) : (
        <Champions col={col} data={data} />
      )}
    </div>
  )
}

function Wards({ wards }: { wards: WardItem[] }) {
  const [q, setQ] = useState('')
  const [own, setOwn] = useState<Own>('all')
  const s = q.trim().toLowerCase()
  const list = wards
    .filter((w) => (!s || w.name.toLowerCase().includes(s)) && (own === 'all' || (own === 'owned' ? w.owned : !w.owned)))
    .sort((a, b) => b.acquired - a.acquired || a.name.localeCompare(b.name, 'ru'))
  const owned = wards.filter((w) => w.owned).length
  return (
    <>
      <div className="coll-toolbar">
        <span className="muted">
          {owned} из {wards.length} тотемов
        </span>
        <span className="grow" />
        <div className="search-mini">
          <Icon name="search" size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти тотем" />
        </div>
        <Segmented
          id="ward-own"
          value={own}
          onChange={setOwn}
          options={[
            { id: 'all', label: 'Все' },
            { id: 'owned', label: 'Есть' },
            { id: 'missing', label: 'Нет' },
          ]}
        />
      </div>
      <div className="ward-wall">
        {list.slice(0, 400).map((w, i) => (
          <motion.div key={w.id} className={`ward-card ${w.owned ? '' : 'missing'}`} initial={i < 40 ? { opacity: 0, scale: 0.94 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(i, 40) * 0.012 }}>
            <Img src={w.image} alt={w.name} size={96} radius={12} />
            <span>{w.name}</span>
            {w.legacy && <em>Легаси</em>}
          </motion.div>
        ))}
        {!list.length && <p className="muted">Тотемы не найдены.</p>}
      </div>
    </>
  )
}

function Champions({ col, data }: { col: CollectionData; data: PlayerData }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const mastery = Object.fromEntries((data.mastery ?? []).map((m) => [m.champion, m]))
  const s = q.trim().toLowerCase()
  const list = col.champions.filter((c) => !s || c.name.toLowerCase().includes(s)).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const skinsOf = (id: string) => col.skins.filter((k) => k.champ === id)
  const openChamp = col.champions.find((c) => c.id === open)
  return (
    <>
      <div className="coll-toolbar">
        <span className="muted">
          {col.champions.filter((c) => c.owned).length} из {col.champions.length} чемпионов
        </span>
        <span className="grow" />
        <div className="search-mini">
          <Icon name="search" size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти чемпиона" />
        </div>
      </div>
      <div className="coll-grid">
        {list.map((c, i) => {
          const sk = skinsOf(c.id)
          return (
            <motion.button
              key={c.id}
              className={`coll-champ ${c.owned ? '' : 'missing'}`}
              onClick={() => setOpen(c.id)}
              initial={i < 40 ? { opacity: 0, scale: 0.94 } : false}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(i, 40) * 0.012, duration: 0.3 }}
              whileHover={{ y: -3 }}
            >
              <Img src={`${DD}/tiles/${c.id}_0.jpg`} alt={c.name} size={120} radius={10} className="coll-tile" />
              <span className="coll-name">{c.name}</span>
              {mastery[c.id] && <span className="coll-mastery">М{mastery[c.id].level}</span>}
              {c.free && <span className="coll-free">Бесплатно</span>}
              <span className="coll-skins">
                {sk.filter((k) => k.owned).length}/{sk.length}
              </span>
            </motion.button>
          )
        })}
      </div>
      <AnimatePresence>
        {openChamp && (
          <motion.div className="modal-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)}>
            <motion.div className="modal card" initial={{ y: 30, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h2>{openChamp.name}</h2>
                <button className="icon-btn" onClick={() => setOpen(null)}>
                  <Icon name="close" />
                </button>
              </div>
              <div className="skin-wall size-m">
                {skinsOf(openChamp.id).map((k) => (
                  <div key={k.id} className={`skin-card ${k.owned ? '' : 'missing'}`}>
                    <SkinArt s={k} />
                    <span className="skin-gem">
                      <Gem tier={k.tier} size={13} />
                    </span>
                    <span className="skin-info">
                      <b>{k.name}</b>
                      <em>{k.owned ? 'Есть' : k.price ? `${rp(k.price)} RP` : ''}</em>
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
