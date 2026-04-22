'use client';

import { useAuth } from '@/app/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function MemberDashboard() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/login?type=member');
  }, [user, loading]);

  if (loading) return (
    <div className="min-h-screen bg-[#0f111a] flex items-center justify-center">
      <p className="text-white/50">Loading...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f111a] text-white">
      <header className="bg-[#1a1d2e] border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⛪</span>
          <div>
            <h1 className="font-black text-lg">FaithSync</h1>
            <p className="text-xs text-white/40">Member Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-white/50 hidden sm:block">{user?.email}</span>
          <span className="text-xs bg-indigo-600/30 text-indigo-300 px-3 py-1 rounded-full border border-indigo-500/30">
            Member
          </span>
          <button
            onClick={signOut}
            className="text-sm text-white/40 hover:text-white transition"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-6 mt-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-3 flex items-center gap-3">
        <span>👁️</span>
        <p className="text-amber-300/80 text-sm">
          You're viewing in <strong>read-only mode</strong>. Contact your church admin to make changes.
        </p>
      </div>

      <main className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Members', value: '—', icon: '👥' },
            { label: 'Upcoming Events', value: '—', icon: '📅' },
            { label: 'Ministries', value: '5', icon: '✝️' },
            { label: 'Locations', value: '3', icon: '📍' },
          ].map((stat) => (
            <div key={stat.label} className="bg-[#1a1d2e] rounded-3xl p-5 border border-white/10">
              <div className="text-2xl mb-2">{stat.icon}</div>
              <div className="text-2xl font-black">{stat.value}</div>
              <div className="text-white/40 text-sm">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#1a1d2e] rounded-3xl p-6 border border-white/10">
            <h2 className="font-black text-lg mb-4">📅 Upcoming Events</h2>
            <p className="text-white/30 text-sm">Events will appear here.</p>
          </div>
          <div className="bg-[#1a1d2e] rounded-3xl p-6 border border-white/10">
            <h2 className="font-black text-lg mb-4">👥 Church Members</h2>
            <p className="text-white/30 text-sm">Members list will appear here.</p>
          </div>
          <div className="bg-[#1a1d2e] rounded-3xl p-6 border border-white/10">
            <h2 className="font-black text-lg mb-4">💰 Finances</h2>
            <p className="text-white/30 text-sm">Financial overview will appear here.</p>
          </div>
          <div className="bg-[#1a1d2e] rounded-3xl p-6 border border-white/10">
            <h2 className="font-black text-lg mb-4">📣 Announcements</h2>
            <p className="text-white/30 text-sm">Announcements will appear here.</p>
          </div>
        </div>
      </main>
    </div>
  );
}