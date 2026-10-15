'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HandCoins, ArrowRight } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { useTheme } from '@/app/context/ThemeContext';
import { useAuth } from '@/app/context/AuthContext';

// Staff Dashboard, Pastor / Leaders / Finance: spending requests waiting on
// this person (db/017, db/019). The database already limits which requests
// each one can see, so this only counts:
//   Pastor, Leaders  requests they can approve now (can_decide_expense)
//   Finance          approved → to release; receipts → to check
//   requester        own released requests still needing receipts
// Renders nothing when there's nothing to do.

async function loadTodo(userId, role) {
  const { data: reqs, error } = await supabase.from('expense_requests')
    .select('id, status, requested_by, liquidation_feedback')
    .in('status', ['pending', 'approved', 'released', 'liquidating']);
  if (error || !reqs) return [];

  const todo = [];
  if (role === 'pastor' || role === 'leader') {
    const pending = reqs.filter((r) => r.status === 'pending' && r.requested_by !== userId);
    const answers = await Promise.all(pending.map((r) => supabase.rpc('can_decide_expense', { req_id: r.id })));
    const n = answers.filter((a) => a.data === true).length;
    if (n) todo.push(`${n} request${n === 1 ? '' : 's'} waiting for your approval`);
  }
  if (role === 'finance') {
    const release = reqs.filter((r) => r.status === 'approved').length;
    const check = reqs.filter((r) => r.status === 'liquidating').length;
    if (release) todo.push(`${release} approved request${release === 1 ? '' : 's'} to release`);
    if (check) todo.push(`${check} set${check === 1 ? '' : 's'} of receipts to check`);
  }
  const mine = reqs.filter((r) => r.status === 'released' && r.requested_by === userId);
  const sentBack = mine.filter((r) => r.liquidation_feedback).length;
  const needed = mine.length - sentBack;
  if (needed) todo.push(`${needed} of your request${needed === 1 ? '' : 's'} still need${needed === 1 ? 's' : ''} receipts`);
  if (sentBack) todo.push(`${sentBack} of your receipt submission${sentBack === 1 ? ' was' : 's were'} sent back to fix`);
  return todo;
}

export default function SpendingReminder() {
  const { dark } = useTheme();
  const { user, role } = useAuth();
  const [todo, setTodo] = useState([]);

  useEffect(() => {
    if (!user || !role) return;
    let gone = false;
    loadTodo(user.id, role).then((list) => { if (!gone) setTodo(list); });
    return () => { gone = true; };
  }, [user, role]);

  if (!todo.length) return null;

  const t = dark
    ? { card: 'bg-[#2a2516] border-[#c5a66a]/30', title: 'text-white', body: 'text-[#d6cfbb]' }
    : { card: 'bg-[#fbf6ea] border-[#c5a66a]/50', title: 'text-[#5c4a1f]', body: 'text-[#6b5a33]' };

  return (
    <section role="status" aria-label="Spending requests waiting" className={`rounded-3xl border p-5 ${t.card}`}>
      <div className="flex items-start gap-4">
        <span className="w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center bg-[#c5a66a]/20 text-[#9c7f45]">
          <HandCoins size={20} strokeWidth={1.75} />
        </span>
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-sm ${t.title}`}>Spending requests need you</p>
          <ul className={`mt-1 text-sm ${t.body} list-disc pl-5 space-y-0.5`}>
            {todo.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <Link href="/dashboard/finance?tab=requests"
            className="inline-flex items-center gap-1 mt-3 h-8 px-3 rounded-lg bg-[#9c7f45] hover:bg-[#866b36] text-white text-xs font-semibold">
            Open spending requests <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </section>
  );
}
