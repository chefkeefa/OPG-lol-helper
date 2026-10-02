import { useEffect, useState } from 'react'

const CDN = 'https://ddragon.leagueoflegends.com'
let version = '15.24.1'
let loaded: Promise<string> | null = null

function loadVersion() {
  loaded ??= fetch(`${CDN}/api/versions.json`)
    .then((r) => r.json())
    .then((v: string[]) => (version = v[0]))
    .catch(() => version)
  return loaded
}

/** Re-renders once the latest Data Dragon version is known. */
export function useDDragon() {
  const [v, setV] = useState(version)
  useEffect(() => {
    loadVersion().then(setV)
  }, [])
  return v
}

export const champIcon = (name: string, v = version) => `${CDN}/cdn/${v}/img/champion/${name}.png`
export const champSplash = (name: string) => `${CDN}/cdn/img/champion/splash/${name}_0.jpg`
export const champTile = (name: string) => `${CDN}/cdn/img/champion/tiles/${name}_0.jpg`
export const itemIcon = (id: number, v = version) => `${CDN}/cdn/${v}/img/item/${id}.png`
export const profileIcon = (id: number, v = version) => `${CDN}/cdn/${v}/img/profileicon/${id}.png`

export interface ChampionInfo {
  id: string
  key: number
  name: string
}
let champList: Promise<ChampionInfo[]> | null = null
/** All champions from Data Dragon, sorted by (English) name. */
export function championList() {
  champList ??= loadVersion()
    .then((v) => fetch(`${CDN}/cdn/${v}/data/ru_RU/champion.json`))
    .then((r) => r.json())
    .then((j: { data: Record<string, { id: string; key: string; name: string }> }) =>
      Object.values(j.data)
        .map((c) => ({ id: c.id, key: Number(c.key), name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    )
    .catch(() => [])
  return champList
}

/** championId (numeric key) → Data Dragon id, e.g. 266 → "Aatrox" */
export const championMap = () =>
  championList().then((l) => Object.fromEntries(l.map((c) => [c.key, c.id])) as Record<number, string>)

export const rankEmblem = (tier: string) =>
  `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${tier.toLowerCase()}.png`
export const positionIcon = (role: string) =>
  `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-${role.toLowerCase()}.png`

let names: Record<string, string> = {}
championList().then((l) => (names = Object.fromEntries(l.map((c) => [c.id, c.name]))))
/** Display name for a Data Dragon champion id (falls back to the id until the list loads). */
export const champName = (id: string) => names[id] ?? id
