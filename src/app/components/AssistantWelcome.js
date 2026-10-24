'use client';

import { BookOpen, GraduationCap, Languages, Sparkles } from 'lucide-react';

// What a new chat shows before the first question (staff and member
// Assistant pages): what the Assistant can do, and questions to tap so
// nobody has to ask "what can you do?" first. Tapping one sends it.
// Everything suggested here is answered from the church's documents or the
// person's own discipleship journey; there's no built-in FaithSync guide.

const CAN_DO = {
  teachings: { Icon: BookOpen, title: 'Church teachings', text: 'Answers from the church’s documents and handouts: what the church believes and teaches.' },
  journey:   { Icon: GraduationCap, title: 'Your discipleship', text: 'Your next module, how far along you are, what a module is about.' },
  language:  { Icon: Languages, title: 'English or Tagalog', text: 'Ask in either one. Say “tell me more” after an answer for the rest.' },
};

// Always answerable: from the person's own discipleship journey
// (api/chatbot). The rest come from the documents' own chapter headings
// (lib/useAssistantSuggestions), so nothing is suggested that the church's
// material can't answer.
const ALWAYS = {
  member: [{ label: 'What’s my next module?', question: 'What’s my next module?' },
           { label: 'How far am I in my training?', question: 'What is my progress?' }],
  staff:  [{ label: 'What is module 1 about?', question: 'What is module 1 about?' }],
};

export default function AssistantWelcome({ member = false, dark = true, note, disabled, onAsk, suggestions = [] }) {
  const s = dark
    ? { title: 'text-white', text: 'text-white/50', card: 'bg-white/[0.03] border-white/10', icon: 'text-blue-400 bg-blue-500/10',
        chip: 'border-blue-400/40 text-blue-300 bg-blue-500/10 hover:bg-blue-500/20', faint: 'text-white/30' }
    : { title: 'text-slate-900', text: 'text-slate-600', card: 'bg-white border-slate-300', icon: 'text-blue-600 bg-blue-50',
        chip: 'border-blue-500 text-blue-700 bg-blue-50 hover:bg-blue-100', faint: 'text-slate-500' };
  const cards = [CAN_DO.teachings, CAN_DO.journey, CAN_DO.language];

  return (
    <div className="min-h-full flex flex-col items-center justify-center py-6 sm:py-10">
      <Sparkles className="w-7 h-7 text-blue-400 mb-2" />
      <p className={`text-base font-black ${s.title}`}>Hi! I&apos;m the church assistant.</p>
      <p className={`text-xs ${s.text} mt-1 text-center max-w-sm`}>
        {note || 'Here’s what I can help with. Tap a question below to try it, or type your own.'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-3xl mt-6">
        {cards.map(({ Icon, title, text }) => (
          <div key={title} className={`border rounded-xl p-3.5 ${s.card}`}>
            <span className={`inline-flex w-8 h-8 rounded-lg items-center justify-center mb-2 ${s.icon}`}><Icon size={16} /></span>
            <p className={`text-sm font-bold ${s.title}`}>{title}</p>
            <p className={`text-xs ${s.text} mt-0.5 leading-relaxed`}>{text}</p>
          </div>
        ))}
      </div>

      <p className={`text-[10px] uppercase tracking-widest font-bold ${s.faint} mt-6 mb-2`}>Try asking</p>
      <div className="flex flex-wrap justify-center gap-2 max-w-3xl">
        {[...suggestions, ...(member ? ALWAYS.member : ALWAYS.staff)].map(({ label, question }) => (
          <button key={question} type="button" disabled={disabled} onClick={() => onAsk(question)} title={question}
            className={`text-xs font-semibold px-3.5 py-2 rounded-full border transition-colors disabled:opacity-50 ${s.chip}`}>
            {label}
          </button>
        ))}
      </div>
      <p className={`text-[11px] ${s.faint} mt-5 text-center max-w-md`}>
        I only answer from the church&apos;s own material. If it isn&apos;t written there, I&apos;ll say so, so you can ask a pastor.
      </p>
    </div>
  );
}

// Under the latest answer: "Tell me more" (when it came from a document)
// and related questions from nearby sections (api/chatbot `related`).
// Tapping one asks it.
export function FollowUps({ dark = true, more, related = [], disabled, onAsk }) {
  if (!more && !related.length) return null;
  const plain = dark ? 'border-white/15 text-white/60 hover:text-white hover:bg-white/5' : 'border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100';
  const chip = dark ? 'border-blue-400/40 text-blue-300 bg-blue-500/10 hover:bg-blue-500/20' : 'border-blue-500 text-blue-700 bg-blue-50 hover:bg-blue-100';
  return (
    <div className="ml-11 mt-2 space-y-2">
      {related.length > 0 && (
        <p className={`text-[10px] uppercase tracking-widest font-bold ${dark ? 'text-white/30' : 'text-slate-500'}`}>Related questions</p>
      )}
      <div className="flex flex-wrap gap-2">
        {related.map((r) => (
          <button key={r.question} type="button" disabled={disabled} onClick={() => onAsk(r.question)} title={r.question}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 text-left ${chip}`}>
            {r.label}
          </button>
        ))}
        {more && (
          <button type="button" disabled={disabled} onClick={() => onAsk('Tell me more')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${plain}`}>
            Tell me more
          </button>
        )}
      </div>
    </div>
  );
}
