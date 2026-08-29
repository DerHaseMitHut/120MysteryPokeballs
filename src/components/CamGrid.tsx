import { useEffect, useRef } from 'react'
import type { PeerStatus } from '../hooks/useWebRTCMesh'

export interface CamTile {
  key: string
  label: string
  stream: MediaStream | null
  isLocal?: boolean
  status?: PeerStatus
}

const STATUS_LABEL: Record<PeerStatus, string> = {
  connecting: 'Verbindet…',
  connected: 'Kamera aus',
  reconnecting: 'Verbindung wird wiederhergestellt…',
}

function placeholderText(tile: CamTile): string {
  if (tile.isLocal) return 'Keine Kamera'
  if (!tile.status) return 'Keine Kamera'
  return STATUS_LABEL[tile.status]
}

function VideoTile({ tile, stretch }: { tile: CamTile; stretch?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.srcObject = tile.stream
  }, [tile.stream])

  return (
    <div
      className={`relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-neutral-900 to-neutral-950 flex items-center justify-center shadow-lg shadow-black/40 ${
        stretch ? 'flex-1 min-w-0' : 'h-52 md:h-64'
      }`}
    >
      {tile.stream ? (
        <video ref={ref} autoPlay playsInline muted={tile.isLocal} className="h-full w-full object-cover" />
      ) : (
        <span className={`text-sm ${tile.status === 'reconnecting' ? 'text-amber-400' : 'text-neutral-600'}`}>
          {placeholderText(tile)}
        </span>
      )}
      <span className="absolute bottom-1.5 left-2 rounded bg-black/70 backdrop-blur-sm px-2 py-0.5 text-xs font-medium text-white">
        {tile.label}
      </span>
    </div>
  )
}

interface Props {
  tiles: CamTile[]
  // Fuer die OBS-16:9-Overlay-Buehne: Kacheln teilen sich gleichmaessig die volle Breite (Hoehe
  // ergibt sich aus aspect-video), damit die Cam-Reihe exakt so breit ist wie der Kampfrahmen
  // darunter. Im normalen Spielbildschirm bleibt die bisherige zentrierte Festgroesse (unabhaengig
  // von der verfuegbaren Breite immer gleich gross).
  stretch?: boolean
}

// Flex + intrinsische Groesse (h + aspect-video) statt Grid-Stretch: so bleibt das
// Kamera-Seitenverhaeltnis immer sauber 16:9, egal wie breit der verfuegbare Platz ist.
export function CamGrid({ tiles, stretch }: Props) {
  return (
    <div className={`flex gap-3 ${stretch ? '' : 'justify-center'}`}>
      {tiles.map((tile) => (
        <VideoTile key={tile.key} tile={tile} stretch={stretch} />
      ))}
    </div>
  )
}
