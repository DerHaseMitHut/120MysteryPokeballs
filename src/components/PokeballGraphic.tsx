import { useState } from 'react'

export type PokeballPhase = 'closed' | 'opening' | 'empty'

interface Props {
  phase: PokeballPhase
  size?: number
}

// Erwartet optionale eigene Bild-Assets in /public: "pokeball-closed.png" fuer den
// geschlossenen Zustand und "pokeball-open.gif" fuer die kurze Oeffnungs-Animation. Solange
// diese Dateien nicht existieren, wird automatisch auf eine per SVG gezeichnete Ersatzgrafik
// zurueckgefallen — sobald die echten Assets im public-Ordner liegen, greifen sie ohne
// Code-Aenderung.
const IMAGE_BY_PHASE: Partial<Record<PokeballPhase, string>> = {
  closed: '/pokeball-closed.png',
  opening: '/pokeball-open.gif',
}

function PokeballSvg({ phase, size }: { phase: PokeballPhase; size: number }) {
  if (phase === 'empty') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="42" stroke="#3f3f46" strokeWidth="4" strokeDasharray="6 6" />
      </svg>
    )
  }
  const spinning = phase === 'opening'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={spinning ? 'animate-[bounce_0.5s_ease-in-out_2]' : ''}
    >
      <defs>
        <clipPath id="top-half">
          <rect x="0" y="0" width="100" height="47" />
        </clipPath>
        <clipPath id="bottom-half">
          <rect x="0" y="53" width="100" height="47" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="44" fill="#dc2626" clipPath="url(#top-half)" />
      <circle cx="50" cy="50" r="44" fill="#f5f5f5" clipPath="url(#bottom-half)" />
      <rect x="6" y="47" width="88" height="6" fill="#18181b" />
      <circle cx="50" cy="50" r="14" fill="#18181b" />
      <circle cx="50" cy="50" r="9" fill={spinning ? '#fde047' : '#f5f5f5'} />
      <circle cx="50" cy="50" r="44" fill="none" stroke="#18181b" strokeWidth="3" />
    </svg>
  )
}

export function PokeballGraphic({ phase, size = 48 }: Props) {
  const [imgFailed, setImgFailed] = useState(false)
  const src = IMAGE_BY_PHASE[phase]

  if (src && !imgFailed) {
    return (
      <img
        src={src}
        width={size}
        height={size}
        alt=""
        onError={() => setImgFailed(true)}
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    )
  }

  return <PokeballSvg phase={phase} size={size} />
}
