'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '@/app/lib/authFetch';

// A Member's daily assistant questions (db/039, api/chatbot). For staff the
// limit is null (no limit). Every answer from /api/chatbot carries the new
// `remaining`, passed in with update(data).
export function useAssistantQuota() {
  const [quota, setQuota] = useState({ limit: null, remaining: null });

  useEffect(() => {
    let cancelled = false;
    authFetch('/api/chatbot')
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setQuota({ limit: d.limit ?? null, remaining: d.remaining ?? null }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const update = (data) => {
    if (data && data.remaining != null) setQuota({ limit: data.limit ?? null, remaining: data.remaining });
  };

  return { ...quota, update, used: quota.limit != null && quota.remaining === 0 };
}

export function quotaText(q) {
  if (q.limit == null) return null;
  return q.remaining > 0
    ? `${q.remaining} of ${q.limit} questions left today`
    : 'You’ve used today’s questions — you can ask again tomorrow.';
}
