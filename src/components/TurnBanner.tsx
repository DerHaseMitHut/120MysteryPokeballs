import type { RoomRow, RoomParticipantRow } from '../lib/database.types'

interface Props {
  room: RoomRow
  participants: RoomParticipantRow[]
}

export function TurnBanner({ room, participants }: Props) {
  if (room.status === 'setup') {
    return <p className="text-center text-neutral-400 text-sm">Warte auf Spielstart…</p>
  }
  if (room.status === 'finished') {
    return <p className="text-center text-emerald-400 font-semibold text-sm">Draft beendet 🎉</p>
  }
  const active = participants.find((p) => p.seat === room.current_turn_seat)
  return (
    <p className="text-center text-sm text-neutral-300">
      Am Zug: <span className="font-semibold text-yellow-300">{active?.display_name ?? `Teilnehmer ${room.current_turn_seat}`}</span>
    </p>
  )
}
