import { useState } from 'react'
import { getPokemonSpriteUrl } from '../lib/pokeSprites'
import { CATEGORY_COLORS, CATEGORY_FILLED_STYLE, CATEGORY_LABELS } from '../lib/categories'

interface Props {
  value: string | null
  filled: boolean
  selectable?: boolean
  onSelect?: () => void
}

// Quadratische Box (statt horizontalem Balken): Badge oben, Sprite mittig, Name unten. Wird per
// h-full so hoch gestreckt wie die daneben gestapelten Wesen/Faehigkeit/Item-Zeilen (siehe FieldCard).
export function PokemonSlot({ value, filled, selectable, onSelect }: Props) {
  const [spriteFailed, setSpriteFailed] = useState(false)
  const spriteUrl = filled ? getPokemonSpriteUrl(value) : null

  const stateClass = selectable
    ? 'border-yellow-400 bg-neutral-800 hover:bg-neutral-700 cursor-pointer'
    : filled
      ? `${CATEGORY_FILLED_STYLE.pokemon} cursor-default`
      : 'border-white/10 bg-neutral-900/60 cursor-default'

  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={onSelect}
      className={`h-full w-full rounded-lg border px-1.5 py-1.5 flex flex-col items-center gap-1 text-center transition ${stateClass}`}
    >
      <span className={`px-1.5 py-0.5 rounded ${CATEGORY_COLORS.pokemon} text-white text-[9px] font-semibold shrink-0`}>
        {CATEGORY_LABELS.pokemon}
      </span>
      <div className="flex-1 w-full min-h-0 flex items-center justify-center">
        {filled && spriteUrl && !spriteFailed ? (
          <img
            src={spriteUrl}
            alt={value ?? ''}
            onError={() => setSpriteFailed(true)}
            className="max-h-full max-w-full object-contain [image-rendering:pixelated] drop-shadow"
          />
        ) : filled ? (
          <span className="text-white font-semibold text-[10px] leading-tight px-1">{value}</span>
        ) : (
          <span className="text-neutral-600 italic text-xs">leer</span>
        )}
      </div>
      {filled && <span className="text-xs font-bold text-white truncate w-full shrink-0">{value}</span>}
    </button>
  )
}
