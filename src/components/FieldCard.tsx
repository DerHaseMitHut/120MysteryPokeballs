import { FIELD_SLOT_LAYOUT } from '../lib/categories'
import type { TeamSlotWithValue } from '../hooks/useTeamSlots'
import { SlotCell } from './SlotCell'
import type { Category } from '../lib/database.types'

interface Props {
  fieldIndex: number
  slots: TeamSlotWithValue[]
  selectableCategory?: Category | null
  onSelectSlot?: (slotType: Category, slotOrdinal: number) => void
}

export function FieldCard({ fieldIndex, slots, selectableCategory, onSelectSlot }: Props) {
  const byKey = new Map(slots.map((s) => [`${s.slot_type}-${s.slot_ordinal}`, s]))

  return (
    <div className="rounded-lg border border-white/10 bg-neutral-900/40 p-2 flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-neutral-500">Feld {fieldIndex}</span>
      <div className="grid grid-cols-2 gap-1.5">
        {FIELD_SLOT_LAYOUT.map(({ slot_type, slot_ordinal }) => {
          const slot = byKey.get(`${slot_type}-${slot_ordinal}`)
          const selectable = selectableCategory === slot_type && !!onSelectSlot
          return (
            <SlotCell
              key={`${slot_type}-${slot_ordinal}`}
              slotType={slot_type}
              value={slot?.value ?? null}
              filled={!!slot?.filled_ball_id}
              selectable={selectable}
              onSelect={selectable ? () => onSelectSlot!(slot_type, slot_ordinal) : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}
