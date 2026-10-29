import { supabase } from '@/app/lib/supabase';

// Profile photos (db/097) live in the public 'avatars' bucket, so a plain
// link works anywhere. Null when there is no photo.
export function avatarUrl(path) {
  if (!path) return null;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
