import { useEffect, useMemo, useRef, useState } from 'react'
import { BallCell } from './BallCell'
import { BallRevealOverlay } from './BallRevealOverlay'
import { supabase, freshChannel } from '../lib/supabaseClient'
import type { BallWithValue } from '../hooks/useBalls'
import type { Seat } from '../lib/database.types'

const PER_PAGE = 20

interface Props {
  roomId: string
  balls: Map<number, BallWithValue>
  totalBalls: number
  canDraw: boolean
  onDraw: (number: number) => void
  revealBall: BallWithValue | null
  isMine: boolean
  openerName: string
  onRevealed?: () => void
  // isController: aktiver ziehender Teilnehmer — dessen Seiten-Navigation wird gebroadcastet.
  // isFollower: uebernimmt eingehende Seiten automatisch, eigene Blaetter-Buttons entfallen.
  isController: boolean
  isFollower: boolean
  // mySeat: eigener Sitzplatz (null fuer Host/OBS) — wird beim Tracken mitgesendet, damit
  // Follower gezielt den Eintrag des aktiven Spielers auswaehlen koennen statt "irgendeinen".
  mySeat: Seat | null
  activeSeat: Seat | null
  sfxVolume: number
}

export function BallsGrid({
  roomId,
  balls,
  totalBalls,
  canDraw,
  onDraw,
  revealBall,
  isMine,
  openerName,
  onRevealed,
  isController,
  isFollower,
  mySeat,
  activeSeat,
  sfxVolume,
}: Props) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const channelRef = useRef<ReturnType<typeof freshChannel> | null>(null)
  const isFollowerRef = useRef(isFollower)
  isFollowerRef.current = isFollower
  const isControllerRef = useRef(isController)
  isControllerRef.current = isController
  const pageRef = useRef(page)
  pageRef.current = page
  const mySeatRef = useRef(mySeat)
  mySeatRef.current = mySeat
  const activeSeatRef = useRef(activeSeat)
  activeSeatRef.current = activeSeat

  const pageCount = Math.ceil(totalBalls / PER_PAGE)
  const numbers = useMemo(() => Array.from({ length: totalBalls }, (_, i) => i + 1), [totalBalls])
  const pageNumbers = numbers.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)
  const openedCount = useMemo(() => {
    let count = 0
    for (const b of balls.values()) if (b.opened) count++
    return count
  }, [balls])

  const highlighted = search ? Number(search) : null

  useEffect(() => {
    if (highlighted && highlighted >= 1 && highlighted <= totalBalls) {
      setPage(Math.floor((highlighted - 1) / PER_PAGE))
    }
  }, [highlighted, totalBalls])

  // Presence (nicht Broadcast!) fuer die Seiten-Synchronisation: der aktive Teilnehmer "trackt"
  // seine aktuelle Seite, Host/OBS lesen sie ueber den 'sync'-Event. Presence liefert bei jedem
  // Sync sofort den VOLLEN aktuellen Stand — anders als Broadcast-Events, die ein spaeter
  // beitretender Betrachter (z.B. OBS, erst nach dem Umblaettern geoeffnet) sonst verpassen wuerde.
  //
  // Ein Host-/OBS-Tab laeuft oft ueber die komplette (lange) Draft-Session im Hintergrund, wo der
  // Realtime-Socket gelegentlich getrennt wird (Netzwerk-Hänger, Tab-Throttling). Ohne aktives
  // Neuverbinden bliebe das Mitblaettern dann fuer den Rest der Session tot. Deshalb bei jedem
  // nicht-SUBSCRIBED Endzustand nach kurzer Pause neu verbinden.
  useEffect(() => {
    let cancelled = false
    let channel: ReturnType<typeof freshChannel> | null = null
    let retryTimer: ReturnType<typeof setTimeout>

    function connect() {
      if (cancelled) return
      const ch = freshChannel(`room:${roomId}:ui`)
      channel = ch
      ch.on('presence', { event: 'sync' }, () => {
        if (!isFollowerRef.current) return
        const state = ch.presenceState<{ page: number; seat: number | null }>()
        for (const key in state) {
          // Presence haeuft bei mehreren track()-Aufrufen auf derselben Verbindung mehrere Metas
          // im selben Key an (Realtime ersetzt sie nicht) — der letzte Eintrag ist der aktuelle.
          // Gezielt nach dem Eintrag des GERADE aktiven Spielers suchen (statt "irgendeinen"
          // Eintrag zu nehmen) — sonst kann ein kurzzeitig noch praesenter, veralteter Eintrag
          // (z.B. vom vorigen Zug) die eigentliche Aktualisierung ueberschreiben/verdecken.
          const metas = state[key]
          const entry = metas?.[metas.length - 1]
          if (entry && typeof entry.page === 'number' && entry.seat === activeSeatRef.current) {
            setPage(entry.page)
            break
          }
        }
      })
      ch.subscribe((status) => {
        if (cancelled) return
        if (status === 'SUBSCRIBED') {
          channelRef.current = ch
          if (isControllerRef.current) ch.track({ page: pageRef.current, seat: mySeatRef.current })
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          channelRef.current = null
          retryTimer = setTimeout(connect, 2000)
        }
      })
    }

    connect()

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      if (channel) supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [roomId])

  useEffect(() => {
    const channel = channelRef.current
    if (!channel) return
    if (isController) {
      channel.track({ page, seat: mySeat })
    } else {
      channel.untrack()
    }
  }, [isController, page, mySeat])

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-neutral-900/50 shadow-xl shadow-black/30 backdrop-blur-sm p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-neutral-300">Pokébälle (1–{totalBalls})</h3>
          <span className="text-xs font-mono rounded-full bg-neutral-800 border border-white/10 px-2 py-0.5 text-neutral-400">
            {openedCount}/{totalBalls} geöffnet
          </span>
        </div>
        <input
          type="number"
          min={1}
          max={totalBalls}
          placeholder="Nr. suchen"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-24 rounded-md bg-neutral-950/60 border border-white/10 focus:border-red-500/50 focus:outline-none px-2 py-1 text-sm text-white placeholder:text-neutral-500 transition-colors"
        />
      </div>

      {/* Feste 5:4-Flaeche (5 Spalten x 4 Reihen quadratischer Zellen), damit das Reveal-Overlay
          exakt die gleiche Flaeche einnimmt, die sonst die Ball-Kacheln belegen. */}
      <div className="relative aspect-[5/4]">
        {revealBall ? (
          <BallRevealOverlay
            ball={revealBall}
            isMine={isMine}
            openerName={openerName}
            onRevealed={onRevealed}
            sfxVolume={sfxVolume}
          />
        ) : (
          <div className="grid grid-cols-5 gap-2.5 h-full">
            {pageNumbers.map((n) => (
              <div key={n} className={highlighted === n ? 'ring-2 ring-yellow-400 rounded-xl' : undefined}>
                <BallCell number={n} ball={balls.get(n)} canDraw={canDraw} onDraw={onDraw} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-sm">
        {isFollower ? (
          <span className="text-neutral-600 text-xs italic">folgt automatisch</span>
        ) : (
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 text-neutral-200 transition"
          >
            ← Zurück
          </button>
        )}
        <span className="text-neutral-500 text-xs">
          Seite {page + 1} / {pageCount} · Bälle {page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, totalBalls)}
        </span>
        {!isFollower && (
          <button
            disabled={page === pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            className="rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 text-neutral-200 transition"
          >
            Weiter →
          </button>
        )}
      </div>
    </div>
  )
}
