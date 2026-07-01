import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAnonymousSession } from '../hooks/useAnonymousSession'
import { GameScreen } from '../components/GameScreen'
import { rpc } from '../lib/rpc'

const WIDTH = 1920
const HEIGHT = 1080

export function ObsViewPage() {
  const { roomId = '', token = '' } = useParams()
  const { userId, loading: sessionLoading } = useAnonymousSession()
  const [claimed, setClaimed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (!userId) return
    rpc
      .claimObsView(roomId, token)
      .then(() => setClaimed(true))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [userId, roomId, token])

  useEffect(() => {
    function updateScale() {
      setScale(Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT, 1))
    }
    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  if (sessionLoading || !userId) return <p className="text-center text-neutral-400 py-10">Lade…</p>
  if (error) return <p className="text-center text-red-400 py-10">{error}</p>
  if (!claimed) return <p className="text-center text-neutral-400 py-10">Verbinde…</p>

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0f1115' }}>
      {/* "zoom" statt "transform: scale(...)": transform skaliert eine bereits gerenderte Bitmap
          (unscharfe Kanten/Text beim Verkleinern), zoom layoutet/rendert nativ in Zielgroesse neu
          und bleibt dadurch scharf. In Chromium/CEF unterstuetzt — deckt sowohl OBS als auch
          normale Chromium-Browser ab. */}
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          zoom: scale,
          overflow: 'hidden',
        }}
      >
        <GameScreen roomId={roomId} myUserId={userId} role="obs" showControls={false} />
      </div>
    </div>
  )
}
