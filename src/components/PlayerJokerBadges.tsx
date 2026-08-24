import { JOKER_TYPES, JOKER_LABELS, JOKER_DESCRIPTIONS, type JokerType } from '../lib/jokers'
import { JokerIcon } from './JokerIcon'
import { useFlashOnChange } from '../hooks/useFlashOnChange'
import type { PlayerJokerRow } from '../lib/database.types'

interface Props {
  // Bereits auf den jeweiligen Sitzplatz gefiltert, unbenutzt, und (falls gerade ein Ball
  // mit Joker aufgedeckt wird) ohne den noch nicht enthuellten Joker -- siehe GameScreen.
  jokers: PlayerJokerRow[]
  clickable: boolean
  canVeto: boolean
  armedJoker: JokerType | null
  onArm: (type: JokerType) => void
  onUseVeto: () => void
}

function JokerBadge({
  type,
  count,
  usable,
  armed,
  onClick,
  title,
}: {
  type: JokerType
  count: number
  usable: boolean
  armed: boolean
  onClick: () => void
  title: string
}) {
  // Flasht kurz auf, sobald sich die Anzahl aendert -- v.a. wenn ein frisch gezogener Joker nach
  // der Ball-Enthuellung hier "ankommt" (siehe GameScreen: bis dahin absichtlich ausgeblendet).
  const flashing = useFlashOnChange(String(count))

  return (
    <button
      type="button"
      disabled={!usable}
      onClick={onClick}
      title={title}
      className={`relative flex items-center gap-1 rounded-lg border px-1.5 py-1 transition ${
        flashing ? 'joker-badge-flash' : ''
      } ${
        armed
          ? 'border-pink-400 bg-pink-400/10'
          : usable
            ? 'border-white/15 bg-neutral-800 hover:bg-neutral-700 cursor-pointer'
            : 'border-white/5 bg-neutral-900/30 opacity-50 cursor-not-allowed'
      }`}
    >
      <JokerIcon type={type} className="h-9 w-9 shrink-0" />
      <span className="text-xs font-mono text-neutral-200">×{count}</span>
    </button>
  )
}

// Inline-Joker-Anzeige fuer einen Sitzplatz, direkt im Team-Header (neben Name/"am Zug"-Badge)
// statt in einer separaten Leiste. Zeigt immer alle 3 Jokerarten (auch bei 0), damit jederzeit
// sichtbar ist, wer welchen Joker hat.
export function PlayerJokerBadges({ jokers, clickable, canVeto, armedJoker, onArm, onUseVeto }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      {JOKER_TYPES.map((type) => {
        const count = jokers.filter((j) => j.joker_type === type).length
        const isVeto = type === 'veto'
        const usable = clickable && count > 0 && (isVeto ? canVeto : true)
        const title = !usable
          ? count === 0
            ? `${JOKER_LABELS[type]}: keiner verfügbar`
            : isVeto
              ? `${JOKER_LABELS[type]}: nur nutzbar, solange gerade ein offener, unplatzierter Ball vorliegt`
              : `${JOKER_LABELS[type]}: nur am eigenen Zug einsetzbar`
          : `${JOKER_LABELS[type]}: ${JOKER_DESCRIPTIONS[type]}`
        return (
          <JokerBadge
            key={type}
            type={type}
            count={count}
            usable={usable}
            armed={clickable && armedJoker === type}
            onClick={() => (isVeto ? onUseVeto() : onArm(type))}
            title={title}
          />
        )
      })}
    </div>
  )
}
