import { useEffect, useState } from 'react'

const STORAGE_KEY = 'pokeballs.sfxVolume'
const DEFAULT_VOLUME = 0.35

function readStoredVolume(): number {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  const parsed = raw != null ? Number(raw) : NaN
  return isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : DEFAULT_VOLUME
}

// Lautstaerke fuer die Ball-Reveal-Sounds, pro Geraet in localStorage gemerkt (kein Sync ueber
// Realtime — Lautstaerke ist eine rein lokale Praeferenz jedes Betrachters).
export function useSfxVolume() {
  const [volume, setVolume] = useState(readStoredVolume)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(volume))
  }, [volume])

  return [volume, setVolume] as const
}
