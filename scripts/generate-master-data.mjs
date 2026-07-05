// Einmaliges Skript: generiert die Pokemon/Attacken/Faehigkeiten/Items/Wesen-Stammdaten aus PokeAPI.
// Aufruf: node scripts/generate-master-data.mjs
// Schreibt src/lib/masterData/*.json, laedt fehlende Sprites nach public/pokemon/ und erzeugt
// (fuer den manuellen Review-Checkpoint) pokemon-review.csv.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'src', 'lib', 'masterData')
const SPRITE_DIR = join(ROOT, 'public', 'pokemon')
const NAMES_DE_PATH = join(ROOT, 'src', 'lib', 'pokemonNamesDe.json')

const API = 'https://pokeapi.co/api/v2'
const CONCURRENCY = 24
const MAX_DEX = 1025
const REGIONAL_FORMS = ['alola', 'galar', 'hisui', 'paldea']
const FORM_LABEL_DE = { alola: 'Alola', galar: 'Galar', hisui: 'Hisui', paldea: 'Paldea' }
// Generation, in der die jeweilige Regionalform eingefuehrt wurde. Hisui->Gen 8 ist eine
// Konvention (Legends: Arceus erschien zwischen Gen 8 und 9) -- als Annahme im CSV markiert.
const REGIONAL_FORM_GENERATION = { alola: 7, galar: 8, hisui: 8, paldea: 9 }
const GENERATION_NUMBER = {
  'generation-i': 1, 'generation-ii': 2, 'generation-iii': 3, 'generation-iv': 4,
  'generation-v': 5, 'generation-vi': 6, 'generation-vii': 7, 'generation-viii': 8, 'generation-ix': 9,
}

async function fetchJson(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      return await res.json()
    } catch (err) {
      if (attempt === retries) throw err
      await new Promise((r) => setTimeout(r, 300 * attempt))
    }
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function germanName(namesArray, fallback) {
  const entry = namesArray?.find((n) => n.language.name === 'de')
  return entry?.name ?? fallback
}

function csvEscape(value) {
  const s = String(value ?? '')
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function downloadSpriteIfMissing(fileName, pokemonDetail) {
  const filePath = join(SPRITE_DIR, fileName)
  if (existsSync(filePath)) return `/pokemon/${fileName}`
  const url = pokemonDetail?.sprites?.other?.['official-artwork']?.front_default
    ?? pokemonDetail?.sprites?.front_default
    ?? null
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(filePath, buf)
    return `/pokemon/${fileName}`
  } catch {
    return null
  }
}

