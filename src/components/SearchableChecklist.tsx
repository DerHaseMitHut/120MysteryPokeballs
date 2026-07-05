import { useMemo, useState } from 'react'

interface Props<T> {
  items: T[]
  getLabel: (item: T) => string
  getKey: (item: T) => string
  selected: Set<string>
  onChange: (selected: Set<string>) => void
  maxRowsWithoutSearch?: number
}

// Generische Such- + Checkbox-Liste fuer die manuelle Pool-Auswahl (Pokemon/Attacken/Faehigkeiten/
// Items/Wesen). Ohne Suchbegriff wird bei sehr grossen Listen (z.B. hunderte Attacken) nur ein
// Hinweis statt der vollen Liste gerendert, um das DOM nicht unnoetig zu belasten.
export function SearchableChecklist<T>({
  items,
  getLabel,
  getKey,
  selected,
  onChange,
  maxRowsWithoutSearch = 200,
}: Props<T>) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.trim().toLowerCase()
    return items.filter((item) => getLabel(item).toLowerCase().includes(q))
  }, [items, search, getLabel])

  const showPlaceholder = !search.trim() && items.length > maxRowsWithoutSearch

  function toggle(key: string) {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={`Suchen… (${items.length} Einträge)`}
        className="rounded-md bg-neutral-950/60 border border-white/10 focus:border-red-500/50 focus:outline-none px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-500 transition-colors"
      />
      <div className="max-h-64 overflow-y-auto rounded-md border border-white/10 bg-neutral-950/40 divide-y divide-white/5">
        {showPlaceholder ? (
          <div className="px-2.5 py-3 text-xs text-neutral-500 italic">Tippe, um in {items.length} Einträgen zu suchen</div>
        ) : filtered.length === 0 ? (
          <div className="px-2.5 py-3 text-xs text-neutral-500 italic">Keine Treffer</div>
        ) : (
          filtered.map((item) => {
            const key = getKey(item)
            return (
              <label
                key={key}
                className="flex items-center gap-2 px-2.5 py-1.5 text-sm text-neutral-200 hover:bg-white/5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(key)}
                  onChange={() => toggle(key)}
                  className="accent-red-500"
                />
                {getLabel(item)}
              </label>
            )
          })
        )}
      </div>
    </div>
  )
}
