import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAnonymousSession } from '../hooks/useAnonymousSession'
import { supabase } from '../lib/supabaseClient'
import { GameScreen } from '../components/GameScreen'

// Nur eine einmalige (nicht live abonnierte) Existenzpruefung -- die eigentliche, fortlaufend
// aktuelle Raum-Live-Ansicht kommt aus GameScreens eigenem useRoom()-Aufruf. Fruehrer riefen
// HostLobbyPage UND GameScreen unabhaengig voneinander useRoom() auf, wodurch zwei Realtime-
// Channels um denselben Topic-Namen konkurrierten (freshChannel() killt dabei den jeweils
// aelteren) -- das liess Aenderungen wie einen Host-Reset (rooms.status -> 'setup') teils nicht
// zuverlaessig bei diesem Tab ankommen, obwohl Teilnehmer sie sofort sahen.
export function HostLobbyPage() {
  const { roomId = '' } = useParams()
  const { userId, loading: sessionLoading } = useAnonymousSession()
  const [exists, setExists] = useState<boolean | null>(null)

  useEffect(() => {
    if (!roomId) return
    let cancelled = false
    supabase
      .from('rooms')
      .select('id')
      .eq('id', roomId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setExists(!!data)
      })
    return () => {
      cancelled = true
    }
  }, [roomId])

  if (sessionLoading || exists === null || !userId) {
    return <p className="text-center text-neutral-400 py-10">Lade…</p>
  }

  if (!exists) {
    return (
      <p className="text-center text-red-400 py-10">
        Raum nicht gefunden — oder du bist nicht der Host dieses Raums.
      </p>
    )
  }

  return <GameScreen roomId={roomId} myUserId={userId} role="host" showControls />
}
