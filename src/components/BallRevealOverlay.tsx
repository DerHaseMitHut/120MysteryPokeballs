import { useEffect, useRef, useState } from 'react'
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../lib/categories'
import { getPokemonSpriteUrl } from '../lib/pokeSprites'
import type { BallWithValue } from '../hooks/useBalls'

interface Props {
  ball: BallWithValue
  isMine: boolean
  openerName: string
  onRevealed?: () => void
  sfxVolume: number
}

const VIDEO_SRC = '/pokeball-animation.mp4'
const STARTUP_SFX_SRC = '/nintendo-game-boy-startup.mp3'
const REVEAL_SFX_SRC = '/sound-effects-pokemon-anime-7-pokemon-out.mp3'
const REVEAL_SFX_DELAY_S = 1.2
const REVEAL_SFX_FADE_START_S = 2
const REVEAL_SFX_FADE_DURATION_S = 0.8
const SFX_LATE_CUTOFF_S = 0.6
const FALLBACK_DURATION_S = 3
const FADE_MS = 1000

// Modul-Ebene (nicht Component-State/Ref): ueberlebt ein Re-Mount der Reveal-Overlay-Komponente
// innerhalb desselben Tabs (z.B. falls "revealBall" durch einen kurzen Realtime-Ruckler
// kurzzeitig null->ball->null->ball flackert) und verhindert so, dass die beiden Sound-Cues fuer
// denselben Ball ein zweites Mal angestossen werden. Wird nur beim vollen Seiten-Reload
// zurueckgesetzt — genau das ist gewuenscht, ein "doppelter" Sound trat nur innerhalb einer
// laufenden Session auf.
const sfxPlayedForBall = new Set<string>()

// Spielt eine Audiodatei ab optionaler Verzoegerung ab und blendet sie optional nach einer
// weiteren Verzoegerung linear aus. Reiner Bonus-Sound: Wiedergabefehler (Autoplay-Policy etc.)
// werden verschluckt. Gibt eine Cleanup-Funktion zurueck, die alle Timer stoppt und den Sound
// sofort stumm schaltet (fuer den Fall, dass der naechste Ball geoeffnet wird, bevor er fertig ist).
function playAudioCue(
  src: string,
  { delayMs = 0, volume = 0.5, fadeStartMs, fadeDurationMs }: { delayMs?: number; volume?: number; fadeStartMs?: number; fadeDurationMs?: number } = {},
): () => void {
  let audio: HTMLAudioElement | null = null
  let fadeTimer: ReturnType<typeof setTimeout> | undefined
  let fadeInterval: ReturnType<typeof setInterval> | undefined

  const startTimer = setTimeout(() => {
    audio = new Audio(src)
    audio.volume = volume
    audio.play().catch(() => {})
    if (fadeStartMs != null && fadeDurationMs) {
      fadeTimer = setTimeout(() => {
        const steps = 16
        let i = 0
        fadeInterval = setInterval(() => {
          i++
          if (audio) audio.volume = Math.max(0, volume * (1 - i / steps))
          if (i >= steps) {
            clearInterval(fadeInterval)
            audio?.pause()
          }
        }, fadeDurationMs / steps)
      }, fadeStartMs)
    }
  }, delayMs)

  return () => {
    clearTimeout(startTimer)
    clearTimeout(fadeTimer)
    clearInterval(fadeInterval)
    audio?.pause()
  }
}

