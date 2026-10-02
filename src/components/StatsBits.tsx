import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { StatsStatus } from '../lib/statsTypes'
import { PLATFORMS } from '../api/riot'
import { championList, type ChampionInfo } from '../lib/ddragon'
import { ROLE_LABEL, TIER_COLOR } from '../lib/statsApi'
import { Champ, Icon, ease, spring } from './ui'
import { RoleIcon } from './RoleIcon'

export function TierBadge({ tier, size = 30 }: { tier: string; size?: number }) {
  return (
    <span className="tier-badge" style={{ width: size, height: size, fontSize: size * 0.42, color: TIER_COLOR[tier], borderColor: TIER_COLOR[tier] + '66', background: TIER_COLOR[tier] + '1a' }}>
      {tier}
    </span>
  )
}

export const ROLE_TABS = ['', 'TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const

export function RoleTabs({ value, onChange, id, counts, all = true }: { value: string; onChange: (r: string) => void; id: string; counts?: Record<string, number>; all?: boolean }) {
  const tabs = ROLE_TABS.filter((r) => (all || r) && (!counts || !r || counts[r]))
  return (
    <div className="role-tabs">
      {tabs.map((r) => (
        <button key={r || 'all'} className={value === r ? 'on' : ''} onClick={() => onChange(r)} title={r ? ROLE_LABEL[r] : 'Все роли'}>
          {value === r && <motion.span layoutId={`roles-${id}`} className="seg-bg" transition={spring} />}
          <span className="seg-label">
            <RoleIcon role={r || 'ALL'} size={16} />
            <span>{r ? ROLE_LABEL[r] : 'Все'}</span>
            {counts && r && <em>{counts[r]}</em>}
          </span>
        </button>
      ))}
    </div>
  )
}

/** Patch filter: the automatic choice (newest patches with enough games) or a single patch. */
export function PatchSelect({ status, value, onChange }: { status: StatsStatus | null; value: string; onChange: (v: string) => void }) {
  return (
    <label className="select-pill">
      <span>Патч</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Актуальный</option>
        {status?.patches.map((p) => (
          <option key={p.patch} value={p.patch}>
            {p.patch} · {p.matches.toLocaleString('ru')} игр
          </option>
        ))}
        {(status?.patches.length ?? 0) > 1 && <option value="*">Все патчи</option>}
      </select>
    </label>
  )
}
export const patchList = (status: StatsStatus | null, v: string) => (v === '*' ? status?.patches.map((p) => p.patch) ?? [] : v ? [v] : [])

/** Search-as-you-type champion picker with icons. */
export function ChampPicker({ value, onPick, placeholder = 'Найти чемпиона…', only }: { value?: string; onPick: (id: string) => void; placeholder?: string; only?: string[] }) {
  const [list, setList] = useState<ChampionInfo[]>([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    championList().then(setList)
  }, [])
  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])
  const source = useMemo(() => {
    const all = list.length ? list : (only ?? []).map((id) => ({ id, key: 0, name: id }))
    return only && list.length ? all.filter((c) => only.includes(c.id)) : all
  }, [list, only])
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (s ? source.filter((c) => c.name.toLowerCase().includes(s) || c.id.toLowerCase().includes(s)) : source).slice(0, 40)
  }, [q, source])
  const current = list.find((c) => c.id === value)
  return (
    <div className="champ-picker" ref={box}>
      <div className="champ-picker-input" onClick={() => setOpen(true)}>
        {value ? <Champ name={value} size={22} radius={6} /> : <Icon name="search" size={16} />}
        <input
          value={open ? q : current?.name ?? value ?? ''}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true)
            setQ('')
          }}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits[0]) {
              onPick(hits[0].id)
              setOpen(false)
              ;(e.target as HTMLInputElement).blur()
            }
            if (e.key === 'Escape') setOpen(false)
          }}
        />
      </div>
      <AnimatePresence>
        {open && hits.length > 0 && (
          <motion.div className="champ-picker-menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease }}>
            {hits.map((c) => (
              <button
                key={c.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(c.id)
                  setOpen(false)
                }}
              >
                <Champ name={c.id} size={26} radius={6} />
                <span>{c.name}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Shown instead of statistics until the collector has data; explains what to do. */
export function StatsGate({ status, onDemo, onSettings }: { status: StatsStatus | null; onDemo: () => void; onSettings: () => void }) {
  if (!status) return <div className="card gate">Загрузка…</div>
  const total = status.patches.reduce((s, p) => s + p.matches, 0)
  return (
    <motion.div className="card gate" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
      <div className="gate-icon">
        <Icon name="pie" size={28} />
      </div>
      {!status.hasKey ? (
        <>
          <h2>Нужен ключ Riot API</h2>
          <p className="muted">
            Тир-лист, билды, руны и матчапы считаются из реальных ранговых игр Master+ вашего региона. Программа сама скачивает их через официальный Riot API в
            фоне, для этого нужен ключ (бесплатно, developer.riotgames.com).
          </p>
          <div className="gate-actions">
            <button className="btn primary" onClick={onSettings}>
              <Icon name="key" size={16} /> Добавить ключ
            </button>
            <button className="btn" onClick={onDemo}>
              Показать пример
            </button>
          </div>
        </>
      ) : !status.enabled ? (
        <>
          <h2>Сбор статистики выключен</h2>
          <p className="muted">Включите его в настройках, и программа начнёт собирать игры Master+ региона {PLATFORMS[status.platform] ?? status.platform}.</p>
          <div className="gate-actions">
            <button className="btn primary" onClick={onSettings}>
              Открыть настройки
            </button>
            <button className="btn" onClick={onDemo}>
              Показать пример
            </button>
          </div>
        </>
      ) : (
        <>
          <h2>Собираю статистику…</h2>
          <p className="muted">
            Скачиваю ранговые игры лучших игроков {PLATFORMS[status.platform] ?? status.platform}. Тир-лист появится после первых {MIN_MATCHES} игр, точность растёт
            с каждым часом работы программы.
          </p>
          <div className="gate-progress">
            <motion.span animate={{ width: `${Math.min(100, (total / MIN_MATCHES) * 100)}%` }} transition={{ duration: 0.6, ease }} />
          </div>
          <p className="small muted">
            {total} из {MIN_MATCHES} игр{status.perHour ? ` · ${status.perHour} игр/час` : ''}
            {status.error ? ` · ${status.error}` : ''}
          </p>
          <div className="gate-actions">
            <button className="btn" onClick={onDemo}>
              Показать пример
            </button>
          </div>
        </>
      )}
    </motion.div>
  )
}
export const MIN_MATCHES = 150
export const hasData = (s: StatsStatus | null) => Boolean(s && s.patches.reduce((n, p) => n + p.matches, 0) >= MIN_MATCHES)

/** Small status line about the collector shown in page headers. */
export function CollectorPill({ status, demo }: { status: StatsStatus | null; demo: boolean }) {
  if (!status) return null
  if (demo) return <span className="collector-pill demo">Пример данных</span>
  const total = status.patches.reduce((s, p) => s + p.matches, 0)
  return (
    <span className={`collector-pill ${status.enabled && status.hasKey && !status.error ? 'on' : ''}`} title={status.error || undefined}>
      <i />
      {(PLATFORMS[status.platform] ?? status.platform).toString()} · Master+ · {total.toLocaleString('ru')} игр
      {status.perHour ? ` · +${status.perHour}/ч` : ''}
    </span>
  )
}
