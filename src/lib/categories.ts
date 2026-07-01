import type { Category } from './database.types'

export const CATEGORY_LABELS: Record<Category, string> = {
  pokemon: 'Pokémon',
  item: 'Item',
  wesen: 'Wesen',
  faehigkeit: 'Fähigkeit',
  attacke: 'Attacke',
}

export const CATEGORY_COLORS: Record<Category, string> = {
  pokemon: 'bg-emerald-600',
  item: 'bg-amber-600',
  wesen: 'bg-sky-600',
  faehigkeit: 'bg-violet-600',
  attacke: 'bg-rose-600',
}

// Dezenter, aber deutlich sichtbarer Hintergrund/Rahmen fuer bereits befuellte Slots, damit auf
// einen Blick erkennbar ist, welche Felder schon belegt sind — je Kategorie eingefaerbt.
export const CATEGORY_FILLED_STYLE: Record<Category, string> = {
  pokemon: 'bg-emerald-500/15 border-emerald-500/50',
  item: 'bg-amber-500/15 border-amber-500/50',
  wesen: 'bg-sky-500/15 border-sky-500/50',
  faehigkeit: 'bg-violet-500/15 border-violet-500/50',
  attacke: 'bg-rose-500/15 border-rose-500/50',
}

export const POOL_REQUIREMENTS: Record<Category, number> = {
  pokemon: 20,
  item: 15,
  wesen: 15,
  faehigkeit: 15,
  attacke: 55,
}

export const CATEGORY_ORDER: Category[] = ['pokemon', 'wesen', 'faehigkeit', 'item', 'attacke']

// Layout eines einzelnen Team-Feldes: welche Slots (slot_type, slot_ordinal) es enthaelt, in Anzeigereihenfolge.
export const FIELD_SLOT_LAYOUT: { slot_type: Category; slot_ordinal: number }[] = [
  { slot_type: 'pokemon', slot_ordinal: 1 },
  { slot_type: 'wesen', slot_ordinal: 1 },
  { slot_type: 'faehigkeit', slot_ordinal: 1 },
  { slot_type: 'item', slot_ordinal: 1 },
  { slot_type: 'attacke', slot_ordinal: 1 },
  { slot_type: 'attacke', slot_ordinal: 2 },
  { slot_type: 'attacke', slot_ordinal: 3 },
  { slot_type: 'attacke', slot_ordinal: 4 },
]

export const TOTAL_BALLS = 120
