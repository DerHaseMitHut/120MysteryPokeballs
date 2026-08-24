import { useState } from 'react'
import { JOKER_FALLBACK_EMOJI, JOKER_ICON_SRC, JOKER_LABELS } from '../lib/jokers'
import type { JokerType } from '../lib/jokers'

interface Props {
  type: JokerType
  className?: string
}

// Icon-Bild aus public/joker-icons/ (vom Host selbst bereitgestellt). Solange die Datei fehlt oder
// nicht laedt, faellt die Anzeige auf ein Emoji-Badge zurueck -- die UI bleibt so auch ohne eigene
// Icons benutzbar.
export function JokerIcon({ type, className = 'h-6 w-6' }: Props) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span className={`${className} flex items-center justify-center leading-none`} title={JOKER_LABELS[type]}>
        {JOKER_FALLBACK_EMOJI[type]}
      </span>
    )
  }

  return (
    <img
      src={JOKER_ICON_SRC[type]}
      alt={JOKER_LABELS[type]}
      title={JOKER_LABELS[type]}
      onError={() => setFailed(true)}
      className={`${className} object-contain`}
    />
  )
}
