import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { PLATFORMS } from '../api/riot'
import { getBoards, isWebhook, memberKey, postDiscord, rankText, refreshBoard, saveBoards, tableMessage, updateBoard, useBoards, type Row } from '../lib/boards'
import { profileIcon, rankEmblem } from '../lib/ddragon'
import { Icon, Img, Switch, ease, fadeUp, stagger } from '../components/ui'
import { t } from '../lib/i18n'

const EXAMPLE: Row[] = [
  { riotId: 'Faker#KR1', platform: 'kr', tier: 'CHALLENGER', rank: 'I', lp: 1312, wins: 212, losses: 160, v: 4112, iconId: 6 },
  { riotId: 'Друг#RU1', platform: 'ru', tier: 'DIAMOND', rank: 'II', lp: 41, wins: 88, losses: 79, v: 2541, iconId: 588 },
  { riotId: 'Твинк#EUW', platform: 'euw1', tier: 'EMERALD', rank: 'I', lp: 77, wins: 54, losses: 47, v: 2377, iconId: 29 },
  { riotId: 'Саппорт#RU1', platform: 'ru', tier: 'PLATINUM', rank: 'III', lp: 12, wins: 40, losses: 44, v: 1712, iconId: 4 },
]

export function CustomBoards({ defaultPlatform, onOpenPlayer, toast }: { defaultPlatform: string; onOpenPlayer: (riotId: string, platform: string) => void; toast: (msg: string, kind?: 'err' | 'info') => void }) {
  const boards = useBoards()
  const [sel, setSel] = useState<string>(() => getBoards()[0]?.id ?? '')
  const [rows, setRows] = useState<Record<string, Row[]>>({})
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [member, setMember] = useState('')
  const [plat, setPlat] = useState(defaultPlatform)
  const [example, setExample] = useState(false)
  const b = boards.find((x) => x.id === sel)

  const shown: Row[] = example ? EXAMPLE : (b && (rows[b.id] ?? Object.values(b.last ?? {}).sort((x, y) => y.v - x.v))) || []

  const refresh = async (board = b) => {
    if (!board || !board.members.length) return
    setBusy(true)
    try {
      const r = await refreshBoard(board)
      setRows((m) => ({ ...m, [board.id]: r.rows }))
      if (r.rows.every((x) => x.error)) toast(r.rows[0]?.error ?? t('Не удалось загрузить игроков'))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (b && !rows[b.id] && b.members.length && (!b.refreshedAt || Date.now() - b.refreshedAt > 10 * 60_000)) refresh(b)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel])

  const create = () => {
    const name = newName.trim() || t('Мой лидерборд')
    const id = Math.random().toString(36).slice(2, 10)
    saveBoards([...getBoards(), { id, name, members: [], alerts: true }])
    setSel(id)
    setNewName('')
    setExample(false)
  }
  const addMember = () => {
    if (!b || !member.includes('#')) return
    const m = { riotId: member.trim(), platform: plat }
    if (b.members.some((x) => memberKey(x) === memberKey(m))) return
    updateBoard(b.id, (x) => ({ ...x, members: [...x.members, m] }))
    setMember('')
    refresh({ ...b, members: [...b.members, m] })
  }
  const removeMember = (key: string) => {
    if (!b) return
    updateBoard(b.id, (x) => ({ ...x, members: x.members.filter((m) => memberKey(m) !== key) }))
    setRows((r) => ({ ...r, [b.id]: (r[b.id] ?? []).filter((x) => memberKey(x) !== key) }))
  }
  const remove = () => {
    if (!b) return
    saveBoards(getBoards().filter((x) => x.id !== b.id))
    setSel(getBoards()[0]?.id ?? '')
  }
  const send = async () => {
    if (!b?.webhook) return
    try {
      await postDiscord(b.webhook, tableMessage(b, shown))
      toast(t('Таблица отправлена в Discord'), 'info')
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <div className="boards">
      <div className="card boards-side">
        <h3 className="card-title">{t('Ваши лидерборды')}</h3>
        {boards.map((x) => (
          <button key={x.id} className={`board-item ${x.id === sel && !example ? 'on' : ''}`} onClick={() => (setSel(x.id), setExample(false))}>
            <Icon name="trophy" size={15} />
            <span>{x.name}</span>
            <em>{x.members.length}</em>
          </button>
        ))}
        <div className="board-new">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder={t('Название, например «Друзья»')} />
          <button className="btn primary" onClick={create}>
            {t('Создать')}
          </button>
        </div>
        {!boards.length && (
          <button className="btn" onClick={() => setExample(true)}>
            {t('Показать пример')}
          </button>
        )}
      </div>

      {example || b ? (
        <div className="boards-main">
          <div className="card">
            <div className="board-head">
              {example ? <h2>{t('Пример: друзья')}</h2> : <input className="board-title" value={b!.name} onChange={(e) => updateBoard(b!.id, (x) => ({ ...x, name: e.target.value }))} />}
              <div className="grow" />
              {!example && (
                <>
                  <button className="btn" onClick={() => refresh()} disabled={busy || !b!.members.length}>
                    <Icon name="refresh" size={15} /> {busy ? t('Обновляю…') : t('Обновить')}
                  </button>
                  <button className="icon-btn danger" onClick={remove} title={t('Удалить лидерборд')}>
                    <Icon name="trash" size={15} />
                  </button>
                </>
              )}
            </div>
            <motion.div className="board-table" variants={stagger} initial="hidden" animate="show" key={sel + String(example) + shown.length}>
              {shown.map((r, i) => {
                const before = b?.last?.[memberKey(r)]
                const games = r.wins + r.losses
                return (
                  <motion.div key={memberKey(r)} variants={fadeUp} className={`board-row ${i < 3 ? `top${i + 1}` : ''}`}>
                    <span className="board-pos">{i + 1}</span>
                    {r.iconId ? <Img src={profileIcon(r.iconId)} alt="" size={36} radius={9} /> : <span className="acc-blank" />}
                    <button className="board-name" onClick={() => onOpenPlayer(r.riotId, r.platform)}>
                      <b>{r.riotId}</b>
                      <span className="muted small">{PLATFORMS[r.platform] ?? r.platform}</span>
                    </button>
                    <span className="board-rank">
                      {r.tier && <Img src={rankEmblem(r.tier)} alt="" size={30} radius={0} />}
                      {r.error ? <span className="bad small">{r.error}</span> : rankText(r)}
                    </span>
                    <span className="muted">{games ? `${r.wins}W ${r.losses}L · ${Math.round((r.wins / games) * 100)}%` : '—'}</span>
                    <span className={`board-delta ${!rows[sel] || !before ? '' : r.v - before.v > 0 ? 'good' : r.v - before.v < 0 ? 'bad' : ''}`}>
                      {rows[sel] && before && before.v >= 0 && r.v >= 0 && r.v !== before.v ? `${r.v > before.v ? '+' : ''}${r.v - before.v} LP` : ''}
                    </span>
                    {!example && (
                      <button className="icon-btn" onClick={() => removeMember(memberKey(r))} title={t('Убрать')}>
                        <Icon name="close" size={14} />
                      </button>
                    )}
                  </motion.div>
                )
              })}
              {!shown.length && <p className="muted small">{t('Добавьте игроков по Riot ID: друзей, команду или свои аккаунты.')}</p>}
            </motion.div>
            {!example && (
              <div className="key-row board-add">
                <input value={member} onChange={(e) => setMember(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMember()} placeholder={t('Имя#ТЕГ')} />
                <select value={plat} onChange={(e) => setPlat(e.target.value)}>
                  {Object.entries(PLATFORMS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <button className="btn primary" onClick={addMember} disabled={!member.includes('#')}>
                  {t('Добавить игрока')}
                </button>
              </div>
            )}
          </div>

          {!example && b && (
            <div className="card">
              <h3 className="card-title">
                <Icon name="bolt" size={16} /> {t('Discord')}
              </h3>
              <p className="muted small">{t('Вставьте ссылку вебхука канала (Настройки канала → Интеграции → Вебхуки). Программа будет писать туда, когда кто-то из списка повышается, понижается или резко набирает либо теряет LP, и сможет отправить всю таблицу.')}</p>
              <div className="key-row">
                <input value={b.webhook ?? ''} onChange={(e) => updateBoard(b.id, (x) => ({ ...x, webhook: e.target.value.trim() }))} placeholder="https://discord.com/api/webhooks/…" />
                <button className="btn" onClick={send} disabled={!isWebhook(b.webhook ?? '') || !shown.length}>
                  {t('Отправить таблицу')}
                </button>
              </div>
              <AnimatePresence>{b.webhook && !isWebhook(b.webhook) && <motion.p className="bad small" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{t('Это не ссылка на вебхук Discord')}</motion.p>}</AnimatePresence>
              <Switch on={b.alerts ?? true} onChange={(v) => updateBoard(b.id, (x) => ({ ...x, alerts: v }))} label={t('Оповещения об изменениях ранга')} hint={t('программа проверяет список каждые 30 минут, пока открыта')} />
            </div>
          )}
        </div>
      ) : (
        <motion.div className="card gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, ease }}>
          <h3>{t('Свои лидерборды')}</h3>
          <p className="muted">{t('Соберите своих друзей, команду или аккаунты в одну таблицу по рангу в Solo/Duo. Количество лидербордов не ограничено, а изменения можно отправлять в Discord.')}</p>
        </motion.div>
      )}
    </div>
  )
}
