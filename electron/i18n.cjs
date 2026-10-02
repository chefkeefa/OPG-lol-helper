// Main-process translations. Strings are written in Russian and wrapped in t('…'); when the
// `lang` setting is 'en' the English text is looked up here. `{name}` placeholders are filled from vars.

const EN = {
  // recorder
  'ffmpeg не найден': 'ffmpeg not found',
  'Двойное убийство': 'Double kill',
  'Тройное убийство': 'Triple kill',
  'Четверное убийство': 'Quadra kill',
  'ПЕНТАКИЛЛ': 'PENTAKILL',
  'Мультикилл': 'Multikill',
  'Убийство: {name}': 'Kill: {name}',
  'Смерть от {name}': 'Killed by {name}',
  'Помощь: {name}': 'Assist: {name}',
  'Первая кровь': 'First blood',
  'Эйс': 'Ace',
  'Дракон': 'Dragon',
  'Барон': 'Baron',
  'Герольд': 'Herald',
  'Личинки': 'Void grubs',
  '{name} (украден)': '{name} (stolen)',
  // builds
  'Нет рун для импорта': 'No runes to import',
  'Нет свободного слота для страницы рун. Удалите одну страницу в клиенте.':
    'No free rune page slot. Delete a page in the client.',
  'Стартовые предметы': 'Starting items',
  'Ботинки': 'Boots',
  'Основная сборка': 'Core build',
  'Поздняя игра': 'Late game',
  'Расходники': 'Consumables',
  'Нет заклинаний для импорта': 'No summoner spells to import',
  // main
  'Пока нет статистики по этому чемпиону': 'No stats for this champion yet',
  'руны': 'runes',
  'предметы': 'items',
  'заклинания': 'summoner spells',
  'Клиент League of Legends не запущен': 'The League of Legends client is not running',
  // collector
  'Ключ Riot API недействителен или истёк': 'The Riot API key is invalid or has expired',
}

let getLang = () => 'ru'

/** Set how the current language is read (main.cjs passes () => store.get('lang')). */
function setLangGetter(fn) {
  getLang = fn
}

function t(ru, vars) {
  let lang = 'ru'
  try {
    lang = getLang()
  } catch {}
  let s = lang === 'en' ? (EN[ru] ?? ru) : ru
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s
}

module.exports = { t, setLangGetter, EN }
