import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAnonymousSession } from '../hooks/useAnonymousSession'
import { GameScreen } from '../components/GameScreen'
import { rpc } from '../lib/rpc'
import type { Seat } from '../lib/database.types'

export function PlayPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const { userId, loading: sessionLoading } = useAnonymousSession()
  const [roomId, setRoomId] = useState<string | null>(null)
  const [seat, setSeat] = useState<Seat | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    rpc
      .previewRoom(code)
      .then((result) => {
        if (cancelled) return
        const mine = result.seats.find((s) => s.is_me)
        if (!mine) {
          navigate(`/join/${code}`)
          return
        }
        setRoomId(result.room_id)
        setSeat(mine.seat)
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [userId, code, navigate])

  if (sessionLoading || !userId) return <p className="text-center text-neutral-400 py-10">Lade…</p>
  if (error) return <p className="text-center text-red-400 py-10">{error}</p>
  if (!roomId || !seat) return <p className="text-center text-neutral-400 py-10">Verbinde…</p>

  return <GameScreen roomId={roomId} myUserId={userId} role={seat} showControls />
}
