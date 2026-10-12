'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/app/lib/supabase';

// How many messages I haven't read (one-to-one db/029 + groups db/030) — for
// the badge on the Messages link. Stays current through Realtime; the
// Messenger page also fires 'faithsync-messages-read' after it marks a chat
// read.
export function useUnreadMessages(userId, enabled = true) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId || !enabled) return;
    let cancelled = false;

    async function refresh() {
      const [direct, groups] = await Promise.all([
        supabase.from('messages').select('id', { count: 'exact', head: true })
          .eq('recipient_id', userId).is('read_at', null),
        supabase.rpc('my_group_unread'),
      ]);
      if (cancelled) return;
      // A missing table / function (migration not run yet) just means no badge.
      const a = direct.error ? 0 : direct.count || 0;
      const b = groups.error ? 0 : Number(groups.data) || 0;
      setCount(a + b);
    }

    refresh();
    const channel = supabase
      .channel(`unread-messages-${userId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `recipient_id=eq.${userId}` },
        refresh)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages' },
        refresh)
      .subscribe();
    window.addEventListener('faithsync-messages-read', refresh);

    return () => {
      cancelled = true;
      window.removeEventListener('faithsync-messages-read', refresh);
      supabase.removeChannel(channel);
    };
  }, [userId, enabled]);

  return count;
}