// Spielt die Ball-Oeffnungs-Animation ab und waechst dabei ueber die gesamte Flaeche, die sonst
// das Baelle-Grid einnimmt. Eine Sekunde vor Videoende beginnt ein Ausblenden (1s), waehrend
// dessen der tatsaechliche Inhalt gross eingeblendet wird — die Laenge wird live aus dem Video
// ausgelesen, nicht hart codiert, damit ein spaeteres Austauschen der Datei einfach bleibt.
// Start ist an ball.opened_at (Server-Zeit) gekoppelt, nicht an den lokalen Mount-Zeitpunkt, damit
// die Animation bei allen Teilnehmern synchron laeuft statt je nach Netzwerk-Latenz versetzt.
export function BallRevealOverlay({ ball, isMine, openerName, onRevealed, sfxVolume }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [grown, setGrown] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)

  // In Refs halten, damit ein neuer Funktionswert (onRevealed wird meist inline uebergeben) bzw.
  // ein Lautstaerke-Regler-Wechsel waehrend einer laufenden Animation nicht den Timing-Effekt
  // unten neu ausloesen (das wuerde Video/Sounds neu starten statt nur die naechste Wiedergabe
  // zu beeinflussen).
  const onRevealedRef = useRef(onRevealed)
  onRevealedRef.current = onRevealed
  const sfxVolumeRef = useRef(sfxVolume)
  sfxVolumeRef.current = sfxVolume

  useEffect(() => {
    const growTimer = setTimeout(() => setGrown(true), 20)
    return () => clearTimeout(growTimer)
  }, [ball.id])

  useEffect(() => {
    setRevealing(false)
    const video = videoRef.current
    if (!video) return

    // ball.opened_at ist ein Server-Zeitstempel (von draw_ball per `now()` gesetzt) und damit fuer
    // alle Teilnehmer identisch — anders als der Moment, in dem das Realtime-Event lokal ankommt
    // (der je nach Netzwerk-Latenz um mehrere Sekunden variiert). Wir starten das Video deshalb
    // nicht bei 0, sondern springen direkt an die Stelle, die "jetzt" korrekt waere, damit alle
    // Bildschirme dieselbe Animation zur selben echten Uhrzeit zeigen statt versetzt loszulaufen.
    const openedAtMs = ball.opened_at ? new Date(ball.opened_at).getTime() : NaN
    const lateBySeconds = isFinite(openedAtMs) ? Math.max(0, (Date.now() - openedAtMs) / 1000) : 0

    // Eigene <audio>-Elemente statt Ton auf dem Video-Element: das Video bleibt bewusst stumm,
    // damit Autoplay ueberall zuverlaessig klappt (v.a. OBS/Host-Tab ohne vorherige Nutzerinter-
    // aktion). Beide Sounds haengen auf derselben ball.opened_at-Zeitachse wie das Video: Start-
    // Jingle direkt bei Animationsbeginn, danach (1s Verzoegerung) der Reveal-Sound, der nach ca.
    // 2s seiner eigenen Spielzeit ausgeblendet wird — das faellt zeitlich mit dem Beginn des Video-
    // Ausblendens zusammen. Reiner Bonus: bei deutlichem Verspaetungs-Nachlauf oder Autoplay-Policy
    // wird ein Cue einfach ausgelassen, ohne die Video-Wiedergabe zu beeinflussen.
    const sfxCleanups: Array<() => void> = []
    if (!sfxPlayedForBall.has(ball.id)) {
      sfxPlayedForBall.add(ball.id)
      if (lateBySeconds < SFX_LATE_CUTOFF_S) {
        sfxCleanups.push(playAudioCue(STARTUP_SFX_SRC, { volume: sfxVolumeRef.current }))
      }
      const revealCueDelayS = REVEAL_SFX_DELAY_S - lateBySeconds
      if (revealCueDelayS > -SFX_LATE_CUTOFF_S) {
        sfxCleanups.push(
          playAudioCue(REVEAL_SFX_SRC, {
            delayMs: Math.max(0, revealCueDelayS * 1000),
            volume: sfxVolumeRef.current,
            fadeStartMs: REVEAL_SFX_FADE_START_S * 1000,
            fadeDurationMs: REVEAL_SFX_FADE_DURATION_S * 1000,
          }),
        )
      }
    }

    let revealTimer: ReturnType<typeof setTimeout>
    function reveal() {
      setRevealing(true)
      onRevealedRef.current?.()
    }
    function startPlayback() {
      const duration = video && isFinite(video.duration) && video.duration > 0 ? video.duration : FALLBACK_DURATION_S
      const remainingS = duration - lateBySeconds
      if (remainingS * 1000 <= FADE_MS) {
        // Wir sind so spaet dran, dass das Video bei anderen laengst vorbei waere — direkt aufdecken
        // statt es kurz ab Ende anzuspielen.
        reveal()
        return
      }
      if (video && lateBySeconds > 0) video.currentTime = lateBySeconds
      video?.play().catch(() => {})
      revealTimer = setTimeout(reveal, remainingS * 1000 - FADE_MS)
    }

    if (video.readyState >= 1) startPlayback()
    else video.addEventListener('loadedmetadata', startPlayback, { once: true })

    return () => {
      clearTimeout(revealTimer)
      video.removeEventListener('loadedmetadata', startPlayback)
      sfxCleanups.forEach((cleanup) => cleanup())
    }
  }, [ball.id, ball.opened_at])

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
        <span className="text-sm text-neutral-400">
          Ball #{ball.number} geöffnet von {openerName}
        </span>
        <span className={`px-3.5 py-1.5 rounded-lg text-base font-semibold text-white ${colorClass}`}>
          {CATEGORY_LABELS[ball.category]}
        </span>
        {spriteUrl && (
          <img
            src={spriteUrl}
            alt={ball.value ?? ''}
            className="h-44 w-44 object-contain [image-rendering:pixelated] drop-shadow-lg"
          />
        )}
        <span className={`text-4xl font-extrabold ${known ? 'text-white' : 'text-neutral-500 italic'}`}>
          {known ? ball.value : 'zensiert'}
        </span>
        {isMine ? (
          <span className="text-base text-yellow-300 mt-1">Wähle jetzt einen passenden Slot in deinem Team ↓</span>
        ) : (
          <span className="text-sm text-neutral-500 mt-1">wird gerade platziert…</span>
        )}
      </div>
    </div>
  )
}
