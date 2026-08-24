import { JOKER_TYPES, JOKER_LABELS, JOKER_DESCRIPTIONS, type JokerType } from '../lib/jokers'
import { JokerIcon } from './JokerIcon'
import type { PlayerJokerRow, Seat } from '../lib/database.types'

interface Props {
  jokers: PlayerJokerRow[]
  seat1Name: string
  seat2Name: string
  mySeat: Seat | null
  isMyTurn: boolean
  canVeto: boolean
  armedJoker: JokerType | null
  wechselAwaitingSecond: boolean
  onArm: (type: JokerType) => void
  onUseVeto: () => void
  onCancelArm: () => void
  error?: string | null
}

function countFor(jokers: PlayerJokerRow[], seat: Seat, type: JokerType): number {
  return jokers.filter((j) => j.seat === seat && j.joker_type === type && !j.used).length
}

function SeatJokers({
  seat,
  jokers,
  clickable,
  canVeto,
  armedJoker,
  onArm,
  onUseVeto,
  align,
}: {
  seat: Seat
  jokers: PlayerJokerRow[]
  clickable: boolean
  canVeto: boolean
  armedJoker: JokerType | null
  onArm: (type: JokerType) => void
  onUseVeto: () => void
  align: 'left' | 'right'
}) {
  return (
    <div className={`flex items-center gap-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {JOKER_TYPES.map((type) => {
        const count = countFor(jokers, seat, type)
        const isVeto = type === 'veto'
        const usable = clickable && count > 0 && (isVeto ? canVeto : true)
        const armed = armedJoker === type && clickable
        return (
          <button
            key={type}
            type="button"
            disabled={!usable}
            onClick={() => (isVeto ? onUseVeto() : onArm(type))}
            title={
              usable
                ? JOKER_DESCRIPTIONS[type]
                : count === 0
                  ? `${JOKER_LABELS[type]}: keiner verfügbar`
                  : isVeto
                    ? `${JOKER_LABELS[type]}: nur nutzbar, solange du gerade einen offenen, unplatzierten Ball hast`
                    : `${JOKER_LABELS[type]}: nur am eigenen Zug einsetzbar`
            }
            className={`relative flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition ${
              armed
                ? 'border-pink-400 bg-pink-400/10'
                : usable
                  ? 'border-white/15 bg-neutral-800 hover:bg-neutral-700 cursor-pointer'
                  : 'border-white/5 bg-neutral-900/40 opacity-40 cursor-not-allowed'
            }`}
          >
            <JokerIcon type={type} className="h-6 w-6 shrink-0" />
            <span className="text-xs font-mono text-neutral-200">×{count}</span>
          </button>
        )
      })}
    </div>
  )
}

// Zwischen Kamera-Grid und Team-Ansicht platzierte Leiste: zeigt fuer beide Sitzplaetze, welche
// Joker sie gerade verfuegbar haben (oeffentlich sichtbar). Nur die eigenen, gerade nutzbaren
// Joker sind klickbar -- Veto loest sofort aus, Wondertrade/Wechsel "schalten scharf" (armedJoker)
// und warten danach auf einen Klick auf ein Zielfeld im Team-Grid (siehe GameScreen).
export function JokerBar({
  jokers,
  seat1Name,
  seat2Name,
  mySeat,
  isMyTurn,
  canVeto,
  armedJoker,
  wechselAwaitingSecond,
  onArm,
  onUseVeto,
  onCancelArm,
  error,
}: Props) {
  const anyJokers = jokers.some((j) => !j.used)
  if (!anyJokers && !armedJoker) return null

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-neutral-900/40 px-3.5 py-2">
      <div className="flex items-center justify-between gap-3">
        <SeatJokers
          seat={1}
          jokers={jokers}
          clickable={mySeat === 1 && isMyTurn}
          canVeto={canVeto}
          armedJoker={armedJoker}
          onArm={onArm}
          onUseVeto={onUseVeto}
          align="left"
        />
        <span className="text-[10px] uppercase tracking-wide text-neutral-600 shrink-0">Joker</span>
        <SeatJokers
          seat={2}
          jokers={jokers}
          clickable={mySeat === 2 && isMyTurn}
          canVeto={canVeto}
          armedJoker={armedJoker}
          onArm={onArm}
          onUseVeto={onUseVeto}
          align="right"
        />
      </div>

      {armedJoker && (
        <div className="flex items-center justify-center gap-2 text-xs text-pink-300">
          <span>
            {armedJoker === 'wondertrade'
              ? `${JOKER_LABELS.wondertrade} aktiv: Wähle ein Pokémon (eigenes oder gegnerisches)`
              : wechselAwaitingSecond
                ? `${JOKER_LABELS.wechsel} aktiv: Wähle das zweite Feld`
                : `${JOKER_LABELS.wechsel} aktiv: Wähle zwei gleichartige Felder in deinem Team`}
          </span>
          <button
            type="button"
            onClick={onCancelArm}
            className="rounded bg-neutral-800 hover:bg-neutral-700 border border-white/10 px-2 py-0.5 text-neutral-300"
          >
            Abbrechen
          </button>
        </div>
      )}

      {error && <p className="text-center text-xs text-red-400">{error}</p>}

      <div className="flex items-center justify-between text-[10px] text-neutral-600">
        <span className="truncate">{seat1Name}</span>
        <span className="truncate">{seat2Name}</span>
      </div>
    </div>
  )
}
