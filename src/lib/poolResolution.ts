import { CATEGORY_LABELS, CATEGORY_ORDER, SLOT_MINIMUMS } from './categories'
import type { Category } from './database.types'
import { ATTACKEN_MASTER, FAEHIGKEITEN_MASTER, ITEMS_MASTER, POKEMON_MASTER, WESEN_MASTER } from './masterData'
import type { AttackeMasterEntry, EvolutionStage, PokemonMasterEntry } from './masterData'

export interface PokemonFilters {
  generations: number[] // leer = kein Filter
  types: string[]
  stages: EvolutionStage[]
  legendary: 'include' | 'exclude' | 'only'
  mythical: 'include' | 'exclude' | 'only'
  ultraBeast: 'include' | 'exclude' | 'only'
  superParadox: 'include' | 'exclude' | 'only'
  bstMin: number | null
  bstMax: number | null
}

export const EMPTY_POKEMON_FILTERS: PokemonFilters = {
  generations: [],
  types: [],
  stages: [],
  legendary: 'include',
  mythical: 'include',
  ultraBeast: 'include',
  superParadox: 'include',
  bstMin: null,
  bstMax: null,
}

export interface AttackeFilters {
  minStatusPercent: number // 0-100: Mindestanteil Status-Attacken im resultierenden Pool
  maxStatusPercent: number // 0-100: Maximalanteil Status-Attacken im resultierenden Pool
  minPowerPercent: number // 0-100: Mindestanteil Attacken mit Basiswert >= powerThreshold
  maxPowerPercent: number // 0-100: Maximalanteil Attacken mit Basiswert >= powerThreshold
  powerThreshold: number // Basiswert-Schwelle, die min-/maxPowerPercent zugrunde liegt
}

export const DEFAULT_ATTACKE_FILTERS: AttackeFilters = {
  minStatusPercent: 0,
  maxStatusPercent: 100,
  minPowerPercent: 0,
  maxPowerPercent: 100,
  powerThreshold: 80,
}

export interface CategoryConfig {
  count: number
  mode: 'random' | 'manual'
  manualSelection: string[] // Namen/Werte (bei Pokemon: der Basisname der Karte, nicht eine gewuerfelte Form)
  pokemonFilters?: PokemonFilters // nur fuer category === 'pokemon' relevant
  attackeFilters?: AttackeFilters // nur fuer category === 'attacke' relevant
}

export type PoolConfig = Record<Category, CategoryConfig>

export function defaultPoolConfig(): PoolConfig {
  return {
    pokemon: { count: 20, mode: 'random', manualSelection: [], pokemonFilters: EMPTY_POKEMON_FILTERS },
    item: { count: 15, mode: 'random', manualSelection: [] },
    wesen: { count: 15, mode: 'random', manualSelection: [] },
    faehigkeit: { count: 15, mode: 'random', manualSelection: [] },
    attacke: { count: 55, mode: 'random', manualSelection: [], attackeFilters: DEFAULT_ATTACKE_FILTERS },
  }
}

export function applyPokemonFilters(entries: PokemonMasterEntry[], f: PokemonFilters): PokemonMasterEntry[] {
  return entries.filter((e) => {
    if (f.generations.length > 0 && !f.generations.includes(e.generation)) return false
    if (f.types.length > 0 && !e.types.some((t) => f.types.includes(t))) return false
    if (f.stages.length > 0 && !f.stages.includes(e.evolutionStage)) return false
    if (f.legendary === 'exclude' && e.legendary) return false
    if (f.legendary === 'only' && !e.legendary) return false
    if (f.mythical === 'exclude' && e.mythical) return false
    if (f.mythical === 'only' && !e.mythical) return false
    if (f.ultraBeast === 'exclude' && e.ultraBeast) return false
    if (f.ultraBeast === 'only' && !e.ultraBeast) return false
    if (f.superParadox === 'exclude' && e.superParadox) return false
    if (f.superParadox === 'only' && !e.superParadox) return false
    if (f.bstMin != null && e.bst < f.bstMin) return false
    if (f.bstMax != null && e.bst > f.bstMax) return false
    return true
  })
}

