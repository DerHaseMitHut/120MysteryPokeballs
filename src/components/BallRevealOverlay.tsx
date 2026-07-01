import { useEffect, useRef, useState } from 'react'
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../lib/categories'
import { getPokemonSpriteUrl } from '../lib/pokeSprites'
import type { BallWithValue } from '../hooks/useBalls'

interface Props {
  ball: BallWithValue
  isMine: boolean
  openerName: string
  onRevealed?: () => void
}

const VIDEO_SRC = '/pokeball-animation.mp4'
const FALLBACK_DURATION_S = 3
const FADE_MS = 1000

// Spielt die Ball-Oeffnungs-Animation ab und waechst dabei ueber die gesamte Flaeche, die sonst
// das Baelle-Grid einnimmt. Eine Sekunde vor Videoende beginnt ein Ausblenden (1s), waehrend
// dessen der tatsaechliche Inhalt gross eingeblendet wird — die Laenge wird live aus dem Video
// ausgelesen, nicht hart codiert, damit ein spaeteres Austauschen der Datei einfach bleibt.
export function BallRevealOverlay({ ball, isMine, openerName, onRevealed }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [grown, setGrown] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)

  // In einem Ref halten, damit ein neuer Funktionswert bei jedem Render (onRevealed wird meist
  // inline uebergeben) nicht den Timing-Effekt unten neu ausloest.
  const onRevealedRef = useRef(onRevealed)
  onRevealedRef.current = onRevealed

  useEffect(() => {
    const growTimer = setTimeout(() => setGrown(true), 20)
    return () => clearTimeout(growTimer)
  }, [ball.id])

  useEffect(() => {
    setRevealing(false)
    const video = videoRef.current
    if (!video) return

    let revealTimer: ReturnType<typeof setTimeout>
    function reveal() {
      setRevealing(true)
      onRevealedRef.current?.()
    }
    function scheduleReveal() {
      const duration = video && isFinite(video.duration) && video.duration > 0 ? video.duration : FALLBACK_DURATION_S
      const delayMs = Math.max(0, duration * 1000 - FADE_MS)
      revealTimer = setTimeout(reveal, delayMs)
    }

    video.currentTime = 0
    video.play().catch(() => {})
    if (video.readyState >= 1) scheduleReveal()
    else video.addEventListener('loadedmetadata', scheduleReveal, { once: true })

    return () => {
      clearTimeout(revealTimer)
      video.removeEventListener('loadedmetadata', scheduleReveal)
    }
  }, [ball.id])

  // Falls das Video gar nicht erst laedt: sofort aufdecken, statt fuer immer verdeckt zu bleiben.
  useEffect(() => {
    if (videoFailed) {
      setRevealing(true)
      onRevealedRef.current?.()
    }
  }, [videoFailed])

  const known = ball.value != null
  const colorClass = CATEGORY_COLORS[ball.category]
  const spriteUrl = ball.category === 'pokemon' && known ? getPokemonSpriteUrl(ball.value) : null

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-2xl bg-neutral-950">
      {!videoFailed && (
        <div
          className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-out ${
            grown ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          }`}
        >
          <video
            ref={videoRef}
            src={VIDEO_SRC}
            muted
            playsInline
            onError={() => setVideoFailed(true)}
            className={`max-h-full max-w-full object-contain transition-opacity ease-in`}
            style={{ transitionDuration: `${FADE_MS}ms`, opacity: revealing ? 0 : 1 }}
          />
        </div>
      )}

      <div
        className="relative z-10 flex flex-col items-center gap-3 px-6 text-center transition-opacity ease-in"
        style={{
          transitionDuration: `${FADE_MS}ms`,
          opacity: revealing || videoFailed ? 1 : 0,
          pointerEvents: revealing || videoFailed ? 'auto' : 'none',
        }}
      >
        <span className="text-xs text-neutral-400">
          Ball #{ball.number} geöffnet von {openerName}
        </span>
        <span className={`px-3 py-1 rounded-lg text-sm font-semibold text-white ${colorClass}`}>
          {CATEGORY_LABELS[ball.category]}
        </span>
        {spriteUrl && (
          <img
            src={spriteUrl}
            alt={ball.value ?? ''}
            className="h-28 w-28 object-contain [image-rendering:pixelated] drop-shadow-lg"
          />
        )}
        <span className={`text-3xl font-extrabold ${known ? 'text-white' : 'text-neutral-500 italic'}`}>
          {known ? ball.value : 'zensiert'}
        </span>
        {isMine ? (
          <span className="text-sm text-yellow-300 mt-1">Wähle jetzt einen passenden Slot in deinem Team ↓</span>
        ) : (
          <span className="text-sm text-neutral-500 mt-1">wird gerade platziert…</span>
        )}
      </div>
    </div>
  )
}
