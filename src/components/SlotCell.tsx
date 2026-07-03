import { CATEGORY_COLORS, CATEGORY_FILLED_STYLE, CATEGORY_LABELS } from '../lib/categories'
import { useFlashOnChange } from '../hooks/useFlashOnChange'
import type { Category } from '../lib/database.types'

interface Props {
  slotType: Category
  value: string | null
  filled: boolean
  ballId?: string | null
  selectable?: boolean
  onSelect?: () => void
}

export function SlotCell({ slotType, value, filled, ballId = null, selectable, onSelect }: Props) {
  const colorClass = CATEGORY_COLORS[slotType]
  const flashing = useFlashOnChange(ballId)

  const content = !filled ? (
    <span className="text-neutral-600 italic leading-tight">leer</span>
  ) : value != null ? (
    <span className="text-white font-medium truncate leading-tight w-full">{value}</span>
  ) : (
    <span className="text-neutral-400 italic leading-tight">zensiert</span>
  )

  const stateClass = selectable
    ? 'border-yellow-400 bg-neutral-800 hover:bg-neutral-700 cursor-pointer'
    : filled
      ? `${CATEGORY_FILLED_STYLE[slotType]} cursor-default`
      : 'border-white/10 bg-neutral-900/60 cursor-default'

  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={onSelect}
      className={`w-full rounded-md border px-3 py-2.5 min-h-[3.75rem] text-sm flex flex-col items-start justify-center gap-1 text-left transition ${stateClass} ${flashing ? 'slot-flash' : ''}`}
    >
      <span className={`px-1 rounded ${colorClass} text-white text-[9px] font-semibold leading-tight`}>
        {CATEGORY_LABELS[slotType]}
      </span>
      {content}
    </button>
  )
}
