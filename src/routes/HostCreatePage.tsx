import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAnonymousSession } from '../hooks/useAnonymousSession'
import { rpc } from '../lib/rpc'

export function HostCreatePage() {
  const { userId, loading } = useAnonymousSession()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setBusy(true)
    setError(null)
    try {
      const room = await rpc.createRoom()
      navigate(`/host/${room.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  if (loading || !userId) return <p className="text-center text-neutral-400 py-10">Lade…</p>

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-lg w-full flex flex-col items-center gap-6 text-center rounded-2xl border border-white/10 bg-neutral-900/60 shadow-2xl shadow-black/40 backdrop-blur-sm p-10">
        <div className="flex flex-col gap-2">
          <h1 className="brand-title text-3xl text-white tracking-tight">120 Mystery Pokéballs!</h1>
          <p className="text-neutral-400 text-sm">
            Zieh mit zwei Freunden abwechselnd Pokébälle und baut daraus eure Teams — live per Video, alles im
            Browser.
          </p>
        </div>
        <button
          disabled={busy}
          onClick={handleCreate}
          className="w-full rounded-lg bg-gradient-to-b from-red-500 to-red-700 hover:brightness-110 disabled:opacity-40 text-white font-semibold px-6 py-3 shadow-lg shadow-red-900/40 transition"
        >
          {busy ? 'Erstelle Raum…' : 'Neuen Raum als Host erstellen'}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <p className="text-xs text-neutral-500">
          Den Inhalts-Pool (Pokémon, Items, Wesen, Fähigkeiten, Attacken) trägst du im nächsten Schritt direkt im
          Host-Bildschirm ein.
        </p>
      </div>
    </div>
  )
}
