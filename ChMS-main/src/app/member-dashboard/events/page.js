'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/app/lib/supabase';
import { Search, CalendarDays, Calendar } from 'lucide-react';

const STATUS_COLORS = {
  approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  pending:  'bg-orange-500/10 text-orange-400 border-orange-500/20',
  planning: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  done:     'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

export default function MemberEventsPage() {
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    async function fetchEvents() {
      setLoading(true);
      const { data } = await supabase
        .from('events')
        .select('*')
        .order('date', { ascending: true });
      setEvents(data || []);
      setLoading(false);
    }
    fetchEvents();
  }, []);

  const filtered = events.filter((ev) => {
    const term = search.toLowerCase();
    return ev.title?.toLowerCase().includes(term) || ev.ministry?.toLowerCase().includes(term);
  });

  const formatDate = (d) => d
    ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'No date set';

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">GGCF-GMI · Pandi, Bulacan</p>
        <h1 className="text-2xl font-black text-white">Events &amp; Services</h1>
        <p className="text-slate-500 text-sm mt-0.5">Church activities and ministry projects</p>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-white/30" />
        <input
          type="text"
          placeholder="Search events or ministries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#1a1d2e] border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {loading ? (
        <p className="text-white/30 text-sm">Loading events...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <CalendarDays className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">{search ? 'No events match your search.' : 'No events scheduled yet.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((ev) => (
            <div key={ev.id} className="bg-[#1a1d2e] border border-white/10 p-6 rounded-3xl">
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${STATUS_COLORS[ev.status] || STATUS_COLORS.planning}`}>
                {ev.status || 'planning'}
              </span>
              <h3 className="text-base font-black text-white mt-4 mb-1 leading-snug">{ev.title}</h3>
              <p className="text-blue-400 text-[10px] font-bold uppercase tracking-wider mb-4">{ev.ministry || 'No ministry assigned'}</p>
              <div className="flex items-center gap-2 text-white/50">
                <Calendar size={13} className="text-white/30 shrink-0" />
                <span className="text-xs">{formatDate(ev.date)}</span>
              </div>
              {ev.description && (
                <p className="text-xs text-white/40 leading-relaxed mt-3 line-clamp-3">{ev.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
