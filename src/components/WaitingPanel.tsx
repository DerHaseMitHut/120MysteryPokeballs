export function WaitingPanel({ text }: { text: string }) {
  return (
    <div className="max-w-lg mx-auto w-full rounded-2xl border border-white/10 bg-neutral-900/60 shadow-xl shadow-black/30 backdrop-blur-sm p-8 text-center flex flex-col gap-3">
      <div className="mx-auto h-10 w-10 rounded-full border-2 border-red-500/50 border-t-red-500 animate-spin" />
      <p className="text-neutral-300">{text}</p>
    </div>
  )
}
