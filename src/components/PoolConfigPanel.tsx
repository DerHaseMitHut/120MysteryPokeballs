import { CATEGORY_ORDER } from '../lib/categories'
import type { PoolConfig } from '../lib/poolResolution'
import { CategoryConfigRow } from './CategoryConfigRow'

interface Props {
  value: PoolConfig
  onChange: (value: PoolConfig) => void
}

export function PoolConfigPanel({ value, onChange }: Props) {
  const total = CATEGORY_ORDER.reduce((sum, cat) => sum + value[cat].count, 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-neutral-300">
        <span className="font-semibold">Gesamtzahl Bälle:</span>
        <span className="font-mono text-white">{total}</span>
      </div>
      {CATEGORY_ORDER.map((cat) => (
        <CategoryConfigRow key={cat} category={cat} config={value[cat]} onChange={(config) => onChange({ ...value, [cat]: config })} />
      ))}
    </div>
  )
}
