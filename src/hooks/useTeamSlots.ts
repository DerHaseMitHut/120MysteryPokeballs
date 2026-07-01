import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { TeamSlotRow } from '../lib/database.types'

export interface TeamSlotWithValue extends TeamSlotRow {
  value: string | null
}

export function useTeamSlots(roomId: string | null) {
  const [slots, setSlots] = useState<TeamSlotWithValue[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!roomId) {
      setSlots([])
      setLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      const [slotsRes, contentsRes] = await Promise.all([
        supabase.from('team_slots').select('*').eq('room_id', roomId!),
        supabase.from('ball_contents').select('ball_id, value').eq('room_id', roomId!),
      ])
      if (cancelled) return
      const valueByBallId = new Map((contentsRes.data ?? []).map((c) => [c.ball_id, c.value as string]))
      const rows = (slotsRes.data ?? []) as TeamSlotRow[]
      setSlots(
        rows.map((s) => ({ ...s, value: s.filled_ball_id ? valueByBallId.get(s.filled_ball_id) ?? null : null })),
      )
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel(`team-slots-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_slots', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return
          const row = payload.new as TeamSlotRow
          setSlots((prev) => {
            const existing = prev.find((s) => s.id === row.id)
            const value = existing?.filled_ball_id === row.filled_ball_id ? existing.value : null
            const next = prev.filter((s) => s.id !== row.id)
            return [...next, { ...row, value }]
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ball_contents', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as { ball_id: string; value: string }
          setSlots((prev) => prev.map((s) => (s.filled_ball_id === row.ball_id ? { ...s, value: row.value } : s)))
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [roomId])

  return { slots, loading }
}
