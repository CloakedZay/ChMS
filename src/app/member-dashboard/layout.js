'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import {
  LayoutDashboard, Users, CalendarDays, ClipboardList,
  HandCoins, BookOpen, UserCircle, LogOut, Church, Bot
} from 'lucide-react';

const NAV_LINKS = [
  { href: '/member-dashboard',              icon: LayoutDashboard, label: 'Overview' },
  { href: '/member-dashboard/members',      icon: Users,           label: 'Members' },
  { href: '/member-dashboard/events',       icon: CalendarDays,    label: 'Events' },
  { href: '/member-dashboard/ministries',   icon: ClipboardList,   label: 'Ministries' },
  { href: '/member-dashboard/finances',     icon: HandCoins,       label: 'Finances' },
  { href: '/member-dashboard/discipleship', icon: BookOpen,        label: 'Discipleship' },
  { href: '/member-dashboard/chatbot',      icon: Bot,             label: 'Assistant' },
  { href: '/member-dashboard/profile',      icon: UserCircle,      label: 'Profile' },
];

export default function MemberDashboardLayout({ children }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.push('/login?type=member');
  }, [user, loading]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#0f111a] flex items-center justify-center">
        <p className="text-white/50 text-sm">Loading...</p>
      </div>
    );
  }

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'ME';

  return (
    <div className="flex min-h-screen bg-[#0f111a] text-white">

      {/* Sidebar */}
      <aside className="w-20 lg:w-64 bg-[#161925] border-r border-white/10 flex flex-col fixed h-full z-40 transition-all duration-200">

        <div className="px-3 lg:px-6 py-7 border-b border-white/10">
          <div className="flex items-center justify-center lg:justify-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Church className="w-4 h-4 text-blue-400" />
            </div>
            <span className="hidden lg:inline text-lg font-black tracking-widest uppercase italic text-white">FaithSync</span>
          </div>
          <p className="hidden lg:block text-[10px] text-slate-600 mt-1.5 ml-0.5 uppercase tracking-wider">Member Portal</p>
        </div>

        <nav className="flex-1 px-2 lg:px-3 py-5 space-y-1 overflow-y-auto">
          <p className="hidden lg:block text-[9px] uppercase tracking-widest text-slate-700 font-bold px-3 mb-3">Main Menu</p>
          {NAV_LINKS.map(({ href, icon: Icon, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={`flex items-center justify-center lg:justify-start gap-3 px-3 lg:px-4 py-2.5 rounded-2xl transition-all group ${
                  active
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                    : 'text-slate-500 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={17} className={`shrink-0 ${active ? 'text-white' : 'text-slate-600 group-hover:text-slate-300'}`} />
                <span className="hidden lg:inline text-sm font-semibold">{label}</span>
                {active && <span className="hidden lg:inline-block ml-auto w-1.5 h-1.5 rounded-full bg-white/50" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-2 lg:p-3 border-t border-white/10 space-y-1">
          <div className="flex items-center justify-center lg:justify-start gap-3 px-2 lg:px-4 py-3 rounded-2xl bg-white/[0.03]" title={user?.email || 'Loading...'}>
            <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center shrink-0">
              <span className="text-xs font-black text-indigo-300">{initials}</span>
            </div>
            <div className="hidden lg:block flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">Member</p>
              <p className="text-[10px] text-slate-600 truncate">{user?.email || 'Loading...'}</p>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            title="Sign Out"
            className="w-full flex items-center justify-center lg:justify-start gap-3 px-3 lg:px-4 py-2.5 rounded-2xl text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition-all group"
          >
            <LogOut size={17} className="shrink-0 group-hover:text-red-400 transition-colors" />
            <span className="hidden lg:inline text-sm font-semibold">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-20 lg:ml-64 min-h-screen min-w-0">
        {children}
      </main>
    </div>
  );
}
