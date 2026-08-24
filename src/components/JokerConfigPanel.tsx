import { JOKER_DESCRIPTIONS, JOKER_LABELS, JOKER_TYPES } from '../lib/jokers'
import type { JokerConfig, JokerType, JokerTypeConfig } from '../lib/jokers'
import { JokerIcon } from './JokerIcon'

interface Props {
  value: JokerConfig
  onChange: (value: JokerConfig) => void
}

function NullableNumberInput({
  value,
  onChange,
  placeholder,
  min = 0,
}: {
  value: number | null
  onChange: (v: number | null) => void
  placeholder: string
  min?: number
}) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="flex items-center gap-1 text-xs text-neutral-400">
        <input type="checkbox" checked={value == null} onChange={(e) => onChange(e.target.checked ? null : min)} />
        kein Limit
      </label>
      {value != null && (
        <input
          type="number"
          min={min}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-16 rounded-md bg-neutral-950/60 border border-white/10 focus:border-red-500/50 focus:outline-none px-2 py-1 text-sm text-white"
        />
      )}
    </div>
  )
}

export function JokerConfigPanel({ value, onChange }: Props) {
  function updateType(type: JokerType, patch: Partial<JokerTypeConfig>) {
    onChange({ ...value, types: { ...value.types, [type]: { ...value.types[type], ...patch } } })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 text-sm text-neutral-300">
          <span className="font-semibold">Joker-Chance pro Ball</span>
          <input
            type="number"
            min={0}
            max={100}
            value={value.chancePercent}
            onChange={(e) => onChange({ ...value, chancePercent: Number(e.target.value) })}
            className="w-16 rounded-md bg-neutral-950/60 border border-white/10 focus:border-red-500/50 focus:outline-none px-2 py-1 text-sm text-white"
          />
          <span className="text-neutral-500">%</span>
        </label>

        <div className="flex items-center gap-1.5 text-sm text-neutral-300">
          <span className="font-semibold">Max. Joker insgesamt</span>
          <NullableNumberInput
            value={value.maxTotal}
            onChange={(maxTotal) => onChange({ ...value, maxTotal })}
            placeholder="unbegrenzt"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {JOKER_TYPES.map((type) => {
          const tc = value.types[type]
          return (
            <div
              key={type}
              className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 transition ${
                tc.enabled ? 'border-white/10 bg-neutral-900/40' : 'border-white/5 bg-neutral-900/20 opacity-60'
              }`}
            >
              <JokerIcon type={type} className="h-8 w-8 shrink-0" />
              <div className="flex flex-col min-w-[9rem]">
                <span className="text-sm font-semibold text-neutral-200">{JOKER_LABELS[type]}</span>
                <span className="text-xs text-neutral-500">{JOKER_DESCRIPTIONS[type]}</span>
              </div>

              <label className="flex items-center gap-1.5 text-xs text-neutral-400 ml-auto">
                <input
                  type="checkbox"
                  checked={tc.enabled}
                  onChange={(e) => updateType(type, { enabled: e.target.checked })}
                />
                aktiv
              </label>

              <label className="flex items-center gap-1.5 text-xs text-neutral-400">
                Gewichtung
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  disabled={!tc.enabled}
                  value={tc.weight}
                  onChange={(e) => updateType(type, { weight: Number(e.target.value) })}
                  className="w-14 rounded-md bg-neutral-950/60 border border-white/10 focus:border-red-500/50 focus:outline-none px-2 py-1 text-sm text-white disabled:opacity-40"
                />
              </label>

              <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                Obergrenze
                <div className={!tc.enabled ? 'opacity-40 pointer-events-none' : undefined}>
                  <NullableNumberInput
                    value={tc.maxCount}
                    onChange={(maxCount) => updateType(type, { maxCount })}
                    placeholder="unbegrenzt"
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
