import { useState } from 'react'
import type { RoomRow, RoomParticipantRow } from '../lib/database.types'
import { joinUrl, obsUrl } from '../lib/urls'

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-neutral-500">{label}</span>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 rounded-md bg-neutral-950/60 border border-white/10 px-2.5 py-1.5 text-sm text-neutral-200 font-mono"
        />
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="rounded-md bg-neutral-700 hover:bg-neutral-600 px-3 py-1.5 text-sm text-white shrink-0 transition"
        >
          {copied ? 'Kopiert!' : 'Kopieren'}
        </button>
      </div>
    </div>
  )
}

export function InviteLinksPanel({
  room,
  participants,
}: {
  room: RoomRow
  participants: RoomParticipantRow[]
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-neutral-900/60 shadow-xl shadow-black/30 backdrop-blur-sm p-5">
      <div>
        <span className="text-xs uppercase tracking-wide text-neutral-500">Raumcode</span>
        <p className="text-2xl font-mono font-bold text-white tracking-widest">{room.code}</p>
      </div>
      <CopyField label="Einladungslink für Teilnehmer" value={joinUrl(room.code)} />
      <CopyField label="OBS Browser-Source Link (1920×1080, nur für dich)" value={obsUrl(room.id, room.obs_token)} />
      <div className="flex gap-4 text-sm">
        {[1, 2].map((seat) => {
          const p = participants.find((pp) => pp.seat === seat)
          return (
            <span key={seat} className={p?.user_id ? 'text-emerald-400' : 'text-neutral-500'}>
              Platz {seat}: {p?.user_id ? p.display_name ?? 'verbunden' : 'wartet…'}
            </span>
          )
        })}
      </div>
    </div>
  )
}
