'use client';
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Calendar, Wallet, ClipboardList, BarChart3, LogOut } from "lucide-react";

export default function DashboardLayout({ children }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-[#0f111a] text-slate-100">
      {/* FIXED SIDEBAR */}
      <aside className="w-64 bg-[#161925] border-r border-slate-800/50 flex flex-col fixed h-full z-20">
        <div className="p-8">
          <h1 className="text-xl font-bold tracking-widest text-blue-400 italic">FAITHSYNC</h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          <SidebarLink href="/dashboard" icon={LayoutDashboard} label="Dashboard" active={pathname === "/dashboard"} />
          <SidebarLink href="/dashboard/members" icon={Users} label="Members" active={pathname === "/dashboard/members"} />
          <SidebarLink href="/dashboard/events" icon={Calendar} label="Events" active={pathname === "/dashboard/events"} />
          <SidebarLink href="/dashboard/finance" icon={Wallet} label="Finance" active={pathname === "/dashboard/finance"} />
          <SidebarLink href="/dashboard/ministry" icon={ClipboardList} label="Ministries" active={pathname === "/dashboard/ministry"} />
          <SidebarLink href="/dashboard/reports" icon={BarChart3} label="Reports" active={pathname === "/dashboard/reports"} />
        </nav>

        <div className="p-4 border-t border-slate-800">
          <SidebarLink href="/login" icon={LogOut} label="Sign Out" />
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 ml-64 min-h-screen">
        {children} 
      </main>
    </div>
  );
}

function SidebarLink({ href, icon: Icon, label, active }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-6 py-3 rounded-2xl transition-all group ${
        active 
          ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" 
          : "text-slate-500 hover:text-white hover:bg-white/5"
      }`}
    >
      <Icon size={18} />
      <span className="text-sm font-semibold">{label}</span>
    </Link>
  );
}