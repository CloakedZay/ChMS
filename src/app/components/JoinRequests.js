'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserPlus, Check, X, Mail, Phone } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { authFetch } from '@/app/lib/authFetch';
import { alertDialog, confirmDialog } from '@/app/lib/dialog';
import { friendlyError } from '@/app/lib/errors';

// "Ask to join" requests (db/093) on the Members page: the Secretary sees
// their branch's, the Pastor every branch's (the database decides).
// Approve makes the member record and, when the person gave an email,
// offers to send the invitation (api/members/invite). Decline just closes it.
// Shows nothing when there are no requests or db/093 hasn't been run.

export default function JoinRequests({ t, branchName, showBranch, onApproved }) {
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('join_requests')
      .select('id, created_at, full_name, email, phone, church_id, note')
      .eq('status', 'pending').order('created_at');
    setList(data || []);
  }, []);
  useEffect(() => {
    let stale = false;
    supabase.from('join_requests')
      .select('id, created_at, full_name, email, phone, church_id, note')
      .eq('status', 'pending').order('created_at')
      .then(({ data }) => { if (!stale) setList(data || []); });
    return () => { stale = true; };
  }, []);

  async function approve(r) {
    if (!await confirmDialog({
      title: 'Approve request',
      message: `Add ${r.full_name} as a member of ${branchName(r.church_id)}?`,
      confirmText: 'Approve',
    })) return;
    setBusy(r.id);
    const { data: member, error } = await supabase.from('members').insert({
      full_name: r.full_name, email: r.email, phone: r.phone, church_id: r.church_id, status: 'active',
    }).select('id').single();
    if (error) { setBusy(null); alertDialog('Could not add the member: ' + friendlyError(error)); return; }
    await supabase.from('join_requests').update({ status: 'approved', member_id: member.id }).eq('id', r.id);

    if (r.email && await confirmDialog({
      title: 'Send invitation?',
      message: `Email ${r.email} an invitation now? They can sign in with Google in one click (Gmail) or choose a password.`,
      confirmText: 'Send invitation',
      cancelText: 'Later',
    })) {
      try {
        const res = await authFetch('/api/members/invite', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ member_id: member.id }),
        });
        const json = await res.json();
        alertDialog(res.ok && json.sent ? `Invitation sent to ${json.email}.` : json.error || 'Could not send the invitation.');
      } catch (err) {
        alertDialog('Could not send the invitation: ' + friendlyError(err));
      }
    }
    setBusy(null);
    await load();
    onApproved?.();
  }

  async function decline(r) {
    if (!await confirmDialog(`Decline the request from ${r.full_name}?`)) return;
    setBusy(r.id);
    const { error } = await supabase.from('join_requests').update({ status: 'declined' }).eq('id', r.id);
    setBusy(null);
    if (error) alertDialog(friendlyError(error)); else load();
  }

  if (!list.length) return null;
  return (
    <section className={`${t.cardBg} border ${t.cardBorder} rounded-2xl p-5 mb-6`} aria-label="Join requests">
      <h2 className={`text-sm font-black ${t.textPrimary} flex items-center gap-2 mb-3`}>
        <UserPlus size={15} className="text-blue-400" /> Asking to join ({list.length})
      </h2>
      <ul className="space-y-2">
        {list.map((r) => (
          <li key={r.id} className={`flex flex-col sm:flex-row sm:items-center gap-3 border ${t.cardBorder} rounded-xl px-4 py-3`}>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold ${t.textPrimary}`}>
                {r.full_name}
                {showBranch && <span className={`ml-2 text-[11px] font-semibold ${t.textMuted}`}>{branchName(r.church_id)}</span>}
              </p>
              <p className={`text-xs ${t.textSub} flex flex-wrap gap-x-3`}>
                {r.email && <span className="inline-flex items-center gap-1"><Mail size={11} /> {r.email}</span>}
                {r.phone && <span className="inline-flex items-center gap-1"><Phone size={11} /> {r.phone}</span>}
                <span>{new Date(r.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>
              </p>
              {r.note && <p className={`text-xs mt-1 ${t.textMuted}`}>&ldquo;{r.note}&rdquo;</p>}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => approve(r)} disabled={busy === r.id}
                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-3 py-1.5 rounded-lg disabled:opacity-50">
                <Check size={12} /> Approve
              </button>
              <button onClick={() => decline(r)} disabled={busy === r.id}
                className="inline-flex items-center gap-1 text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-3 py-1.5 rounded-lg disabled:opacity-50">
                <X size={12} /> Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
