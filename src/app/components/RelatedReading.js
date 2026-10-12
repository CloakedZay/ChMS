'use client';

import { useState } from 'react';
import { BookOpenText, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { authFetch } from '@/app/lib/authFetch';
import { useTheme } from '@/app/context/ThemeContext';

// The handout passages of a module that relate to a piece of text
// (/api/knowledge/related). Loaded only when opened.
//   members — label "Related reading", under a lesson question: points to
//             where to read, it doesn't answer the question for them
//   leaders — label "What the handout says", next to an answer in review
// Fixed hex classes so it reads the same on the member and staff pages.

export default function RelatedReading({ moduleId, text, label = 'Related reading', hint }) {
  const { dark } = useTheme();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);   // null | 'loading' | { passages, setup }
  const [full, setFull] = useState(null);     // index of a passage shown in full

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || state) return;
    setState('loading');
    try {
      const res = await authFetch('/api/knowledge/related', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_id: moduleId, text }),
      });
      const data = await res.json();
      setState(res.ok ? data : { passages: [], setup: data.error || 'Could not load.' });
    } catch {
      setState({ passages: [], setup: 'Could not load. Please try again.' });
    }
  }

  const t = dark
    ? { btn: 'text-[#c5a66a] hover:text-[#dcc88f]', box: 'bg-[#c5a66a]/[0.07] border-[#c5a66a]/25', title: 'text-[#e9ece9]', body: 'text-[#c9cdc9]', muted: 'text-[#858b87]' }
    : { btn: 'text-[#9c7f45] hover:text-[#7a6234]', box: 'bg-[#faf6ec] border-[#c5a66a]/40', title: 'text-[#173f35]', body: 'text-[#4c534f]', muted: 'text-[#858b87]' };

  if (!moduleId || !text) return null;

  return (
    <div>
      <button type="button" onClick={toggle} aria-expanded={open}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${t.btn}`}>
        <BookOpenText size={14} strokeWidth={1.75} />
        {label}
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open && (
        <div className={`mt-2 rounded-xl border px-3.5 py-3 text-xs leading-relaxed ${t.box}`}>
          {state === 'loading' || state === null ? (
            <p className={`flex items-center gap-2 ${t.muted}`}><Loader2 size={13} className="animate-spin" /> Looking in this module&apos;s handouts…</p>
          ) : state.passages?.length ? (
            <div className="space-y-3">
              {hint && <p className={t.muted}>{hint}</p>}
              {state.passages.map((p, i) => (
                <div key={i}>
                  <p className={`font-semibold ${t.title}`}>{p.title}</p>
                  <p className={`mt-1 whitespace-pre-wrap ${t.body}`}>{full === i ? p.full : p.excerpt}</p>
                  {p.full && p.full.length > p.excerpt.length + 20 && (
                    <button type="button" onClick={() => setFull(full === i ? null : i)} className={`mt-1 font-semibold ${t.btn}`}>
                      {full === i ? 'Show less' : 'Read the full passage'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className={t.muted}>
              {!state.setup
                ? 'Nothing in this module’s handouts relates to this question.'
                : state.setup.startsWith('Run db')
                  ? 'Not available yet — ask the administrator to run db/035 and db/037 in Supabase.'
                  : state.setup}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
