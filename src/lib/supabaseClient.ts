import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Fehlende Supabase-Konfiguration. Bitte VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY setzen (.env.local).',
  )
}

// Bewusst ohne generischen Database-Typ: die Row-Typen in database.types.ts werden
// stattdessen gezielt per `as` beim Lesen der Query-Ergebnisse angewandt (siehe hooks/*),
// das haelt supabase-js' generische Typinferenz einfach und robust.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// React (v19 StrictMode) invoked effects in dev mounten/unmounten/mounten synchron neu, bevor
// removeChannel() vom vorigen Mount fertig ist. supabase-js's .channel(topic) gibt dann den
// alten, bereits subscribeten Channel zurueck, worauf .on(...) mit "cannot add ... after
// subscribe()" crasht. Fix: vor dem Neuanlegen aktiv nach einem gleichnamigen Channel suchen
// und ihn entfernen, statt uns auf den (asynchronen) Cleanup-Timing zu verlassen.
export function freshChannel(topic: string, options?: Parameters<typeof supabase.channel>[1]) {
  const existing = supabase.getChannels().find((c) => c.topic === `realtime:${topic}` || c.topic === topic)
  if (existing) supabase.removeChannel(existing)
  return supabase.channel(topic, options)
}
