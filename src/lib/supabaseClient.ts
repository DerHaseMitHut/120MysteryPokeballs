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
