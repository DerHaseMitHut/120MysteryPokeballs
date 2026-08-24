import { useEffect, useState } from 'react'
import { supabase, freshChannel } from '../lib/supabaseClient'
import type { PlayerJokerRow } from '../lib/database.types'

export function usePlayerJokers(roomId: string | null) {
  const [jokers, setJokers] = useState<PlayerJokerRow[]>([])

  useEffect(() => {
    if (!roomId) {
      setJokers([])
      return
    }

    let cancelled = false

    async function load() {
      const { data } = await supabase.from('player_jokers').select('*').eq('room_id', roomId!)
      if (cancelled) return
      setJokers((data ?? []) as PlayerJokerRow[])
    }
    load()

    const channel = freshChannel(`player-jokers-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player_jokers', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as PlayerJokerRow
            setJokers((prev) => prev.filter((j) => j.id !== oldRow.id))
            return
          }
          const row = payload.new as PlayerJokerRow
          setJokers((prev) => [...prev.filter((j) => j.id !== row.id), row])
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [roomId])

  return { jokers }
}
