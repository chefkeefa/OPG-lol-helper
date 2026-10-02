import { cdLocale, t } from '../lib/i18n'
// Skins and ward skins: catalogue data from CommunityDragon (rarity, sets, legacy status),
// ownership, purchase dates and prices from the League client when it is running.
import { championList } from '../lib/ddragon'

const CD = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global'
/** "/lol-game-data/assets/ASSETS/x.png" → CommunityDragon URL */
export const cdAsset = (p?: string) => (p ? `${CD}/default/${p.replace(/^\/lol-game-data\/assets\//i, '').toLowerCase()}` : '')

export type Tier = 'kNoRarity' | 'kRare' | 'kEpic' | 'kLegendary' | 'kMythic' | 'kUltimate' | 'kExalted' | 'kTranscendent'
export const TIERS: { id: Tier; label: string; color: string }[] = [
  { id: 'kNoRarity', label: t('Обычный'), color: '#9aa3c7' },
  { id: 'kRare', label: t('Редкий'), color: '#6fb6ff' },
  { id: 'kEpic', label: t('Эпический'), color: '#3fa2ff' },
  { id: 'kLegendary', label: t('Легендарный'), color: '#ff6b5c' },
  { id: 'kMythic', label: t('Мифический'), color: '#b06bff' },
  { id: 'kUltimate', label: t('Ультимативный'), color: '#f4b63f' },
  { id: 'kExalted', label: t('Возвышенный'), color: '#ff6fb1' },
  { id: 'kTranscendent', label: t('Трансцендентный'), color: '#37e0c1' },
]

export interface SkinItem {
  id: number
  champ: string // Data Dragon id
  champName: string
  num: number
  name: string
  tier: Tier
  legacy: boolean
  sets: number[]
  owned: boolean
  acquired: number // ms, 0 if unknown
  price: number // RP, 0 if not sold for RP
  released: number
  loadScreen: string
}
export interface WardItem {
  id: number
  name: string
  image: string
  legacy: boolean
  owned: boolean
  acquired: number
}
export interface CollectionData {
  skins: SkinItem[]
  wards: WardItem[]
  sets: Record<number, string>
  champions: { id: string; key: number; name: string; owned: boolean; free: boolean }[]
  source: 'client' | 'snapshot' | 'demo'
  savedAt?: number
}

interface CdSkin {
  id: number
  name: string
  isBase: boolean
  rarity?: Tier
  isLegacy?: boolean
  skinLines?: { id: number }[] | null
  loadScreenPath?: string
}
interface CdWard {
  id: number
  name: string
  wardImagePath: string
  isLegacy?: boolean
}

const getJson = async <T>(url: string): Promise<T | null> => {
  try {
    const r = await fetch(url)
    return r.ok ? ((await r.json()) as T) : null
  } catch {
    return null
  }
}

/** LCU dates look like "20240115T101112.000Z" */
const lcuDate = (s?: string) => {
  if (!s) return 0
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(s)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : Date.parse(s) || 0
}

async function catalogue() {
  const [skins, lines, wards] = await Promise.all([
    getJson<Record<string, CdSkin>>(`${CD}/${cdLocale}/v1/skins.json`).then((x) => x ?? getJson<Record<string, CdSkin>>(`${CD}/default/v1/skins.json`)),
    getJson<{ id: number; name: string }[]>(`${CD}/${cdLocale}/v1/skinlines.json`),
    getJson<CdWard[]>(`${CD}/${cdLocale}/v1/ward-skins.json`),
  ])
  return {
    skins: skins && typeof skins === 'object' && !Array.isArray(skins) ? skins : null,
    sets: Object.fromEntries((Array.isArray(lines) ? lines : []).filter((l) => l.id).map((l) => [l.id, l.name])) as Record<number, string>,
    wards: Array.isArray(wards) ? wards : [],
  }
}

type Rp = NonNullable<Window['rp']>
interface InvItem {
  itemId: number
  purchaseDate?: string
  ownershipType?: string
}
interface CatalogItem {
  itemId: number
  prices?: { currency: string; cost: number }[]
  releaseDate?: string | number
}

const SNAP = 'riftpulse.collection'

async function fromClient(rp: Rp) {
  const me = await rp.lcu.get<{ summonerId: number }>('/lol-summoner/v1/current-summoner')
  const [champs, skinInv, wardInv, skinCat] = await Promise.all([
    rp.lcu.get<{ id: number; alias: string; name: string; freeToPlay: boolean; ownership: { owned: boolean } }[]>(`/lol-champions/v1/inventories/${me.summonerId}/champions-minimal`).catch(() =>
      rp.lcu.get<{ id: number; alias: string; name: string; freeToPlay: boolean; ownership: { owned: boolean } }[]>(`/lol-champions/v1/inventories/${me.summonerId}/champions`),
    ),
    rp.lcu.get<InvItem[]>('/lol-inventory/v2/inventory/CHAMPION_SKIN').catch(() => [] as InvItem[]),
    rp.lcu.get<InvItem[]>('/lol-inventory/v2/inventory/WARD_SKIN').catch(() => [] as InvItem[]),
    rp.lcu.get<CatalogItem[]>('/lol-catalog/v1/items/CHAMPION_SKIN').catch(() => [] as CatalogItem[]),
  ])
  return { champs: champs.filter((c) => c.id > 0), skinInv, wardInv, skinCat }
}

