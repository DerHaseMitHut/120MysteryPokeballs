import dexToNameDe from './pokemonNamesDe.json'

// Eigene, lokal mitgelieferte Sprites (public/pokemon/{dexnummer}.png) statt eines Live-Abrufs
// bei PokeAPI — dexToNameDe.json wurde einmalig per PokeAPI-Skript erzeugt (deutsche Namen fuer
// Dex 1-1025) und bildet zusammen mit dem Sprite-Ordner die Grundlage fuer die Zuordnung.
const nameToDex = new Map<string, string>()
for (const [dex, name] of Object.entries(dexToNameDe as Record<string, string>)) {
  nameToDex.set(normalize(name), dex)
}

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

export function getPokemonSpriteUrl(name: string | null | undefined): string | null {
  if (!name) return null
  const dex = nameToDex.get(normalize(name))
  return dex ? `/pokemon/${dex}.png` : null
}

// Bewusst kein Async-Hook mehr: die Zuordnung ist rein lokal und synchron (keine Netzwerk-
// Abhaengigkeit waehrend des Spiels). Name beibehalten, damit bestehende Aufrufer unveraendert
// bleiben.
export function usePokemonSprite(name: string | null | undefined): string | null {
  return getPokemonSpriteUrl(name)
}
