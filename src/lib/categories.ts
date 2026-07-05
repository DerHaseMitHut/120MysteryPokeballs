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

// Ergibt sich aus dem unveraenderten Team-Slot-Layout (2 Sitze x 4 Felder x je 1
// Pokemon/Wesen/Faehigkeit/Item + 4 Attacke): ohne diese Mindestanzahl pro Kategorie waeren
// manche Team-Slots nie befuellbar. Wird serverseitig in set_content_pool() identisch geprueft.
export const SLOT_MINIMUMS: Record<Category, number> = {
  pokemon: 8,
  item: 8,
  wesen: 8,
  faehigkeit: 8,
  attacke: 32,
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
