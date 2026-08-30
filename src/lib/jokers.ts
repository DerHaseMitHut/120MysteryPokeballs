export type JokerType = 'veto' | 'wondertrade' | 'wechsel' | 'protect'

export const JOKER_TYPES: JokerType[] = ['veto', 'wondertrade', 'wechsel', 'protect']

export const JOKER_LABELS: Record<JokerType, string> = {
  veto: 'Veto',
  wondertrade: 'Wondertrade',
  wechsel: 'Wechsel',
  protect: 'Protect',
}

export const JOKER_DESCRIPTIONS: Record<JokerType, string> = {
  veto: 'Verwirft einen gezogenen Ball, ohne ihn platzieren zu müssen.',
  wondertrade: 'Würfelt ein platziertes Pokémon (eigenes oder gegnerisches) neu aus.',
  wechsel: 'Tauscht zwei gleichartige Slots innerhalb des eigenen Teams.',
  protect: 'Ersetzt eine eigene Attacke durch Schutzschild.',
}

// Bild pro Jokerart -- Host legt die Dateien selbst in public/joker-icons/ ab (siehe README dort).
// Fehlt eine Datei, faellt die Anzeige automatisch auf ein Emoji-Badge zurueck (siehe JokerIcon).
export const JOKER_ICON_SRC: Record<JokerType, string> = {
  veto: '/joker-icons/veto.png',
  wondertrade: '/joker-icons/wondertrade.png',
  wechsel: '/joker-icons/wechsel.png',
  protect: '/joker-icons/protect.png',
}

export const JOKER_FALLBACK_EMOJI: Record<JokerType, string> = {
  veto: '🚫',
  wondertrade: '🔀',
  wechsel: '🔁',
  protect: '🛡️',
}

export interface JokerTypeConfig {
  enabled: boolean
  // Relative Gewichtung unter den aktiven Jokerarten (Standard: alle gleich = 1). 0 wirkt wie
  // deaktiviert, ohne den "enabled"-Schalter selbst umzulegen.
  weight: number
  // null = keine Obergrenze fuer diese Jokerart.
  maxCount: number | null
}

export interface JokerConfig {
  // Chance PRO BALL (0-100), zusaetzlich zu seinem Standardinhalt einen Joker zu enthalten.
  chancePercent: number
  // null = keine Gesamt-Obergrenze ueber alle Jokerarten hinweg.
  maxTotal: number | null
  types: Record<JokerType, JokerTypeConfig>
}

export function defaultJokerTypeConfig(): JokerTypeConfig {
  return { enabled: true, weight: 1, maxCount: null }
}

export function defaultJokerConfig(): JokerConfig {
  return {
    chancePercent: 15,
    maxTotal: null,
    types: {
      veto: defaultJokerTypeConfig(),
      wondertrade: defaultJokerTypeConfig(),
      wechsel: defaultJokerTypeConfig(),
      protect: defaultJokerTypeConfig(),
    },
  }
}

export function validateJokerConfig(config: JokerConfig): string[] {
  const errors: string[] = []

  if (!Number.isFinite(config.chancePercent) || config.chancePercent < 0 || config.chancePercent > 100) {
    errors.push('Joker-Chance muss zwischen 0 und 100 liegen')
  }
  if (config.maxTotal != null && (!Number.isFinite(config.maxTotal) || config.maxTotal < 0)) {
    errors.push('Maximale Gesamtzahl Joker muss 0 oder größer sein')
  }

  for (const type of JOKER_TYPES) {
    const tc = config.types[type]
    if (!Number.isFinite(tc.weight) || tc.weight < 0) {
      errors.push(`${JOKER_LABELS[type]}: Gewichtung muss 0 oder größer sein`)
    }
    if (tc.maxCount != null && (!Number.isFinite(tc.maxCount) || tc.maxCount < 0)) {
      errors.push(`${JOKER_LABELS[type]}: Obergrenze muss 0 oder größer sein`)
    }
  }

  const anyActive = JOKER_TYPES.some((t) => config.types[t].enabled && config.types[t].weight > 0)
  if (config.chancePercent > 0 && !anyActive) {
    errors.push('Mindestens eine Jokerart muss aktiv sein, wenn die Joker-Chance größer als 0 ist')
  }

  return errors
}