function flatMasterFor(category: 'item' | 'wesen' | 'faehigkeit'): string[] {
  switch (category) {
    case 'item':
      return ITEMS_MASTER
    case 'wesen':
      return WESEN_MASTER
    case 'faehigkeit':
      return FAEHIGKEITEN_MASTER
  }
}

function pickRandom<T>(items: T[], n: number): T[] {
  const pool = [...items]
  const result: T[] = []
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    result.push(pool.splice(idx, 1)[0])
  }
  return result
}

// Bei Pokemon mit Alternativformen (z.B. Deoxys, Rotom, Kyurem) wird beim Ziehen in den Pool
// zufaellig genau eine Form (inkl. Basisform) ausgewaehlt -- die Karte selbst repraesentiert alle
// Formen gleichwahrscheinlich, nie mehrere gleichzeitig im Pool.
function resolvePokemonForm(entry: PokemonMasterEntry): string {
  const form = entry.forms[Math.floor(Math.random() * entry.forms.length)]
  return form.name
}

function isHighPower(m: AttackeMasterEntry, threshold: number): boolean {
  return m.power != null && m.power >= threshold
}

// Attacken-Aufloesung mit Kompositions-Garantien: manuell angehakte Attacken zaehlen auf die
// Status-/Basiswert-Quoten an; der Rest wird zufaellig aufgefuellt, wobei zuerst die beiden
// Mindestquoten bedient werden (Status-Attacken haben nie einen Basiswert, die Mengen
// ueberschneiden sich also nie) und danach frei aus dem verbleibenden Pool gezogen wird. Die
// Maximalquoten werden durchgesetzt, indem der freie Auffuell-Pool von vornherein nur so viele
// zusaetzliche Status-/Basiswert-Attacken enthaelt, wie bis zum jeweiligen Maximum noch erlaubt
// sind -- so kann ein zufaelliger Zug das Maximum nie versehentlich ueberschreiten.
function resolveAttackePool(config: CategoryConfig): string[] {
  const filters = config.attackeFilters ?? DEFAULT_ATTACKE_FILTERS
  const manualNames = new Set(config.manualSelection)
  const manualEntries = ATTACKEN_MASTER.filter((m) => manualNames.has(m.name))
  let pool = ATTACKEN_MASTER.filter((m) => !manualNames.has(m.name))

  const minStatusCount = Math.ceil((filters.minStatusPercent / 100) * config.count)
  // max wird mit floor gerundet (garantiert "hoechstens X%"), min mit ceil (garantiert
  // "mindestens X%") -- bei gleichem Prozentwert auf beiden Seiten (z.B. exakt 30/30) koennen
  // diese bei nicht glatt teilbarer Gesamtzahl sonst auseinanderfallen (ceil(30%) > floor(30%)),
  // wodurch der Mindest-Zug den Maximal-Deckel technisch schon vor der Fuell-Phase ueberschreitet.
  // Der Max-Wert wird deshalb nie kleiner als der Min-Wert zugelassen.
  const maxStatusCount = Math.max(minStatusCount, Math.floor((filters.maxStatusPercent / 100) * config.count))
  const minPowerCount = Math.ceil((filters.minPowerPercent / 100) * config.count)
  const maxPowerCount = Math.max(minPowerCount, Math.floor((filters.maxPowerPercent / 100) * config.count))

  const selected = [...manualEntries]
  const statusSoFar = selected.filter((m) => m.category === 'status').length
  const powerSoFar = selected.filter((m) => isHighPower(m, filters.powerThreshold)).length

  const neededStatus = Math.max(0, minStatusCount - statusSoFar)
  const drawnStatus = pickRandom(
    pool.filter((m) => m.category === 'status'),
    neededStatus,
  )
  selected.push(...drawnStatus)
  pool = pool.filter((m) => !drawnStatus.includes(m))

  const neededPower = Math.max(0, minPowerCount - powerSoFar)
  const drawnPower = pickRandom(
    pool.filter((m) => isHighPower(m, filters.powerThreshold)),
    neededPower,
  )
  selected.push(...drawnPower)
  pool = pool.filter((m) => !drawnPower.includes(m))

  const stillNeeded = Math.max(0, config.count - selected.length)
  const statusTotalSoFar = statusSoFar + drawnStatus.length
  const powerTotalSoFar = powerSoFar + drawnPower.length
  const additionalStatusAllowed = Math.max(0, maxStatusCount - statusTotalSoFar)
  const additionalPowerAllowed = Math.max(0, maxPowerCount - powerTotalSoFar)

  const otherPool = pool.filter((m) => m.category !== 'status' && !isHighPower(m, filters.powerThreshold))
  const eligibleStatus = pickRandom(
    pool.filter((m) => m.category === 'status'),
    additionalStatusAllowed,
  )
  const eligiblePower = pickRandom(
    pool.filter((m) => isHighPower(m, filters.powerThreshold)),
    additionalPowerAllowed,
  )
  const fillerPool = [...otherPool, ...eligibleStatus, ...eligiblePower]
  selected.push(...pickRandom(fillerPool, stillNeeded))

  return selected.map((m) => m.name)
}

