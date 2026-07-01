import { useEffect, useRef, useState } from 'react'
import { PokeballGraphic } from './PokeballGraphic'
import type { BallWithValue } from '../hooks/useBalls'

interface Props {
  number: number
  ball: BallWithValue | undefined
  canDraw: boolean
  onDraw: (number: number) => void
}

const OPEN_ANIMATION_MS = 1200

export function BallCell({ number, ball, canDraw, onDraw }: Props) {
  const opened = ball?.opened ?? false
  const wasOpened = useRef(opened)
  const [justOpened, setJustOpened] = useState(false)

  useEffect(() => {
    if (opened && !wasOpened.current) {
      setJustOpened(true)
      const timeout = setTimeout(() => setJustOpened(false), OPEN_ANIMATION_MS)
      wasOpened.current = true
      return () => clearTimeout(timeout)
    }
    wasOpened.current = opened
  }, [opened])

  if (!opened) {
    return (
      <button
        type="button"
        disabled={!canDraw}
        onClick={() => onDraw(number)}
        title={canDraw ? `Ball #${number} öffnen` : `Ball #${number}`}
        className={`aspect-square rounded-xl border flex flex-col items-center justify-center gap-1 transition
          ${
            canDraw
              ? 'border-red-500/60 bg-neutral-900 hover:bg-neutral-800 hover:scale-[1.03] cursor-pointer shadow'
              : 'border-white/10 bg-neutral-900/60 opacity-60 cursor-not-allowed'
          }`}
      >
        <PokeballGraphic phase="closed" size={56} />
        <span className="text-xs font-semibold text-neutral-300">#{number}</span>
      </button>
    )
  }

  // Nach dem Oeffnen bleibt die Zelle bewusst "leer" — was drin war, steht im Reveal-Banner und
  // im Team-Slot, nicht mehr dauerhaft im Ball-Grid.
  return (
    <div
      className="aspect-square rounded-xl border border-white/5 bg-neutral-900/30 flex flex-col items-center justify-center gap-1"
      title={`Ball #${number} — bereits geöffnet`}
    >
      <PokeballGraphic phase={justOpened ? 'opening' : 'empty'} size={justOpened ? 56 : 34} />
      <span className="text-[10px] text-neutral-600">#{number}</span>
    </div>
  )
}
