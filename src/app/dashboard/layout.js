'use client';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, Calendar, Wallet,
  ClipboardList, BarChart3, LogOut, ShieldCheck
} from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import { useTheme } from "@/app/context/ThemeContext"; // NEW

const NAV_LINKS = [
  { href: "/dashboard",            icon: LayoutDashboard, label: "Dashboard" },
  { href: "/dashboard/members",    icon: Users,           label: "Members" },
  { href: "/dashboard/events",     icon: Calendar,        label: "Events" },
  { href: "/dashboard/finance",    icon: Wallet,          label: "Finance" },
  { href: "/dashboard/ministry",   icon: ClipboardList,   label: "Ministries" },
  { href: "/dashboard/reports",    icon: BarChart3,       label: "Reports" },
];

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, signOut } = useAuth();
  const { dark } = useTheme(); // NEW

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  // Get initials from email
  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'AD';

  // Format role label
  const roleLabel = role
    ? role.charAt(0).toUpperCase() + role.slice(1)
    : 'Admin';

  // NEW — sidebar theme tokens, same pattern as DashboardPage's T()
  const s = {
    pageBg:     dark ? "bg-[#0f111a]"        : "bg-slate-100",
    sideBg:     dark ? "bg-[#161925]"        : "bg-white",
    sideBorder: dark ? "border-slate-800/50" : "border-slate-200",
    textMain:   dark ? "text-slate-100"      : "text-slate-900",
    logoText:   dark ? "text-white"          : "text-slate-900",
    logoSub:    dark ? "text-slate-600"      : "text-slate-400",
    navLabel:   dark ? "text-slate-700"      : "text-slate-400",
    navInactive:dark ? "text-slate-500 hover:text-white hover:bg-white/5" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100",
    iconInactive: dark ? "text-slate-600 group-hover:text-slate-300" : "text-slate-400 group-hover:text-slate-600",
    userCard:   dark ? "bg-slate-800/30"     : "bg-slate-100",
    userName:   dark ? "text-white"          : "text-slate-900",
    userEmail:  dark ? "text-slate-600"      : "text-slate-400",
  };

  return (
    <div className={`flex min-h-screen ${s.pageBg} ${s.textMain} transition-colors duration-200`}>

      {/* Sidebar */}
      <aside className={`w-64 ${s.sideBg} border-r ${s.sideBorder} flex flex-col fixed h-full z-20 transition-colors duration-200`}>

        {/* Logo */}
        <div className={`px-6 py-7 border-b ${s.sideBorder}`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <span className={`text-lg font-black tracking-widest ${s.logoText} uppercase italic`}>FaithSync</span>
          </div>
          <p className={`text-[10px] ${s.logoSub} mt-1.5 ml-0.5 uppercase tracking-wider`}>GGCF-GMI Pandi</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 space-y-1">
          <p className={`text-[9px] uppercase tracking-widest ${s.navLabel} font-bold px-3 mb-3`}>Main Menu</p>
          {NAV_LINKS.map(({ href, icon: Icon, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl transition-all group ${
                  active
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                    : s.navInactive
                }`}
              >
                <Icon size={17} className={active ? "text-white" : s.iconInactive} />
                <span className="text-sm font-semibold">{label}</span>
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/50" />}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: User + Sign Out */}
        <div className={`p-3 border-t ${s.sideBorder} space-y-1`}>

          {/* User Info */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl ${s.userCard}`}>
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/20 flex items-center justify-center shrink-0">
              <span className="text-xs font-black text-blue-400">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-bold ${s.userName} truncate`}>{roleLabel}</p>
              <p className={`text-[10px] ${s.userEmail} truncate`}>{user?.email || 'Loading...'}</p>
            </div>
          </div>

          {/* Sign Out */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition-all group"
          >
            <LogOut size={17} className="group-hover:text-red-400 transition-colors" />
            <span className="text-sm font-semibold">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 min-h-screen">
        {children}
      </main>
    </div>
  );
}