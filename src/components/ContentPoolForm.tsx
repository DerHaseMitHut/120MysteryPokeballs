import { CATEGORY_LABELS, CATEGORY_ORDER, POOL_REQUIREMENTS } from '../lib/categories'
import type { Category } from '../lib/database.types'

export type PoolTexts = Record<Category, string>

export const EMPTY_POOL_TEXTS: PoolTexts = {
  pokemon: '',
  item: '',
  wesen: '',
  faehigkeit: '',
  attacke: '',
}

export function parsePoolTexts(texts: PoolTexts): { category: Category; value: string }[] {
  const pool: { category: Category; value: string }[] = []
  for (const cat of CATEGORY_ORDER) {
    for (const value of parseLines(texts[cat])) pool.push({ category: cat, value })
  }
  return pool
}

export function poolCounts(texts: PoolTexts): Record<Category, number> {
  const result: Record<Category, number> = { pokemon: 0, item: 0, wesen: 0, faehigkeit: 0, attacke: 0 }
  for (const cat of CATEGORY_ORDER) result[cat] = parseLines(texts[cat]).length
  return result
}

export function isPoolValid(texts: PoolTexts): boolean {
  const counts = poolCounts(texts)
  return CATEGORY_ORDER.every((cat) => counts[cat] === POOL_REQUIREMENTS[cat])
}

function parseLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

interface Props {
  value: PoolTexts
  onChange: (value: PoolTexts) => void
}

// Reine Eingabemaske ohne eigenen Submit-Button — der aufrufende Screen (HostSetupPanel)
// entscheidet, wann/wie der geparste Pool gespeichert wird (z.B. kombiniert mit "Spiel starten").
export function ContentPoolForm({ value, onChange }: Props) {
  const counts = poolCounts(value)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
              value={value[cat]}
              onChange={(e) => onChange({ ...value, [cat]: e.target.value })}
              rows={cat === 'attacke' ? 12 : 6}
              placeholder={`Ein Wert pro Zeile (${required} benötigt)`}
              className="rounded-md bg-neutral-950/60 border border-white/10 focus:border-red-500/50 focus:outline-none px-2.5 py-2 text-sm text-white font-mono resize-y transition-colors"
            />
          </div>
        )
      })}
    </div>
  )
}
