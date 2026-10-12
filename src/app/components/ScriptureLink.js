'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen, ExternalLink, Smartphone } from 'lucide-react';
import { bibleLinks, BIBLE_VERSION } from '@/app/lib/bibleLinks';
import { useTheme } from '@/app/context/ThemeContext';

// A scripture reference that opens the passage in a Bible site or app.
// Click → a small menu: BibleGateway (website) or YouVersion (opens the app
// on phones that have it). A reference that can't be read stays plain text.
//
//   <ScriptureLink reference="James 1:2-3" className="text-sm font-bold" />
//   prefix — text shown before the reference (e.g. "— ")

export default function ScriptureLink({ reference, className = '', prefix = '' }) {
  const { dark } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const links = bibleLinks(reference);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!links) return <span className={className}>{prefix}{reference}</span>;

  const menu = dark ? 'bg-[#1b2420] border-white/10' : 'bg-white border-[#e5e3d8]';
  const item = dark ? 'text-[#e9ece9] hover:bg-white/5' : 'text-[#252a28] hover:bg-[#f8f7f2]';

  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Read ${links.label} (${BIBLE_VERSION.label})`}
        className={`inline-flex items-center gap-1 underline decoration-dotted underline-offset-4 hover:decoration-solid ${className}`}
      >
        {prefix}{reference}
        <ExternalLink size={12} strokeWidth={2} className="opacity-70 shrink-0" />
      </button>

      {open && (
        <span
          role="menu"
          className={`absolute left-0 top-full mt-2 z-40 w-60 rounded-2xl border shadow-xl p-1.5 block text-left not-italic font-normal ${menu}`}
        >
          <span className={`block px-3 pt-2 pb-1 text-[11px] font-semibold text-[#858b87]`}>
            Read {links.label} · {BIBLE_VERSION.label}
          </span>
          <a role="menuitem" href={links.gateway} target="_blank" rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 h-10 px-3 rounded-xl text-sm ${item}`}>
            <BookOpen size={16} strokeWidth={1.75} className="text-[#858b87]" /> BibleGateway
          </a>
          <a role="menuitem" href={links.youversion} target="_blank" rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 h-10 px-3 rounded-xl text-sm ${item}`}>
            <Smartphone size={16} strokeWidth={1.75} className="text-[#858b87]" /> YouVersion Bible app
          </a>
        </span>
      )}
    </span>
  );
}
