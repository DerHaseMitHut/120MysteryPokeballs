import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

type RtcSignal =
  | { kind: 'join'; from: string }
  | { kind: 'offer'; from: string; to: string; sdp: string }
  | { kind: 'answer'; from: string; to: string; sdp: string }
  | { kind: 'ice-candidate'; from: string; to: string; candidate: RTCIceCandidateInit }
  | { kind: 'leave'; from: string }

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

interface PeerEntry {
  connection: RTCPeerConnection
  stream: MediaStream
}

interface Options {
  // Reiner Empfaenger ohne eigene Kamera (fuer die OBS-Ansicht): nimmt trotzdem an der
  // Signalisierung teil, sendet aber nie eigene Spuren.
  receiveOnly?: boolean
}

export function useWebRTCMesh(
  roomId: string | null,
  myPeerId: string | null,
  camEnabled: boolean,
  options: Options = {},
) {
  const { receiveOnly = false } = options
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [camError, setCamError] = useState<string | null>(null)

  const peersRef = useRef<Map<string, PeerEntry>>(new Map())
  const channelRef = useRef<RealtimeChannel | null>(null)
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())

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
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        setLocalStream(stream)
      })
      .catch((err) => setCamError(err.message ?? 'Kamera/Mikrofon nicht verfügbar'))
    return () => {
      cancelled = true
    }
  }, [camEnabled, receiveOnly])

  useEffect(() => {
    if (!roomId || !myPeerId) return
    if (!receiveOnly && !localStream) return

    const channel = supabase.channel(`room:${roomId}:rtc`, { config: { broadcast: { self: false } } })
    channelRef.current = channel

    function getOrCreatePeer(otherId: string): PeerEntry {
      const existing = peersRef.current.get(otherId)
      if (existing) return existing
      const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      const stream = new MediaStream()
      if (localStream) {
        localStream.getTracks().forEach((track) => connection.addTrack(track, localStream))
      } else {
        connection.addTransceiver('audio', { direction: 'recvonly' })
        connection.addTransceiver('video', { direction: 'recvonly' })
      }
      connection.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((t) => stream.addTrack(t))
        setRemoteStreams((prev) => new Map(prev).set(otherId, stream))
      }
      connection.onicecandidate = (event) => {
        if (event.candidate) {
          send({ kind: 'ice-candidate', from: myPeerId!, to: otherId, candidate: event.candidate.toJSON() })
        }
      }
      connection.onconnectionstatechange = () => {
        if (['disconnected', 'failed', 'closed'].includes(connection.connectionState)) {
          teardownPeer(otherId)
        }
      }
      const entry = { connection, stream }
      peersRef.current.set(otherId, entry)
      return entry
    }

    function teardownPeer(otherId: string) {
      const entry = peersRef.current.get(otherId)
      entry?.connection.close()
      peersRef.current.delete(otherId)
      setRemoteStreams((prev) => {
        const next = new Map(prev)
        next.delete(otherId)
        return next
      })
    }

    function send(signal: RtcSignal) {
      channel.send({ type: 'broadcast', event: 'rtc-signal', payload: signal })
    }

    async function handleSignal(signal: RtcSignal) {
      if ('to' in signal && signal.to !== myPeerId) return
      if (signal.kind === 'join') {
        if (signal.from === myPeerId) return
        const peer = getOrCreatePeer(signal.from)
        if (myPeerId! < signal.from) {
          const offer = await peer.connection.createOffer()
          await peer.connection.setLocalDescription(offer)
          send({ kind: 'offer', from: myPeerId!, to: signal.from, sdp: offer.sdp! })
        }
      } else if (signal.kind === 'offer') {
        const peer = getOrCreatePeer(signal.from)
        await peer.connection.setRemoteDescription({ type: 'offer', sdp: signal.sdp })
        await flushPendingCandidates(signal.from, peer)
        const answer = await peer.connection.createAnswer()
        await peer.connection.setLocalDescription(answer)
        send({ kind: 'answer', from: myPeerId!, to: signal.from, sdp: answer.sdp! })
      } else if (signal.kind === 'answer') {
        const peer = peersRef.current.get(signal.from)
        if (peer) {
          await peer.connection.setRemoteDescription({ type: 'answer', sdp: signal.sdp })
          await flushPendingCandidates(signal.from, peer)
        }
      } else if (signal.kind === 'ice-candidate') {
        const peer = peersRef.current.get(signal.from)
        if (peer && peer.connection.remoteDescription) {
          await peer.connection.addIceCandidate(signal.candidate)
        } else {
          const queue = pendingCandidatesRef.current.get(signal.from) ?? []
          queue.push(signal.candidate)
          pendingCandidatesRef.current.set(signal.from, queue)
        }
      } else if (signal.kind === 'leave') {
        teardownPeer(signal.from)
      }
    }

    async function flushPendingCandidates(otherId: string, peer: PeerEntry) {
      const queue = pendingCandidatesRef.current.get(otherId)
      if (!queue) return
      for (const candidate of queue) {
        await peer.connection.addIceCandidate(candidate)
      }
      pendingCandidatesRef.current.delete(otherId)
    }

    channel
      .on('broadcast', { event: 'rtc-signal' }, ({ payload }) => {
        handleSignal(payload as RtcSignal).catch((err) => console.error('RTC-Signal Fehler', err))
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        for (const p of leftPresences as unknown as { peerId: string }[]) {
          teardownPeer(p.peerId)
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ peerId: myPeerId })
          send({ kind: 'join', from: myPeerId! })
        }
      })

    return () => {
      send({ kind: 'leave', from: myPeerId! })
      for (const id of Array.from(peersRef.current.keys())) teardownPeer(id)
      supabase.removeChannel(channel)
      channelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, myPeerId, localStream, receiveOnly])

  return { localStream, remoteStreams, camError }
}
