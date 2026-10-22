'use client';

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  LayoutDashboard, Users, Calendar, Wallet,
  ClipboardList, BarChart3, Bot,
  Book, BookOpen, UserCog, History, NotebookPen, MessageCircle, Megaphone, HeartHandshake, UserCircle, ClipboardCheck
} from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import { useTheme } from "@/app/context/ThemeContext";
import { can, canOpenPage, homePathFor, ROLE_LABELS } from "@/app/lib/permissions";
import { usePageVisit } from "@/app/lib/usePageVisit";
import { useUnreadMessages } from "@/app/lib/useUnreadMessages";
import { useFollowUpReminder } from "@/app/lib/useFollowUpReminder";
import { useTrainingFollowUp } from "@/app/lib/useTrainingFollowUp";
import { useEventNotices } from "@/app/lib/useEventNotices";
import AppShell from "@/app/components/AppShell";
import { branchLabelText } from "@/app/components/BranchLabel";

// Navigation, grouped. A group with no page the person can open is hidden.
const NAV_GROUPS = [
  { label: "Overview", links: [
    { href: "/dashboard",              icon: LayoutDashboard, label: "Dashboard" },
    { href: "/dashboard/messages",     icon: MessageCircle,   label: "Messages" },
  ]},
  { label: "People", links: [
    { href: "/dashboard/members",      icon: Users,           label: "Members" },
    { href: "/dashboard/follow-up",    icon: HeartHandshake,  label: "Follow-up" },
    { href: "/dashboard/ministry",     icon: ClipboardList,   label: "Ministries" },
    { href: "/dashboard/users",        icon: UserCog,         label: "Users" },
  ]},
  { label: "Church life", links: [
    { href: "/dashboard/announcements", icon: Megaphone,      label: "Announcements" },
    { href: "/dashboard/events",       icon: Calendar,        label: "Events" },
    { href: "/dashboard/attendance",   icon: ClipboardCheck,  label: "Attendance" },
    { href: "/dashboard/training",     icon: Book,            label: "Training" },
    { href: "/dashboard/bible-verses", icon: BookOpen,        label: "Bible Verses" },
    { href: "/dashboard/chatbot",      icon: Bot,             label: "Assistant" },
    { href: "/dashboard/journal",      icon: NotebookPen,     label: "Journal" },
  ]},
  { label: "Stewardship", links: [
    { href: "/dashboard/finance",      icon: Wallet,          label: "Finance" },
    { href: "/dashboard/reports",      icon: BarChart3,       label: "Reports" },
    { href: "/dashboard/activity",     icon: History,         label: "Activity" },
  ]},
  { label: "My account", links: [
    { href: "/dashboard/profile",      icon: UserCircle,      label: "My Profile" },
  ]},
];

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, loading, signOut, mustChangePassword, churchName } = useAuth();
  const { dark } = useTheme();

  // Signed out → login; a page this level can't open → their own home page.
  // No profile row yet = treat as a member, the least access.
  const level = role || 'member';
  const allowed = !!user && canOpenPage(level, pathname);
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
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
  const followUp = useFollowUpReminder(user?.id, !loading && allowed && !mustChangePassword && can(level, 'followUp'));
  // Members behind in training (db/075): Pastor and Leaders — who both see
  // training progress and can follow up.
  const trainingFollowUp = useTrainingFollowUp(!loading && allowed && !mustChangePassword
    && can(level, 'followUp') && can(level, 'moduleProgress'));
  // Events waiting for the Pastor / the Pastor's decisions on yours (db/042).
  const eventNotices = useEventNotices(user?.id, level, !loading && allowed && !mustChangePassword && can(level, 'events'));

  // Don't render the page (or let it fetch data) until access is confirmed.
  if (loading || !allowed) {
    return (
      <div className={`min-h-screen ${dark ? "bg-[#111815]" : "bg-[#f8f7f2]"} flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-4">
          <div className="skeleton w-12 h-12 rounded-2xl" />
          <p className="text-sm text-[#858b87]">Loading...</p>
        </div>
      </div>
    );
  }

  const groups = NAV_GROUPS
    .map((g) => ({ ...g, links: g.links.filter(({ href }) => canOpenPage(level, href)).map((l) => (l.href.endsWith('/messages') ? { ...l, badge: unreadMessages }
      : l.href === '/dashboard/follow-up' ? { ...l, badge: followUp.count }
      : l.href === '/dashboard/training' ? { ...l, badge: trainingFollowUp.count }
      : l.href === '/dashboard/events' ? { ...l, badge: eventNotices.count } : l)) }))
    .filter((g) => g.links.length > 0);

  return (
    <AppShell
      dark={dark}
      portalLabel="Church Management"
      subLabel={branchLabelText(role, churchName)}
      homeHref="/dashboard"
      groups={groups}
      user={user}
      roleLabel={ROLE_LABELS[level]}
      onSignOut={handleSignOut}
      menuLinks={[
        { href: "/dashboard/profile", icon: UserCircle, label: "My Profile" },
      ]}
    >
      {children}
    </AppShell>
  );
}
