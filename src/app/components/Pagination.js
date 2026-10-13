'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '@/app/context/ThemeContext';

// Shared paging for long lists (Members, Events, Follow-up, Announcements,
// Journal, member directory).
//
//   const pg = usePaged(filtered, 10, `${search}|${filter}`);
//   pg.items.map(...)                 ← only this page's rows
//   <Pagination {...pg} label="members" />
//
// `resetKey`: when it changes (new search / filter) the list goes back to
// page 1. The page is also kept in range when the list shrinks.

export function usePaged(list, pageSize = 10, resetKey = '') {
  const [state, setState] = useState({ key: resetKey, page: 1 });
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const wanted = state.key === resetKey ? state.page : 1;
  const page = Math.min(Math.max(1, wanted), totalPages);
  const start = (page - 1) * pageSize;
  return {
    items: list.slice(start, start + pageSize),
    page,
    totalPages,
    total,
    from: total ? start + 1 : 0,
    to: Math.min(start + pageSize, total),
    setPage: (p) => setState({ key: resetKey, page: p }),
  };
}

// Page numbers to show: first, last, and the ones around the current page.
function pageList(page, totalPages) {
  const set = new Set([1, totalPages, page - 1, page, page + 1]);
  const pages = [...set].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out = [];
  pages.forEach((p, i) => {
    if (i && p - pages[i - 1] > 1) out.push('…' + p);
    out.push(p);
  });
  return out;
}

export default function Pagination({ page, totalPages, total, from, to, setPage, label = 'items', className = '' }) {
  const { dark } = useTheme();
  if (total === 0) return null;

  const t = dark
    ? { text: 'text-[#858b87]', btn: 'border-white/10 text-[#c9cdc9] hover:bg-white/5', on: 'bg-[#2f6b57] border-[#2f6b57] text-white' }
    : { text: 'text-[#858b87]', btn: 'border-[#d9d6c8] text-[#4c534f] hover:bg-white', on: 'bg-[#173f35] border-[#173f35] text-white' };

  const go = (p) => {
    setPage(p);
    // keep the list's top in view after changing page
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav aria-label="Pages" className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 ${className}`}>
      <p className={`text-xs ${t.text}`}>
        Showing {from}–{to} of {total} {label}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => go(page - 1)} disabled={page === 1} aria-label="Previous page"
            className={`h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 ${t.btn}`}>
            <ChevronLeft size={14} /> Prev
          </button>
          {pageList(page, totalPages).map((p) => (typeof p === 'string'
            ? <span key={p} className={`px-1 text-xs ${t.text}`}>…</span>
            : (
              <button key={p} type="button" onClick={() => go(p)} aria-current={p === page ? 'page' : undefined}
                className={`h-8 min-w-8 px-2 rounded-lg border text-xs font-semibold ${p === page ? t.on : t.btn}`}>
                {p}
              </button>
            )))}
          <button type="button" onClick={() => go(page + 1)} disabled={page === totalPages} aria-label="Next page"
            className={`h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 ${t.btn}`}>
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}
    </nav>
  );
}
