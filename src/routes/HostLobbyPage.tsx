import { useParams } from 'react-router-dom'
import { useAnonymousSession } from '../hooks/useAnonymousSession'
import { useRoom } from '../hooks/useRoom'
import { GameScreen } from '../components/GameScreen'

export function HostLobbyPage() {
  const { roomId = '' } = useParams()
  const { userId, loading: sessionLoading } = useAnonymousSession()
  const { room, loading: roomLoading, error } = useRoom(roomId)

  if (sessionLoading || roomLoading || !userId) {
    return <p className="text-center text-neutral-400 py-10">Lade…</p>
  }

  if (error || !room) {
    return (
      <p className="text-center text-red-400 py-10">
        Raum nicht gefunden — oder du bist nicht der Host dieses Raums.
      </p>
    )
  }

  return <GameScreen roomId={roomId} myUserId={userId} role="host" showControls />
}
