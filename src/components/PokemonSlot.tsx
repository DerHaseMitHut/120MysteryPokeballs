import { useState } from 'react'
import { getPokemonSpriteUrl } from '../lib/pokeSprites'
import { CATEGORY_COLORS, CATEGORY_FILLED_STYLE, CATEGORY_LABELS } from '../lib/categories'
import { useFlashOnChange } from '../hooks/useFlashOnChange'

interface Props {
  value: string | null
  filled: boolean
  ballId?: string | null
  selectable?: boolean
  onSelect?: () => void
  // 'pink' markiert eine Joker-Zielauswahl (statt der normalen gelben Ball-Platzierung).
  accent?: 'yellow' | 'pink'
  // Zusaetzlicher Ring fuer "das ist gerade als erster Slot eines Wechseljoker-Tauschs gewaehlt".
  selected?: boolean
}

// Quadratische Box (statt horizontalem Balken): Badge oben, Sprite mittig, Name unten. Wird per
// h-full so hoch gestreckt wie die daneben gestapelten Wesen/Faehigkeit/Item-Zeilen (siehe FieldCard).
// min-h-[9rem] sorgt zusaetzlich dafuer, dass dem Sprite auch dann genug Platz bleibt, wenn die
// Zeilen daneben (noch) niedriger waeren.
export function PokemonSlot({ value, filled, ballId = null, selectable, onSelect, accent = 'yellow', selected }: Props) {
  const [spriteFailed, setSpriteFailed] = useState(false)
  const spriteUrl = filled ? getPokemonSpriteUrl(value) : null
  const flashing = useFlashOnChange(ballId)

  const stateClass = selectable
    ? `${accent === 'pink' ? 'border-pink-400' : 'border-yellow-400'} bg-neutral-800 hover:bg-neutral-700 cursor-pointer`
    : filled
      ? `${CATEGORY_FILLED_STYLE.pokemon} cursor-default`
      : 'border-white/10 bg-neutral-900/60 cursor-default'

  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={onSelect}
      className={`h-full w-full min-h-[9rem] rounded-lg border px-2 py-2 flex flex-col items-center gap-1.5 text-center transition ${stateClass} ${flashing ? 'slot-flash' : ''} ${selected ? 'ring-2 ring-pink-400' : ''}`}
    >
      <span className={`px-1.5 py-0.5 rounded ${CATEGORY_COLORS.pokemon} text-white text-[10px] font-semibold shrink-0`}>
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
          <span className="text-white font-semibold text-sm leading-tight px-1">{value}</span>
        ) : (
          <span className="text-neutral-600 italic text-base">leer</span>
        )}
      </div>
      {filled && <span className="text-base font-bold text-white truncate w-full shrink-0">{value}</span>}
    </button>
  )
}
