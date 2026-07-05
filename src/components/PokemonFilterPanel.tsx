import { EMPTY_POKEMON_FILTERS, type PokemonFilters } from '../lib/poolResolution'
import type { EvolutionStage } from '../lib/masterData'

const GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

const TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
]
const TYPE_LABELS_DE: Record<string, string> = {
  normal: 'Normal', fire: 'Feuer', water: 'Wasser', electric: 'Elektro', grass: 'Pflanze',
  ice: 'Eis', fighting: 'Kampf', poison: 'Gift', ground: 'Boden', flying: 'Flug',
  psychic: 'Psycho', bug: 'Käfer', rock: 'Gestein', ghost: 'Geist', dragon: 'Drache',
  dark: 'Unlicht', steel: 'Stahl', fairy: 'Fee',
}

const STAGE_OPTIONS: { value: EvolutionStage; label: string }[] = [
  { value: 'baby', label: 'Baby' },
  { value: 'first_stage', label: 'Erste Stufe' },
  { value: 'middle_stage', label: 'Mittelstufe' },
  { value: 'not_fully_evolved', label: 'Nicht vollentwickelt' },
  { value: 'fully_evolved', label: 'Vollentwickelt' },
  { value: 'no_evolution', label: 'Entwicklungslos' },
]

const TRI_STATE_OPTIONS: { value: 'include' | 'exclude' | 'only'; label: string }[] = [
  { value: 'include', label: 'Egal' },
  { value: 'exclude', label: 'Nein' },
  { value: 'only', label: 'Nur' },
]

interface Props {
  value: PokemonFilters
  onChange: (value: PokemonFilters) => void
}

function chipClass(active: boolean): string {
  return `rounded-lg px-2.5 py-1 text-xs border transition ${
    active ? 'border-yellow-400 bg-yellow-400/10 text-yellow-300' : 'border-white/10 text-neutral-300 hover:bg-neutral-800'
  }`
}

export function PokemonFilterPanel({ value, onChange }: Props) {
  function toggleGeneration(g: number) {
    const next = value.generations.includes(g) ? value.generations.filter((x) => x !== g) : [...value.generations, g]
    onChange({ ...value, generations: next })
  }
  function toggleType(t: string) {
    const next = value.types.includes(t) ? value.types.filter((x) => x !== t) : [...value.types, t]
    onChange({ ...value, types: next })
  }
  function toggleStage(s: EvolutionStage) {
    const next = value.stages.includes(s) ? value.stages.filter((x) => x !== s) : [...value.stages, s]
    onChange({ ...value, stages: next })
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-white/10 bg-neutral-950/30 p-3">
      <div>
        <div className="text-xs font-semibold text-neutral-400 mb-1">Generation</div>
        <div className="flex flex-wrap gap-1.5">
          {GENERATIONS.map((g) => (
            <button key={g} type="button" onClick={() => toggleGeneration(g)} className={chipClass(value.generations.includes(g))}>
              {g}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-neutral-400 mb-1">Typ</div>
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <button key={t} type="button" onClick={() => toggleType(t)} className={chipClass(value.types.includes(t))}>
              {TYPE_LABELS_DE[t]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-neutral-400 mb-1">Entwicklungsstufe</div>
        <div className="flex flex-wrap gap-1.5">
          {STAGE_OPTIONS.map((s) => (
            <button key={s.value} type="button" onClick={() => toggleStage(s.value)} className={chipClass(value.stages.includes(s.value))}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-5">
        <div>
          <div className="text-xs font-semibold text-neutral-400 mb-1">Legendär</div>
          <div className="flex gap-1.5">
            {TRI_STATE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange({ ...value, legendary: o.value })}
                className={chipClass(value.legendary === o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-neutral-400 mb-1">Mystisch</div>
          <div className="flex gap-1.5">
            {TRI_STATE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange({ ...value, mythical: o.value })}
                className={chipClass(value.mythical === o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-neutral-400 mb-1">Statuswerte-Summe (BST)</div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={value.bstMin ?? ''}
              onChange={(e) => onChange({ ...value, bstMin: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="Min"
              className="w-20 rounded-md bg-neutral-950/60 border border-white/10 focus:border-red-500/50 focus:outline-none px-2 py-1 text-xs text-white placeholder:text-neutral-500"
            />
            <span className="text-neutral-500 text-xs">–</span>
            <input
              type="number"
              value={value.bstMax ?? ''}
              onChange={(e) => onChange({ ...value, bstMax: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="Max"
              className="w-20 rounded-md bg-neutral-950/60 border border-white/10 focus:border-red-500/50 focus:outline-none px-2 py-1 text-xs text-white placeholder:text-neutral-500"
            />
          </div>
        </div>
        {(value.generations.length > 0 ||
          value.types.length > 0 ||
          value.stages.length > 0 ||
          value.legendary !== 'include' ||
          value.mythical !== 'include' ||
          value.bstMin != null ||
          value.bstMax != null) && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_POKEMON_FILTERS)}
            className="self-end text-xs text-neutral-400 hover:text-neutral-200 underline underline-offset-2"
          >
            Filter zurücksetzen
          </button>
        )}
      </div>
    </div>
  )
}
