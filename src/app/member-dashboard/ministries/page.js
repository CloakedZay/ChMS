'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/lib/supabase';
import { Loader2, CalendarClock, UserRound, BookOpen, X, ChevronRight, Check } from 'lucide-react';
import BranchLabel from '@/app/components/BranchLabel';
import PersonProfile from '@/app/components/PersonProfile';
import { useDialog } from '@/app/lib/useDialog';

// The member's ministries (step M2, db/022 + db/024): the ones they belong
// to, then the other ministries of their branch, each a tile. Tapping one
// of their own opens it with its training modules (M3), taken on the
// Discipleship page; the other ministries' tiles can't be opened. The
// Pastor or a ministry's head adds members.
// Tapping a head who has a login opens their profile (db/061).

const shortDate = (ts) => ts ? new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

function initials(name = '') {
  return name.replace(/&/g, ' ').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'M';
}

// The head's name: a button to their profile when they have a login.
function HeadName({ m, onOpen, className }) {
  if (!m.head_name) return <span className={className}>Not set</span>;
  if (!m.leader_id) return <span className={className}>{m.head_name}</span>;
  return (
    <button type="button" onClick={() => onOpen(m.leader_id)} title="See profile"
      className={`${className} underline decoration-dotted underline-offset-2 hover:text-blue-400`}>{m.head_name}</button>
  );
}

