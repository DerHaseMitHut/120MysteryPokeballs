import { useEffect, useMemo, useRef, useState } from 'react'
import { useRoom } from '../hooks/useRoom'
import { useBalls } from '../hooks/useBalls'
import { useTeamSlots } from '../hooks/useTeamSlots'
import { usePlayerJokers } from '../hooks/usePlayerJokers'
import { useWebRTCMesh } from '../hooks/useWebRTCMesh'
import { CamGrid, type CamTile } from './CamGrid'
import { BallsGrid } from './BallsGrid'
import { TeamPanel } from './TeamPanel'
import type { JokerFieldMode } from './FieldCard'
import { JOKER_LABELS } from '../lib/jokers'
import { TurnBanner } from './TurnBanner'
import { LockButton } from './LockButton'
import { GameOverSummary } from './GameOverSummary'
import { HostSetupPanel } from './HostSetupPanel'
import { WaitingPanel } from './WaitingPanel'
import { CopyButton } from './CopyButton'
import { EditableName } from './EditableName'
import { VolumeControl } from './VolumeControl'
import { useSfxVolume } from '../hooks/useSfxVolume'
import { rpc } from '../lib/rpc'
import { joinUrl, obsUrl } from '../lib/urls'
import { EMPTY_POKEMON_FILTERS, randomPokemonFormCandidates } from '../lib/poolResolution'
import type { JokerType } from '../lib/jokers'
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
  const { jokers } = usePlayerJokers(roomId)
  const [camEnabled, setCamEnabled] = useState(false)
  const [revealedBallId, setRevealedBallId] = useState<string | null>(null)
  const [sfxVolume, setSfxVolume] = useSfxVolume()
  const [armedJoker, setArmedJoker] = useState<JokerType | null>(null)
  const [wechselFirstSlotId, setWechselFirstSlotId] = useState<string | null>(null)
  const [wechselFirstSlotType, setWechselFirstSlotType] = useState<Category | null>(null)
  const [jokerError, setJokerError] = useState<string | null>(null)
  const [vetoFlash, setVetoFlash] = useState<{ ballNumber: number } | null>(null)

  const mySeat: Seat | null = role === 1 || role === 2 ? role : null

  const { localStream, remoteStreams, peerStatuses, camError } = useWebRTCMesh(roomId, myUserId, camEnabled, {
    receiveOnly: role === 'obs',
  })

  const seat1 = participants.find((p) => p.seat === 1)
  const seat2 = participants.find((p) => p.seat === 2)

  const tiles: CamTile[] = useMemo(() => {
    function tileFor(key: string, label: string, ownerUserId: string | null | undefined): CamTile {
      const isLocal = role !== 'obs' && ownerUserId === myUserId
      return {
        key,
        label,
        isLocal,
        stream: isLocal ? localStream : ownerUserId ? remoteStreams.get(ownerUserId) ?? null : null,
        status: !isLocal && ownerUserId ? peerStatuses.get(ownerUserId) : undefined,
      }
    }
    return [
      tileFor('seat1', seat1?.display_name || 'Teilnehmer 1', seat1?.user_id),
      tileFor('host', room?.host_display_name || 'Host', room?.host_user_id),
      tileFor('seat2', seat2?.display_name || 'Teilnehmer 2', seat2?.user_id),
    ]
  }, [seat1, seat2, room, localStream, remoteStreams, peerStatuses, myUserId, role])

  const pendingBall = useMemo(() => {
    for (const ball of balls.values()) {
      if (ball.opened && ball.placed_field == null && !ball.discarded) return ball
    }
    return null
  }, [balls])

  // Kleine Zwischen-Animation fuers Verwerfen eines Balls per Veto-Joker (statt dass er einfach
  // verschwindet und sofort wieder das Grid zu sehen ist): erkennt einen frischen
  // false->true-Uebergang von "discarded" ueber die geteilten Realtime-Baelle -- damit sehen ALLE
  // Betrachter (nicht nur die vetoende Person) dieselbe kurze "Veto!"-Einblendung, so wie auch die
  // normale Ball-Enthuellung fuer alle synchron laeuft.
  const prevBallsRef = useRef<typeof balls | null>(null)
  const vetoFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const prev = prevBallsRef.current
    if (prev) {
      for (const [number, ball] of balls) {
        if (ball.discarded && !prev.get(number)?.discarded) {
          if (vetoFlashTimerRef.current) clearTimeout(vetoFlashTimerRef.current)
          setVetoFlash({ ballNumber: number })
          vetoFlashTimerRef.current = setTimeout(() => setVetoFlash(null), 1400)
          break
        }
      }
    }
    prevBallsRef.current = balls
  }, [balls])
  useEffect(() => () => {
    if (vetoFlashTimerRef.current) clearTimeout(vetoFlashTimerRef.current)
  }, [])

  const myParticipant = mySeat ? participants.find((p) => p.seat === mySeat) : null
  const isMyTurn = mySeat != null && room?.status === 'drafting' && room.current_turn_seat === mySeat
  const canDraw = showControls && isMyTurn && !pendingBall && !myParticipant?.locked
  const canLock = showControls && isMyTurn && !pendingBall && !myParticipant?.locked
  const isMyBall = showControls && mySeat != null && !!pendingBall && pendingBall.opened_by_seat === mySeat
  // Slots duerfen erst markiert/waehlbar werden, NACHDEM die Reveal-Animation durchgelaufen ist —
  // sonst waere die Kategorie schon durch die Markierung erkennbar, bevor sie offiziell gezeigt wird.
  const isRevealed = !!pendingBall && revealedBallId === pendingBall.id
  const selectableCategory: Category | null = isMyBall && isRevealed ? pendingBall!.category : null

  const myJokers = mySeat != null ? jokers.filter((j) => j.seat === mySeat && !j.used) : []
  const hasVeto = myJokers.some((j) => j.joker_type === 'veto')
  const canVeto = isMyBall && isRevealed && hasVeto
  // Wondertrade/Wechsel sind freie Aktionen ohne Zugwechsel -- waehrend des Drafts nur am eigenen
  // Zug, nach Draft-Ende (kein "Zug" mehr vorhanden) aber weiterhin nutzbar, damit restliche Joker
  // nicht ungenutzt verfallen. Veto braucht ohnehin immer einen offenen unplatzierten Ball, der
  // nach Draft-Ende nie existiert -- dafuer ist keine Sonderbehandlung noetig.
  const canUseFreeJokers = showControls && mySeat != null && (isMyTurn || room?.status === 'finished')

  // Der Joker eines gerade offenen, noch nicht enthuellten Balls wird bewusst NICHT sofort in der
  // Team-Leiste angezeigt (das wuerde die Spannung der Ball-Enthuellung nehmen) -- stattdessen
  // erst zusammen mit der Enthuellung in der Mitte gezeigt (siehe BallRevealOverlay/joker-Prop)
  // und taucht erst danach (isRevealed) bei den Badges des jeweiligen Sitzplatzes auf.
  const pendingJoker = pendingBall
    ? jokers.find((j) => j.source_ball_id === pendingBall.id && !j.used) ?? null
    : null
  const hiddenPendingJokerId = pendingJoker && !isRevealed ? pendingJoker.id : null

  function jokersForSeat(seat: Seat): typeof jokers {
    return jokers.filter((j) => j.seat === seat && !j.used && j.id !== hiddenPendingJokerId)
  }

  const [actionError, setActionError] = useState<string | null>(null)
  const showOverlayStage = !!room?.overlay_mode && (role === 'host' || role === 'obs')
  // Kampfrahmen (fuer die separat in OBS eingeblendete Kampf-Aufnahme) links, dazu eine hochkante
  // Flaeche rechts (fuer einen separat eingeblendeten Chat) -- beide bleiben leere Platzhalter, nur
  // ihre Position/Groesse zaehlt fuers Hintergrund-Loch (siehe Effekt unten).
  const overlayBoxRef = useRef<HTMLDivElement>(null)
  const overlayChatBoxRef = useRef<HTMLDivElement>(null)

  // Aussenrum soll das Hintergrundbild sichtbar bleiben, nur die beiden Platzhalter-Flaechen muessen
  // fuer OBS echt transparent sein. Dafuer werden "Loecher" exakt in Groesse/Position der Flaechen
  // per clip-path aus dem fixierten .app-background-Layer ausgeschnitten (das Element selbst hat
  // keine eigenen Kinder, ein Clip dort kann also nichts vom eigentlichen App-Inhalt mitclippen).
  useEffect(() => {
    if (!showOverlayStage) return
    const appBg = document.querySelector<HTMLElement>('.app-background')
    const box = overlayBoxRef.current
    const chatBox = overlayChatBoxRef.current
    if (!appBg || !box || !chatBox) return

    function holePath(el: HTMLElement, bgRect: DOMRect) {
      const r = el.getBoundingClientRect()
      const left = r.left - bgRect.left
      const top = r.top - bgRect.top
      const right = r.right - bgRect.left
      const bottom = r.bottom - bgRect.top
      return `M${left} ${top}H${right}V${bottom}H${left}Z`
    }

    function update() {
      const bgRect = appBg!.getBoundingClientRect()
      appBg!.style.clipPath =
        `path(evenodd, "M0 0H${bgRect.width}V${bgRect.height}H0Z` +
        `${holePath(box!, bgRect)}${holePath(chatBox!, bgRect)}")`
    }

    update()
    window.addEventListener('resize', update)
    const observer = new ResizeObserver(update)
    observer.observe(box)
    observer.observe(chatBox)

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

  async function handleUseVeto() {
    setJokerError(null)
    try {
      await rpc.useVetoJoker(roomId)
    } catch (err) {
      setJokerError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleArmJoker(type: JokerType) {
    setJokerError(null)
    setWechselFirstSlotId(null)
    setWechselFirstSlotType(null)
    setArmedJoker((current) => (current === type ? null : type))
  }

  function handleCancelArmedJoker() {
    setJokerError(null)
    setArmedJoker(null)
    setWechselFirstSlotId(null)
    setWechselFirstSlotType(null)
  }

  async function handleWondertradePick(ballId: string) {
    setJokerError(null)
    const filters = room?.pokemon_filters ?? EMPTY_POKEMON_FILTERS
    const known = new Set(
      slots.filter((s) => s.slot_type === 'pokemon' && s.value != null).map((s) => s.value as string),
    )
    const candidates = randomPokemonFormCandidates(filters, known)
    if (candidates.length === 0) {
      setJokerError('Kein passendes Pokémon mehr verfügbar')
      return
    }
    for (const candidate of candidates.slice(0, 30)) {
      try {
        await rpc.useWondertradeJoker(roomId, ballId, candidate)
        setArmedJoker(null)
        return
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!msg.includes('bereits vergeben')) {
          setJokerError(msg)
          return
        }
        // Kollision mit einem noch versteckten Ball (der Client kennt dessen Wert nicht) —
        // naechsten Kandidaten probieren.
      }
    }
    setJokerError('Konnte kein neues Pokémon finden (zu viele Duplikate)')
  }

  async function handleWechselPick(slotId: string, slotType: Category) {
    setJokerError(null)
    if (!wechselFirstSlotId) {
      setWechselFirstSlotId(slotId)
      setWechselFirstSlotType(slotType)
      return
    }
    if (slotId === wechselFirstSlotId) {
      setWechselFirstSlotId(null)
      setWechselFirstSlotType(null)
      return
    }
    try {
      await rpc.useWechselJoker(roomId, wechselFirstSlotId, slotId)
      setArmedJoker(null)
      setWechselFirstSlotId(null)
      setWechselFirstSlotType(null)
    } catch (err) {
      setJokerError(err instanceof Error ? err.message : String(err))
    }
  }

  function jokerModeForSeat(seat: Seat): JokerFieldMode | null {
    if (armedJoker === 'wondertrade') {
      return { kind: 'wondertrade', onPickPokemon: handleWondertradePick }
    }
    if (armedJoker === 'wechsel') {
      return {
        kind: 'wechsel',
        ownTeam: seat === mySeat,
        firstSlotId: wechselFirstSlotId,
        firstSlotType: wechselFirstSlotType,
        onPickSlot: handleWechselPick,
      }
    }
    return null
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
          {role === 'host' && (
            <span className="flex items-center gap-1.5 text-xs rounded-full bg-neutral-800 border border-white/10 px-2.5 py-0.5 text-neutral-300">
              <span className="text-neutral-500">Dein Name:</span>
              <EditableName
                value={room.host_display_name ?? ''}
                placeholder="Host"
                onSave={(name) => rpc.setHostDisplayName(roomId, name)}
                className="text-neutral-200 hover:text-yellow-300 underline decoration-dotted decoration-neutral-500 underline-offset-2 transition-colors"
              />
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

      {!showOverlayStage && <CamGrid tiles={tiles} />}

      {room.status !== 'setup' && actionError && (
        <p className="text-center text-sm text-red-400">{actionError}</p>
      )}
      {room.status !== 'setup' && jokerError && (
        <p className="text-center text-sm text-red-400">{jokerError}</p>
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
        // Kampf-Aufnahme und Chat werden separat in OBS ueber diese beiden transparenten Flaechen
        // gelegt (siehe Hole-Cutting-Effekt oben). Links: Cams gleichmaessig ueber die volle Breite
        // gestreckt, direkt darunter der Kampfrahmen (gleiche Breite, fuellt die komplette
        // Resthoehe bis ganz nach unten). Rechts: hochkante Chat-Flaeche (9:16), oben/unten mit
        // Abstand statt komplett kantenbuendig gestreckt.
        <div className="flex-1 min-h-0 flex gap-3">
          <div className="flex flex-col gap-3 flex-1 min-w-0">
            <CamGrid tiles={tiles} stretch />
            <div ref={overlayBoxRef} className="flex-1 min-h-0 w-full border-2 border-dashed border-white/40" />
          </div>
          {/* Breite zuerst festlegen (definiter Wert aus der Zeilenbreite), Hoehe per aspect-ratio
              daraus ableiten -- NICHT umgekehrt (Hoehe per flex-grow in einer breiten-auto Spalte,
              Breite per aspect-ratio daraus): das fuehrt zu einem Zirkelbezug, den Browser mit
              Breite ~0 aufloesen (kollabierter Strich statt Box). justify-center zentriert die so
              bereits fertig bemessene Box senkrecht in der vollen Spaltenhoehe. */}
          <div className="w-[23%] shrink-0 h-full flex flex-col justify-center">
            <div ref={overlayChatBoxRef} className="w-full aspect-[9/16] border-2 border-dashed border-white/40" />
          </div>
        </div>
      ) : (
        <>
          <TurnBanner room={room} participants={participants} />
          {room.status === 'finished' && <GameOverSummary />}

          {armedJoker && (
            <div className="flex items-center justify-center gap-2 text-xs text-pink-300">
              <span>
                {armedJoker === 'wondertrade'
                  ? `${JOKER_LABELS.wondertrade} aktiv: Wähle ein Pokémon (eigenes oder gegnerisches)`
                  : wechselFirstSlotId
                    ? `${JOKER_LABELS.wechsel} aktiv: Wähle das zweite Feld`
                    : `${JOKER_LABELS.wechsel} aktiv: Wähle zwei gleichartige Felder in deinem Team`}
              </span>
              <button
                type="button"
                onClick={handleCancelArmedJoker}
                className="rounded bg-neutral-800 hover:bg-neutral-700 border border-white/10 px-2 py-0.5 text-neutral-300"
              >
                Abbrechen
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 items-start">
            <TeamPanel
              seat={1}
              displayName={seat1?.display_name ?? 'Teilnehmer 1'}
              locked={seat1?.locked ?? false}
              isYourTurn={room.status === 'drafting' && room.current_turn_seat === 1}
              slots={slots.filter((s) => s.seat === 1)}
              selectableCategory={mySeat === 1 && !armedJoker ? selectableCategory : null}
              onSelectSlot={mySeat === 1 ? handleSelectSlot : undefined}
              editable={mySeat === 1}
              onRename={mySeat === 1 ? (name) => rpc.setDisplayName(roomId, name) : undefined}
              jokerMode={jokerModeForSeat(1)}
              jokers={jokersForSeat(1)}
              jokersClickable={mySeat === 1 && canUseFreeJokers}
              canVeto={canVeto}
              armedJoker={armedJoker}
              onArmJoker={handleArmJoker}
              onUseVeto={handleUseVeto}
            />

            <div className="w-full lg:w-[500px] shrink-0">
              <BallsGrid
                roomId={roomId}
                balls={balls}
                totalBalls={balls.size}
                canDraw={!!canDraw}
                onDraw={handleDraw}
                revealBall={pendingBall}
                isMine={isMyBall}
                openerName={openerName || ''}
                onRevealed={() => pendingBall && setRevealedBallId(pendingBall.id)}
                isController={isMyTurn}
                isFollower={room.status === 'drafting' && !isMyTurn}
                mySeat={mySeat}
                activeSeat={room.current_turn_seat}
                sfxVolume={sfxVolume}
                canVeto={canVeto}
                onVeto={handleUseVeto}
                revealJoker={pendingJoker?.joker_type ?? null}
                vetoFlash={vetoFlash}
              />
            </div>

            <TeamPanel
              seat={2}
              displayName={seat2?.display_name ?? 'Teilnehmer 2'}
              locked={seat2?.locked ?? false}
              isYourTurn={room.status === 'drafting' && room.current_turn_seat === 2}
              slots={slots.filter((s) => s.seat === 2)}
              selectableCategory={mySeat === 2 && !armedJoker ? selectableCategory : null}
              onSelectSlot={mySeat === 2 ? handleSelectSlot : undefined}
              editable={mySeat === 2}
              onRename={mySeat === 2 ? (name) => rpc.setDisplayName(roomId, name) : undefined}
              align="right"
              jokerMode={jokerModeForSeat(2)}
              jokers={jokersForSeat(2)}
              jokersClickable={mySeat === 2 && canUseFreeJokers}
              canVeto={canVeto}
              armedJoker={armedJoker}
              onArmJoker={handleArmJoker}
              onUseVeto={handleUseVeto}
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
