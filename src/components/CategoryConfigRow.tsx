import { useMemo } from 'react'
import { CATEGORY_LABELS, SLOT_MINIMUMS } from '../lib/categories'
import type { Category } from '../lib/database.types'
import { ATTACKEN_MASTER, FAEHIGKEITEN_MASTER, ITEMS_MASTER, POKEMON_MASTER, WESEN_MASTER } from '../lib/masterData'
import type { AttackeMasterEntry, PokemonMasterEntry } from '../lib/masterData'
import {
  applyPokemonFilters,
  DEFAULT_ATTACKE_FILTERS,
  EMPTY_POKEMON_FILTERS,
  type CategoryConfig,
} from '../lib/poolResolution'
import { SearchableChecklist } from './SearchableChecklist'
import { PokemonFilterPanel } from './PokemonFilterPanel'
import { AttackeFilterPanel } from './AttackeFilterPanel'

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

interface Props {
  category: Category
  config: CategoryConfig
  onChange: (config: CategoryConfig) => void
}

export function CategoryConfigRow({ category, config, onChange }: Props) {
  const isPokemon = category === 'pokemon'
  const isAttacke = category === 'attacke'

  const filteredItems = useMemo<(string | PokemonMasterEntry | AttackeMasterEntry)[]>(() => {
    if (isPokemon) return applyPokemonFilters(POKEMON_MASTER, config.pokemonFilters ?? EMPTY_POKEMON_FILTERS)
    if (isAttacke) return ATTACKEN_MASTER
    return flatMasterFor(category as 'item' | 'wesen' | 'faehigkeit')
  }, [isPokemon, isAttacke, category, config.pokemonFilters])

  const selected = useMemo(() => new Set(config.manualSelection), [config.manualSelection])

  function itemKey(item: string | PokemonMasterEntry | AttackeMasterEntry): string {
    return typeof item === 'string' ? item : item.name
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-white/10 bg-neutral-900/40 p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm font-semibold text-neutral-200">{CATEGORY_LABELS[category]}</span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-neutral-400">
            Anzahl
            <input
              type="number"
              min={SLOT_MINIMUMS[category]}
              value={config.count}
              onChange={(e) => onChange({ ...config, count: Number(e.target.value) })}
              className="w-16 rounded-md bg-neutral-950/60 border border-white/10 focus:border-red-500/50 focus:outline-none px-2 py-1 text-sm text-white"
            />
          </label>
          <div className="flex gap-1">
            {(['random', 'manual'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChange({ ...config, mode: m })}
                className={`rounded-lg px-3 py-1 text-xs border transition ${
                  config.mode === m
                    ? 'border-yellow-400 bg-yellow-400/10 text-yellow-300'
                    : 'border-white/10 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {m === 'random' ? 'Zufällig' : 'Manuell'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isPokemon && (
        <PokemonFilterPanel
          value={config.pokemonFilters ?? EMPTY_POKEMON_FILTERS}
          onChange={(pokemonFilters) => onChange({ ...config, pokemonFilters })}
        />
      )}

      {isAttacke && (
        <AttackeFilterPanel
          value={config.attackeFilters ?? DEFAULT_ATTACKE_FILTERS}
          onChange={(attackeFilters) => onChange({ ...config, attackeFilters })}
        />
      )}

      {config.mode === 'manual' && (
        <>
          <span className="text-xs text-neutral-500">
            {config.manualSelection.length} ausgewählt · {filteredItems.length} verfügbar{isPokemon ? ' (nach Filter)' : ''}
          </span>
          <SearchableChecklist
            items={filteredItems}
            getKey={itemKey}
            getLabel={itemKey}
            selected={selected}
            onChange={(next) => onChange({ ...config, manualSelection: [...next] })}
          />
        </>
      )}
    </div>
  )
}
