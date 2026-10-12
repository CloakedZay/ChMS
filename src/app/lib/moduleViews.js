import { supabase } from '@/app/lib/supabase';

// Module tracking (db/012): note that the signed-in member opened a module
// ('opened') or downloaded one of its handouts ('handout'). The database
// fills in who, church and time. Fire-and-forget: a failure never gets in
// the member's way.
export function recordModuleView(moduleId, kind = 'opened') {
  if (!moduleId) return;
  supabase.from('module_views').insert({ module_id: moduleId, kind })
    .then(({ error }) => { if (error) console.warn('Module view not recorded:', error.message); });
}
