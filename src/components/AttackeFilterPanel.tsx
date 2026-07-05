import { DEFAULT_ATTACKE_FILTERS, type AttackeFilters } from '../lib/poolResolution'

interface Props {
  value: AttackeFilters
  onChange: (value: AttackeFilters) => void
}

export function AttackeFilterPanel({ value, onChange }: Props) {
  const isDefault =
    value.minStatusPercent === DEFAULT_ATTACKE_FILTERS.minStatusPercent &&
    value.minPowerPercent === DEFAULT_ATTACKE_FILTERS.minPowerPercent &&
    value.powerThreshold === DEFAULT_ATTACKE_FILTERS.powerThreshold

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-neutral-950/30 p-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-neutral-400">Mindestanteil Status-Attacken</span>
          <span className="font-mono text-neutral-300">{value.minStatusPercent}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value.minStatusPercent}
          onChange={(e) => onChange({ ...value, minStatusPercent: Number(e.target.value) })}
          className="accent-red-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-neutral-400">Mindestanteil Attacken mit hoher Basis-Stärke</span>
          <span className="font-mono text-neutral-300">{value.minPowerPercent}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value.minPowerPercent}
          onChange={(e) => onChange({ ...value, minPowerPercent: Number(e.target.value) })}
          className="accent-red-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-neutral-400">Basis-Stärke-Schwelle für obigen Regler</span>
          <span className="font-mono text-neutral-300">≥ {value.powerThreshold}</span>
        </div>
        <input
          type="range"
          min={10}
          max={200}
          step={5}
          value={value.powerThreshold}
          onChange={(e) => onChange({ ...value, powerThreshold: Number(e.target.value) })}
          className="accent-red-500"
        />
      </div>

      {!isDefault && (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_ATTACKE_FILTERS)}
          className="self-end text-xs text-neutral-400 hover:text-neutral-200 underline underline-offset-2"
        >
          Regler zurücksetzen
        </button>
      )}
    </div>
  )
}
