import { useState } from 'react'
import { PoolConfigPanel } from './PoolConfigPanel'
import { defaultPoolConfig, resolvePool, validatePoolConfig, type PoolConfig } from '../lib/poolResolution'
import { InviteLinksPanel } from './InviteLinksPanel'
import { rpc } from '../lib/rpc'
import type { RoomParticipantRow, RoomRow, Seat } from '../lib/database.types'

interface Props {
  room: RoomRow
  participants: RoomParticipantRow[]
}

export function HostSetupPanel({ room, participants }: Props) {
  const [poolConfig, setPoolConfig] = useState<PoolConfig>(defaultPoolConfig())
  const [startingSeat, setStartingSeat] = useState<Seat>(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bothJoined = participants.length === 2 && participants.every((p) => p.user_id)
  const validationErrors = validatePoolConfig(poolConfig)

  async function handleStart() {
    setBusy(true)
    setError(null)
    try {
      await rpc.setContentPool(room.id, resolvePool(poolConfig))
      await rpc.startGame(room.id, startingSeat)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-6xl mx-auto w-full">
      <InviteLinksPanel room={room} participants={participants} />

      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-neutral-900/60 shadow-xl shadow-black/30 backdrop-blur-sm p-5">
        <div>
          <h2 className="text-lg font-bold text-white">Inhalts-Pool</h2>
          <p className="text-sm text-neutral-400 mt-0.5">
            Lege pro Kategorie Anzahl und Auswahlmodus fest (zufällig oder manuell, bei Pokémon zusätzlich mit
            Filtern). Diese Werte werden beim Spielstart zufällig auf die Pokébälle verteilt.
          </p>
        </div>
        <PoolConfigPanel value={poolConfig} onChange={setPoolConfig} />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-neutral-900/60 shadow-xl shadow-black/30 backdrop-blur-sm p-5">
        <span className="text-sm font-semibold text-neutral-200">Wer beginnt?</span>
        <div className="flex gap-3">
          {[1, 2].map((seat) => (
            <button
              key={seat}
              onClick={() => setStartingSeat(seat as Seat)}
              className={`rounded-lg px-4 py-2 text-sm border transition ${
                startingSeat === seat
                  ? 'border-yellow-400 bg-yellow-400/10 text-yellow-300'
                  : 'border-white/10 text-neutral-300 hover:bg-neutral-800'
              }`}
            >
              {participants.find((p) => p.seat === seat)?.display_name ?? `Teilnehmer ${seat}`}
            </button>
          ))}
        </div>
        {validationErrors.length > 0 && (
          <ul className="text-xs text-amber-400 list-disc list-inside">
            {validationErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <button
          disabled={!bothJoined || validationErrors.length > 0 || busy}
          onClick={handleStart}
          className="self-start rounded-lg bg-gradient-to-b from-red-500 to-red-700 hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 shadow-lg shadow-red-900/30 transition"
        >
          {busy ? 'Startet…' : !bothJoined ? 'Warte auf beide Teilnehmer…' : validationErrors.length > 0 ? 'Pool noch unvollständig' : 'Spiel starten'}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  )
}
