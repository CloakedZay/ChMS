'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/app/lib/supabase"; // Updated to match your Members page import
import { 
  Wallet, TrendingUp, TrendingDown, Download, Plus, 
  Search, Filter, MoreVertical, ArrowUpRight, ArrowDownRight, 
  History, X 
} from "lucide-react";

export default function FinancePage() {
  const [transactions, setTransactions] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    category: 'Tithe',
    member: '',
    amount: '',
    type: 'income',
    status: 'Verified',
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchTransactions();
  }, []);

  async function fetchTransactions() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });
      
      if (!error) setTransactions(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    const { error } = await supabase
      .from('transactions')
      .insert([{ 
          category: formData.category,
          member: formData.member || "Anonymous",
          amount: parseFloat(formData.amount),
          type: formData.type,
          status: formData.status,
          date: formData.date
      }]);

    if (!error) {
      setShowModal(false);
      setFormData({ category: 'Tithe', member: '', amount: '', type: 'income', status: 'Verified', date: new Date().toISOString().split('T')[0] });
      fetchTransactions();
    }
  }

  // CRITICAL: Ensure these result in simple numbers, not objects
  const totalBalance = transactions.reduce((acc, tx) => tx.type === 'income' ? acc + (Number(tx.amount) || 0) : acc - (Number(tx.amount) || 0), 0);
  const incomeTotal = transactions.filter(tx => tx.type === 'income').reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);
  const expenseTotal = transactions.filter(tx => tx.type === 'expense').reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);

  return (
    <div className="p-10 min-h-screen bg-[#0f111a] text-white">
      {/* Header */}
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financial Ledger</h1>
          <p className="text-slate-500 text-sm mt-1">Track church tithes and expenses</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg"
        >
          <Plus size={18} /> New Entry
        </button>
      </div>

      {/* Stats - Using .toLocaleString() to ensure they are STRINGS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <FinanceStat label="Total Balance" amount={`₱${totalBalance.toLocaleString()}`} icon={Wallet} color="text-blue-400" />
        <FinanceStat label="Monthly Income" amount={`₱${incomeTotal.toLocaleString()}`} icon={TrendingUp} color="text-emerald-400" />
        <FinanceStat label="Monthly Expenses" amount={`₱${expenseTotal.toLocaleString()}`} icon={TrendingDown} color="text-rose-400" />
      </div>

      {/* Table */}
      <div className="bg-[#161925]/50 border border-slate-800/60 rounded-3xl overflow-hidden">
        {transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/50 text-[10px] uppercase text-slate-500 font-bold tracking-widest">
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-slate-400 text-sm">{String(tx.date)}</td>
                    <td className="px-6 py-4 font-semibold">{String(tx.category)}</td>
                    <td className={`px-6 py-4 font-bold ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      ₱{(Number(tx.amount) || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] px-3 py-1 rounded-full border border-slate-700 bg-slate-800/50">
                        {String(tx.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-20 text-center flex flex-col items-center opacity-40">
            <History size={48} className="mb-4" />
            <p>{loading ? "Loading Ledger..." : "No records found in database."}</p>
          </div>
        )}
      </div>

      {/* Add Entry Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#1a1d2e] border border-slate-800 w-full max-w-md rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">New Entry</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500"><X /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex gap-2">
                {['income', 'expense'].map(t => (
                  <button 
                    key={t} type="button"
                    onClick={() => setFormData({...formData, type: t})}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize border ${formData.type === t ? 'bg-blue-600 border-blue-500' : 'bg-[#0f111a] border-slate-800 text-slate-500'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <input 
                type="text" placeholder="Member/Payee" required
                className="w-full bg-[#0f111a] border border-slate-800 rounded-xl p-3 text-sm"
                value={formData.member} onChange={e => setFormData({...formData, member: e.target.value})}
              />
              <input 
                type="number" placeholder="Amount (₱)" required
                className="w-full bg-[#0f111a] border border-slate-800 rounded-xl p-3 text-sm"
                value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})}
              />
              <button type="submit" className="w-full bg-blue-600 font-bold py-3 rounded-xl mt-4">Save Entry</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Child component - Wrapped amount in String() to be extra safe
function FinanceStat({ label, amount, icon: Icon, color }) {
  return (
    <div className="bg-[#161925]/50 border border-slate-800/60 p-6 rounded-3xl backdrop-blur-sm">
      <div className={`p-3 rounded-2xl bg-slate-900/80 w-fit mb-4 ${color}`}><Icon size={24} /></div>
      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">{String(label)}</p>
      <h3 className="text-2xl font-bold">{String(amount)}</h3>
    </div>
  );
}