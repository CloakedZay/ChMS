import Link from "next/link";
import { 
  Users, Calendar, Wallet, ClipboardList, 
  BarChart3, Bell, Search, Plus
} from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen bg-[#0f111a] text-slate-100 font-sans">

      {/* MAIN CONTENT */}
      <main className="flex-1 ml-64 p-10 bg-[#0f111a]">
        {/* Header */}
        <div className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-2xl font-bold text-white">GGCF-GMI Pandi, Bulacan</h2>
            <p className="text-slate-500 text-sm">Dashboard Overview</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search..." 
                className="bg-[#1a1d2e] border border-slate-800 rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <button className="p-2 bg-[#1a1d2e] rounded-full border border-slate-800 text-slate-400 hover:text-white">
              <Bell size={20} />
            </button>
          </div>
        </div>

        {/* Top Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <StatCard label="Active Members" value="7" sub="of 8 total" color="text-blue-400" />
          <StatCard label="Attendance Rate" value="88%" sub="Last Sunday" color="text-indigo-400" />
          <StatCard label="Total Church Funds" value="₱85,000.00" sub="All categories" color="text-purple-400" />
          <StatCard label="Upcoming Events" value="4" sub="Pending & Approved" color="text-pink-400" />
        </div>

        {/* Middle Section: Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Fund Breakdown Card */}
          <div className="bg-[#1a1d2e]/50 border border-slate-800/60 p-6 rounded-3xl backdrop-blur-sm">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-6 border-b border-slate-800 pb-2">Fund Breakdown</h3>
            <div className="space-y-4">
              <FundRow label="Monthly Budget" amount="₱15,000.00" dotColor="bg-yellow-500" />
              <FundRow label="General Fund" amount="₱42,500.00" dotColor="bg-blue-500" />
              <FundRow label="Project Fund" amount="₱21,250.00" dotColor="bg-purple-500" />
              <FundRow label="Lot Fund" amount="₱21,250.00" dotColor="bg-pink-500" />
            </div>
          </div>

          {/* Ministry Leaders Card */}
          <div className="bg-[#1a1d2e]/50 border border-slate-800/60 p-6 rounded-3xl backdrop-blur-sm">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-6 border-b border-slate-800 pb-2">Ministry Leaders</h3>
            <div className="space-y-4">
              <LeaderRow ministry="Program & Music" name="Israel Dadap" />
              <LeaderRow ministry="Mission & Evangelism" name="Neator Jose" />
              <LeaderRow ministry="Training & Life Group" name="Lolita Jose" />
              <LeaderRow ministry="Building & Equipment" name="Ariel Dela Pena" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* --- REUSABLE COMPONENTS --- */

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-[#1a1d2e]/50 border border-slate-800/60 p-6 rounded-3xl backdrop-blur-sm">
      <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">{label}</p>
      <p className={`text-3xl font-bold ${color} mb-1`}>{value}</p>
      <p className="text-xs text-slate-600 font-medium">{sub}</p>
    </div>
  );
}

function FundRow({ label, amount, dotColor }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="text-slate-300">{label}</span>
      </div>
      <span className="font-mono font-bold text-slate-100">{amount}</span>
    </div>
  );
}

function LeaderRow({ ministry, name }) {
  return (
    <div className="flex justify-between items-center text-sm border-b border-slate-800/30 pb-2">
      <span className="text-slate-400">{ministry}</span>
      <span className="text-white font-semibold">{name}</span>
    </div>
  );
}

function SidebarLink({ href, icon: Icon, label, active = false }) {
  return (
    <Link href={href}>
      <div className={`flex items-center gap-3 px-6 py-3 rounded-2xl cursor-pointer transition-all ${
        active 
          ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" 
          : "text-slate-500 hover:text-white hover:bg-white/5"
      }`}>
        <Icon size={18} />
        <span className="text-sm font-semibold">{label}</span>
      </div>
    </Link>
  );
}

// Just a dummy icon for the sidebar
function LayoutDashboard(props) {
  return <BarChart3 {...props} />;
}