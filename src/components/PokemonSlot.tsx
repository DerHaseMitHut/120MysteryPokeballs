import { useState } from 'react'
import { getPokemonSpriteUrl } from '../lib/pokeSprites'
import { CATEGORY_COLORS, CATEGORY_FILLED_STYLE, CATEGORY_LABELS } from '../lib/categories'

interface Props {
  value: string | null
  filled: boolean
  selectable?: boolean
  onSelect?: () => void
}

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
      className={`w-full rounded-lg border px-3 py-4 flex flex-col items-center gap-1.5 transition ${stateClass}`}
    >
      <span className={`px-2 py-0.5 rounded ${CATEGORY_COLORS.pokemon} text-white text-[10px] font-semibold`}>
        {CATEGORY_LABELS.pokemon}
      </span>
      <div className="h-28 w-28 flex items-center justify-center">
        {!filled ? (
          <span className="text-neutral-600 italic text-sm">leer</span>
        ) : spriteUrl && !spriteFailed ? (
          <img
            src={spriteUrl}
            alt={value ?? ''}
            onError={() => setSpriteFailed(true)}
            className="h-full w-full object-contain [image-rendering:pixelated] drop-shadow-lg"
          />
        ) : (
          <span className="text-white font-semibold text-center px-2">{value}</span>
        )}
      </div>
      {filled && (spriteUrl || value) && (
        <span className="text-base font-bold text-white">{value}</span>
      )}
    </button>
  )
}
