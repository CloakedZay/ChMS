import { createClient } from '@supabase/supabase-js'

// The Supabase project, from the environment (.env.local on your computer,
// Environment Variables on the host): Supabase → Project Settings → API.
// Both are public by design — the database's rules protect the data — and
// NEXT_PUBLIC_ makes Next.js include them in the app at build time.
// See docs/DEPLOYMENT.md.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Add them to .env.local (or the host\'s environment variables) and restart. See docs/DEPLOYMENT.md.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
