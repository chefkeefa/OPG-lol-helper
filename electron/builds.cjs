// Turns aggregated collector data into one recommended build, and writes builds into the
// League client: a rune page, an item set and summoner spells.

const { t } = require('./i18n.cjs')
const top = (map, min = 1) =>
  Object.entries(map || {})
    .filter(([, [g]]) => g >= min)
    .sort((a, b) => b[1][0] - a[1][0])

function parseRunes(key) {
  const n = key.split('.').map(Number)
  if (n.length !== 11) return null
  return { primaryStyleId: n[0], subStyleId: n[5], perks: [n[1], n[2], n[3], n[4], n[6], n[7], n[8], n[9], n[10]] }
}

/** The most played choice in every category (what most high-elo players actually do). */
function recommend(agg) {
  if (!agg || !agg.g) return null
  const runeKey = top(agg.runes)[0]?.[0]
  const spells = top(agg.spells)[0]?.[0]?.split('.').map(Number) ?? []
  const core = top(agg.core)[0]?.[0]?.split('.').map(Number) ?? []
  const start = top(agg.start)[0]?.[0]?.split('.').map(Number) ?? []
  const boots = Number(top(agg.boots)[0]?.[0]) || 0
  const late = top(agg.late)
    .map(([k]) => Number(k))
    .filter((id) => !core.includes(id))
    .slice(0, 6)
  return {
    runes: runeKey ? parseRunes(runeKey) : null,
    spells,
    start,
    core,
    boots,
    late,
    skills: top(agg.skills)[0]?.[0] ?? '',
  }
}

// ---------------------------------------------------------------- client writes
const PREFIX = 'Rift Pulse'

async function importRunes(lcu, { champion, role, runes }) {
  if (!runes) throw new Error(t('Нет рун для импорта'))
  const pages = await lcu.get('/lol-perks/v1/pages')
  for (const p of pages) if (p.isDeletable && p.name?.startsWith(PREFIX)) await lcu.send('DELETE', `/lol-perks/v1/pages/${p.id}`).catch(() => {})
  const body = {
    name: `${PREFIX}: ${champion}${role ? ' ' + role.toLowerCase() : ''}`.slice(0, 25),
    primaryStyleId: runes.primaryStyleId,
    subStyleId: runes.subStyleId,
    selectedPerkIds: runes.perks,
    current: true,
  }
  try {
    await lcu.post('/lol-perks/v1/pages', body)
  } catch (e) {
    // all page slots are taken: replace the page that is currently selected, if it is editable
    const cur = await lcu.get('/lol-perks/v1/currentpage').catch(() => null)
    if (!cur?.isDeletable) throw new Error(t('Нет свободного слота для страницы рун. Удалите одну страницу в клиенте.'))
    await lcu.send('DELETE', `/lol-perks/v1/pages/${cur.id}`)
    await lcu.post('/lol-perks/v1/pages', body)
  }
  return true
}

async function importItems(lcu, { champion, championKey, role, start = [], core = [], boots = 0, late = [] }) {
  const me = await lcu.get('/lol-summoner/v1/current-summoner')
  const url = `/lol-item-sets/v1/item-sets/${me.summonerId}/sets`
  const data = await lcu.get(url)
  const aram = role === 'ARAM'
  const uid = `riftpulse-${aram ? 'aram-' : ''}${championKey}`
  const block = (type, ids) => ({ type, items: ids.filter(Boolean).map((id) => ({ id: String(id), count: 1 })) })
  const set = {
    uid,
    title: `${PREFIX}: ${champion}${role ? ' ' + role.toLowerCase() : ''}`,
    associatedChampions: [championKey],
    associatedMaps: [aram ? 12 : 11],
    blocks: [
      block(t('Стартовые предметы'), aram ? start : [...new Set([...start, 3340])]),
      block(t('Ботинки'), [boots]),
      block(t('Основная сборка'), core),
      block(t('Поздняя игра'), late),
      block(t('Расходники'), [2003, 2055, 2138, 2139, 2140]),
    ].filter((b) => b.items.length),
    map: aram ? 'HA' : 'SR',
    mode: aram ? 'ARAM' : 'CLASSIC',
    preferredItemSlots: [],
    sortrank: 0,
    startedFrom: 'blank',
    type: 'custom',
  }
  const itemSets = (data.itemSets || []).filter((s) => s.uid !== uid)
  itemSets.unshift(set)
  await lcu.send('PUT', url, { ...data, itemSets, timestamp: Date.now() })
  return true
}

const FLASH = 4
async function importSpells(lcu, spells) {
  if (spells.length !== 2) throw new Error(t('Нет заклинаний для импорта'))
  const session = await lcu.get('/lol-champ-select/v1/session')
  const me = session.myTeam?.find((c) => c.cellId === session.localPlayerCellId)
  let [a, b] = spells
  // keep Flash on the key the player already uses for it
  if (a === FLASH && me?.spell2Id === FLASH) [a, b] = [b, a]
  else if (b === FLASH && me?.spell1Id === FLASH) [a, b] = [b, a]
  await lcu.send('PATCH', '/lol-champ-select/v1/session/my-selection', { spell1Id: a, spell2Id: b })
  return true
}

module.exports = { recommend, importRunes, importItems, importSpells }
