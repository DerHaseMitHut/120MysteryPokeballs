import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAnonymousSession } from '../hooks/useAnonymousSession'
import { rpc } from '../lib/rpc'
import type { PreviewRoomResult, Seat } from '../lib/database.types'

export function JoinPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const { userId, loading: sessionLoading } = useAnonymousSession()
  const [preview, setPreview] = useState<PreviewRoomResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [seat, setSeat] = useState<Seat | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    rpc
      .previewRoom(code)
      .then((result) => {
        if (cancelled) return
        setPreview(result)
        const mine = result.seats.find((s) => s.is_me)
        if (mine) {
          navigate(`/play/${code}`)
          return
        }
        const firstFree = result.seats.find((s) => !s.taken)
        if (firstFree) setSeat(firstFree.seat)
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [userId, code, navigate])

  async function handleJoin() {
    if (!seat) return
    setBusy(true)
    setError(null)
    try {
      await rpc.joinRoom(code, seat, name)
      navigate(`/play/${code}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  if (sessionLoading || !userId) return <p className="text-center text-neutral-400 py-10">Lade…</p>
  if (error && !preview) return <p className="text-center text-red-400 py-10">{error}</p>
  if (!preview) return <p className="text-center text-neutral-400 py-10">Suche Raum…</p>

  return (
    <div className="max-w-md mx-auto p-6 flex flex-col gap-5">
      <h1 className="text-xl font-bold text-white">Raum {preview.code} beitreten</h1>
      <div className="flex flex-col gap-1">
        <label className="text-sm text-neutral-300">Dein Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z.B. Max"
          className="rounded bg-neutral-900 border border-white/10 px-3 py-2 text-white"
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm text-neutral-300">Platz wählen</span>
        <div className="flex gap-3">
          {preview.seats.map((s) => (
            <button
              key={s.seat}
              disabled={s.taken && !s.is_me}
              onClick={() => setSeat(s.seat)}
              className={`flex-1 rounded-lg border px-3 py-3 text-sm ${
                seat === s.seat
                  ? 'border-yellow-400 bg-yellow-400/10 text-yellow-300'
                  : s.taken
                    ? 'border-white/5 bg-neutral-900 text-neutral-600 cursor-not-allowed'
                    : 'border-white/10 text-neutral-200 hover:bg-neutral-800'
              }`}
            >
              Teilnehmer {s.seat}
              {s.taken && <div className="text-xs mt-1">{s.display_name ?? 'belegt'}</div>}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        disabled={!seat || busy}
        onClick={handleJoin}
        className="rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-30 text-white font-semibold px-5 py-2"
      >
        {busy ? 'Trete bei…' : 'Beitreten'}
      </button>
    </div>
  )
}
