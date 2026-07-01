import type { TeamSlotWithValue } from '../hooks/useTeamSlots'
import { SlotCell } from './SlotCell'
import { PokemonSlot } from './PokemonSlot'
import type { Category } from '../lib/database.types'

interface Props {
  fieldIndex: number
  slots: TeamSlotWithValue[]
  selectableCategory?: Category | null
  onSelectSlot?: (slotType: Category, slotOrdinal: number) => void
}

export function FieldCard({ fieldIndex, slots, selectableCategory, onSelectSlot }: Props) {
  const byKey = new Map(slots.map((s) => [`${s.slot_type}-${s.slot_ordinal}`, s]))

  function slotProps(slotType: Category, slotOrdinal: number) {
    const slot = byKey.get(`${slotType}-${slotOrdinal}`)
    const selectable = selectableCategory === slotType && !!onSelectSlot
    return {
      value: slot?.value ?? null,
      filled: !!slot?.filled_ball_id,
      selectable,
      onSelect: selectable ? () => onSelectSlot!(slotType, slotOrdinal) : undefined,
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
