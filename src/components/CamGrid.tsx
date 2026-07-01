import { useEffect, useRef } from 'react'

export interface CamTile {
  key: string
  label: string
  stream: MediaStream | null
  isLocal?: boolean
}

function VideoTile({ tile }: { tile: CamTile }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.srcObject = tile.stream
  }, [tile.stream])

  return (
    <div className="relative h-52 md:h-64 aspect-video overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-neutral-900 to-neutral-950 flex items-center justify-center shadow-lg shadow-black/40">
      {tile.stream ? (
        <video ref={ref} autoPlay playsInline muted={tile.isLocal} className="h-full w-full object-cover" />
      ) : (
        <span className="text-neutral-600 text-sm">Keine Kamera</span>
      )}
      <span className="absolute bottom-1.5 left-2 rounded bg-black/70 backdrop-blur-sm px-2 py-0.5 text-xs font-medium text-white">
        {tile.label}
      </span>
    </div>
  )
}

// Flex + intrinsische Groesse (h + aspect-video) statt Grid-Stretch: so bleibt das
// Kamera-Seitenverhaeltnis immer sauber 16:9, egal wie breit der verfuegbare Platz ist.
export function CamGrid({ tiles }: { tiles: CamTile[] }) {
  return (
    <div className="flex justify-center gap-3">
      {tiles.map((tile) => (
        <VideoTile key={tile.key} tile={tile} />
      ))}
    </div>
  )
}
