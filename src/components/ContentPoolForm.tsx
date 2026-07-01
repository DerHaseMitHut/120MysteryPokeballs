import { useMemo, useState } from 'react'
import { CATEGORY_LABELS, CATEGORY_ORDER, POOL_REQUIREMENTS } from '../lib/categories'
import type { Category } from '../lib/database.types'

interface Props {
  onSubmit: (pool: { category: Category; value: string }[]) => void
  busy: boolean
  error: string | null
}

function parseLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

export function ContentPoolForm({ onSubmit, busy, error }: Props) {
  const [texts, setTexts] = useState<Record<Category, string>>({
    pokemon: '',
    item: '',
    wesen: '',
    faehigkeit: '',
    attacke: '',
  })

  const counts = useMemo(() => {
    const result: Record<Category, number> = { pokemon: 0, item: 0, wesen: 0, faehigkeit: 0, attacke: 0 }
    for (const cat of CATEGORY_ORDER) result[cat] = parseLines(texts[cat]).length
    return result
  }, [texts])

  const allValid = CATEGORY_ORDER.every((cat) => counts[cat] === POOL_REQUIREMENTS[cat])

  function handleSubmit() {
    const pool: { category: Category; value: string }[] = []
    for (const cat of CATEGORY_ORDER) {
      for (const value of parseLines(texts[cat])) pool.push({ category: cat, value })
    }
    onSubmit(pool)
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-neutral-400">
        Trage pro Kategorie jeweils einen Wert pro Zeile ein. Diese 120 Werte werden beim Spielstart zufällig auf
        die Pokébälle verteilt.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CATEGORY_ORDER.map((cat) => {
          const required = POOL_REQUIREMENTS[cat]
          const count = counts[cat]
          const ok = count === required
          return (
            <div key={cat} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-neutral-200">{CATEGORY_LABELS[cat]}</label>
                <span className={`text-xs font-mono ${ok ? 'text-emerald-400' : 'text-neutral-400'}`}>
                  {count}/{required}
                </span>
              </div>
              <textarea
                value={texts[cat]}
                onChange={(e) => setTexts((prev) => ({ ...prev, [cat]: e.target.value }))}
                rows={cat === 'attacke' ? 12 : 5}
                placeholder={`Ein Wert pro Zeile (${required} benötigt)`}
                className="rounded-md bg-neutral-900 border border-white/10 px-2 py-1.5 text-sm text-white font-mono resize-y"
              />
            </div>
          )
        })}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        disabled={!allValid || busy}
        onClick={handleSubmit}
        className="self-start rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold px-5 py-2"
      >
        {busy ? 'Raum wird erstellt…' : 'Raum erstellen'}
      </button>
    </div>
  )
}
