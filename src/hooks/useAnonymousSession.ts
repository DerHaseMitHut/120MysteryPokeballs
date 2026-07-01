import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

interface SessionState {
  userId: string | null
  loading: boolean
  error: string | null
}

export function useAnonymousSession(): SessionState {
  const [state, setState] = useState<SessionState>({ userId: null, loading: true, error: null })

  useEffect(() => {
    let cancelled = false

    async function ensureSession() {
      const { data: existing } = await supabase.auth.getSession()
      let userId = existing.session?.user?.id ?? null

      if (!userId) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (error) {
          if (!cancelled) setState({ userId: null, loading: false, error: error.message })
          return
        }
        userId = data.user?.id ?? null
      }

      if (!cancelled) setState({ userId, loading: false, error: null })
    }

    ensureSession()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        setState((prev) => ({ ...prev, userId: session?.user?.id ?? prev.userId }))
      }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  return state
}
