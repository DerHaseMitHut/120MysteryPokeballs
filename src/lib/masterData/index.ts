import pokemonData from './pokemon.json'
import attackenData from './attacken.json'
import faehigkeitenData from './faehigkeiten.json'
import itemsData from './items.json'
import wesenData from './wesen.json'
import type { AttackeMasterEntry, PokemonMasterEntry } from './types'

export const POKEMON_MASTER = pokemonData as PokemonMasterEntry[]
// Attacken: host-kuratierte Liste (PokeWiki, ohne Gigadynamax-/Dynamax-/Z-Attacken) mit
// Kategorie+Basiswert fuer die Statusattacken-/Basiswert-Regler. Faehigkeiten/Items/Wesen sind
// flache, host-kuratierte Listen ohne Metadaten.
export const ATTACKEN_MASTER = attackenData as AttackeMasterEntry[]
export const FAEHIGKEITEN_MASTER = faehigkeitenData as string[]
export const ITEMS_MASTER = itemsData as string[]
export const WESEN_MASTER = wesenData as string[]

export type { PokemonMasterEntry, PokemonForm, EvolutionStage, AttackeMasterEntry } from './types'
