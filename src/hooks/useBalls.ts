import { useEffect, useState } from 'react'
import { supabase, freshChannel } from '../lib/supabaseClient'
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

    // ball_contents-Zeilen fuer ALLE 120 Baelle existieren bereits seit start_game (nur durch RLS
    // unsichtbar) — beim Oeffnen aendert sich also nichts an der Zeile selbst, nur die Sichtbarkeit
    // fuer den jeweiligen Betrachter. Dafuer feuert Realtime kein INSERT/UPDATE-Event. Deshalb bei
    // jeder balls-Aenderung aktiv (neu) nachfragen, ob der Wert jetzt (fuer uns) lesbar ist.
    async function refetchValue(ballId: string, number: number) {
      const { data } = await supabase.from('ball_contents').select('value').eq('ball_id', ballId).maybeSingle()
      if (cancelled) return
      setBalls((prev) => {
        const existing = prev.get(number)
        if (!existing || existing.id !== ballId) return prev
        const next = new Map(prev)
        next.set(number, { ...existing, value: data?.value ?? null })
        return next
      })
    }

    const channel = freshChannel(`balls-${roomId}`)
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
          if (row.opened) refetchValue(row.id, row.number)
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
