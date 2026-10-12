import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/app/lib/supabase";

// SERVER ONLY. A client with the secret service-role key from .env.local
// (SUPABASE_SERVICE_ROLE_KEY). It skips every database rule, so only use it
// in /api routes, after checking who the caller is (lib/apiAuth.ts), and
// only for what the anon key can't do — e.g. creating a login for someone
// else. Returns null when the key isn't configured.
export function getAdminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