async function main() {
  console.log('Lade deutsche Namensliste...')
  const namesDe = JSON.parse(readFileSync(NAMES_DE_PATH, 'utf-8'))

  const testDex = process.env.TEST_DEX?.split(',').map(Number)
  console.log(`Lade ${testDex ? testDex.length : MAX_DEX} Pokemon-Species...`)
  const dexIds = testDex ?? Array.from({ length: MAX_DEX }, (_, i) => i + 1)
  const evolutionChainCache = new Map()

  async function getEvolutionStage(chainUrl, speciesName, isBaby) {
    if (isBaby) return 'baby'
    let chain = evolutionChainCache.get(chainUrl)
    if (!chain) {
      chain = await fetchJson(chainUrl)
      evolutionChainCache.set(chainUrl, chain)
    }
    function findNode(node, parent) {
      if (node.species.name === speciesName) return { node, parent }
      for (const child of node.evolves_to) {
        const found = findNode(child, node)
        if (found) return found
      }
      return null
    }
    function forwardDepth(node) {
      if (node.evolves_to.length === 0) return 0
      return 1 + Math.max(...node.evolves_to.map(forwardDepth))
    }
    const result = findNode(chain.chain, null)
    if (!result) return 'not_fully_evolved' // sollte nicht vorkommen, konservativer Fallback
    const { node, parent } = result

    // Eine Baby-Vorstufe (z.B. Pichu vor Pikachu) zaehlt NICHT als "echte" Vorentwicklung fuer
    // die middle_stage-Einstufung -- Pikachu/Marill/Chansey etc. bleiben bei not_fully_evolved
    // statt middle_stage, obwohl sie eine Baby-Vorstufe haben (Absprache mit dem Host).
    let hasPreEvolution = parent !== null
    if (hasPreEvolution && parent === chain.chain && (await isBabySpecies(chain.chain.species.name))) {
      hasPreEvolution = false
    }

    const remaining = forwardDepth(node) // wie oft sich dieses Pokemon noch weiterentwickelt

    if (remaining === 0) return hasPreEvolution ? 'fully_evolved' : 'no_evolution'
    if (remaining === 1) return hasPreEvolution ? 'middle_stage' : 'not_fully_evolved'
    return 'first_stage' // remaining >= 2 (Wurzel einer 3er-Entwicklungsreihe)
  }

  const babySpeciesCache = new Map()
  async function isBabySpecies(speciesName) {
    if (!babySpeciesCache.has(speciesName)) {
      const s = await fetchJson(`${API}/pokemon-species/${speciesName}`)
      babySpeciesCache.set(speciesName, s.is_baby)
    }
    return babySpeciesCache.get(speciesName)
  }

  const pokemonEntries = []

  await mapLimit(dexIds, CONCURRENCY, async (dex) => {
    const species = await fetchJson(`${API}/pokemon-species/${dex}`)
    const generation = GENERATION_NUMBER[species.generation.name] ?? 0
    const stage = await getEvolutionStage(species.evolution_chain.url, species.name, species.is_baby)
    const baseName = namesDe[String(dex)] ?? germanName(species.names, species.name)

    const defaultVariety = species.varieties.find((v) => v.is_default) ?? species.varieties[0]
    const basePokemon = await fetchJson(defaultVariety.pokemon.url)
    const baseSpriteFile = `${dex}.png`
    await downloadSpriteIfMissing(baseSpriteFile, basePokemon) // No-Op, falls Datei schon existiert

    const baseEntry = {
      dex,
      formSlug: null,
      name: baseName,
      types: basePokemon.types.map((t) => t.type.name),
      generation,
      evolutionStage: stage,
      legendary: species.is_legendary,
      mythical: species.is_mythical,
      baby: species.is_baby,
      bst: basePokemon.stats.reduce((sum, s) => sum + s.base_stat, 0),
      forms: [{ name: baseName, sprite: `/pokemon/${baseSpriteFile}` }],
      flag: '',
    }
    // Vollstaendiges Statuswerte-Profil (nicht nur Summe) fuer den Cosmetic-vs-Kampfform-Vergleich
    // unten -- Deoxys/Giratina-Formen haben z.B. identische BST-Summe, aber andere Verteilung.
    const baseStatsProfile = basePokemon.stats.map((s) => s.base_stat).join(',')

    const regionalEntries = []

    for (const variety of species.varieties) {
      if (variety.is_default) continue
      const varietyName = variety.pokemon.name
      const slug = varietyName.startsWith(`${species.name}-`)
        ? varietyName.slice(species.name.length + 1)
        : varietyName

      if (/mega|gmax|gigantamax|primal|eternamax|totem|power-construct/.test(varietyName)) continue // ausdruecklich ausgeschlossen

      const regionalMatch = REGIONAL_FORMS.find((f) => varietyName.endsWith(`-${f}`))
      if (regionalMatch) {
        const formPokemon = await fetchJson(variety.pokemon.url)
        const spriteFile = `${dex}-${regionalMatch}.png`
        const sprite = await downloadSpriteIfMissing(spriteFile, formPokemon)
        const synthName = `${FORM_LABEL_DE[regionalMatch]}-${baseName}`
        regionalEntries.push({
          dex,
          formSlug: regionalMatch,
          name: synthName,
          types: formPokemon.types.map((t) => t.type.name),
          generation: REGIONAL_FORM_GENERATION[regionalMatch],
          evolutionStage: stage,
          legendary: species.is_legendary,
          mythical: species.is_mythical,
          baby: species.is_baby,
          bst: formPokemon.stats.reduce((sum, s) => sum + s.base_stat, 0),
          forms: [{ name: synthName, sprite }],
          flag: `synthetisierter Name; Generation="Einfuehrung der Regionalform" (${regionalMatch}->Gen ${REGIONAL_FORM_GENERATION[regionalMatch]}), nicht Basis-Generation${sprite ? '' : '; KEIN SPRITE GEFUNDEN'}`,
        })
        continue
      }

      // Nur "echte" Alternativformen mit abweichenden Werten/Typ (z.B. Deoxys, Rotom, Giratina,
      // Kyurem, ...) aufnehmen -- rein kosmetische Formen ohne Werte-/Typunterschied (z.B.
      // Pikachu-Kostueme/-Kappen, Unown, Vivillon, Alcremie) werden bewusst NICHT aufgenommen,
      // da sie keine eigene "forms"-Option sein sollen (Absprache: nur echte Kampfformen).
      const formPokemon = await fetchJson(variety.pokemon.url)
      const formTypes = formPokemon.types.map((t) => t.type.name)
      const formStatsProfile = formPokemon.stats.map((s) => s.base_stat).join(',')
      const sameTypes = formTypes.length === baseEntry.types.length && formTypes.every((t) => baseEntry.types.includes(t))
      if (sameTypes && formStatsProfile === baseStatsProfile) continue // rein kosmetisch, keine Werte-/Typaenderung

      let label = null
      const formResourceUrl = formPokemon.forms?.[0]?.url
      if (formResourceUrl) {
        const formDetail = await fetchJson(formResourceUrl)
        label = germanName(formDetail.names, null) ?? germanName(formDetail.form_names, null)
      }
      let labelFlag = ''
      let displayName
      if (label && label.toLowerCase().includes(baseName.toLowerCase())) {
        displayName = label // PokeAPI liefert oft schon einen vollstaendigen Namen (z.B. "Wasch-Rotom")
      } else if (label) {
        displayName = `${baseName} (${label})`
      } else {
        const fallbackLabel = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ')
        displayName = `${baseName} (${fallbackLabel})`
        labelFlag = `kein dt. Formname gefunden, Fallback aus Slug ("${slug}")`
      }
      const spriteFile = `${dex}-${slug}.png`
      const sprite = await downloadSpriteIfMissing(spriteFile, formPokemon)
      baseEntry.forms.push({ name: displayName, sprite })
      if (labelFlag || !sprite) {
        baseEntry.flag = [baseEntry.flag, labelFlag, sprite ? '' : `KEIN SPRITE fuer Form "${slug}"`]
          .filter(Boolean)
          .join('; ')
      }
    }

    pokemonEntries.push(baseEntry, ...regionalEntries)
  })

  pokemonEntries.sort((a, b) => a.dex - b.dex || (a.formSlug ?? '').localeCompare(b.formSlug ?? ''))

  // Namens-Eindeutigkeit pruefen (wichtig fuer Sprite-/Wert-Lookup nach Name)
  const allNames = pokemonEntries.flatMap((e) => e.forms.map((f) => f.name))
  const nameCounts = new Map()
  for (const n of allNames) nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1)
  for (const e of pokemonEntries) {
    if (e.forms.some((f) => nameCounts.get(f.name) > 1)) {
      e.flag = (e.flag ? e.flag + '; ' : '') + 'NAMENSKOLLISION -- manuell pruefen'
    }
  }

  console.log(`Pokemon-Eintraege (Basis+Regionalformen): ${pokemonEntries.length}`)
  console.log(`Davon mit alternativen Kampfformen (>1 forms-Eintrag): ${pokemonEntries.filter((e) => e.forms.length > 1).length}`)

  if (testDex) {
    console.log(JSON.stringify(pokemonEntries, null, 2))
    return
  }

  // Attacken/Faehigkeiten/Items/Wesen werden NICHT automatisch generiert -- der Host liefert
  // dafuer eine eigene, kuratierte Liste (Absprache: PokeAPI-Rohdaten enthalten Dubletten und
  // fuer dieses Spiel irrelevante Eintraege).

  // --- Schreiben ---
  mkdirSync(OUT_DIR, { recursive: true })
  mkdirSync(SPRITE_DIR, { recursive: true })
  // eslint-disable-next-line no-unused-vars -- flag ist nur fuer die CSV gedacht, nicht fuer die JSON-Ausgabe
  const pokemonOut = pokemonEntries.map(({ flag: _flag, ...rest }) => rest)
  writeFileSync(join(OUT_DIR, 'pokemon.json'), JSON.stringify(pokemonOut, null, 0))

  const csvHeader = 'dex;formSlug;name;types;generation;evolutionStage;legendary;mythical;baby;bst;alternativeForms;flag'
  const csvRows = pokemonEntries.map((e) =>
    [
      e.dex,
      e.formSlug ?? '',
      e.name,
      e.types.join('/'),
      e.generation,
      e.evolutionStage,
      e.legendary,
      e.mythical,
      e.baby,
      e.bst,
      e.forms.slice(1).map((f) => f.name).join(' | '),
      e.flag,
    ]
      .map(csvEscape)
      .join(';'),
  )
  writeFileSync(join(ROOT, 'pokemon-review.csv'), '﻿' + [csvHeader, ...csvRows].join('\n'), 'utf-8')

  console.log('\nFertig. Bitte pokemon-review.csv (im Projekt-Root) kontrollieren, bevor es weitergeht.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
