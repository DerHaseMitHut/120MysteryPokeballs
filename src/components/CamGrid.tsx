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
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-neutral-900 flex items-center justify-center">
      {tile.stream ? (
        <video ref={ref} autoPlay playsInline muted={tile.isLocal} className="h-full w-full object-cover" />
      ) : (
        <span className="text-neutral-600 text-sm">Keine Kamera</span>
      )}
      <span className="absolute bottom-1 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
        {tile.label}
      </span>
    </div>
  )
}

export function CamGrid({ tiles }: { tiles: CamTile[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {tiles.map((tile) => (
        <VideoTile key={tile.key} tile={tile} />
      ))}
    </div>
  )
}
