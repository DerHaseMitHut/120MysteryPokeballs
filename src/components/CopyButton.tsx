import { useState } from 'react'

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="text-xs rounded-lg bg-neutral-800/80 hover:bg-neutral-700 border border-white/10 px-3 py-1.5 text-neutral-200 transition whitespace-nowrap"
    >
      {copied ? 'Kopiert!' : label}
    </button>
  )
}
