import type { TeamSlotWithValue } from '../hooks/useTeamSlots'
import { SlotCell } from './SlotCell'
import { PokemonSlot } from './PokemonSlot'
import type { Category } from '../lib/database.types'

// Zielauswahl fuer einen aktiv "scharf geschalteten" Joker (siehe GameScreen). Wondertrade zielt
// auf ein bereits platziertes Pokemon (eigenes ODER gegnerisches); Wechsel zielt auf zwei
// gleichartige Slots im EIGENEN Team (ownTeam steuert, ob dieses FieldCard-Team ueberhaupt in
// Frage kommt) und merkt sich den ersten gewaehlten Slot, bis der zweite gewaehlt wird.
export type JokerFieldMode =
  | { kind: 'wondertrade'; onPickPokemon: (ballId: string) => void }
  | {
      kind: 'wechsel'
      ownTeam: boolean
      firstSlotId: string | null
      firstSlotType: Category | null
      onPickSlot: (slotId: string, slotType: Category) => void
    }

interface Props {
  fieldIndex: number
  slots: TeamSlotWithValue[]
  selectableCategory?: Category | null
  onSelectSlot?: (slotType: Category, slotOrdinal: number) => void
  jokerMode?: JokerFieldMode | null
}

export function FieldCard({ fieldIndex, slots, selectableCategory, onSelectSlot, jokerMode }: Props) {
  const byKey = new Map(slots.map((s) => [`${s.slot_type}-${s.slot_ordinal}`, s]))

  function slotProps(slotType: Category, slotOrdinal: number) {
    const slot = byKey.get(`${slotType}-${slotOrdinal}`)
    let selectable = selectableCategory === slotType && !!onSelectSlot
    let onSelect = selectable ? () => onSelectSlot!(slotType, slotOrdinal) : undefined
    let accent: 'yellow' | 'pink' = 'yellow'
    let selected = false

    if (jokerMode?.kind === 'wondertrade' && slotType === 'pokemon' && slot?.filled_ball_id) {
      const ballId = slot.filled_ball_id
      selectable = true
      accent = 'pink'
      onSelect = () => jokerMode.onPickPokemon(ballId)
    } else if (jokerMode?.kind === 'wechsel' && jokerMode.ownTeam && slot) {
      const matchesType = jokerMode.firstSlotType == null || jokerMode.firstSlotType === slotType
      if (matchesType) {
        const slotId = slot.id
        selectable = true
        accent = 'pink'
        selected = jokerMode.firstSlotId === slotId
        onSelect = () => jokerMode.onPickSlot(slotId, slotType)
      }
    }

    return {
      value: slot?.value ?? null,
      filled: !!slot?.filled_ball_id,
      ballId: slot?.filled_ball_id ?? null,
      selectable,
      onSelect,
      accent,
      selected,
    }
  }

  return (
    <div className="relative rounded-lg bg-neutral-950/30 p-2.5 flex flex-col gap-2.5">
      <span className="absolute top-1 right-1.5 text-[9px] text-neutral-600 leading-none z-10">{fieldIndex}</span>

      <div className="grid grid-cols-2 gap-2 items-stretch">
        <PokemonSlot {...slotProps('pokemon', 1)} />
        <div className="flex flex-col gap-1.5 min-w-0">
          <SlotCell slotType="faehigkeit" {...slotProps('faehigkeit', 1)} />
          <SlotCell slotType="wesen" {...slotProps('wesen', 1)} />
          <SlotCell slotType="item" {...slotProps('item', 1)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SlotCell slotType="attacke" {...slotProps('attacke', 1)} />
        <SlotCell slotType="attacke" {...slotProps('attacke', 2)} />
        <SlotCell slotType="attacke" {...slotProps('attacke', 3)} />
        <SlotCell slotType="attacke" {...slotProps('attacke', 4)} />
      </div>
    </div>
  )
}
