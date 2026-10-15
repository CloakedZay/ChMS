'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useTheme } from '@/app/context/ThemeContext';
import { canOpenPage, homePathFor, ROLE_LABELS } from '@/app/lib/permissions';
import { usePageVisit } from '@/app/lib/usePageVisit';
import { useUnreadMessages } from '@/app/lib/useUnreadMessages';
import AppShell from '@/app/components/AppShell';
import {
  LayoutDashboard, CalendarDays, ClipboardList,
  BookOpen, UserCircle, Bot, KeyRound, NotebookPen, MessageCircle, CalendarCheck2
} from 'lucide-react';

// Navigation, grouped. A group with no page the person can open is hidden.
const NAV_GROUPS = [
  { label: 'Overview', links: [
    { href: '/member-dashboard',              icon: LayoutDashboard, label: 'Overview' },
    { href: '/member-dashboard/messages',     icon: MessageCircle,   label: 'Messages' },
  ]},
  { label: 'Community', links: [
    { href: '/member-dashboard/events',       icon: CalendarDays,    label: 'Events' },
    { href: '/member-dashboard/attendance',   icon: CalendarCheck2,  label: 'Attendance' },
    { href: '/member-dashboard/ministries',   icon: ClipboardList,   label: 'Ministries' },
  ]},
  { label: 'Growth', links: [
    { href: '/member-dashboard/discipleship', icon: BookOpen,        label: 'Discipleship' },
    { href: '/member-dashboard/chatbot',      icon: Bot,             label: 'Assistant' },
    { href: '/member-dashboard/journal',      icon: NotebookPen,     label: 'Journal' },
  ]},
  { label: 'My account', links: [
    { href: '/member-dashboard/profile',      icon: UserCircle,      label: 'Profile' },
  ]},
];

export default function MemberDashboardLayout({ children }) {
  const { user, role, loading, signOut, mustChangePassword } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { dark, toggle: toggleTheme } = useTheme();

  // Signed out → login; a page this level can't open → their own home page.
  // No profile row yet = treat as a member, the least access.
  const level = role || 'member';
  const allowed = !!user && canOpenPage(level, pathname);
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login?type=member');
    else if (mustChangePassword) router.replace('/change-password');
    else if (!allowed) router.replace(homePathFor(level));
  }, [loading, user, level, allowed, mustChangePassword, router]);

  // Screen time: only pages this person actually stays on.
  usePageVisit(user?.id, pathname, !loading && allowed && !mustChangePassword);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const unreadMessages = useUnreadMessages(user?.id, !loading && allowed && !mustChangePassword);

  if (loading || !allowed) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-[#111815]' : 'bg-[#f8f7f2]'}`}>
        <div className="flex flex-col items-center gap-4">
          <div className="skeleton w-12 h-12 rounded-2xl" />
          <p className="text-sm text-[#858b87]">Loading...</p>
        </div>
      </div>
    );
  }

  const groups = NAV_GROUPS
    .map((g) => ({ ...g, links: g.links.filter(({ href }) => canOpenPage(level, href)).map((l) => (l.href.endsWith('/messages') ? { ...l, badge: unreadMessages } : l)) }))
    .filter((g) => g.links.length > 0);

  // The member pages are written with dark classes; .member-light (globals.css)
  // remaps them to the ivory theme.
  return (
    <div className={dark ? 'bg-[#111815] text-white' : 'member-light'}>
      <AppShell
        dark={dark}
        portalLabel="Member Portal"
        subLabel={user?.email || ''}
        homeHref="/member-dashboard"
        groups={groups}
        user={user}
        roleLabel={ROLE_LABELS[level]}
        onSignOut={handleSignOut}
        menuLinks={[
          { href: '/member-dashboard/profile', icon: UserCircle, label: 'My Profile' },
          { href: '/change-password', icon: KeyRound, label: 'Password & Google' },
        ]}
        themeToggle={toggleTheme}
      >
        {children}
      </AppShell>
    </div>
  );
}
