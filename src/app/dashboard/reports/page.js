'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/app/lib/supabase";
import {
  BarChart3, TrendingUp, PieChart,
  Download, Filter, ArrowUpRight, ArrowDownRight,
  Users, Wallet, Calendar, TrendingDown
} from "lucide-react";

const FUND_COLORS = {
  income: "bg-emerald-500",
  expense: "bg-rose-500",
};

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);

  // Members
  const [totalMembers, setTotalMembers] = useState(0);
  const [activeMembers, setActiveMembers] = useState(0);
  const [membersByMinistry, setMembersByMinistry] = useState([]);

  // Finance
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [monthlyTotals, setMonthlyTotals] = useState([]);

  // Events
  const [totalEvents, setTotalEvents] = useState(0);
  const [upcomingEvents, setUpcomingEvents] = useState(0);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      try {
        // ── Members ──────────────────────────────────────────
        const { count: mTotal } = await supabase
          .from('members')
          .select('*', { count: 'exact', head: true });

        const { count: mActive } = await supabase
          .from('members')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active');

        const { data: members } = await supabase
          .from('members')
          .select('ministry');

        // Group by ministry
        const ministryMap = {};
        (members || []).forEach((m) => {
          const key = m.ministry || 'Unassigned';
          ministryMap[key] = (ministryMap[key] || 0) + 1;
        });
        const ministryList = Object.entries(ministryMap)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        // ── Transactions ──────────────────────────────────────
        const { data: trans } = await supabase
          .from('transactions')
          .select('amount, type, date_recorded')
          .order('date_recorded', { ascending: false });

        const income = (trans || [])
          .filter(t => t.type === 'income')
          .reduce((s, t) => s + Number(t.amount || 0), 0);

        const expense = (trans || [])
          .filter(t => t.type === 'expense')
          .reduce((s, t) => s + Number(t.amount || 0), 0);

        // Group by month (last 7 months)
        const monthMap = {};
        (trans || []).forEach((t) => {
          if (!t.date_recorded) return;
          const d = new Date(t.date_recorded);
          const key = d.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' });
          if (!monthMap[key]) monthMap[key] = { income: 0, expense: 0 };
          if (t.type === 'income') monthMap[key].income += Number(t.amount || 0);
          if (t.type === 'expense') monthMap[key].expense += Number(t.amount || 0);
        });
        const monthlyArr = Object.entries(monthMap)
          .slice(-7)
          .map(([month, vals]) => ({ month, ...vals }));

        // ── Events ────────────────────────────────────────────
        const { count: evTotal } = await supabase
          .from('events')
          .select('*', { count: 'exact', head: true });

        const { count: evUpcoming } = await supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .gte('date', new Date().toISOString().split('T')[0]);

        // Set all state
        setTotalMembers(mTotal || 0);
        setActiveMembers(mActive || 0);
        setMembersByMinistry(ministryList);
        setTotalIncome(income);
        setTotalExpense(expense);
        setRecentTransactions((trans || []).slice(0, 6));
        setMonthlyTotals(monthlyArr);
        setTotalEvents(evTotal || 0);
        setUpcomingEvents(evUpcoming || 0);

      } catch (err) {
        console.error('Reports fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchAll();
  }, []);

  const balance = totalIncome - totalExpense;
  const attendanceRate = totalMembers > 0
    ? Math.round((activeMembers / totalMembers) * 100)
    : 0;

  // Bar chart: normalize heights
  const maxMonthly = Math.max(...monthlyTotals.map(m => Math.max(m.income, m.expense)), 1);

  return (
    <div className="p-8 min-h-screen bg-[#0f111a] text-slate-100">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">GGCF-GMI · Pandi, Bulacan</p>
          <h1 className="text-3xl font-black text-white tracking-tight">Reports & Analytics</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {loading ? 'Syncing live data...' : 'Live data from all church modules.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 bg-[#1a1d2e] hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all border border-slate-700">
            <Filter className="w-4 h-4" /> Filter Range
          </button>
          <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-900/20">
            <Download className="w-4 h-4" /> Export PDF
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {[
          {
            label: "Total Balance",
            val: loading ? "..." : `₱${balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
            sub: "Income minus expenses",
            up: balance >= 0,
            icon: Wallet,
            color: "text-blue-400",
          },
          {
            label: "Active Members",
            val: loading ? "..." : activeMembers.toString(),
            sub: `${attendanceRate}% of ${totalMembers} total`,
            up: true,
            icon: Users,
            color: "text-indigo-400",
          },
          {
            label: "Total Events",
            val: loading ? "..." : totalEvents.toString(),
            sub: `${upcomingEvents} upcoming`,
            up: true,
            icon: Calendar,
            color: "text-pink-400",
          },
          {
            label: "Total Expenses",
            val: loading ? "..." : `₱${totalExpense.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
            sub: "All recorded expenses",
            up: false,
            icon: TrendingDown,
            color: "text-rose-400",
          },
        ].map((s, i) => (
          <div key={i} className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 relative overflow-hidden group">
            <s.icon className="absolute -right-2 -bottom-2 w-16 h-16 text-white/3 group-hover:text-blue-500/10 transition-colors" />
            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">{s.label}</p>
            <p className={`text-2xl font-black ${s.color}`}>{s.val}</p>
            <p className={`text-xs mt-1 flex items-center gap-1 font-medium ${s.up ? 'text-emerald-400' : 'text-rose-400'}`}>
              {s.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {s.sub}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

        {/* Income vs Expense Bar Chart */}
        <div className="lg:col-span-2 bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6">
          <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-400" /> Monthly Finance
            </h3>
            <div className="flex gap-3 text-[10px] font-bold uppercase">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Income
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> Expense
              </span>
            </div>
          </div>

          {loading ? (
            <div className="h-48 flex items-center justify-center">
              <p className="text-slate-600 text-sm">Syncing...</p>
            </div>
          ) : monthlyTotals.length === 0 ? (
            <div className="h-48 flex items-center justify-center border border-dashed border-slate-800 rounded-2xl">
              <p className="text-slate-600 text-sm">No transaction data yet.</p>
            </div>
          ) : (
            <div className="h-52 flex items-end justify-between gap-2 px-2">
              {monthlyTotals.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                  <div className="w-full flex gap-1 items-end" style={{ height: '160px' }}>
                    {/* Income bar */}
                    <div
                      className="flex-1 bg-emerald-500/30 hover:bg-emerald-500/60 rounded-t-md transition-all relative group/bar"
                      style={{ height: `${Math.max((m.income / maxMonthly) * 100, 2)}%` }}
                    >
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[9px] py-0.5 px-1.5 rounded opacity-0 group-hover/bar:opacity-100 transition-opacity whitespace-nowrap">
                        ₱{m.income.toLocaleString()}
                      </div>
                    </div>
                    {/* Expense bar */}
                    <div
                      className="flex-1 bg-rose-500/30 hover:bg-rose-500/60 rounded-t-md transition-all relative group/bar"
                      style={{ height: `${Math.max((m.expense / maxMonthly) * 100, 2)}%` }}
                    >
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-rose-600 text-white text-[9px] py-0.5 px-1.5 rounded opacity-0 group-hover/bar:opacity-100 transition-opacity whitespace-nowrap">
                        ₱{m.expense.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <span className="text-[9px] text-slate-600 font-bold">{m.month}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Members by Ministry */}
        <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6">
          <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 mb-5 border-b border-slate-800 pb-4">
            <Users className="w-4 h-4 text-indigo-400" /> Members by Ministry
          </h3>
          {loading ? (
            <p className="text-slate-600 text-sm text-center py-8">Syncing...</p>
          ) : membersByMinistry.length === 0 ? (
            <p className="text-slate-600 text-sm text-center py-8">No member data yet.</p>
          ) : (
            <div className="space-y-4">
              {membersByMinistry.map((m) => {
                const pct = totalMembers > 0 ? Math.round((m.count / totalMembers) * 100) : 0;
                return (
                  <div key={m.name}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-400 font-medium truncate max-w-[140px]">{m.name}</span>
                      <span className="text-white font-black">{m.count} <span className="text-slate-600 font-normal">({pct}%)</span></span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-slate-800 grid grid-cols-2 gap-3">
            <div className="bg-slate-900/60 rounded-2xl p-3 text-center">
              <p className="text-xl font-black text-white">{loading ? '...' : totalMembers}</p>
              <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">Total</p>
            </div>
            <div className="bg-slate-900/60 rounded-2xl p-3 text-center">
              <p className="text-xl font-black text-emerald-400">{loading ? '...' : activeMembers}</p>
              <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">Active</p>
            </div>
          </div>
        </div>
      </div>

      {/* Finance Summary + Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Income vs Expense Summary */}
        <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6">
          <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 mb-5 border-b border-slate-800 pb-4">
            <PieChart className="w-4 h-4 text-purple-400" /> Finance Summary
          </h3>
          <div className="space-y-5">
            {[
              { label: "Total Income", value: totalIncome, color: "bg-emerald-500", textColor: "text-emerald-400" },
              { label: "Total Expenses", value: totalExpense, color: "bg-rose-500", textColor: "text-rose-400" },
              { label: "Net Balance", value: balance, color: "bg-blue-500", textColor: "text-blue-400" },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-400">{item.label}</span>
                  <span className={`font-black ${item.textColor}`}>
                    {loading ? '...' : `₱${item.value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color} rounded-full`}
                    style={{ width: totalIncome > 0 ? `${Math.min((Math.abs(item.value) / totalIncome) * 100, 100)}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-blue-600/5 border border-blue-500/20 rounded-2xl">
            <p className="text-[10px] text-blue-400 font-bold uppercase mb-1">Stewardship Note</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Financial transparency is maintained across all fund categories as per GGCF-GMI policy.
            </p>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="lg:col-span-2 bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6">
          <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 mb-5 border-b border-slate-800 pb-4">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> Recent Transactions
          </h3>
          {loading ? (
            <p className="text-slate-600 text-sm text-center py-8">Syncing...</p>
          ) : recentTransactions.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-slate-800 rounded-2xl">
              <p className="text-slate-600 text-sm">No transactions recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentTransactions.map((tx, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 px-4 rounded-2xl bg-slate-900/40 hover:bg-slate-900/70 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${tx.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <div>
                      <p className="text-sm font-semibold text-white capitalize">{tx.type}</p>
                      <p className="text-[10px] text-slate-600">
                        {tx.date_recorded
                          ? new Date(tx.date_recorded).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </p>
                    </div>
                  </div>
                  <p className={`text-sm font-black font-mono ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {tx.type === 'expense' ? '−' : '+'}₱{Number(tx.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}