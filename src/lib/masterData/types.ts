export type EvolutionStage =
  | 'baby'
  | 'first_stage'
  | 'middle_stage'
  | 'not_fully_evolved'
  | 'fully_evolved'
  | 'no_evolution'

export interface PokemonForm {
  name: string
  sprite: string | null
}

export interface AttackeMasterEntry {
  name: string
  category: 'physical' | 'special' | 'status'
  power: number | null // null bei Status-Attacken und Attacken mit variabler/nicht-fixer Staerke
}

export interface PokemonMasterEntry {
  dex: number
  formSlug: string | null
  name: string
  types: string[]
  generation: number
  evolutionStage: EvolutionStage
  legendary: boolean
  mythical: boolean
  baby: boolean
  bst: number
  // Alternative Kampfformen mit eigenen Werten/Typ (z.B. Deoxys, Rotom, Kyurem) inkl. Basisform
  // an Index 0 -- beim Ziehen in den Pool wird zufaellig genau eine davon gewaehlt. Enthaelt bei
  // Pokemon ohne Alternativformen nur die Basisform selbst.
  forms: PokemonForm[]
}
