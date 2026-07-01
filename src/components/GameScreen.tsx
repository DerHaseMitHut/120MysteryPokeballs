import { useMemo, useState } from 'react'
import { useRoom } from '../hooks/useRoom'
import { useBalls } from '../hooks/useBalls'
import { useTeamSlots } from '../hooks/useTeamSlots'
import { useWebRTCMesh } from '../hooks/useWebRTCMesh'
import { CamGrid, type CamTile } from './CamGrid'
import { BallsGrid } from './BallsGrid'
import { TeamPanel } from './TeamPanel'
import { TurnBanner } from './TurnBanner'
import { LockButton } from './LockButton'
import { RevealBanner } from './RevealBanner'
import { GameOverSummary } from './GameOverSummary'
import { rpc } from '../lib/rpc'
import type { Category, Seat } from '../lib/database.types'

export type ViewerRole = 'host' | 'obs' | Seat

interface Props {
  roomId: string
  myUserId: string
  role: ViewerRole
  showControls: boolean
}

export function GameScreen({ roomId, myUserId, role, showControls }: Props) {
  const { room, participants } = useRoom(roomId)
  const { balls } = useBalls(roomId)
  const { slots } = useTeamSlots(roomId)
  const [camEnabled, setCamEnabled] = useState(false)

  const mySeat: Seat | null = role === 1 || role === 2 ? role : null

  const { localStream, remoteStreams, camError } = useWebRTCMesh(roomId, myUserId, camEnabled, {
    receiveOnly: role === 'obs',
  })

  const seat1 = participants.find((p) => p.seat === 1)
  const seat2 = participants.find((p) => p.seat === 2)

  const tiles: CamTile[] = useMemo(() => {
    function tileFor(key: string, label: string, ownerUserId: string | null | undefined): CamTile {
      const isLocal = role !== 'obs' && ownerUserId === myUserId
      return { key, label, isLocal, stream: isLocal ? localStream : ownerUserId ? remoteStreams.get(ownerUserId) ?? null : null }
    }
    return [
      tileFor('seat1', seat1?.display_name || 'Teilnehmer 1', seat1?.user_id),
      tileFor('host', 'Host', room?.host_user_id),
      tileFor('seat2', seat2?.display_name || 'Teilnehmer 2', seat2?.user_id),
    ]
  }, [seat1, seat2, room, localStream, remoteStreams, myUserId, role])

  const pendingBall = useMemo(() => {
    for (const ball of balls.values()) {
      if (ball.opened && ball.placed_field == null) return ball
    }
    return null
  }, [balls])

  const myParticipant = mySeat ? participants.find((p) => p.seat === mySeat) : null
  const isMyTurn = mySeat != null && room?.status === 'drafting' && room.current_turn_seat === mySeat
  const canDraw = showControls && isMyTurn && !pendingBall && !myParticipant?.locked
  const canLock = showControls && isMyTurn && !pendingBall && !myParticipant?.locked
  const selectableCategory: Category | null =
    showControls && mySeat != null && pendingBall && pendingBall.opened_by_seat === mySeat
      ? pendingBall.category
      : null

  const [actionError, setActionError] = useState<string | null>(null)

  async function handleDraw(number: number) {
    setActionError(null)
    try {
      await rpc.drawBall(roomId, number)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleSelectSlot(fieldIndex: number, slotType: Category, slotOrdinal: number) {
    if (!pendingBall) return
    setActionError(null)
    try {
      await rpc.placeBall(roomId, pendingBall.id, fieldIndex, slotType, slotOrdinal)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleLock() {
    setActionError(null)
    try {
      await rpc.lockTeam(roomId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  if (!room) return <p className="text-center text-neutral-400 py-10">Lade Raum…</p>

  const openerName =
    pendingBall && (participants.find((p) => p.seat === pendingBall.opened_by_seat)?.display_name ?? 'Teilnehmer')

  return (
    <div className="flex flex-col gap-4 w-full max-w-[1800px] mx-auto p-4">
      <CamGrid tiles={tiles} />

      {showControls && role !== 'obs' && (
        <div className="flex justify-center">
          <button
            onClick={() => setCamEnabled((v) => !v)}
            className="text-xs rounded bg-neutral-800 hover:bg-neutral-700 border border-white/10 px-3 py-1 text-neutral-300"
          >
            {camEnabled ? 'Kamera & Mikrofon deaktivieren' : 'Kamera & Mikrofon aktivieren'}
          </button>
          {camError && <span className="text-xs text-red-400 ml-2">{camError}</span>}
        </div>
      )}

      <TurnBanner room={room} participants={participants} />
      {room.status === 'finished' && <GameOverSummary />}
      {pendingBall && <RevealBanner ball={pendingBall} isMine={selectableCategory != null} openerName={openerName || ''} />}
      {actionError && <p className="text-center text-sm text-red-400">{actionError}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 items-start">
        <TeamPanel
          seat={1}
          displayName={seat1?.display_name ?? 'Teilnehmer 1'}
          locked={seat1?.locked ?? false}
          isYourTurn={room.status === 'drafting' && room.current_turn_seat === 1}
          slots={slots.filter((s) => s.seat === 1)}
          selectableCategory={mySeat === 1 ? selectableCategory : null}
          onSelectSlot={mySeat === 1 ? handleSelectSlot : undefined}
        />

        <div className="w-full lg:w-[640px]">
          <BallsGrid balls={balls} canDraw={!!canDraw} onDraw={handleDraw} />
        </div>

        <TeamPanel
          seat={2}
          displayName={seat2?.display_name ?? 'Teilnehmer 2'}
          locked={seat2?.locked ?? false}
          isYourTurn={room.status === 'drafting' && room.current_turn_seat === 2}
          slots={slots.filter((s) => s.seat === 2)}
          selectableCategory={mySeat === 2 ? selectableCategory : null}
          onSelectSlot={mySeat === 2 ? handleSelectSlot : undefined}
          align="right"
        />
      </div>

      {canLock && (
        <div className="flex justify-center">
          <LockButton onLock={handleLock} disabled={!canLock} />
        </div>
      )}
    </div>
  )
}
