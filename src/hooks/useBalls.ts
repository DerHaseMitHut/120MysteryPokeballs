import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { BallRow } from '../lib/database.types'

export interface BallWithValue extends BallRow {
  value: string | null
}

export function useBalls(roomId: string | null) {
  const [balls, setBalls] = useState<Map<number, BallWithValue>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!roomId) {
      setBalls(new Map())
      setLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      const [ballsRes, contentsRes] = await Promise.all([
        supabase.from('balls').select('*').eq('room_id', roomId!),
        supabase.from('ball_contents').select('ball_id, value').eq('room_id', roomId!),
      ])
      if (cancelled) return
      const valueByBallId = new Map((contentsRes.data ?? []).map((c) => [c.ball_id, c.value as string]))
      const map = new Map<number, BallWithValue>()
      for (const b of (ballsRes.data ?? []) as BallRow[]) {
        map.set(b.number, { ...b, value: valueByBallId.get(b.id) ?? null })
      }
      setBalls(map)
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel(`balls-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'balls', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return
          const row = payload.new as BallRow
          setBalls((prev) => {
            const next = new Map(prev)
            const existing = next.get(row.number)
            next.set(row.number, { ...row, value: existing?.value ?? null })
            return next
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ball_contents', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as { ball_id: string; value: string }
          setBalls((prev) => {
            const next = new Map(prev)
            for (const [number, ball] of next) {
              if (ball.id === row.ball_id) {
                next.set(number, { ...ball, value: row.value })
                break
              }
            }
            return next
          })
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [roomId])

  return { balls, loading }
}
