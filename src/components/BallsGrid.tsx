import { useMemo, useState } from 'react'
import { BallCell } from './BallCell'
import type { BallWithValue } from '../hooks/useBalls'
import { TOTAL_BALLS } from '../lib/categories'

interface Props {
  balls: Map<number, BallWithValue>
  canDraw: boolean
  onDraw: (number: number) => void
}

export function BallsGrid({ balls, canDraw, onDraw }: Props) {
  const [search, setSearch] = useState('')

  const numbers = useMemo(() => Array.from({ length: TOTAL_BALLS }, (_, i) => i + 1), [])
  const highlighted = search ? Number(search) : null

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-neutral-300">Pokébälle (1–120)</h3>
        <input
          type="number"
          min={1}
          max={120}
          placeholder="Nr. suchen"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-28 rounded bg-neutral-800 border border-white/10 px-2 py-1 text-sm text-white placeholder:text-neutral-500"
        />
      </div>
      <div className="grid grid-cols-10 gap-1.5 overflow-y-auto pr-1 max-h-[52vh] auto-rows-min">
        {numbers.map((n) => (
          <div key={n} className={highlighted === n ? 'ring-2 ring-yellow-400 rounded-lg' : undefined}>
            <BallCell number={n} ball={balls.get(n)} canDraw={canDraw} onDraw={onDraw} />
          </div>
        ))}
      </div>
    </div>
  )
}
