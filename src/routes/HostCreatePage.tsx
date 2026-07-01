import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAnonymousSession } from '../hooks/useAnonymousSession'
import { ContentPoolForm } from '../components/ContentPoolForm'
import { rpc } from '../lib/rpc'
import type { Category } from '../lib/database.types'

export function HostCreatePage() {
  const { userId, loading } = useAnonymousSession()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(pool: { category: Category; value: string }[]) {
    setBusy(true)
    setError(null)
    try {
      const room = await rpc.createRoom(pool)
      navigate(`/host/${room.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  if (loading || !userId) return <p className="text-center text-neutral-400 py-10">Lade…</p>

  return (
    <div className="max-w-4xl mx-auto p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">120 Pokébälle — Raum erstellen</h1>
        <p className="text-neutral-400 text-sm mt-1">
          Als Host legst du den Inhalts-Pool fest, der beim Spielstart zufällig auf die 120 Pokébälle verteilt wird.
        </p>
      </div>
      <ContentPoolForm onSubmit={handleSubmit} busy={busy} error={error} />
    </div>
  )
}
