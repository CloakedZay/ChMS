'use client';
import { useState } from "react";
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Download, 
  Plus, 
  Search, 
  Filter,
  MoreVertical,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";

export default function FinancePage() {
  // Sample data based on your FaithSync project video
  const transactions = [
    { id: 1, date: "2025-06-28", category: "Tithe", member: "Dante Agustin", amount: 5000.00, type: "income", status: "Verified" },
    { id: 2, date: "2025-06-28", category: "Love Offering", member: "Anonymous", amount: 1250.00, type: "income", status: "Verified" },
    { id: 3, date: "2025-06-25", category: "Electric Bill", member: "Meralco", amount: 3450.00, type: "expense", status: "Paid" },
    { id: 4, date: "2025-06-24", category: "Mission Support", member: "Outreach Fund", amount: 2000.00, type: "expense", status: "Verified" },
    { id: 5, date: "2025-06-21", category: "Tithe", member: "David Lopez", amount: 3000.00, type: "income", status: "Verified" },
  ];

  return (
    <div className="p-10">
      {/* Header */}
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Financial Ledger</h1>
          <p className="text-slate-500 text-sm mt-1">Track church tithes, offerings, and operational expenses</p>
        </div>
        <div className="flex gap-3">
            <button className="flex items-center gap-2 bg-[#1a1d2e] border border-slate-800 text-slate-300 px-5 py-2.5 rounded-xl font-bold hover:text-white transition-all">
                <Download size={18} />
                Export PDF
            </button>
            <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/20">
                <Plus size={18} />
                New Entry
            </button>
        </div>
      </div>

      {/* Mini Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <FinanceStat label="Total Balance" amount="₱85,420.00" icon={Wallet} color="text-blue-400" />
        <FinanceStat label="Monthly Income" amount="₱12,250.00" icon={TrendingUp} color="text-emerald-400" trend="+12%" />
        <FinanceStat label="Monthly Expenses" amount="₱5,450.00" icon={TrendingDown} color="text-rose-400" trend="-5%" />
      </div>

      {/* Transactions Table */}
      <div className="bg-[#161925]/50 border border-slate-800/60 rounded-3xl overflow-hidden backdrop-blur-sm">
        <div className="p-6 border-b border-slate-800/60 flex justify-between items-center">
            <h3 className="font-bold text-white">Recent Transactions</h3>
            <div className="flex gap-2">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input type="text" placeholder="Search entries..." className="bg-[#0f111a] border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-blue-500" />
                </div>
                <button className="p-2 bg-[#0f111a] border border-slate-800 rounded-lg text-slate-400 hover:text-white"><Filter size={18}/></button>
            </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-900/50 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">From/To</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-4 text-slate-400 text-sm font-mono">{tx.date}</td>
                  <td className="px-6 py-4">
                    <span className="text-white text-sm font-semibold">{tx.category}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm">{tx.member}</td>
                  <td className="px-6 py-4">
                    <div className={`flex items-center gap-1 font-bold ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {tx.type === 'income' ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}
                        ₱{tx.amount.toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] uppercase font-black px-3 py-1 rounded-full border ${
                        tx.status === 'Verified' 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                        : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-slate-600 hover:text-white"><MoreVertical size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FinanceStat({ label, amount, icon: Icon, color, trend }) {
  return (
    <div className="bg-[#161925]/50 border border-slate-800/60 p-6 rounded-3xl backdrop-blur-sm">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-2xl bg-slate-900/80 ${color}`}>
          <Icon size={24} />
        </div>
        {trend && (
            <span className={`text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-900/50 ${trend.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>
                {trend}
            </span>
        )}
      </div>
      <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">{label}</p>
      <h3 className="text-2xl font-bold text-white">{amount}</h3>
    </div>
  );
}