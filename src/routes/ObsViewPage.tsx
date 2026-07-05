import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAnonymousSession } from '../hooks/useAnonymousSession'
import { GameScreen } from '../components/GameScreen'
import { rpc } from '../lib/rpc'

const WIDTH = 1920

export function ObsViewPage() {
  const { roomId = '', token = '' } = useParams()
  const { userId, loading: sessionLoading } = useAnonymousSession()
  const [claimed, setClaimed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!userId) return
    rpc
      .claimObsView(roomId, token)
      .then(() => setClaimed(true))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [userId, roomId, token])

  // Skaliert so, dass der Inhalt (Cams + Teams + Ballgrid, dessen Hoehe je nach Anzahl aktiver
  // Kameras/Inhalt variiert) IMMER komplett innerhalb 1920x1080 sichtbar bleibt, statt bei
  // ueberlangem Inhalt unten abgeschnitten zu werden. "zoom" layoutet nativ neu (bleibt scharf),
  // beeinflusst dabei aber auch die von ResizeObserver gemessene Groesse -- deshalb hier durch den
  // aktuell angewendeten Zoom zurueckgerechnet auf die "natuerliche" (ungezoomte) Inhaltshoehe.
  useEffect(() => {
    const el = contentRef.current
    // Vor "claimed" ist das Inhalts-Div (mit dieser ref) noch gar nicht gemountet (die Seite
    // zeigt bis dahin nur "Lade…"/"Verbinde…") -- ohne "claimed" in den Deps wuerde dieser Effekt
    // beim allerersten (leeren) Mount laufen und nie wieder, der Observer haette also nie ein
    // echtes Element zum Beobachten.
    if (!el) return
    function recompute() {
      const zoomedHeight = el!.getBoundingClientRect().height
      const naturalHeight = zoomedHeight / (scaleRef.current || 1)
      const next = Math.min(window.innerWidth / WIDTH, window.innerHeight / Math.max(naturalHeight, 1), 1)
      setScale((prev) => (Math.abs(prev - next) > 0.002 ? next : prev))
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(el)
    window.addEventListener('resize', recompute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', recompute)
    }
  }, [claimed])

  if (sessionLoading || !userId) return <p className="text-center text-neutral-400 py-10">Lade…</p>
  if (error) return <p className="text-center text-red-400 py-10">{error}</p>
  if (!claimed) return <p className="text-center text-neutral-400 py-10">Verbinde…</p>

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* "zoom" statt "transform: scale(...)": transform skaliert eine bereits gerenderte Bitmap
          (unscharfe Kanten/Text beim Verkleinern), zoom layoutet/rendert nativ in Zielgroesse neu
          und bleibt dadurch scharf. In Chromium/CEF unterstuetzt — deckt sowohl OBS als auch
          normale Chromium-Browser ab. */}
      <div
        ref={contentRef}
        style={{
          width: WIDTH,
          zoom: scale,
        }}
      >
        <GameScreen roomId={roomId} myUserId={userId} role="obs" showControls={false} />
      </div>
    </div>
  )
}
