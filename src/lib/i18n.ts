/**
 * Interface language. Strings are written in Russian in the code and wrapped in t('…');
 * in English mode the Russian text is looked up in the dictionaries under src/i18n.
 * Switching language reloads the window so data loaded with a locale (champion names,
 * runes, items, skins) is fetched again in the new language.
 */
import { EN } from '../i18n'

export type Lang = 'ru' | 'en'
const KEY = 'riftpulse.lang'

export const lang: Lang = (() => {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'ru' || v === 'en') return v
  } catch {}
  return 'ru'
})()

export function setLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l)
  } catch {}
  window.rp?.settings.set('lang', l).catch(() => {})
  location.reload()
}

/** Translate a Russian UI string; `{name}` placeholders are filled from vars. */
export function t(ru: string, vars?: Record<string, string | number>): string {
  let s = lang === 'en' ? (EN[ru] ?? ru) : ru
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s
}

/** BCP-47 locale for dates and numbers */
export const locale = lang === 'en' ? 'en-US' : 'ru-RU'
/** Data Dragon locale */
export const ddLocale = lang === 'en' ? 'en_US' : 'ru_RU'
/** CommunityDragon locale */
export const cdLocale = lang === 'en' ? 'default' : 'ru_ru'

export const fmtNum = (n: number) => n.toLocaleString(locale)
