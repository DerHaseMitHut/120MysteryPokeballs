import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase, freshChannel } from '../lib/supabaseClient'

type RtcSignal =
  | { kind: 'offer'; from: string; to: string; sdp: string }
  | { kind: 'answer'; from: string; to: string; sdp: string }
  | { kind: 'ice-candidate'; from: string; to: string; candidate: RTCIceCandidateInit }

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
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
  // sichtbar als kurzer Blackscreen bei ALLEN Teilnehmern, nicht nur bei der schaltenden Person,
  // und Quelle diverser Race-Conditions beim Wiederverbinden. Stattdessen wird hier nur der
  // Video-Track ausgetauscht; die Richtungsaenderung (recvonly <-> sendrecv) loest automatisch
  // eine "negotiationneeded"-Renegotiation ueber den Signalkanal aus, den Rest erledigt der
  // Perfect-Negotiation-Handler unten.
  useEffect(() => {
    localStreamRef.current = localStream
    const newTrack = localStream?.getVideoTracks()[0] ?? null
    for (const entry of peersRef.current.values()) {
      const [transceiver] = entry.connection.getTransceivers()
      if (!transceiver) {
        if (newTrack && localStream) entry.connection.addTrack(newTrack, localStream)
        continue
      }
      transceiver.direction = newTrack ? 'sendrecv' : 'recvonly'
      if (transceiver.sender.track !== newTrack) {
        transceiver.sender.replaceTrack(newTrack).catch((err) => console.error('Kamera-Track tauschen fehlgeschlagen', err))
      }
    }
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

      // Einzige Stelle, die Offers verschickt -- egal ob Erstverbindung, Kamera-An/Aus oder
      // ICE-Restart. Der Browser feuert dieses Event automatisch bei jeder Aenderung, die eine
      // Neuaushandlung braucht (neuer Track, geaenderte Transceiver-Richtung, restartIce()).
      connection.onnegotiationneeded = async () => {
        try {
          entry.makingOffer = true
          const offer = await connection.createOffer()
          await connection.setLocalDescription(offer)
          send({ kind: 'offer', from: myPeerId!, to: otherId, sdp: connection.localDescription!.sdp! })
        } catch (err) {
          console.error('RTC-Offer Fehler', err)
        } finally {
          entry.makingOffer = false
        }
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

      return entry
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
          try {
            current.connection.restartIce()
          } catch (err) {
            console.error('ICE-Restart Fehler', err)
          }
          scheduleRestart(otherId, entry, ICE_RESTART_BACKOFF_MS)
        } else {
          teardownPeer(otherId)
          if (myPeerId! < otherId) {
            getOrCreatePeer(otherId)
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
      const entry = getOrCreatePeer(signal.from)
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
          getOrCreatePeer(otherId)
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

    return () => {
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
