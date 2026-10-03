import { supabase } from '@/app/lib/supabase'

// fetch() for our own /api routes, with the signed-in user's access token
// attached so the route can check who is calling (see lib/apiAuth.ts).
export async function authFetch(url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = new Headers(options.headers)
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }
  return fetch(url, { ...options, headers })
}
