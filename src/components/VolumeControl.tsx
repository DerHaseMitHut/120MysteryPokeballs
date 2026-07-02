interface Props {
  volume: number
  onChange: (volume: number) => void
}

export function VolumeControl({ volume, onChange }: Props) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-neutral-400 rounded-lg bg-neutral-800/80 border border-white/10 px-3 py-1.5">
      <span className="whitespace-nowrap">Ton</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 accent-red-500"
        aria-label="Lautstärke der Ball-Sounds"
      />
    </label>
  )
}
