import { DEFAULT_ATTACKE_FILTERS, type AttackeFilters } from '../lib/poolResolution'

interface Props {
  value: AttackeFilters
  onChange: (value: AttackeFilters) => void
}

interface DualRangeProps {
  label: string
  min: number
  max: number
  minValue: number
  maxValue: number
  onChangeMin: (v: number) => void
  onChangeMax: (v: number) => void
  step?: number
  format?: (v: number) => string
}

// Zwei uebereinandergelegte native Range-Inputs (siehe .dual-range-input in index.css): der
// jeweils obenliegende Regler (per z-index nach Naehe zum Wert bestimmt) bekommt die
// Maus-/Touch-Interaktion, damit sich beide Griffe frei ueberholen und unabhaengig ziehen lassen,
// ohne dass der Min-Wert je ueber den Max-Wert hinausrutscht (per clamp in den onChange-Handlern).
function DualRangeSlider({ label, min, max, minValue, maxValue, onChangeMin, onChangeMax, step = 5, format }: DualRangeProps) {
  const fmt = format ?? ((v: number) => `${v}%`)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-neutral-400">{label}</span>
        <span className="font-mono text-neutral-300">
          {fmt(minValue)} – {fmt(maxValue)}
        </span>
      </div>
      <div className="relative h-4 flex items-center">
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-neutral-800" />
        <div
          className="absolute h-1.5 rounded-full bg-red-500/70"
          style={{
            left: `${((minValue - min) / (max - min)) * 100}%`,
            right: `${100 - ((maxValue - min) / (max - min)) * 100}%`,
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={minValue}
          onChange={(e) => onChangeMin(Math.min(Number(e.target.value), maxValue))}
          className="dual-range-input"
          style={{ zIndex: minValue >= maxValue ? 4 : 3 }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={maxValue}
          onChange={(e) => onChangeMax(Math.max(Number(e.target.value), minValue))}
          className="dual-range-input"
          style={{ zIndex: 3 }}
        />
      </div>
    </div>
  )
}

export function AttackeFilterPanel({ value, onChange }: Props) {
  const isDefault =
    value.minStatusPercent === DEFAULT_ATTACKE_FILTERS.minStatusPercent &&
    value.maxStatusPercent === DEFAULT_ATTACKE_FILTERS.maxStatusPercent &&
    value.minPowerPercent === DEFAULT_ATTACKE_FILTERS.minPowerPercent &&
    value.maxPowerPercent === DEFAULT_ATTACKE_FILTERS.maxPowerPercent &&
    value.powerThreshold === DEFAULT_ATTACKE_FILTERS.powerThreshold

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-neutral-950/30 p-3">
      <DualRangeSlider
        label="Anteil Status-Attacken"
        min={0}
        max={100}
        minValue={value.minStatusPercent}
        maxValue={value.maxStatusPercent}
        onChangeMin={(v) => onChange({ ...value, minStatusPercent: v })}
        onChangeMax={(v) => onChange({ ...value, maxStatusPercent: v })}
      />

      <DualRangeSlider
        label="Anteil Attacken mit hoher Basis-Stärke"
        min={0}
        max={100}
        minValue={value.minPowerPercent}
        maxValue={value.maxPowerPercent}
        onChangeMin={(v) => onChange({ ...value, minPowerPercent: v })}
        onChangeMax={(v) => onChange({ ...value, maxPowerPercent: v })}
      />

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
