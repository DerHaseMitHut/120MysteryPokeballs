import { useEffect, useMemo, useState } from 'react'
import { BallCell } from './BallCell'
import type { BallWithValue } from '../hooks/useBalls'
import { TOTAL_BALLS } from '../lib/categories'

const PER_PAGE = 20

interface Props {
  balls: Map<number, BallWithValue>
  canDraw: boolean
  onDraw: (number: number) => void
}

export function BallsGrid({ balls, canDraw, onDraw }: Props) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const pageCount = Math.ceil(TOTAL_BALLS / PER_PAGE)
  const numbers = useMemo(() => Array.from({ length: TOTAL_BALLS }, (_, i) => i + 1), [])
  const pageNumbers = numbers.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)

  const highlighted = search ? Number(search) : null

  useEffect(() => {
    if (highlighted && highlighted >= 1 && highlighted <= TOTAL_BALLS) {
      setPage(Math.floor((highlighted - 1) / PER_PAGE))
    }
  }, [highlighted])

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-neutral-900/50 shadow-xl shadow-black/30 backdrop-blur-sm p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-neutral-300">Pokébälle (1–120)</h3>
        <input
          type="number"
          min={1}
          max={120}
          placeholder="Nr. suchen"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-24 rounded-md bg-neutral-950/60 border border-white/10 focus:border-red-500/50 focus:outline-none px-2 py-1 text-sm text-white placeholder:text-neutral-500 transition-colors"
        />
      </div>
      <div className="grid grid-cols-5 gap-2">
        {pageNumbers.map((n) => (
          <div key={n} className={highlighted === n ? 'ring-2 ring-yellow-400 rounded-xl' : undefined}>
            <BallCell number={n} ball={balls.get(n)} canDraw={canDraw} onDraw={onDraw} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-sm">
        <button
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          className="rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 text-neutral-200 transition"
        >
          ← Zurück
        </button>
        <span className="text-neutral-500 text-xs">
          Seite {page + 1} / {pageCount} · Bälle {page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, TOTAL_BALLS)}
        </span>
        <button
          disabled={page === pageCount - 1}
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          className="rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 text-neutral-200 transition"
        >
          Weiter →
        </button>
      </div>
    </div>
  )
}
