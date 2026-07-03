import { FieldCard } from './FieldCard'
import { EditableName } from './EditableName'
import type { TeamSlotWithValue } from '../hooks/useTeamSlots'
import type { Category, Seat } from '../lib/database.types'

interface Props {
  seat: Seat
  displayName: string
  locked: boolean
  isYourTurn: boolean
  slots: TeamSlotWithValue[]
  selectableCategory?: Category | null
  onSelectSlot?: (fieldIndex: number, slotType: Category, slotOrdinal: number) => void
  align?: 'left' | 'right'
  editable?: boolean
  onRename?: (name: string) => Promise<unknown>
}

export function TeamPanel({
  seat,
  displayName,
  locked,
  isYourTurn,
  slots,
  selectableCategory,
  onSelectSlot,
  align = 'left',
  editable = false,
  onRename,
}: Props) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border p-3.5 w-full shadow-xl shadow-black/30 backdrop-blur-sm transition-colors
        ${isYourTurn ? 'border-yellow-400/70 bg-yellow-400/5 shadow-yellow-500/10' : 'border-white/10 bg-neutral-900/50'}`}
    >
      <div className={`flex items-center gap-2 px-0.5 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
        {editable && onRename ? (
          <EditableName
            value={displayName}
            placeholder={`Teilnehmer ${seat}`}
            onSave={onRename}
            className="font-semibold text-lg text-white hover:text-yellow-300 underline decoration-dotted decoration-neutral-500 underline-offset-4 transition-colors"
          />
        ) : (
          <span className="font-semibold text-lg text-white">{displayName || `Teilnehmer ${seat}`}</span>
        )}
        {locked && (
          <span className="text-[10px] uppercase tracking-wide bg-neutral-700 text-neutral-300 px-1.5 py-0.5 rounded">
            gelockt
          </span>
        )}
        {isYourTurn && !locked && (
          <span className="text-[10px] uppercase tracking-wide bg-yellow-500 text-black px-1.5 py-0.5 rounded">
            am Zug
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((fieldIndex) => (
          <FieldCard
            key={fieldIndex}
            fieldIndex={fieldIndex}
            slots={slots.filter((s) => s.field_index === fieldIndex)}
            selectableCategory={selectableCategory}
            onSelectSlot={
              onSelectSlot
                ? (slotType, slotOrdinal) => onSelectSlot(fieldIndex, slotType, slotOrdinal)
                : undefined
            }
          />
        ))}
      </div>
    </div>
  )
}
