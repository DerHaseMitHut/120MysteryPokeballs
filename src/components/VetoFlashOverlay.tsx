import { JokerIcon } from './JokerIcon'

interface Props {
  ballNumber: number
}

// Kurzer Zwischenzustand fuer die Flaeche, die sonst das Baelle-Grid einnimmt: wird angezeigt,
// solange GameScreen den "vetoFlash"-Zustand haelt (siehe dort -- per Timer wieder auf null
// gesetzt), danach kommt automatisch wieder das normale Grid. Ersetzt das bisherige plotzliche
// Verschwinden des Balls durch eine kurze, erkennbare "Veto!"-Einblendung.
export function VetoFlashOverlay({ ballNumber }: Props) {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-2xl bg-neutral-950">
      <div className="flex flex-col items-center gap-3 veto-flash-pop">
        <JokerIcon type="veto" className="h-28 w-28" />
        <span className="text-3xl font-extrabold text-pink-300">Veto!</span>
        <span className="text-sm text-neutral-400">Ball #{ballNumber} wird verworfen</span>
      </div>
    </div>
  )
}
