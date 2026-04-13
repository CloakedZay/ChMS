import React from 'react';
import { 
  BarChart3, TrendingUp, PieChart, 
  Download, Filter, ArrowUpRight, ArrowDownRight,
  Calendar, Users, Wallet
} from "lucide-react";

export default function ReportsPage() {
  return (
    <div className="p-8 min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Reports & Analytics</h1>
          <p className="text-slate-400 text-sm italic">GGCF-GMI Pandi · Administrative Insights</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all border border-slate-700">
            <Filter className="w-4 h-4" /> Filter Range
          </button>
          <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-blue-900/20">
            <Download className="w-4 h-4" /> Export PDF
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { label: "Total Tithes", val: "₱54,200", trend: "+12%", up: true, icon: Wallet },
          { label: "Avg Attendance", val: "124", trend: "+5%", up: true, icon: Users },
          { label: "Expenses", val: "₱12,800", trend: "-2%", up: false, icon: ArrowDownRight },
          { label: "New Souls", val: "12", trend: "Steady", up: true, icon: TrendingUp },
        ].map((stat, i) => (
          <div key={i} className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl relative overflow-hidden group">
             <stat.icon className="absolute -right-2 -bottom-2 w-16 h-16 text-white/5 group-hover:text-blue-500/10 transition-colors" />
             <p className="text-slate-500 text-xs uppercase font-bold tracking-widest">{stat.label}</p>
             <div className="flex items-baseline gap-2 mt-2">
                <p className="text-2xl font-black text-white">{stat.val}</p>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${stat.up ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                  {stat.trend}
                </span>
             </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Growth Chart Placeholder */}
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-500" /> Attendance Trends
            </h3>
            <div className="flex gap-2 text-[10px] font-bold uppercase tracking-tighter">
              <span className="flex items-center gap-1 text-blue-400"><span className="w-2 h-2 rounded-full bg-blue-500"/> Service</span>
              <span className="flex items-center gap-1 text-slate-500"><span className="w-2 h-2 rounded-full bg-slate-700"/> Youth</span>
            </div>
          </div>
          
          {/* Visual Simulation of a Chart */}
          <div className="h-64 flex items-end justify-between gap-3 px-2">
            {[45, 60, 55, 80, 70, 95, 85].map((bar, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 group cursor-help">
                <div className="w-full bg-blue-600/20 group-hover:bg-blue-600/40 transition-all rounded-t-md relative" style={{ height: `${bar}%` }}>
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                    {bar + 50}
                  </div>
                </div>
                <span className="text-[10px] text-slate-600 font-bold uppercase">Wk {i+1}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Fund Allocation Breakdown */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-indigo-400" /> Fund Allocation
          </h3>
          <div className="space-y-6">
            {[
              { name: "General Fund", color: "bg-blue-500", percent: 60 },
              { name: "Project Fund", color: "bg-indigo-500", percent: 25 },
              { name: "Lot Fund", color: "bg-emerald-500", percent: 10 },
              { name: "Love Gift", color: "bg-rose-500", percent: 5 },
            ].map((fund) => (
              <div key={fund.name}>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-400 font-medium">{fund.name}</span>
                  <span className="text-white font-bold">{fund.percent}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${fund.color} transition-all duration-1000`} style={{ width: `${fund.percent}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 p-4 bg-blue-600/5 border border-blue-500/20 rounded-xl">
            <p className="text-[10px] text-blue-400 font-bold uppercase mb-1">Stewardship Note</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Financial transparency is maintained across all 4 categories as per GGCF-GMI policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}