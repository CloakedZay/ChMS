'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { supabase } from '@/app/lib/supabase';
import { Save, Loader2 } from 'lucide-react';

export default function ProfilePage() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName]   = useState(false);
  const [saveMsg, setSaveMsg]         = useState('');

  useEffect(() => {
    if (!user) return;
    async function fetchProfile() {
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();
      if (data?.full_name) setDisplayName(data.full_name);
    }
    fetchProfile();
  }, [user]);

  async function saveDisplayName() {
    if (!displayName.trim()) return;
    setSavingName(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: displayName.trim() })
      .eq('id', user.id);
    setSavingName(false);
    setSaveMsg(error ? 'Something went wrong.' : '✓ Display name updated!');
    setTimeout(() => setSaveMsg(''), 4000);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">GGCF-GMI · Pandi, Bulacan</p>
        <h1 className="text-2xl font-black text-white">Profile</h1>
        <p className="text-slate-500 text-sm mt-0.5">Your account details</p>
      </div>

      <div className="max-w-md space-y-5">
        <div className="bg-[#1a1d2e] border border-white/10 rounded-3xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/20 flex items-center justify-center shrink-0">
              <span className="text-lg font-black text-blue-400">
                {displayName
                  ? displayName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
                  : user?.email?.[0]?.toUpperCase() || '?'}
              </span>
            </div>
            <div>
              <p className="text-base font-black text-white">
                {displayName || 'No display name set'}
              </p>
              <p className="text-xs text-white/40 mt-0.5">{user?.email}</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold block">
              Display Name
            </label>
            <input
              type="text"
              placeholder="Enter your full name..."
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveDisplayName()}
              className="w-full bg-[#0f111a] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <p className="text-[10px] text-white/20">
              This name is shown to your pastor when reviewing your discipleship answers.
            </p>
          </div>

          <div className="flex items-center justify-between mt-5">
            {saveMsg && (
              <p className={`text-xs font-bold ${saveMsg.startsWith('✓') ? 'text-emerald-400' : 'text-rose-400'}`}>
                {saveMsg}
              </p>
            )}
            <button
              onClick={saveDisplayName}
              disabled={savingName || !displayName.trim()}
              className="ml-auto flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
            >
              {savingName
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
                : <><Save className="w-3.5 h-3.5" /> Save Name</>
              }
            </button>
          </div>
        </div>

        <div className="bg-[#1a1d2e] border border-white/10 rounded-3xl p-6">
          <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-4">Account Info</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <p className="text-xs text-white/40">Email</p>
              <p className="text-xs text-white font-semibold">{user?.email}</p>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <p className="text-xs text-white/40">Role</p>
              <span className="text-xs bg-indigo-600/30 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-500/30 font-bold">
                Member
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <p className="text-xs text-white/40">Password</p>
              <p className="text-xs text-white/20">Managed by church admin</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
