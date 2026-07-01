import { useEffect, useState } from 'react'
import { supabase, freshChannel } from '../lib/supabaseClient'
import type { RoomRow, RoomParticipantRow } from '../lib/database.types'

interface RoomState {
  room: RoomRow | null
  participants: RoomParticipantRow[]
  loading: boolean
  error: string | null
}

export function useRoom(roomId: string | null): RoomState {
  const [state, setState] = useState<RoomState>({ room: null, participants: [], loading: true, error: null })

  useEffect(() => {
    if (!roomId) {
      setState({ room: null, participants: [], loading: false, error: null })
      return
    }

    let cancelled = false

    async function load() {
      const [roomRes, participantsRes] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
        supabase.from('room_participants').select('*').eq('room_id', roomId).order('seat'),
      ])
      if (cancelled) return
      if (roomRes.error || participantsRes.error) {
        setState({
          room: null,
          participants: [],
          loading: false,
          error: roomRes.error?.message ?? participantsRes.error?.message ?? 'Unbekannter Fehler',
        })
        return
      }
      setState({
        room: roomRes.data as RoomRow | null,
        participants: (participantsRes.data ?? []) as RoomParticipantRow[],
        loading: false,
        error: null,
      })
    }

    load()

    const channel = freshChannel(`room-state-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return
          setState((prev) => ({ ...prev, room: payload.new as RoomRow }))
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_participants', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return
          setState((prev) => {
            const updated = payload.new as RoomParticipantRow
            const others = prev.participants.filter((p) => p.id !== updated.id)
            return { ...prev, participants: [...others, updated].sort((a, b) => a.seat - b.seat) }
          })
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [roomId])

  return state
}
