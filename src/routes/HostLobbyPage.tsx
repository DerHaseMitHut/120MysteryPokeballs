import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAnonymousSession } from '../hooks/useAnonymousSession'
import { useRoom } from '../hooks/useRoom'
import { InviteLinksPanel } from '../components/InviteLinksPanel'
import { GameScreen } from '../components/GameScreen'
import { rpc } from '../lib/rpc'
import type { Seat } from '../lib/database.types'

export function HostLobbyPage() {
  const { roomId = '' } = useParams()
  const { userId, loading: sessionLoading } = useAnonymousSession()
  const { room, participants, loading: roomLoading, error } = useRoom(roomId)
  const [startingSeat, setStartingSeat] = useState<Seat>(1)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [showLinks, setShowLinks] = useState(false)

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

  const bothJoined = participants.length === 2 && participants.every((p) => p.user_id)

  async function handleStart() {
    setStarting(true)
    setStartError(null)
    try {
      await rpc.startGame(roomId, startingSeat)
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  if (room.status === 'setup') {
    return (
      <div className="max-w-3xl mx-auto p-6 flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">Lobby</h1>
        <InviteLinksPanel room={room} participants={participants} />
        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-neutral-900/40 p-4">
          <span className="text-sm font-semibold text-neutral-200">Wer beginnt?</span>
          <div className="flex gap-3">
            {[1, 2].map((seat) => (
              <button
                key={seat}
                onClick={() => setStartingSeat(seat as Seat)}
                className={`rounded-lg px-4 py-2 text-sm border ${
                  startingSeat === seat
                    ? 'border-yellow-400 bg-yellow-400/10 text-yellow-300'
                    : 'border-white/10 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {participants.find((p) => p.seat === seat)?.display_name ?? `Teilnehmer ${seat}`}
              </button>
            ))}
          </div>
          <button
            disabled={!bothJoined || starting}
            onClick={handleStart}
            className="self-start rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold px-5 py-2"
          >
            {starting ? 'Startet…' : bothJoined ? 'Spiel starten' : 'Warte auf beide Teilnehmer…'}
          </button>
          {startError && <p className="text-sm text-red-400">{startError}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-center">
        <button
          onClick={() => setShowLinks((v) => !v)}
          className="text-xs text-neutral-500 hover:text-neutral-300 underline"
        >
          {showLinks ? 'Links verbergen' : 'Links & Raumcode anzeigen'}
        </button>
      </div>
      {showLinks && (
        <div className="max-w-3xl mx-auto w-full px-4">
          <InviteLinksPanel room={room} participants={participants} />
        </div>
      )}
      <GameScreen roomId={roomId} myUserId={userId} role="host" showControls />
    </div>
  )
}
