'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { supabase } from '@/app/lib/supabase';
import {
  BookOpen, ChevronRight, ChevronUp, CheckCircle, Clock, Lock,
  Send, FileText, Download,
} from 'lucide-react';

const ANSWER_STATUS = {
  approved: { label: 'Approved',       cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  pending:  { label: 'Under Review',   cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'   },
  rejected: { label: 'Needs Revision', cls: 'text-rose-400 bg-rose-500/10 border-rose-500/20'         },
};

export default function DiscipleshipPage() {
  const { user } = useAuth();

  const [modules, setModules]               = useState([]);
  const [questions, setQuestions]           = useState([]);
  const [progress, setProgress]             = useState([]);
  const [expandedModule, setExpandedModule] = useState(null);
  const [answers, setAnswers]               = useState({});
  const [submitting, setSubmitting]         = useState(false);
  const [submitMsg, setSubmitMsg]           = useState({});
  const [handouts, setHandouts]             = useState({});

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

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">GGCF-GMI · Pandi, Bulacan</p>
        <h1 className="text-2xl font-black text-white">Discipleship</h1>
        <p className="text-slate-500 text-sm mt-0.5">Grow through each module at your own pace</p>
      </div>

      <div className="space-y-4">
        {/* Progress header */}
        <div className="bg-[#1a1d2e] border border-white/10 rounded-3xl p-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Your Progress</p>
            <h2 className="text-2xl font-black text-white">
              {completedCount} of {modules.length} Modules Complete
            </h2>
            <p className="text-sm text-white/40 mt-1">
              Answer each module&apos;s questions. Your pastor will review and approve before the next module unlocks.
            </p>
          </div>
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

                        {st === 'approved' && (
                          <div className={`p-3 rounded-2xl border text-xs leading-relaxed ${style.cls}`}>
                            <p className="font-bold mb-1 flex items-center gap-1.5">
                              <CheckCircle className="w-3 h-3" /> {style.label}
                            </p>
                            <p className="text-white/60">{prog.answer}</p>
                            {prog.notes && (
                              <p className="mt-2 text-white/40 italic">Pastor&apos;s note: {prog.notes}</p>
                            )}
                          </div>
                        )}

                        {st === 'pending' && (
                          <div className={`p-3 rounded-2xl border text-xs leading-relaxed ${style.cls}`}>
                            <p className="font-bold mb-1 flex items-center gap-1.5">
                              <Clock className="w-3 h-3" /> {style.label}
                            </p>
                            <p className="text-white/60">{prog.answer}</p>
                          </div>
                        )}

                        {(!st || st === 'rejected') && (
                          <div className="space-y-1.5">
                            {st === 'rejected' && (
                              <div className={`p-3 rounded-2xl border text-xs ${style.cls}`}>
                                <p className="font-bold mb-1">Needs Revision</p>
                                <p className="text-white/60">Your previous answer: {prog.answer}</p>
                                {prog.notes && (
                                  <p className="mt-1 text-white/40 italic">Pastor&apos;s note: {prog.notes}</p>
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
    </div>
  );
}
