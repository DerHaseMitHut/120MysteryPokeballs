import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase, freshChannel } from '../lib/supabaseClient'

type RtcSignal =
  | { kind: 'offer'; from: string; to: string; sdp: string }
  | { kind: 'answer'; from: string; to: string; sdp: string }
  | { kind: 'ice-candidate'; from: string; to: string; candidate: RTCIceCandidateInit }

// Mehrere STUN-Server (Redundanz -- fällt einer aus/ist langsam, bleiben genug fuer die
// Reflexive-Candidate-Ermittlung) plus den TURN-Relay explizit sowohl per UDP als auch per
// erzwungenem TCP (turn:...443?transport=tcp) eingetragen: reines UDP-TURN wird von manchen
// restriktiven Firmen-/Mobilfunk-Netzen komplett geblockt, waehrend TCP-ueber-443 meist
// durchkommt, weil es wie normaler HTTPS-Traffic aussieht -- genau die Faelle, in denen zwei
// Teilnehmer in unterschiedlichen Netzen sonst nie eine Route zueinander finden.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

export type PeerStatus = 'connecting' | 'connected' | 'reconnecting'

interface PeerEntry {
  connection: RTCPeerConnection
  stream: MediaStream
  // "Hoefliche" Seite zieht bei einer Offer-Kollision (beide bieten gleichzeitig an) ihr eigenes
  // Offer zurueck statt die Verbindung kaputtzuverhandeln -- Standard-Loesung fuer WebRTC-Glare
  // ("Perfect Negotiation", siehe MDN). Deterministisch aus den Peer-IDs abgeleitet, damit beide
  // Seiten unabhaengig auf die komplementaere Rolle kommen.
  polite: boolean
  makingOffer: boolean
  ignoreOffer: boolean
  negotiationPending: boolean
  restartAttempts: number
}

interface Options {
  // Reiner Empfaenger ohne eigene Kamera (fuer die OBS-Ansicht): nimmt trotzdem an der
  // Signalisierung teil, sendet aber nie eigene Spuren.
  receiveOnly?: boolean
}

const ICE_RESTART_MAX_ATTEMPTS = 5
const ICE_RESTART_BACKOFF_MS = 1500
const DISCONNECTED_GRACE_MS = 4000

