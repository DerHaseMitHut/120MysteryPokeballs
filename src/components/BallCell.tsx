import { useState } from 'react'
import { PokeballGraphic } from './PokeballGraphic'
import type { BallWithValue } from '../hooks/useBalls'

interface Props {
  number: number
  ball: BallWithValue | undefined
  canDraw: boolean
  onDraw: (number: number) => void
}

// Statisches Bild (erster Frame der Oeffnungs-Animation, siehe scripts/README) statt 20 parallel
// ladender <video>-Elemente im Grid — Standbild ist leichtgewichtig und flackerfrei, die echte
// Animation laeuft ohnehin nur einmalig im BallRevealOverlay.
const CLOSED_IMAGE_SRC = '/pokeball-closed.png'

export function BallCell({ number, ball, canDraw, onDraw }: Props) {
  const opened = ball?.opened ?? false
  const [imageFailed, setImageFailed] = useState(false)

  if (!opened) {
    return (
      <button
        type="button"
        disabled={!canDraw}
        onClick={() => onDraw(number)}
        title={canDraw ? `Ball #${number} öffnen` : `Ball #${number}`}
        className={`aspect-square rounded-xl border flex flex-col items-center justify-center gap-1 overflow-hidden transition
          ${
            canDraw
              ? 'border-red-500/60 bg-neutral-900 hover:bg-neutral-800 hover:scale-[1.03] cursor-pointer shadow'
              : 'border-white/10 bg-neutral-900/60 opacity-60 cursor-not-allowed'
          }`}
      >
        {!imageFailed ? (
          <img
            src={CLOSED_IMAGE_SRC}
            alt=""
            onError={() => setImageFailed(true)}
            className="h-2/3 w-2/3 object-contain pointer-events-none"
          />
        ) : (
          <PokeballGraphic phase="closed" size={64} />
        )}
        <span className="text-xs font-semibold text-neutral-300">#{number}</span>
      </button>
    )
  }

  // Nach dem Oeffnen bleibt die Zelle bewusst "leer" — die eigentliche Oeffnungs-Animation und
  // der Inhalt laufen im BallRevealOverlay ueber dem gesamten Grid, nicht mehr hier einzeln.
  return (
    <div
      className="aspect-square rounded-xl border border-white/5 bg-neutral-900/30 flex flex-col items-center justify-center gap-1"
      title={`Ball #${number} — bereits geöffnet`}
    >
      <PokeballGraphic phase="empty" size={40} />
      <span className="text-[10px] text-neutral-600">#{number}</span>
    </div>
  )
}
