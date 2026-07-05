import { POKEMON_MASTER } from './masterData'

// Name -> Sprite-Pfad, aus den Stammdaten aufgebaut (deckt Basisformen, Regionalformen und
// alternative Kampfformen wie Deoxys/Rotom/Kyurem ab, jeweils mit ihrem eigenen Bild). Rein lokal
// und synchron (keine Netzwerk-Abhaengigkeit waehrend des Spiels) -- Sprites liegen als statische
// Dateien unter public/pokemon/, einmalig per PokeAPI-Skript (scripts/generate-master-data.mjs)
// heruntergeladen.
const nameToSprite = new Map<string, string | null>()
for (const entry of POKEMON_MASTER) {
  for (const form of entry.forms) {
    nameToSprite.set(normalize(form.name), form.sprite)
  }
}

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

export function getPokemonSpriteUrl(name: string | null | undefined): string | null {
  if (!name) return null
  return nameToSprite.get(normalize(name)) ?? null
}

// Bewusst kein Async-Hook: die Zuordnung ist rein lokal und synchron. Name beibehalten, damit
// bestehende Aufrufer unveraendert bleiben.
export function usePokemonSprite(name: string | null | undefined): string | null {
  return getPokemonSpriteUrl(name)
}
