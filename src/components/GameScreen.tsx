import { useEffect, useMemo, useRef, useState } from 'react'
import { useRoom } from '../hooks/useRoom'
import { useBalls } from '../hooks/useBalls'
import { useTeamSlots } from '../hooks/useTeamSlots'
import { useWebRTCMesh } from '../hooks/useWebRTCMesh'
import { CamGrid, type CamTile } from './CamGrid'
import { BallsGrid } from './BallsGrid'
import { TeamPanel } from './TeamPanel'
import { TurnBanner } from './TurnBanner'
import { LockButton } from './LockButton'
import { GameOverSummary } from './GameOverSummary'
import { HostSetupPanel } from './HostSetupPanel'
import { WaitingPanel } from './WaitingPanel'
import { CopyButton } from './CopyButton'
import { VolumeControl } from './VolumeControl'
import { useSfxVolume } from '../hooks/useSfxVolume'
import { rpc } from '../lib/rpc'
import { joinUrl, obsUrl } from '../lib/urls'
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
  const [revealedBallId, setRevealedBallId] = useState<string | null>(null)
  const [sfxVolume, setSfxVolume] = useSfxVolume()

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
  const isMyBall = showControls && mySeat != null && !!pendingBall && pendingBall.opened_by_seat === mySeat
  // Slots duerfen erst markiert/waehlbar werden, NACHDEM die Reveal-Animation durchgelaufen ist —
  // sonst waere die Kategorie schon durch die Markierung erkennbar, bevor sie offiziell gezeigt wird.
  const isRevealed = !!pendingBall && revealedBallId === pendingBall.id
  const selectableCategory: Category | null = isMyBall && isRevealed ? pendingBall!.category : null

  const [actionError, setActionError] = useState<string | null>(null)
  const showOverlayStage = !!room?.overlay_mode && (role === 'host' || role === 'obs')
  const overlayBoxRef = useRef<HTMLDivElement>(null)

  // Aussenrum soll das Hintergrundbild sichtbar bleiben, nur die 16:9-Flaeche selbst muss fuer OBS
  // echt transparent sein. Dafuer wird ein "Loch" exakt in Groesse/Position der Flaeche per
  // clip-path aus dem fixierten .app-background-Layer ausgeschnitten (das Element selbst hat keine
  // eigenen Kinder, ein Clip dort kann also nichts vom eigentlichen App-Inhalt mitclippen).
  useEffect(() => {
    if (!showOverlayStage) return
    const appBg = document.querySelector<HTMLElement>('.app-background')
    const box = overlayBoxRef.current
    if (!appBg || !box) return

    function update() {
      const bgRect = appBg!.getBoundingClientRect()
      const boxRect = box!.getBoundingClientRect()
      const holeLeft = boxRect.left - bgRect.left
      const holeTop = boxRect.top - bgRect.top
      const holeRight = boxRect.right - bgRect.left
      const holeBottom = boxRect.bottom - bgRect.top
      appBg!.style.clipPath =
        `path(evenodd, "M0 0H${bgRect.width}V${bgRect.height}H0Z` +
        `M${holeLeft} ${holeTop}H${holeRight}V${holeBottom}H${holeLeft}Z")`
    }

    update()
    window.addEventListener('resize', update)
    const observer = new ResizeObserver(update)
    observer.observe(box)

    return () => {
      window.removeEventListener('resize', update)
      observer.disconnect()
      appBg.style.clipPath = ''
    }
  }, [showOverlayStage])

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

  async function handleToggleOverlay() {
    if (!room) return
    setActionError(null)
    try {
      await rpc.setOverlayMode(roomId, !room.overlay_mode)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleUndo() {
    setActionError(null)
    try {
      await rpc.undoLastAction(roomId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleReset() {
    if (
      !window.confirm(
        'Draft wirklich zurücksetzen? Geöffnete Bälle, Platzierungen und Sperren gehen verloren. Der Content-Pool und die Teilnehmer bleiben erhalten.',
      )
    ) {
      return
    }
    setActionError(null)
    try {
      await rpc.resetDraft(roomId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  if (!room) return <p className="text-center text-neutral-400 py-10">Lade Raum…</p>

  const openerName =
    pendingBall && (participants.find((p) => p.seat === pendingBall.opened_by_seat)?.display_name ?? 'Teilnehmer')

  return (
    <div
      className={`flex flex-col gap-2.5 w-full max-w-[2100px] mx-auto p-2.5 ${showOverlayStage ? 'h-screen' : ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="brand-title text-lg text-white tracking-tight">120 Mystery Pokéballs!</h1>
          {role !== 'obs' && (
            <span className="text-xs font-mono rounded-full bg-neutral-800 border border-white/10 px-2.5 py-0.5 text-neutral-300">
              Code: {room.code}
            </span>
          )}
          {showControls && role !== 'obs' && (
            <button
              onClick={() => setCamEnabled((v) => !v)}
              className="text-xs rounded bg-neutral-800 hover:bg-neutral-700 border border-white/10 px-2.5 py-1 text-neutral-300"
            >
              {camEnabled ? 'Kamera deaktivieren' : 'Kamera aktivieren'}
            </button>
          )}
          {camError && <span className="text-xs text-red-400">{camError}</span>}
          {role !== 'obs' && <VolumeControl volume={sfxVolume} onChange={setSfxVolume} />}
        </div>
        {role === 'host' && (
          <div className="flex items-center gap-2">
            <CopyButton value={joinUrl(room.code)} label="Einladungslink kopieren" />
            <CopyButton value={obsUrl(room.id, room.obs_token)} label="OBS-Link kopieren" />
            {room.status !== 'setup' && (
              <>
                <button
                  onClick={handleToggleOverlay}
                  className="text-xs rounded bg-neutral-800 hover:bg-neutral-700 border border-white/10 px-2.5 py-1 text-neutral-300"
                >
                  {room.overlay_mode ? 'Zur normalen Ansicht' : '16:9-Overlay'}
                </button>
                <button
                  onClick={handleUndo}
                  className="text-xs rounded bg-neutral-800 hover:bg-neutral-700 border border-white/10 px-2.5 py-1 text-neutral-300"
                >
                  Rückgängig
                </button>
                <button
                  onClick={handleReset}
                  className="text-xs rounded bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 px-2.5 py-1 text-red-300"
                >
                  Reset
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <CamGrid tiles={tiles} />

      {room.status !== 'setup' && actionError && (
        <p className="text-center text-sm text-red-400">{actionError}</p>
      )}

      {room.status === 'setup' ? (
        role === 'host' ? (
          <HostSetupPanel room={room} participants={participants} />
        ) : (
          <WaitingPanel
            text={
              role === 'obs'
                ? 'Der Host bereitet die Runde vor…'
                : 'Der Host bereitet den Inhalts-Pool vor. Gleich geht’s los!'
            }
          />
        )
      ) : showOverlayStage ? (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div ref={overlayBoxRef} className="aspect-video h-full max-w-full border-2 border-dashed border-white/40" />
        </div>
      ) : (
        <>
          <TurnBanner room={room} participants={participants} />
          {room.status === 'finished' && <GameOverSummary />}

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 items-start">
            <TeamPanel
              seat={1}
              displayName={seat1?.display_name ?? 'Teilnehmer 1'}
              locked={seat1?.locked ?? false}
              isYourTurn={room.status === 'drafting' && room.current_turn_seat === 1}
              slots={slots.filter((s) => s.seat === 1)}
              selectableCategory={mySeat === 1 ? selectableCategory : null}
              onSelectSlot={mySeat === 1 ? handleSelectSlot : undefined}
            />

            <div className="w-full lg:w-[500px] shrink-0">
              <BallsGrid
                roomId={roomId}
                balls={balls}
                canDraw={!!canDraw}
                onDraw={handleDraw}
                revealBall={pendingBall}
                isMine={isMyBall}
                openerName={openerName || ''}
                onRevealed={() => pendingBall && setRevealedBallId(pendingBall.id)}
                isController={isMyTurn}
                isFollower={role === 'host' || role === 'obs'}
                sfxVolume={sfxVolume}
              />
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
        </>
      )}
    </div>
  )
}
