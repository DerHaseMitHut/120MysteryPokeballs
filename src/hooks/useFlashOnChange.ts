import { useEffect, useRef, useState } from 'react'

const FLASH_MS = 900

// Meldet kurzzeitig "flashing = true", wenn sich der uebergebene Schluessel aendert (z.B. die
// filled_ball_id eines Team-Slots) — nicht beim initialen Mount, nur bei echten Aenderungen
// danach (neu befuellt oder ueberschrieben). Dient rein visuellem Feedback, damit auf einen
// Blick erkennbar ist, welches Feld sich gerade geaendert hat.
export function useFlashOnChange(key: string | null): boolean {
  const [flashing, setFlashing] = useState(false)
  const prevKey = useRef(key)
  const mounted = useRef(false)

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      prevKey.current = key
      return
    }
    if (key !== prevKey.current) {
      prevKey.current = key
      if (key != null) {
        setFlashing(true)
        const timer = setTimeout(() => setFlashing(false), FLASH_MS)
        return () => clearTimeout(timer)
      }
    }
  }, [key])

  return flashing
}
