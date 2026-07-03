import { useState } from 'react'

interface Props {
  value: string
  placeholder: string
  onSave: (name: string) => Promise<unknown>
  className?: string
}

// Klick auf den Namen -> Inline-Eingabefeld, das per Enter/Blur speichert (Escape bricht ab).
// Fuer Host-Name im Header sowie Teilnehmer-Namen im TeamPanel, jeweils nur fuer den
// jeweiligen Besitzer sichtbar/aktiv.
export function EditableName({ value, placeholder, onSave, className }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
        title="Namen ändern"
        className={
          className ??
          'text-white hover:text-yellow-300 underline decoration-dotted decoration-neutral-500 underline-offset-4 transition-colors'
        }
      >
        {value || placeholder} <span className="text-neutral-500">✎</span>
      </button>
    )
  }

  async function commit() {
    setBusy(true)
    try {
      await onSave(draft)
    } finally {
      setBusy(false)
      setEditing(false)
    }
  }

  return (
    <input
      autoFocus
      value={draft}
      disabled={busy}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setEditing(false)
      }}
      className="rounded bg-neutral-900 border border-yellow-400/60 focus:outline-none px-2 py-0.5 text-sm text-white w-32"
    />
  )
}