// manualSelection zaehlt bewusst UNABHAENGIG von "mode": "Manuell" schaltet nur die Checkliste in
// der UI sichtbar, angehakte Eintraege bleiben aber auch nach dem Zurueckschalten auf "Zufaellig"
// garantiert im Pool -- so lassen sich gezielt einzelne Werte fix vorgeben und der Rest trotzdem
// bequem zufaellig auffuellen, ohne dauerhaft in der Checklisten-Ansicht bleiben zu muessen.
export function resolveCategoryPool(category: Category, config: CategoryConfig): string[] {
  if (category === 'pokemon') {
    const filtered = applyPokemonFilters(POKEMON_MASTER, config.pokemonFilters ?? EMPTY_POKEMON_FILTERS)
    const manualNames = new Set(config.manualSelection)
    const manualEntries = filtered.filter((e) => manualNames.has(e.name))
    const remaining = filtered.filter((e) => !manualNames.has(e.name))
    const additional = pickRandom(remaining, config.count - manualEntries.length)
    return [...manualEntries, ...additional].map(resolvePokemonForm)
  }

  if (category === 'attacke') {
    return resolveAttackePool(config)
  }

  const master = flatMasterFor(category)
  const manualValues = config.manualSelection.filter((v) => master.includes(v))
  const remaining = master.filter((v) => !manualValues.includes(v))
  const additional = pickRandom(remaining, config.count - manualValues.length)
  return [...manualValues, ...additional]
}

// Liefert eine zufaellig gemischte Liste moeglicher neuer Pokemon-Formen fuer den
// Wondertrade-Joker: alle Formen aller Master-Eintraege, die die uebergebenen Filter erfuellen,
// abzueglich der als "bereits bekannt" uebergebenen Namen (das eigene/gegnerische Team). Der
// Aufrufer probiert die Liste der Reihe nach durch und faengt serverseitige Duplikat-Ablehnungen
// ab (der Client kennt die noch versteckten Baelle nicht, siehe use_wondertrade_joker in
// schema.sql) -- deshalb absichtlich eine ganze Liste statt nur eines einzelnen Zufallswerts.
export function randomPokemonFormCandidates(filters: PokemonFilters, excludeNames: Set<string>): string[] {
  const eligible = applyPokemonFilters(POKEMON_MASTER, filters)
  const pool = eligible.flatMap((e) => e.forms.map((f) => f.name)).filter((name) => !excludeNames.has(name))
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool
}

export function resolvePool(config: PoolConfig): { category: Category; value: string }[] {
  const result: { category: Category; value: string }[] = []
  for (const category of CATEGORY_ORDER) {
    for (const value of resolveCategoryPool(category, config[category])) {
      result.push({ category, value })
    }
  }
  return result
}

