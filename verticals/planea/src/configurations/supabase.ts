import { createClient } from '@supabase/supabase-js'

export const supabaseConfig = {
  url: 'https://mfxujzvvrnsbiqcefvtg.supabase.co',
  publishableKey: 'sb_publishable_0dMP5Pof56t9H4fyCNJn9Q_NKGuorXc',
  projectRef: 'mfxujzvvrnsbiqcefvtg'
} as const

export const supabase = createClient(
  supabaseConfig.url,
  supabaseConfig.publishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
)
