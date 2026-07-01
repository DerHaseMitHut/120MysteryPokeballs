import { CATEGORY_COLORS, CATEGORY_LABELS } from '../lib/categories'
import type { BallWithValue } from '../hooks/useBalls'

interface Props {
  ball: BallWithValue
  isMine: boolean
  openerName: string
}

export function RevealBanner({ ball, isMine, openerName }: Props) {
  const known = ball.value != null
  const colorClass = CATEGORY_COLORS[ball.category]

  return (
    <div className="flex items-center justify-center">
      <div
        className={`flex items-center gap-3 rounded-xl border border-white/10 bg-neutral-900 px-4 py-2 shadow-lg animate-[pulse_1.4s_ease-in-out_1]`}
      >
        <span className="text-xs text-neutral-400">Ball #{ball.number} geöffnet von {openerName}</span>
        <span className={`px-2 py-0.5 rounded text-xs font-semibold text-white ${colorClass}`}>
          {CATEGORY_LABELS[ball.category]}
        </span>
        <span className={`text-sm font-bold ${known ? 'text-white' : 'text-neutral-500 italic'}`}>
          {known ? ball.value : 'zensiert'}
        </span>
        {isMine ? (
          <span className="text-xs text-yellow-300">Wähle jetzt einen passenden Slot in deinem Team ↓</span>
        ) : (
          <span className="text-xs text-neutral-500">wird gerade platziert…</span>
        )}
      </div>
    </div>
  )
}