export function useWebRTCMesh(
  roomId: string | null,
  myPeerId: string | null,
  camEnabled: boolean,
  options: Options = {},
) {
  const { receiveOnly = false } = options
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [peerStatuses, setPeerStatuses] = useState<Map<string, PeerStatus>>(new Map())
  const [camError, setCamError] = useState<string | null>(null)

  const peersRef = useRef<Map<string, PeerEntry>>(new Map())
  const channelRef = useRef<RealtimeChannel | null>(null)
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)
  const restartTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  // Wird von der Signalisierungs-Effekt-Instanz befuellt, damit der (separate) Kamera-Sync-Effekt
  // unten bei einem Kamera-An/Aus bestehende Verbindungen aktiv nachverhandeln kann, ohne dass
  // beide Effekte an dieselben Deps gebunden sein muessen (siehe Kommentar dort).
  const syncLocalTrackRef = useRef<(stream: MediaStream | null) => void>(() => {})

  useEffect(() => {
    if (receiveOnly || !camEnabled) {
      setLocalStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop())
        return null
      })
      return
    }
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        setLocalStream(stream)
      })
      .catch((err) => setCamError(err.message ?? 'Kamera nicht verfügbar'))
    return () => {
      cancelled = true
    }
  }, [camEnabled, receiveOnly])

  // Speist den lokalen Kamera-Track in bereits bestehende Peer-Verbindungen ein, OHNE sie
  // abzureissen. Frueher hing der komplette Signalisierungs-Effekt (unten) an `localStream`,
  // wodurch bei JEDEM Kamera-An/Aus alle Verbindungen geschlossen und neu aufgebaut wurden --
  // sichtbar als kurzer Blackscreen bei ALLEN Teilnehmern, nicht nur bei der schaltenden Person.
  // Delegiert die eigentliche Track-/Renegotiation-Arbeit an `syncLocalTrackRef.current`, die vom
  // Signalisierungs-Effekt gesetzt wird (dort leben `send`/Kollisions-Handling).
  useEffect(() => {
    localStreamRef.current = localStream
    syncLocalTrackRef.current(localStream)
  }, [localStream])

  useEffect(() => {
    if (!roomId || !myPeerId) return

    const channel = freshChannel(`room:${roomId}:rtc`, { config: { broadcast: { self: false } } })
    channelRef.current = channel

    function setStatus(otherId: string, status: PeerStatus) {
      setPeerStatuses((prev) => new Map(prev).set(otherId, status))
    }

    function clearRestartTimer(otherId: string) {
      const timer = restartTimersRef.current.get(otherId)
      if (timer) {
        clearTimeout(timer)
        restartTimersRef.current.delete(otherId)
      }
    }

    function send(signal: RtcSignal) {
      channel.send({ type: 'broadcast', event: 'rtc-signal', payload: signal })
    }

    // Einzige Stelle, die tatsaechlich ein Offer verschickt -- fuer die Erstverbindung, nach
    // Kamera-An/Aus UND fuer ICE-Restarts. Bewusst NICHT ueber das browsereigene
    // "negotiationneeded"-Event ausgeloest: das feuert bei einer reinen Transceiver-Richtungs-
    // aenderung (recvonly -> sendrecv, ohne neuen Track) nicht in allen Browsern zuverlaessig/
    // zeitnah genug, was genau dazu fuehrte, dass ein NACHTRAEGLICH aktiviertes Kamerabild bei
    // bereits verbundenen Gegenstellen nie ankam (nur der "Kamera war beim Verbinden schon an"-
    // Fall hat zuverlaessig funktioniert). Stattdessen wird hier an jeder Stelle, die den lokalen
    // Verhandlungsstand aendert, explizit und deterministisch negotiate() aufgerufen.
    async function negotiate(otherId: string, entry: PeerEntry, opts?: { iceRestart?: boolean }) {
      if (entry.makingOffer || entry.connection.signalingState !== 'stable') {
        entry.negotiationPending = true
        return
      }
      entry.makingOffer = true
      try {
        const offer = await entry.connection.createOffer(opts?.iceRestart ? { iceRestart: true } : undefined)
        await entry.connection.setLocalDescription(offer)
        send({ kind: 'offer', from: myPeerId!, to: otherId, sdp: entry.connection.localDescription!.sdp! })
      } catch (err) {
        console.error('RTC-Offer Fehler', err)
      } finally {
        entry.makingOffer = false
        if (entry.negotiationPending) {
          entry.negotiationPending = false
          negotiate(otherId, entry)
        }
      }
    }

    function getOrCreatePeer(otherId: string): PeerEntry {
      const existing = peersRef.current.get(otherId)
      if (existing) return existing
      const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      const stream = new MediaStream()
      const localTrack = localStreamRef.current?.getVideoTracks()[0] ?? null
      if (localTrack && localStreamRef.current) {
        connection.addTrack(localTrack, localStreamRef.current)
      } else {
        connection.addTransceiver('video', { direction: 'recvonly' })
      }

      const entry: PeerEntry = {
        connection,
        stream,
        polite: myPeerId! > otherId,
        makingOffer: false,
        ignoreOffer: false,
        negotiationPending: false,
        restartAttempts: 0,
      }
      peersRef.current.set(otherId, entry)
      setStatus(otherId, 'connecting')

      connection.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((t) => stream.addTrack(t))
        setRemoteStreams((prev) => new Map(prev).set(otherId, stream))
      }

      connection.onicecandidate = (event) => {
        if (event.candidate) {
          send({ kind: 'ice-candidate', from: myPeerId!, to: otherId, candidate: event.candidate.toJSON() })
        }
      }

      // Sicherheitsnetz zusaetzlich zu den expliziten negotiate()-Aufrufen -- schadet nicht
      // (negotiate() ist gegen doppelte/parallele Ausfuehrung abgesichert), faengt aber jeden
      // Aenderungspfad ab, den wir nicht explizit bedacht haben.
      connection.onnegotiationneeded = () => {
        negotiate(otherId, entry)
      }

      connection.onconnectionstatechange = () => {
        const state = connection.connectionState
        if (state === 'connected') {
          entry.restartAttempts = 0
          clearRestartTimer(otherId)
          setStatus(otherId, 'connected')
        } else if (state === 'failed') {
          setStatus(otherId, 'reconnecting')
          scheduleRestart(otherId, entry, 0)
        } else if (state === 'disconnected') {
          setStatus(otherId, 'reconnecting')
          scheduleRestart(otherId, entry, DISCONNECTED_GRACE_MS)
        } else if (state === 'closed') {
          teardownPeer(otherId)
        }
      }

      // Legt nur die Verbindung + den lokalen Transceiver an, verschickt aber bewusst noch KEIN
      // Offer -- das entscheidet der jeweilige Aufrufer (siehe handlePresenceSync/scheduleRestart
      // vs. handleSignal's Offer-Zweig, der dieselbe Funktion nutzt, um beim Empfang eines
      // fremden Offers erst die eigene Verbindung samt lokalem Track bereitzustellen, OHNE
      // gleichzeitig selbst ein konkurrierendes Offer loszuschicken).
      return entry
    }

    // Aktiv eine neue Verbindung anbieten (Erstkontakt oder Neuaufbau nach gescheitertem
    // Reconnect) -- getrennt von getOrCreatePeer(), damit das Erzeugen der Verbindung (auch beim
    // Beantworten eines fremden Offers noetig) nicht automatisch immer ein eigenes Offer ausloest.
    function offerTo(otherId: string) {
      const entry = getOrCreatePeer(otherId)
      negotiate(otherId, entry)
    }

    // Verbindungsabbrueche wurden bisher sofort final aufgegeben (Verbindung geschlossen, Tile
    // verschwunden) -- ein neues Angebot kam danach nur zustande, wenn die betroffene Person den
    // Raum verliess und wieder beitrat (Presence-"sync"), sonst half nur ein Reload. Jetzt wird
    // zuerst wiederholt per ICE-Restart versucht, dieselbe Verbindung zu reparieren; erst wenn das
    // mehrfach scheitert, wird die Verbindung verworfen und (von der urspruenglich anbietenden
    // Seite) aktiv neu angeboten, ohne auf ein Presence-Ereignis warten zu muessen.
    function scheduleRestart(otherId: string, entry: PeerEntry, delayMs: number) {
      clearRestartTimer(otherId)
      const timer = setTimeout(() => {
        const current = peersRef.current.get(otherId)
        if (!current || current !== entry) return
        const state = current.connection.connectionState
        if (state === 'connected' || state === 'closed') return
        if (entry.restartAttempts < ICE_RESTART_MAX_ATTEMPTS) {
          entry.restartAttempts += 1
          negotiate(otherId, entry, { iceRestart: true })
          scheduleRestart(otherId, entry, ICE_RESTART_BACKOFF_MS)
        } else {
          teardownPeer(otherId)
          if (myPeerId! < otherId) {
            offerTo(otherId)
          }
        }
      }, delayMs)
      restartTimersRef.current.set(otherId, timer)
    }

    function teardownPeer(otherId: string) {
      clearRestartTimer(otherId)
      const entry = peersRef.current.get(otherId)
      entry?.connection.close()
      peersRef.current.delete(otherId)
      setRemoteStreams((prev) => {
        const next = new Map(prev)
        next.delete(otherId)
        return next
      })
      setPeerStatuses((prev) => {
        const next = new Map(prev)
        next.delete(otherId)
        return next
      })
    }

    async function handleSignal(signal: RtcSignal) {
      if (signal.to !== myPeerId) return

      // Nur ein eingehendes Offer darf eine noch fehlende Verbindung ueberhaupt erst anlegen (samt
      // unserem lokalen Track/Transceiver, den die Antwort gleich mit einschliessen muss). Ein
      // Answer oder ICE-Candidate fuer eine Verbindung, die wir gar nicht kennen, kann nur verspaetet
      // eingetroffen/veraltet sein (die Gegenstelle hat inzwischen selbst schon aufgegeben) -- ein
      // Anlegen wuerde dort faelschlich ein eigenes, ungewolltes Offer auslösen.
      const entry = signal.kind === 'offer' ? getOrCreatePeer(signal.from) : peersRef.current.get(signal.from)
      if (!entry) return
      const connection = entry.connection

      if (signal.kind === 'offer') {
        const offerCollision = entry.makingOffer || connection.signalingState !== 'stable'
        entry.ignoreOffer = !entry.polite && offerCollision
        if (entry.ignoreOffer) return
        if (offerCollision) {
          await connection.setLocalDescription({ type: 'rollback' })
        }
        await connection.setRemoteDescription({ type: 'offer', sdp: signal.sdp })
        await flushPendingCandidates(signal.from, entry)
        const answer = await connection.createAnswer()
        await connection.setLocalDescription(answer)
        send({ kind: 'answer', from: myPeerId!, to: signal.from, sdp: connection.localDescription!.sdp! })
      } else if (signal.kind === 'answer') {
        if (connection.signalingState !== 'have-local-offer') return
        await connection.setRemoteDescription({ type: 'answer', sdp: signal.sdp })
        await flushPendingCandidates(signal.from, entry)
      } else if (signal.kind === 'ice-candidate') {
        if (connection.remoteDescription) {
          try {
            await connection.addIceCandidate(signal.candidate)
          } catch (err) {
            if (!entry.ignoreOffer) console.error('ICE-Candidate Fehler', err)
          }
        } else {
          const queue = pendingCandidatesRef.current.get(signal.from) ?? []
          queue.push(signal.candidate)
          pendingCandidatesRef.current.set(signal.from, queue)
        }
      }

      // Nach jeder abgeschlossenen Verhandlungsrunde: falls waehrenddessen eine weitere lokale
      // Aenderung (z.B. Kamera-Toggle) auflief und deshalb zurueckgestellt wurde, jetzt nachholen.
      if (connection.signalingState === 'stable' && entry.negotiationPending) {
        entry.negotiationPending = false
        negotiate(signal.from, entry)
      }
    }

    async function flushPendingCandidates(otherId: string, entry: PeerEntry) {
      const queue = pendingCandidatesRef.current.get(otherId)
      if (!queue) return
      for (const candidate of queue) {
        await entry.connection.addIceCandidate(candidate).catch((err) => console.error('ICE-Candidate Fehler', err))
      }
      pendingCandidatesRef.current.delete(otherId)
    }

    // Peer-Erkennung ueber Presence statt eines eigenen "join"-Broadcasts: ein 'sync'-Event
    // liefert bei JEDEM Subscriber (auch spaet dazustossenden) immer den VOLLEN aktuellen
    // Mitgliederstand, nicht nur ein einmaliges Ereignis. Ein Broadcast dagegen wird verpasst,
    // wenn der Empfaenger im Sende-Moment noch nicht fertig subscribed ist — genau das war die
    // Ursache dafuer, dass Kameras teils erst nach einem Reload auftauchten. Damit nicht beide
    // Seiten gleichzeitig ein Offer schicken, bietet bei jedem entdeckten Paar nur die Seite mit
    // der (lexikografisch) kleineren Peer-Id an.
    function handlePresenceSync() {
      const state = channel.presenceState<{ peerId: string }>()
      for (const key in state) {
        const metas = state[key]
        const entry = metas?.[metas.length - 1]
        const otherId = entry?.peerId
        if (!otherId || otherId === myPeerId || peersRef.current.has(otherId)) continue
        if (myPeerId! < otherId) {
          offerTo(otherId)
        }
      }
    }

    channel
      .on('broadcast', { event: 'rtc-signal' }, ({ payload }) => {
        handleSignal(payload as RtcSignal).catch((err) => console.error('RTC-Signal Fehler', err))
      })
      .on('presence', { event: 'sync' }, handlePresenceSync)
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        for (const p of leftPresences as unknown as { peerId: string }[]) {
          teardownPeer(p.peerId)
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ peerId: myPeerId })
        }
      })

    syncLocalTrackRef.current = (stream: MediaStream | null) => {
      const newTrack = stream?.getVideoTracks()[0] ?? null
      for (const [otherId, entry] of peersRef.current) {
        const [transceiver] = entry.connection.getTransceivers()
        if (!transceiver) {
          if (newTrack && stream) entry.connection.addTrack(newTrack, stream)
          continue
        }
        const directionChanged = transceiver.direction !== (newTrack ? 'sendrecv' : 'recvonly')
        transceiver.direction = newTrack ? 'sendrecv' : 'recvonly'
        if (transceiver.sender.track !== newTrack) {
          transceiver.sender.replaceTrack(newTrack).catch((err) => console.error('Kamera-Track tauschen fehlgeschlagen', err))
        }
        if (directionChanged) negotiate(otherId, entry)
      }
    }
    // Kamera koennte schon aktiviert worden sein, bevor dieser Effekt (neu) lief (z.B. Rejoin) --
    // einmal direkt synchronisieren statt auf die naechste `localStream`-Aenderung zu warten.
    syncLocalTrackRef.current(localStreamRef.current)

    return () => {
      syncLocalTrackRef.current = () => {}
      for (const timer of restartTimersRef.current.values()) clearTimeout(timer)
      restartTimersRef.current.clear()
      for (const id of Array.from(peersRef.current.keys())) teardownPeer(id)
      supabase.removeChannel(channel)
      channelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, myPeerId])

  return { localStream, remoteStreams, peerStatuses, camError }
}
