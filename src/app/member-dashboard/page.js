'use client';

import { useAuth } from '@/app/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/app/lib/supabase';
import {
  Users, CalendarDays, HandCoins, BookOpen,
  ChevronRight, CheckCircle, Clock, Lock,
  ChevronUp, Send, Church, FileText, Download
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EVENT_BADGE = {
  approved: 'bg-emerald-500/15 text-emerald-400',
  pending:  'bg-yellow-500/15 text-yellow-400',
  planning: 'bg-blue-500/15 text-blue-400',
  done:     'bg-slate-500/15 text-slate-400',
};

const ANSWER_STATUS = {
  approved: { label: 'Approved',        cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  pending:  { label: 'Under Review',    cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'   },
  rejected: { label: 'Needs Revision',  cls: 'text-rose-400 bg-rose-500/10 border-rose-500/20'         },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MemberDashboard() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab]       = useState('overview');
  const [dataLoading, setDataLoading]   = useState(true);

  // Overview
  const [memberCount, setMemberCount]       = useState(null);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [members, setMembers]               = useState([]);
  const [totalFunds, setTotalFunds]         = useState(null);
  const [totalIncome, setTotalIncome]       = useState(null);
  const [totalExpense, setTotalExpense]     = useState(null);
  const [announcements, setAnnouncements]   = useState([]);

  // Training
  const [modules, setModules]           = useState([]);
  const [questions, setQuestions]       = useState([]);
  const [progress, setProgress]         = useState([]);
  const [expandedModule, setExpandedModule] = useState(null);
  const [answers, setAnswers]           = useState({});
  const [submitting, setSubmitting]     = useState(false);
  const [submitMsg, setSubmitMsg]       = useState({});
  const [handouts, setHandouts]         = useState({});  // { [module_id]: [...] }

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && !user) router.push('/login?type=member');
  }, [user, loading]);

  // ── Fetch overview ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    async function fetchOverview() {
      setDataLoading(true);
      try {
        const { count: mCount } = await supabase
          .from('members').select('*', { count: 'exact', head: true });

        const { data: membersList } = await supabase
          .from('members').select('full_name, status, ministry')
          .order('id', { ascending: false }).limit(6);

        const { data: evts } = await supabase
          .from('events').select('id, title, date, ministry, status')
          .gte('date', new Date().toISOString().split('T')[0])
          .order('date', { ascending: true }).limit(5);

        const { data: trans } = await supabase
          .from('transactions').select('amount, type');

        const { data: annList } = await supabase
          .from('events').select('id, title, date, ministry, status')
          .eq('status', 'approved')
          .order('date', { ascending: false }).limit(4);

        setMemberCount(mCount || 0);
        setMembers(membersList || []);
        setUpcomingEvents(evts || []);
        setAnnouncements(annList || []);

        if (trans) {
          const inc = trans.filter(t => t.type === 'income').reduce((a, t) => a + (Number(t.amount) || 0), 0);
          const exp = trans.filter(t => t.type === 'expense').reduce((a, t) => a + (Number(t.amount) || 0), 0);
          setTotalIncome(inc);
          setTotalExpense(exp);
          setTotalFunds(inc - exp);
        }
      } catch (err) {
        console.error('Overview fetch error:', err);
      } finally {
        setDataLoading(false);
      }
    }
    fetchOverview();
  }, [user]);

  // ── Fetch training ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    async function fetchTraining() {
      const { data: mods } = await supabase
        .from('discipleship_modules')
        .select('*').eq('is_active', true)
        .order('order_index', { ascending: true });

      const { data: qs } = await supabase
        .from('discipleship_questions')
        .select('*').order('order_index', { ascending: true });

      const { data: prog } = await supabase
        .from('discipleship_progress')
        .select('*').eq('member_id', user.id);

      setModules(mods || []);
      setQuestions(qs || []);
      setProgress(prog || []);
    }
    fetchTraining();
  }, [user]);

  // ── Fetch handouts for a module (read-only for members) ──────────────────
  async function fetchHandouts(moduleId) {
    const { data } = await supabase
      .from('module_handouts')
      .select('*')
      .eq('module_id', moduleId)
      .order('created_at', { ascending: false });
    setHandouts(p => ({ ...p, [moduleId]: data || [] }));
  }

  function toggleModule(moduleId) {
    if (expandedModule === moduleId) {
      setExpandedModule(null);
    } else {
      setExpandedModule(moduleId);
      if (!handouts[moduleId]) fetchHandouts(moduleId);
    }
  }

  async function handleDownload(handout) {
    const { data, error } = await supabase.storage
      .from('handouts')
      .createSignedUrl(handout.file_path, 60);
    if (error) { alert('Could not generate download link.'); return; }
    window.open(data.signedUrl, '_blank');
  }

  // ── Training logic ────────────────────────────────────────────────────────
  const moduleQuestions = (moduleId) => questions.filter(q => q.module_id === moduleId);
  const getProgress     = (questionId) => progress.find(p => p.question_id === questionId);
  const isModuleComplete = (moduleId) => {
    const qs = moduleQuestions(moduleId);
    return qs.length > 0 && qs.every(q => getProgress(q.id)?.status === 'approved');
  };
  const isModuleUnlocked = (mod) => {
    if (mod.order_index <= 1) return true;
    const prev = modules.find(m => m.order_index === mod.order_index - 1);
    return prev ? isModuleComplete(prev.id) : false;
  };
  const isModuleSubmitted = (moduleId) =>
    moduleQuestions(moduleId).some(q => getProgress(q.id));

  const completedCount = modules.filter(m => isModuleComplete(m.id)).length;

  async function handleSubmit(moduleId) {
    const qs = moduleQuestions(moduleId);
    const toSubmit = qs.filter(q => {
      const existing = getProgress(q.id);
      const draft = answers[q.id]?.trim();
      return draft && (!existing || existing.status === 'rejected');
    });

    if (toSubmit.length === 0) {
      setSubmitMsg(p => ({ ...p, [moduleId]: 'Please write your answers before submitting.' }));
      return;
    }

    setSubmitting(true);
    try {
      const rows = toSubmit.map(q => ({
        member_id: user.id, module_id: moduleId,
        question_id: q.id, answer: answers[q.id].trim(), status: 'pending',
      }));

      const { error } = await supabase
        .from('discipleship_progress')
        .upsert(rows, { onConflict: 'member_id,question_id' });

      if (error) throw error;

      const { data: prog } = await supabase
        .from('discipleship_progress').select('*').eq('member_id', user.id);
      setProgress(prog || []);

      const cleared = { ...answers };
      toSubmit.forEach(q => delete cleared[q.id]);
      setAnswers(cleared);
      setSubmitMsg(p => ({ ...p, [moduleId]: '✓ Submitted! Your pastor will review your answers.' }));
    } catch (err) {
      console.error('Submit error:', err);
      setSubmitMsg(p => ({ ...p, [moduleId]: 'Something went wrong. Please try again.' }));
    } finally {
      setSubmitting(false);
      setTimeout(() => setSubmitMsg(p => ({ ...p, [moduleId]: '' })), 5000);
    }
  }

  const formatDate = (d) => d
    ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  const formatPeso = (v) => v === null ? '—'
    : '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: 2 });

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#0f111a] flex items-center justify-center">
      <p className="text-white/50 text-sm">Loading...</p>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0f111a] text-white">

      {/* Header */}
      <header className="bg-[#1a1d2e] border-b border-white/10 px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
            <Church className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h1 className="font-black text-base leading-none">FaithSync</h1>
            <p className="text-xs text-white/40 mt-0.5">Member Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-white/50 hidden sm:block">{user?.email}</span>
          <span className="text-xs bg-indigo-600/30 text-indigo-300 px-3 py-1 rounded-full border border-indigo-500/30">
            Member
          </span>
          <button onClick={signOut} className="text-sm text-white/40 hover:text-white transition">
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Tabs */}
        <div className="flex gap-1 bg-[#1a1d2e]/60 border border-slate-800 rounded-xl p-1 w-fit mb-8">
          {[
            { id: 'overview',  label: 'Overview',     Icon: Users     },
            { id: 'training',  label: 'Discipleship', Icon: BookOpen  },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-5 py-1.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === id ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Members',   value: dataLoading ? '...' : memberCount,           icon: '👥' },
                { label: 'Upcoming Events', value: dataLoading ? '...' : upcomingEvents.length, icon: '📅' },
                { label: 'Ministries',      value: '5',                                         icon: '✝️' },
                { label: 'Locations',       value: '3',                                         icon: '📍' },
              ].map((s) => (
                <div key={s.label} className="bg-[#1a1d2e] rounded-3xl p-5 border border-white/10">
                  <div className="text-2xl mb-2">{s.icon}</div>
                  <div className="text-2xl font-black">{s.value}</div>
                  <div className="text-white/40 text-sm mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Events */}
              <div className="bg-[#1a1d2e] rounded-3xl p-6 border border-white/10">
                <h2 className="font-black text-base mb-4 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-blue-400" /> Upcoming Events
                </h2>
                {!dataLoading && upcomingEvents.length === 0
                  ? <p className="text-white/30 text-sm">No upcoming events scheduled.</p>
                  : <div className="space-y-3">
                      {upcomingEvents.map((ev) => (
                        <div key={ev.id} className="flex items-start justify-between gap-3 p-3 bg-white/[0.03] rounded-2xl border border-white/5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">{ev.title}</p>
                            <p className="text-xs text-white/40 mt-0.5">
                              {formatDate(ev.date)}{ev.ministry ? ` · ${ev.ministry}` : ''}
                            </p>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${EVENT_BADGE[ev.status] || EVENT_BADGE.planning}`}>
                            {ev.status || 'planning'}
                          </span>
                        </div>
                      ))}
                    </div>
                }
              </div>

              {/* Members */}
              <div className="bg-[#1a1d2e] rounded-3xl p-6 border border-white/10">
                <h2 className="font-black text-base mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-400" /> Church Members
                </h2>
                {!dataLoading && members.length === 0
                  ? <p className="text-white/30 text-sm">No members found.</p>
                  : <div className="space-y-2.5">
                      {members.map((m, i) => (
                        <div key={i} className="flex items-center gap-3 p-2.5 bg-white/[0.03] rounded-2xl border border-white/5">
                          <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/20 flex items-center justify-center shrink-0">
                            <span className="text-[11px] font-black text-blue-400">
                              {m.full_name?.split(' ').map(w => w[0]).slice(0, 2).join('')}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{m.full_name}</p>
                            <p className="text-xs text-white/40 truncate">{m.ministry || 'Unassigned'}</p>
                          </div>
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.status === 'active' ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                        </div>
                      ))}
                      {memberCount > 6 && (
                        <p className="text-xs text-white/20 text-center pt-1">
                          +{memberCount - 6} more in the congregation
                        </p>
                      )}
                    </div>
                }
              </div>

              {/* Finance */}
              <div className="bg-[#1a1d2e] rounded-3xl p-6 border border-white/10">
                <h2 className="font-black text-base mb-4 flex items-center gap-2">
                  <HandCoins className="w-4 h-4 text-purple-400" /> Finances
                </h2>
                <div className="space-y-3">
                  {[
                    { label: 'Church Balance', value: formatPeso(totalFunds),   color: 'text-blue-400'    },
                    { label: 'Total Income',   value: formatPeso(totalIncome),  color: 'text-emerald-400' },
                    { label: 'Total Expenses', value: formatPeso(totalExpense), color: 'text-rose-400'    },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between p-3 bg-white/[0.03] rounded-2xl border border-white/5">
                      <p className="text-xs text-white/40">{item.label}</p>
                      <p className={`text-base font-black font-mono ${item.color}`}>{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Announcements */}
              <div className="bg-[#1a1d2e] rounded-3xl p-6 border border-white/10">
                <h2 className="font-black text-base mb-4">📣 Announcements</h2>
                {!dataLoading && announcements.length === 0
                  ? <p className="text-white/30 text-sm">No announcements at the moment.</p>
                  : <div className="space-y-3">
                      {announcements.map((a) => (
                        <div key={a.id} className="p-3 bg-white/[0.03] rounded-2xl border border-white/5">
                          <p className="text-sm font-bold text-white">{a.title}</p>
                          <p className="text-xs text-white/40 mt-1">
                            {formatDate(a.date)}{a.ministry ? ` · ${a.ministry}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                }
              </div>
            </div>
          </div>
        )}

        {/* ── DISCIPLESHIP TAB ── */}
        {activeTab === 'training' && (
          <div className="space-y-4">

            {/* Progress header */}
            <div className="bg-[#1a1d2e] border border-white/10 rounded-3xl p-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Your Progress</p>
                <h2 className="text-2xl font-black text-white">
                  {completedCount} of {modules.length} Modules Complete
                </h2>
                <p className="text-sm text-white/40 mt-1">
                  Answer each module's questions. Your pastor will review and approve before the next module unlocks.
                </p>
              </div>
              {/* Circle progress */}
              <div className="relative w-16 h-16 shrink-0">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none" stroke="#3b82f6" strokeWidth="3"
                    strokeDasharray={`${modules.length > 0 ? (completedCount / modules.length) * 100 : 0} 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-white">
                  {modules.length > 0 ? Math.round((completedCount / modules.length) * 100) : 0}%
                </span>
              </div>
            </div>

            {/* Modules */}
            {modules.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-slate-800 rounded-3xl">
                <BookOpen className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-600 text-sm">No modules have been set up yet.</p>
                <p className="text-slate-700 text-xs mt-1">Your pastor will add them soon.</p>
              </div>
            ) : modules.map((mod) => {
              const unlocked  = isModuleUnlocked(mod);
              const complete  = isModuleComplete(mod.id);
              const submitted = isModuleSubmitted(mod.id);
              const qs        = moduleQuestions(mod.id);
              const isOpen    = expandedModule === mod.id;

              return (
                <div
                  key={mod.id}
                  className={`rounded-3xl border overflow-hidden transition-all ${
                    complete  ? 'bg-emerald-500/5 border-emerald-500/20' :
                    !unlocked ? 'bg-[#1a1d2e]/40 border-white/5 opacity-60' :
                                'bg-[#1a1d2e] border-white/10'
                  }`}
                >
                  {/* Module row */}
                  <button
                    disabled={!unlocked}
                    onClick={() => toggleModule(mod.id)}
                    className="w-full flex items-center justify-between gap-4 p-5 text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                        complete  ? 'bg-emerald-500/15 border border-emerald-500/30' :
                        !unlocked ? 'bg-white/5 border border-white/10' :
                                    'bg-blue-600/15 border border-blue-500/30'
                      }`}>
                        {complete  ? <CheckCircle className="w-5 h-5 text-emerald-400" /> :
                         !unlocked ? <Lock className="w-4 h-4 text-slate-600" /> :
                                     <BookOpen className="w-4 h-4 text-blue-400" />}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-black ${!unlocked ? 'text-white/30' : 'text-white'}`}>
                          {mod.title}
                        </p>
                        <p className="text-xs text-white/40 mt-0.5">{mod.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {complete && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                          Complete
                        </span>
                      )}
                      {submitted && !complete && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
                          Submitted
                        </span>
                      )}
                      {!unlocked && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-700/50 text-slate-500">
                          Locked
                        </span>
                      )}
                      {unlocked && (
                        isOpen
                          ? <ChevronUp className="w-4 h-4 text-slate-500" />
                          : <ChevronRight className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                  </button>

                  {/* Questions panel */}
                  {isOpen && unlocked && (
                    <div className="px-5 pb-5 space-y-5 border-t border-white/5 pt-5">
                      {qs.map((q, qi) => {
                        const prog  = getProgress(q.id);
                        const st    = prog?.status;
                        const style = st ? ANSWER_STATUS[st] : null;

                        return (
                          <div key={q.id} className="space-y-2">
                            <p className="text-sm font-bold text-white/90">
                              <span className="text-blue-400 font-black mr-2">Q{qi + 1}.</span>
                              {q.question}
                            </p>

                            {/* Approved */}
                            {st === 'approved' && (
                              <div className={`p-3 rounded-2xl border text-xs leading-relaxed ${style.cls}`}>
                                <p className="font-bold mb-1 flex items-center gap-1.5">
                                  <CheckCircle className="w-3 h-3" /> {style.label}
                                </p>
                                <p className="text-white/60">{prog.answer}</p>
                                {prog.notes && (
                                  <p className="mt-2 text-white/40 italic">Pastor's note: {prog.notes}</p>
                                )}
                              </div>
                            )}

                            {/* Pending */}
                            {st === 'pending' && (
                              <div className={`p-3 rounded-2xl border text-xs leading-relaxed ${style.cls}`}>
                                <p className="font-bold mb-1 flex items-center gap-1.5">
                                  <Clock className="w-3 h-3" /> {style.label}
                                </p>
                                <p className="text-white/60">{prog.answer}</p>
                              </div>
                            )}

                            {/* Unanswered or rejected — textarea */}
                            {(!st || st === 'rejected') && (
                              <div className="space-y-1.5">
                                {st === 'rejected' && (
                                  <div className={`p-3 rounded-2xl border text-xs ${style.cls}`}>
                                    <p className="font-bold mb-1">Needs Revision</p>
                                    <p className="text-white/60">Your previous answer: {prog.answer}</p>
                                    {prog.notes && (
                                      <p className="mt-1 text-white/40 italic">Pastor's note: {prog.notes}</p>
                                    )}
                                  </div>
                                )}
                                <textarea
                                  rows={3}
                                  placeholder="Write your answer here..."
                                  value={answers[q.id] || ''}
                                  onChange={(e) => setAnswers(p => ({ ...p, [q.id]: e.target.value }))}
                                  className="w-full bg-[#0f111a] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500 resize-none transition-colors"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Handouts */}
                      {(() => {
                        const modHandouts = handouts[mod.id];
                        if (!modHandouts) return null;
                        return modHandouts.length > 0 ? (
                          <div className="pt-2 border-t border-white/5">
                            <p className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-2">
                              Module Handouts
                            </p>
                            <div className="space-y-2">
                              {modHandouts.map((hf) => (
                                <button
                                  key={hf.id}
                                  onClick={() => handleDownload(hf)}
                                  className="w-full flex items-center gap-3 p-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-blue-500/20 rounded-xl transition-colors group"
                                >
                                  <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                                  <div className="flex-1 min-w-0 text-left">
                                    <p className="text-xs font-bold text-white truncate">{hf.file_name}</p>
                                    {hf.description && (
                                      <p className="text-[10px] text-white/30 mt-0.5">{hf.description}</p>
                                    )}
                                  </div>
                                  <Download className="w-3.5 h-3.5 text-slate-600 group-hover:text-blue-400 transition-colors shrink-0" />
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="pt-2 border-t border-white/5">
                            <p className="text-[10px] uppercase tracking-widest text-white/20 font-bold mb-1">
                              Module Handouts
                            </p>
                            <p className="text-xs text-white/20">No handouts uploaded for this module yet.</p>
                          </div>
                        );
                      })()}

                      {/* Submit */}
                      {!complete && (
                        <div className="pt-1 flex items-center justify-between gap-4">
                          {submitMsg[mod.id] && (
                            <p className="text-xs text-blue-400 flex-1">{submitMsg[mod.id]}</p>
                          )}
                          <button
                            onClick={() => handleSubmit(mod.id)}
                            disabled={submitting}
                            className="ml-auto flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
                          >
                            <Send className="w-3.5 h-3.5" />
                            {submitting ? 'Submitting...' : 'Submit Answers'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}