'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/app/lib/supabase';
import { Search, Users } from 'lucide-react';

export default function MemberDirectoryPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    async function fetchMembers() {
      setLoading(true);
      const { data } = await supabase
        .from('members')
        .select('full_name, role, ministry, status')
        .order('full_name', { ascending: true });
      setMembers(data || []);
      setLoading(false);
    }
    fetchMembers();
  }, []);

  const filtered = members.filter((m) => {
    const term = search.toLowerCase();
    return (
      m.full_name?.toLowerCase().includes(term) ||
      m.ministry?.toLowerCase().includes(term) ||
      m.role?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">GGCF-GMI · Pandi, Bulacan</p>
        <h1 className="text-2xl font-black text-white">Church Members</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {loading ? 'Loading...' : `${members.length} member${members.length === 1 ? '' : 's'} in the congregation`}
        </p>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-white/30" />
        <input
          type="text"
          placeholder="Search by name, role, or ministry..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#1a1d2e] border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {loading ? (
        <p className="text-white/30 text-sm">Loading members...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Users className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">{search ? 'No members match your search.' : 'No members yet.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m, i) => (
            <div key={i} className="bg-[#1a1d2e] rounded-3xl p-5 border border-white/10 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/20 flex items-center justify-center shrink-0">
                <span className="text-xs font-black text-blue-400">
                  {m.full_name?.split(' ').map(w => w[0]).slice(0, 2).join('')}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{m.full_name}</p>
                <p className="text-xs text-white/40 truncate capitalize">{m.role || 'Member'} · {m.ministry || 'Unassigned'}</p>
              </div>
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.status === 'active' ? 'bg-emerald-500' : 'bg-slate-600'}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
