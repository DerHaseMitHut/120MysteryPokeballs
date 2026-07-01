import { CATEGORY_COLORS, CATEGORY_LABELS } from '../lib/categories'
import type { BallWithValue } from '../hooks/useBalls'

interface Props {
  number: number
  ball: BallWithValue | undefined
  canDraw: boolean
  onDraw: (number: number) => void
}

export function BallCell({ number, ball, canDraw, onDraw }: Props) {
  const opened = ball?.opened ?? false

  if (!opened) {
    return (
      <button
        type="button"
        disabled={!canDraw}
        onClick={() => onDraw(number)}
        className={`aspect-square rounded-lg border text-sm font-semibold flex items-center justify-center transition
          ${
            canDraw
              ? 'border-red-500/60 bg-gradient-to-b from-red-600 to-red-800 hover:brightness-110 cursor-pointer text-white shadow'
              : 'border-white/10 bg-neutral-800 text-neutral-500 cursor-not-allowed'
          }`}
        title={canDraw ? `Ball #${number} öffnen` : `Ball #${number}`}
      >
        {number}
      </button>
    )
  }

  const known = ball?.value != null
  const label = known ? ball!.value! : CATEGORY_LABELS[ball!.category]
  const colorClass = CATEGORY_COLORS[ball!.category]

  return (
    <div
      className={`aspect-square rounded-lg border border-white/10 ${colorClass}/30 bg-neutral-900 text-[10px] leading-tight
        flex flex-col items-center justify-center gap-0.5 p-1 text-center`}
      title={`Ball #${number} — ${CATEGORY_LABELS[ball!.category]}${known ? ': ' + label : ' (zensiert)'}`}
    >
      <span className="text-neutral-500">#{number}</span>
      <span className={`px-1 rounded ${colorClass} text-white text-[9px] font-semibold`}>
        {CATEGORY_LABELS[ball!.category]}
      </span>
      <span className={`truncate w-full ${known ? 'text-white font-medium' : 'text-neutral-500 italic'}`}>
        {known ? label : 'zensiert'}
      </span>
    </div>
  )
}
