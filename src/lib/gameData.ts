// Game data from Data Dragon in Russian: runes, items and summoner spells.
import { useEffect, useState } from 'react'

const CDN = 'https://ddragon.leagueoflegends.com'

export interface RuneInfo {
  id: number
  name: string
  icon: string
  desc: string
}
export interface RuneTree extends RuneInfo {
  slots: RuneInfo[][]
}
export interface ItemInfo {
  name: string
  desc: string
  gold: number
}
export interface SpellInfo {
  id: string
  name: string
  desc: string
}
export interface GameData {
  version: string
  trees: RuneTree[]
  runes: Record<number, RuneInfo>
  items: Record<number, ItemInfo>
  spells: Record<number, SpellInfo>
}

const strip = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

let cache: Promise<GameData> | null = null
export function gameData() {
  cache ??= (async () => {
    const version: string = (await (await fetch(`${CDN}/api/versions.json`)).json())[0]
    const base = `${CDN}/cdn/${version}/data/ru_RU`
    const [runesJ, itemsJ, spellsJ] = await Promise.all(
      ['runesReforged', 'item', 'summoner'].map((f) =>
        fetch(`${base}/${f}.json`)
          .then((r) => r.json())
          .catch(() => null),
      ),
    )
    const trees: RuneTree[] = (runesJ ?? []).map(
      (t: { id: number; name: string; icon: string; slots: { runes: { id: number; name: string; icon: string; shortDesc: string }[] }[] }) => ({
        id: t.id,
        name: t.name,
        icon: t.icon,
        desc: '',
        slots: t.slots.map((s) => s.runes.map((r) => ({ id: r.id, name: r.name, icon: r.icon, desc: strip(r.shortDesc) }))),
      }),
    )
    const runes: Record<number, RuneInfo> = {}
    for (const t of trees) {
      runes[t.id] = t
      for (const s of t.slots) for (const r of s) runes[r.id] = r
    }
    const items: Record<number, ItemInfo> = {}
    for (const [id, it] of Object.entries((itemsJ?.data ?? {}) as Record<string, { name: string; description: string; gold: { total: number } }>))
      items[Number(id)] = { name: it.name, desc: strip(it.description), gold: it.gold.total }
    const spells: Record<number, SpellInfo> = {}
    for (const sp of Object.values((spellsJ?.data ?? {}) as Record<string, { id: string; key: string; name: string; description: string }>))
      spells[Number(sp.key)] = { id: sp.id, name: sp.name, desc: sp.description }
    return { version, trees, runes, items, spells }
  })().catch(() => ({ version: '', trees: [], runes: {}, items: {}, spells: {} }))
  return cache
}

export function useGameData() {
  const [d, setD] = useState<GameData | null>(null)
  useEffect(() => {
    gameData().then(setD)
  }, [])
  return d
}

export const runeIcon = (icon: string) => `${CDN}/cdn/img/${icon}`
export const spellIcon = (id: string, v: string) => `${CDN}/cdn/${v || '15.24.1'}/img/spell/${id}.png`

/** Stat shards: three rows of choices (offense, flex, defense). */
export const SHARDS: { id: number; name: string; icon: string }[][] = [
  [
    { id: 5008, name: 'Адаптивная сила', icon: 'StatModsAdaptiveForceIcon' },
    { id: 5005, name: 'Скорость атаки', icon: 'StatModsAttackSpeedIcon' },
    { id: 5007, name: 'Ускорение умений', icon: 'StatModsCDRScalingIcon' },
  ],
  [
    { id: 5008, name: 'Адаптивная сила', icon: 'StatModsAdaptiveForceIcon' },
    { id: 5010, name: 'Скорость передвижения', icon: 'StatModsMovementSpeedIcon' },
    { id: 5001, name: 'Здоровье (растёт с уровнем)', icon: 'StatModsHealthScalingIcon' },
  ],
  [
    { id: 5011, name: 'Здоровье', icon: 'StatModsHealthPlusIcon' },
    { id: 5013, name: 'Стойкость и сопротивление замедлению', icon: 'StatModsTenacityIcon' },
    { id: 5001, name: 'Здоровье (растёт с уровнем)', icon: 'StatModsHealthScalingIcon' },
  ],
]
export const shardIcon = (icon: string) => `${CDN}/cdn/img/perk-images/StatMods/${icon}.png`

/** Fallback names when Data Dragon is unreachable. */
export const SPELL_FALLBACK: Record<number, string> = {
  1: 'SummonerBoost',
  3: 'SummonerExhaust',
  4: 'SummonerFlash',
  6: 'SummonerHaste',
  7: 'SummonerHeal',
  11: 'SummonerSmite',
  12: 'SummonerTeleport',
  14: 'SummonerDot',
  21: 'SummonerBarrier',
  32: 'SummonerSnowball',
}
