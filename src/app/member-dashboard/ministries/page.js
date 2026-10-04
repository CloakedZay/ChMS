'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/app/lib/supabase';
import { Loader2, CalendarClock, UserRound, BookOpen } from 'lucide-react';
import BranchLabel from '@/app/components/BranchLabel';

// The member's ministries (step M2, db/022 + db/024): the ones they belong
// to, then the other ministries of their branch. The Pastor or a
// ministry's head adds members; training modules are on Discipleship.

const shortDate = (ts) => ts ? new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

function initials(name = '') {
  return name.replace(/&/g, ' ').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'M';
}

export default function MemberMinistriesPage() {
  const [ministries, setMinistries] = useState([]);
  const [mine, setMine]             = useState([]);   // { ministry_id, assigned_at }
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    async function load() {
      // Members only see their own branch's ministries and their own
      // assignments (database rules).
      const [{ data: list }, { data: assigned }] = await Promise.all([
        supabase.from('ministries').select('id, name, description, head_name, meeting_schedule, color_code').eq('is_active', true).order('name'),
        supabase.from('ministry_assignments').select('ministry_id, assigned_at'),
      ]);
      setMinistries(list || []);
      setMine(assigned || []);
      setLoading(false);
    }
    load();
  }, []);

  const joinedAt = (id) => mine.find((a) => a.ministry_id === id)?.assigned_at;
  const myMinistries = ministries.filter((m) => joinedAt(m.id));
  const others = ministries.filter((m) => !joinedAt(m.id));

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1"><BranchLabel /></p>
        <h1 className="text-2xl font-black text-white">Ministries</h1>
        <p className="text-slate-500 text-sm mt-0.5">The ministries you serve in, and the others in your church</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-14 text-slate-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading ministries...
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-3">My ministries</h2>
            {myMinistries.length === 0 ? (
              <div className="bg-[#1a1d2e] border border-dashed border-white/10 rounded-3xl p-6 text-center">
                <p className="text-sm text-white/60">You&apos;re not in a ministry yet.</p>
                <p className="text-xs text-white/30 mt-1">Talk to a ministry head or the Pastor — they can add you.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {myMinistries.map((m) => {
                  const color = m.color_code || '#3b82f6';
                  return (
                    <div key={m.id} className="bg-[#1a1d2e] border border-white/10 rounded-3xl p-5" style={{ borderLeft: `4px solid ${color}` }}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border"
                          style={{ backgroundColor: `${color}1a`, borderColor: `${color}40` }}>
                          <span className="text-[11px] font-black" style={{ color }}>{initials(m.name)}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-base font-black text-white truncate">{m.name}</p>
                          {joinedAt(m.id) && <p className="text-[10px] text-white/30">Member since {shortDate(joinedAt(m.id))}</p>}
                        </div>
                      </div>
                      {m.description && <p className="text-sm text-white/60 mb-3">{m.description}</p>}
                      <div className="space-y-1.5 text-xs text-white/50">
                        <p className="flex items-center gap-2"><UserRound size={13} /> Head: <span className="text-white/80 font-semibold">{m.head_name || 'Not set'}</span></p>
                        <p className="flex items-center gap-2"><CalendarClock size={13} /> Meets: <span className="text-white/80 font-semibold">{m.meeting_schedule || '—'}</span></p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {others.length > 0 && (
            <section>
              <h2 className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-3">Other ministries</h2>
              <div className="bg-[#1a1d2e] border border-white/10 rounded-3xl divide-y divide-white/5 overflow-hidden">
                {others.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color_code || '#3b82f6' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{m.name}</p>
                      <p className="text-xs text-white/40 truncate">
                        Head: {m.head_name || 'not set'}{m.meeting_schedule && <> · {m.meeting_schedule}</>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-white/30 mt-2">Interested in one? Ask its head or the Pastor to add you.</p>
            </section>
          )}

          <Link href="/member-dashboard/discipleship"
            className="flex items-center gap-3 bg-[#1a1d2e] border border-dashed border-white/10 rounded-3xl p-5 text-xs text-white/40 hover:text-blue-400 transition-colors">
            <BookOpen className="w-5 h-5 shrink-0" /> Training modules and handouts are on the Discipleship page →
          </Link>
        </div>
      )}
    </div>
  );
}