// Clientseitige Vorab-Pruefung -- spiegelt die serverseitigen Checks in set_content_pool() fuer
// sofortiges UI-Feedback, ersetzt sie aber nicht (die DB bleibt die Autoritaet).
export function validatePoolConfig(config: PoolConfig): string[] {
  const errors: string[] = []
  for (const category of CATEGORY_ORDER) {
    const cfg = config[category]
    const label = CATEGORY_LABELS[category]

    if (!Number.isFinite(cfg.count) || cfg.count < SLOT_MINIMUMS[category]) {
      errors.push(`${label}: mindestens ${SLOT_MINIMUMS[category]} noetig (aktuell ${cfg.count})`)
      continue
    }
    if (cfg.manualSelection.length > cfg.count) {
      errors.push(`${label}: ${cfg.manualSelection.length} angehakt, aber nur ${cfg.count} konfiguriert`)
      continue
    }

    if (category === 'pokemon') {
      const availableCount = applyPokemonFilters(POKEMON_MASTER, cfg.pokemonFilters ?? EMPTY_POKEMON_FILTERS).length
      if (availableCount < cfg.count) {
        errors.push(`${label}: nur ${availableCount} verfuegbar (nach Filter), aber ${cfg.count} angefordert`)
      }
      continue
    }

    if (category === 'attacke') {
      if (ATTACKEN_MASTER.length < cfg.count) {
        errors.push(`${label}: nur ${ATTACKEN_MASTER.length} verfuegbar, aber ${cfg.count} angefordert`)
        continue
      }
      const filters = cfg.attackeFilters ?? DEFAULT_ATTACKE_FILTERS
      const minStatusCount = Math.ceil((filters.minStatusPercent / 100) * cfg.count)
      const maxStatusCount = Math.max(minStatusCount, Math.floor((filters.maxStatusPercent / 100) * cfg.count))
      const minPowerCount = Math.ceil((filters.minPowerPercent / 100) * cfg.count)
      const maxPowerCount = Math.max(minPowerCount, Math.floor((filters.maxPowerPercent / 100) * cfg.count))
      if (filters.minStatusPercent > filters.maxStatusPercent) {
        errors.push(`${label}: Mindestanteil Status-Attacken groesser als der Maximalanteil`)
      }
      if (filters.minPowerPercent > filters.maxPowerPercent) {
        errors.push(`${label}: Mindestanteil starker Attacken groesser als der Maximalanteil`)
      }
      if (minStatusCount + minPowerCount > cfg.count) {
        errors.push(`${label}: Status- und Basiswert-Mindestanteil zusammen groesser als die Gesamtanzahl`)
      }
      const statusAvailable = ATTACKEN_MASTER.filter((m) => m.category === 'status').length
      if (statusAvailable < minStatusCount) {
        errors.push(`${label}: nur ${statusAvailable} Status-Attacken verfuegbar, aber ${minStatusCount} gefordert`)
      }
      const powerAvailable = ATTACKEN_MASTER.filter((m) => isHighPower(m, filters.powerThreshold)).length
      if (powerAvailable < minPowerCount) {
        errors.push(`${label}: nur ${powerAvailable} Attacken mit Basiswert >= ${filters.powerThreshold} verfuegbar, aber ${minPowerCount} gefordert`)
      }
      const manualStatusCount = ATTACKEN_MASTER.filter(
        (m) => cfg.manualSelection.includes(m.name) && m.category === 'status',
      ).length
      if (manualStatusCount > maxStatusCount) {
        errors.push(`${label}: ${manualStatusCount} manuell angehakte Status-Attacken ueberschreiten den Maximalanteil (${maxStatusCount})`)
      }
      const manualPowerCount = ATTACKEN_MASTER.filter(
        (m) => cfg.manualSelection.includes(m.name) && isHighPower(m, filters.powerThreshold),
      ).length
      if (manualPowerCount > maxPowerCount) {
        errors.push(`${label}: ${manualPowerCount} manuell angehakte starke Attacken ueberschreiten den Maximalanteil (${maxPowerCount})`)
      }
      continue
    }

    const availableCount = flatMasterFor(category).length
    if (availableCount < cfg.count) {
      errors.push(`${label}: nur ${availableCount} verfuegbar, aber ${cfg.count} angefordert`)
    }
  }
  return errors
}
