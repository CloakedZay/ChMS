'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/app/lib/supabase';
import { Wallet, TrendingUp, TrendingDown, Search, History } from 'lucide-react';

const FUNDS = ['Monthly Budget', 'General Fund', 'Project Fund', 'Lot Fund'];
const FUND_DOTS = { 'Monthly Budget': 'bg-yellow-500', 'General Fund': 'bg-blue-500', 'Project Fund': 'bg-purple-500', 'Lot Fund': 'bg-pink-500' };

const STATUS_BADGE = {
  Verified:   'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Pending:    'bg-orange-500/10 text-orange-400 border-orange-500/20',
  Unverified: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

export default function MemberFinancesPage() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [fetchError, setFetchError]     = useState('');
  const [search, setSearch]             = useState('');
  const [filterType, setFilterType]     = useState('all');

  useEffect(() => {
    async function fetchTransactions() {
      setLoading(true);
      const { data, error } = await supabase
        .from('transactions')
        .select('id, category, fund, amount, type, status, date')
        .order('date', { ascending: false });
      if (error) {
        console.error('Finance fetch error:', error.message);
        setFetchError(error.message);
      }
      setTransactions(data || []);
      setLoading(false);
    }
    fetchTransactions();
  }, []);

  const totalIncome  = transactions.filter(t => t.type === 'income').reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const totalBalance = totalIncome - totalExpense;

  const fundTotals = FUNDS.reduce((acc, fund) => {
    acc[fund] = transactions.filter(t => t.fund === fund && t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return acc;
  }, {});

  const filtered = transactions.filter((tx) => {
    const term = search.toLowerCase();
    const matchSearch = tx.category?.toLowerCase().includes(term) || tx.fund?.toLowerCase().includes(term);
    const matchType = filterType === 'all' || tx.type === filterType;
    return matchSearch && matchType;
  });

  const formatPeso = (v) => '₱' + (v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 });

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">GGCF-GMI · Pandi, Bulacan</p>
        <h1 className="text-2xl font-black text-white">Finances</h1>
        <p className="text-slate-500 text-sm mt-0.5">Church tithes, offerings, and fund allocations</p>
      </div>

      {fetchError && (
        <div className="mb-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4">
          <p className="text-sm text-rose-400 font-bold">Couldn&apos;t load finance data</p>
          <p className="text-xs text-rose-300/70 mt-1">{fetchError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Church Balance" amount={totalBalance} icon={Wallet} color="text-blue-400" />
        <StatCard label="Total Income"   amount={totalIncome}  icon={TrendingUp} color="text-emerald-400" />
        <StatCard label="Total Expenses" amount={totalExpense} icon={TrendingDown} color="text-rose-400" />
      </div>

      <div className="bg-[#1a1d2e] border border-white/10 rounded-3xl p-6 mb-6">
        <h3 className="text-[10px] uppercase font-bold tracking-widest text-white/40 mb-5 border-b border-white/10 pb-3">Fund Breakdown</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {FUNDS.map((fund) => (
            <div key={fund} className="bg-white/[0.03] rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${FUND_DOTS[fund]}`} />
                <span className="text-[10px] text-white/40 uppercase tracking-wider font-bold">{fund}</span>
              </div>
              <p className="text-lg font-black text-white font-mono">{formatPeso(fundTotals[fund])}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-white/30" />
          <input
            type="text"
            placeholder="Search by category or fund..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#1a1d2e] border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'income', 'expense'].map((tp) => (
            <button
              key={tp}
              onClick={() => setFilterType(tp)}
              className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all ${filterType === tp ? 'bg-blue-600 text-white' : 'bg-[#1a1d2e] border border-white/10 text-white/40 hover:text-white'}`}
            >
              {tp}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#1a1d2e] border border-white/10 rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/[0.02] text-[10px] uppercase tracking-widest text-white/40 font-bold border-b border-white/10">
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Fund</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-14 text-white/30 text-sm">Loading ledger...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-14">
                  <History className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                  <p className="text-white/30 text-sm">{search || filterType !== 'all' ? 'No entries match your search.' : 'No transactions recorded yet.'}</p>
                </td></tr>
              ) : (
                filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-blue-500/5 transition-colors">
                    <td className="px-6 py-4 text-white/50 text-sm">{tx.date ? new Date(tx.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                    <td className="px-6 py-4 font-semibold text-white text-sm">{tx.category}</td>
                    <td className="px-6 py-4 text-blue-400 text-xs font-medium">{tx.fund || '—'}</td>
                    <td className={`px-6 py-4 font-black text-sm font-mono ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {tx.type === 'expense' ? '−' : '+'}{formatPeso(Number(tx.amount))}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`border text-[10px] uppercase font-bold px-3 py-1 rounded-full ${STATUS_BADGE[tx.status] || STATUS_BADGE.Verified}`}>{tx.status || 'Verified'}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, amount, icon: Icon, color }) {
  return (
    <div className="bg-[#1a1d2e] border border-white/10 p-6 rounded-3xl">
      <div className={`p-2.5 rounded-xl bg-white/[0.03] w-fit mb-4 ${color}`}><Icon size={20} /></div>
      <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mb-1">{label}</p>
      <h3 className="text-2xl font-black text-white font-mono">{'₱' + (amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</h3>
    </div>
  );
}
