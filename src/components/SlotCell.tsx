import { CATEGORY_COLORS, CATEGORY_LABELS } from '../lib/categories'
import type { Category } from '../lib/database.types'

interface Props {
  slotType: Category
  value: string | null
  filled: boolean
  selectable?: boolean
  onSelect?: () => void
}

export function SlotCell({ slotType, value, filled, selectable, onSelect }: Props) {
  const colorClass = CATEGORY_COLORS[slotType]

  const content = !filled ? (
    <span className="text-neutral-600 italic">leer</span>
  ) : value != null ? (
    <span className="text-white font-medium truncate">{value}</span>
  ) : (
    <span className="text-neutral-500 italic">zensiert</span>
  )

  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={onSelect}
      className={`w-full rounded-md border px-2 py-1.5 text-xs flex flex-col items-start gap-0.5 text-left transition
        ${
          selectable
            ? 'border-yellow-400 bg-neutral-800 hover:bg-neutral-700 cursor-pointer'
            : 'border-white/10 bg-neutral-900/60 cursor-default'
        }`}
    >
      <span className={`px-1 rounded ${colorClass} text-white text-[9px] font-semibold`}>
        {CATEGORY_LABELS[slotType]}
      </span>
      {content}
    </button>
  )
}