// One ministry as a tile. Only the member's own ministries open; the
// others are a plain card.
function Tile({ m, moduleCount: n, joined, onOpen }) {
  const color = m.color_code || '#173f35';
  const Box = joined ? 'button' : 'div';
  return (
    <Box {...(joined ? { type: 'button', onClick: () => onOpen(m.id) } : {})}
      className={`group w-full text-left bg-[#1b2420] border border-white/10 rounded-xl overflow-hidden ${joined
        ? 'hover:border-white/25 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400'
        : 'cursor-default'}`}>
      <div className="h-1.5" style={{ backgroundColor: color }} />
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border"
            style={{ backgroundColor: `${color}1a`, borderColor: `${color}40` }}>
            <span className="text-[11px] font-black" style={{ color }}>{initials(m.name)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-white truncate">{m.name}</p>
            <p className="text-[11px] text-white/40 truncate">
              {joined ? `Member since ${shortDate(joined)}` : m.head_name ? `Head: ${m.head_name}` : 'No head set yet'}
            </p>
          </div>
          {joined && <ChevronRight size={16} className="text-white/30 group-hover:text-white/70 shrink-0 transition-colors" />}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-white/50">
          <BookOpen size={12} className="text-blue-400" />
          {n ? `${n} training module${n === 1 ? '' : 's'}` : 'No modules yet'}
          {m.meeting_schedule && <span className="truncate">· {m.meeting_schedule}</span>}
        </div>
      </div>
    </Box>
  );
}

export default function MemberMinistriesPage() {
  const router = useRouter();
  const [profileId, setProfileId]   = useState(null);
  const [ministries, setMinistries] = useState([]);
  const [mine, setMine]             = useState([]);   // { ministry_id, assigned_at }
  const [modules, setModules]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [openId, setOpenId]         = useState(null); // ministry shown in the pop-up

  useEffect(() => {
    async function load() {
      // Members only see their own branch's ministries and their own
      // assignments (database rules); modules are readable by every login (db/068).
      const [{ data: list }, { data: assigned }, { data: mods }] = await Promise.all([
        supabase.from('ministries').select('id, name, description, head_name, leader_id, meeting_schedule, color_code').eq('is_active', true).order('name'),
        supabase.from('ministry_assignments').select('ministry_id, assigned_at'),
        supabase.from('discipleship_modules').select('id, title, description, ministry_id, order_index').eq('is_active', true).not('ministry_id', 'is', null).order('order_index'),
      ]);
      setMinistries(list || []);
      setMine(assigned || []);
      setModules(mods || []);
      setLoading(false);
    }
    load();
  }, []);

  const joinedAt = (id) => mine.find((a) => a.ministry_id === id)?.assigned_at;
  const myMinistries = ministries.filter((m) => joinedAt(m.id));
  const others = ministries.filter((m) => !joinedAt(m.id));
  const modulesOf = (id) => modules.filter((x) => x.ministry_id === id);
  const opened = ministries.find((m) => m.id === openId) || null;
  const dialogRef = useDialog(!!opened, () => setOpenId(null));

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1"><BranchLabel /></p>
        <h1 className="text-2xl font-black text-white">Ministries</h1>
        <p className="text-slate-500 text-sm mt-0.5">The ministries you serve in, and the others in your church. Tap one of yours to see its training modules.</p>
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
              <div className="bg-[#1b2420] border border-dashed border-white/10 rounded-xl p-6 text-center">
                <p className="text-sm text-white/60">You&apos;re not in a ministry yet.</p>
                <p className="text-xs text-white/30 mt-1">Talk to a ministry head or the Pastor — they can add you.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {myMinistries.map((m) => <Tile key={m.id} m={m} moduleCount={modulesOf(m.id).length} joined={joinedAt(m.id)} onOpen={setOpenId} />)}
              </div>
            )}
          </section>

          {others.length > 0 && (
            <section>
              <h2 className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-3">Other ministries</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {others.map((m) => <Tile key={m.id} m={m} moduleCount={modulesOf(m.id).length} joined={joinedAt(m.id)} onOpen={setOpenId} />)}
              </div>
              <p className="text-xs text-white/30 mt-2">Interested in one? Ask its head or the Pastor to add you.</p>
            </section>
          )}

          <Link href="/member-dashboard/discipleship"
            className="flex items-center gap-3 bg-[#1b2420] border border-dashed border-white/10 rounded-xl p-5 text-xs text-white/40 hover:text-blue-400 transition-colors">
            <BookOpen className="w-5 h-5 shrink-0" /> Training modules and handouts are on the Discipleship page →
          </Link>
        </div>
      )}

      {/* One ministry: details and its training modules */}
      {opened && (() => {
        const color = opened.color_code || '#173f35';
        const joined = joinedAt(opened.id);
        const mods = modulesOf(opened.id);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenId(null); }}>
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={opened.name}
              className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#1b2420] border border-white/10 rounded-xl shadow-2xl">
              <div className="h-1.5" style={{ backgroundColor: color }} />
              <div className="p-6">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0 border"
                    style={{ backgroundColor: `${color}1a`, borderColor: `${color}40` }}>
                    <span className="text-xs font-black" style={{ color }}>{initials(opened.name)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-black text-white leading-snug">{opened.name}</h2>
                    {joined
                      ? <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-0.5"><Check size={12} /> You&apos;re a member since {shortDate(joined)}</p>
                      : <p className="text-[11px] text-white/40 mt-0.5">You&apos;re not in this ministry</p>}
                  </div>
                  <button type="button" aria-label="Close" onClick={() => setOpenId(null)} className="text-white/40 hover:text-white p-1"><X size={18} /></button>
                </div>

                {opened.description && <p className="text-sm text-white/60 mt-4">{opened.description}</p>}
                <div className="space-y-1.5 text-xs text-white/50 mt-4">
                  <p className="flex items-center gap-2"><UserRound size={13} /> Head: <HeadName m={opened} onOpen={(id) => { setOpenId(null); setProfileId(id); }} className="text-white/80 font-semibold" /></p>
                  <p className="flex items-center gap-2"><CalendarClock size={13} /> Meets: <span className="text-white/80 font-semibold">{opened.meeting_schedule || '—'}</span></p>
                </div>

                <div className="mt-5 pt-4 border-t border-white/5">
                  <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-3">Training modules</p>
                  {mods.length === 0 ? (
                    <p className="text-sm text-white/40">No training modules yet.</p>
                  ) : (
                    <ol className="space-y-2">
                      {mods.map((x, i) => {
                        const body = (
                          <>
                            <span className="text-white/30 text-xs font-bold w-5 shrink-0 pt-0.5">{i + 1}</span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5 text-sm font-semibold text-white"><BookOpen size={13} className="text-blue-400 shrink-0" /> {x.title}</span>
                              {x.description && <span className="block text-xs text-white/40 mt-0.5 line-clamp-2">{x.description}</span>}
                            </span>
                            {joined && <ChevronRight size={15} className="text-white/30 shrink-0 mt-0.5" />}
                          </>
                        );
                        return (
                          <li key={x.id}>
                            {joined ? (
                              <Link href="/member-dashboard/discipleship"
                                className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.03] hover:bg-white/[0.07] px-3 py-2.5 transition-colors">
                                {body}
                              </Link>
                            ) : (
                              <div className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5">{body}</div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                  {mods.length > 0 && (
                    <p className="text-xs text-white/30 mt-3">
                      {joined ? 'Tap a module to take it on the Discipleship page.' : 'Join this ministry to take its modules. Ask its head or the Pastor to add you.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {profileId && (
        <PersonProfile key={profileId} personId={profileId} onClose={() => setProfileId(null)}
          onMessage={(id) => router.push(`/member-dashboard/messages?to=${id}`)} />
      )}
    </div>
  );
}