// deterministic pseudo random for the demo
const hash = (n: number) => {
  let x = n * 2654435761
  x ^= x >>> 15
  return ((x >>> 0) % 1000) / 1000
}

export async function loadCollection(useClient: boolean): Promise<CollectionData> {
  const [cat, list] = await Promise.all([catalogue(), championList()])
  const byKey = Object.fromEntries(list.map((c) => [c.key, c]))
  let client: Awaited<ReturnType<typeof fromClient>> | null = null
  let source: CollectionData['source'] = 'demo'
  let savedAt: number | undefined
  if (useClient && window.rp) client = await fromClient(window.rp).catch(() => null)
  if (client) {
    source = 'client'
    // Riot API has no inventory endpoint, so keep the last client snapshot for use without League running
    try {
      localStorage.setItem(
        SNAP,
        JSON.stringify({
          at: Date.now(),
          champs: client.champs.map((c) => ({ id: c.id, alias: c.alias, name: c.name, freeToPlay: c.freeToPlay, ownership: { owned: Boolean(c.ownership?.owned) } })),
          skinInv: client.skinInv.map((i) => ({ itemId: i.itemId, purchaseDate: i.purchaseDate })),
          wardInv: client.wardInv.map((i) => ({ itemId: i.itemId, purchaseDate: i.purchaseDate })),
          skinCat: client.skinCat.map((c) => ({ itemId: c.itemId, prices: c.prices?.filter((p) => p.currency === 'RP'), releaseDate: c.releaseDate })),
        }),
      )
    } catch {}
  } else if (window.rp) {
    try {
      const snap = JSON.parse(localStorage.getItem(SNAP) ?? 'null')
      if (snap && Array.isArray(snap.skinInv)) {
        client = snap
        source = 'snapshot'
        savedAt = snap.at
      }
    } catch {}
  }

  const inv = new Map((client?.skinInv ?? []).map((i) => [i.itemId, i]))
  const prices = new Map((client?.skinCat ?? []).map((c) => [c.itemId, c]))
  const ownedChamps = new Set((client?.champs ?? []).filter((c) => c.ownership?.owned).map((c) => c.id))
  const now = Date.now()

  const skins: SkinItem[] = []
  const raw: CdSkin[] = cat.skins
    ? Object.values(cat.skins)
    : // CommunityDragon unreachable: base skins only
      list.map((c) => ({ id: c.key * 1000, name: c.name, isBase: true }))
  for (const s of raw) {
    if (s.isBase) continue
    const key = Math.floor(s.id / 1000)
    const champ = byKey[key]
    if (!champ) continue
    const r = hash(s.id)
    const own = client ? inv.get(s.id) : null
    const owned = client ? Boolean(own) : r < 0.22
    const c = prices.get(s.id)
    const rp = c?.prices?.find((p) => p.currency === 'RP')?.cost ?? 0
    const tier = s.rarity ?? 'kNoRarity'
    const demoPrice = { kNoRarity: [520, 750, 975, 1350][Math.floor(r * 40) % 4], kRare: 1350, kEpic: 1350, kLegendary: 1820, kMythic: 0, kUltimate: 3250, kExalted: 0, kTranscendent: 0 }[tier]
    skins.push({
      id: s.id,
      champ: champ.id,
      champName: champ.name,
      num: s.id % 1000,
      name: s.name,
      tier,
      legacy: Boolean(s.isLegacy),
      sets: (s.skinLines ?? []).map((l) => l.id),
      owned,
      acquired: client ? lcuDate(own?.purchaseDate) : owned ? now - Math.floor(hash(s.id + 7) * 5 * 365) * 86400_000 : 0,
      price: client ? rp : demoPrice,
      released: c?.releaseDate ? (typeof c.releaseDate === 'number' ? c.releaseDate : Date.parse(c.releaseDate)) : 0,
      loadScreen: cdAsset(s.loadScreenPath),
    })
  }

  const wardInv = new Map((client?.wardInv ?? []).map((i) => [i.itemId, i]))
  const wards: WardItem[] = cat.wards
    .filter((w) => w.id > 0)
    .map((w) => {
      const own = wardInv.get(w.id)
      const owned = client ? Boolean(own) : hash(w.id + 3) < 0.3
      return {
        id: w.id,
        name: w.name,
        image: cdAsset(w.wardImagePath),
        legacy: Boolean(w.isLegacy),
        owned,
        acquired: client ? lcuDate(own?.purchaseDate) : owned ? now - Math.floor(hash(w.id) * 4 * 365) * 86400_000 : 0,
      }
    })

  const champions = client
    ? client.champs.map((c) => ({ id: c.alias, key: c.id, name: byKey[c.id]?.name ?? c.name, owned: ownedChamps.has(c.id), free: c.freeToPlay }))
    : list.map((c, i) => ({ id: c.id, key: c.key, name: c.name, owned: (c.key * 7 + i) % 5 !== 0, free: i % 17 === 0 }))

  return { skins, wards, sets: cat.sets, champions, source, savedAt }
}
