import { useState } from 'react'

interface Props {
  onLock: () => Promise<void>
  disabled: boolean
}

export function LockButton({ onLock, disabled }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  if (confirming) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-neutral-300">Team wirklich locken?</span>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await onLock()
            setBusy(false)
            setConfirming(false)
          }}
          className="rounded bg-red-600 hover:bg-red-500 px-3 py-1 font-semibold text-white disabled:opacity-50"
        >
          Ja, locken
        </button>
        <button onClick={() => setConfirming(false)} className="rounded bg-neutral-700 hover:bg-neutral-600 px-3 py-1">
          Abbrechen
        </button>
      </div>
    )
  }

  return (
    <button
      disabled={disabled}
      onClick={() => setConfirming(true)}
      className="rounded border border-red-500/60 text-red-300 hover:bg-red-500/10 px-3 py-1.5 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
    >
      Team locken (keine weiteren Bälle mehr)
    </button>
  )
}
