export function GameOverSummary() {
  return (
    <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 shadow-lg shadow-emerald-900/20 px-4 py-3 text-center">
      <p className="text-emerald-300 font-semibold">Der Draft ist beendet.</p>
      <p className="text-xs text-neutral-400 mt-1">
        Die Teams bleiben wie im Spiel zensiert sichtbar — nur der Host sieht alle Details.
      </p>
    </div>
  )
}
