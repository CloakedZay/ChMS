"use client";

import { useState, useEffect } from "react";
// Import the established supabase client from your lib folder
import { supabase } from "../lib/supabase"; 
import {
  Users, Bell, Search, TrendingUp, UserCheck,
  CalendarDays, HandCoins, Church, ChevronRight
} from "lucide-react";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  
  // ─── Real Database States ──────────────────────────────────────
  const [memberCount, setMemberCount] = useState(0);
  const [totalFunds, setTotalFunds] = useState(0);
  const [upcomingEventsCount, setUpcomingEventsCount] = useState(0);

  useEffect(() => {
    async function fetchLiveStats() {
      setLoading(true);
      
      try {
        // 1. Get Real Member Count from 'members' table
        const { count: mCount, error: mError } = await supabase
          .from('members')
          .select('*', { count: 'exact', head: true });

        // 2. Calculate Total Funds from 'transactions' table
        const { data: trans, error: tError } = await supabase
          .from('transactions')
          .select('amount, type');

        // 3. Get Upcoming Events Count
        const { count: eCount } = await supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .gte('date', new Date().toISOString());

        if (!mError) setMemberCount(mCount || 0);
        
        if (!tError && trans) {
          const total = trans.reduce((acc, curr) => 
            curr.type === 'income' ? acc + Number(curr.amount) : acc - Number(curr.amount), 0
          );
          setTotalFunds(total);
        }

        setUpcomingEventsCount(eCount || 0);
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchLiveStats();
  }, []);

  // ─── Dynamic Stats Array ──────────────────────────────────────
  const STATS = [
    { 
      label: "Active Members", 
      value: loading ? "..." : memberCount.toString(), 
      sub: "Total in Pandi", 
      icon: Users, 
      color: "text-blue-400" 
    },
    { 
      label: "Attendance Rate", 
      value: "0%", 
      sub: "Needs logging", 
      icon: UserCheck, 
      color: "text-indigo-400" 
    },
    { 
      label: "Total Church Funds", 
      value: loading ? "..." : `₱${totalFunds.toLocaleString()}`, 
      sub: "Live Balance", 
      icon: HandCoins, 
      color: "text-purple-400" 
    },
    { 
      label: "Upcoming Events", 
      value: loading ? "..." : upcomingEventsCount.toString(), 
      sub: "This month", 
      icon: CalendarDays, 
      color: "text-pink-400" 
    },
  ];

  return (
    <div className="p-8 min-h-screen bg-[#0f111a] text-slate-100">
      
      {/* Header */}
      <div className="flex justify-between items-start mb-10">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">GGCF-GMI · Pandi, Bulacan</p>
          <h2 className="text-2xl font-black text-white">Dashboard Overview</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {loading ? "Syncing with Supabase..." : "Live data from all church modules."}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        {STATS.map((s) => (
          <div key={s.label} className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500">{s.label}</p>
              <s.icon className="w-4 h-4 text-slate-700" />
            </div>
            <p className={`text-3xl font-black mb-1 ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-600">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Placeholder Sections for Events and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6">
          <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-5 border-b border-slate-800 pb-3">Next Schedule</h3>
          <div className="py-10 text-center border border-dashed border-slate-800 rounded-2xl">
            <CalendarDays className="w-8 h-8 text-slate-800 mx-auto mb-2" />
            <p className="text-xs text-slate-600">No events found in database.</p>
          </div>
        </div>

        <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6">
          <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-5 border-b border-slate-800 pb-3">Activity Log</h3>
          <div className="py-10 text-center border border-dashed border-slate-800 rounded-2xl">
            <TrendingUp className="w-8 h-8 text-slate-800 mx-auto mb-2" />
            <p className="text-xs text-slate-600">No recent activities logged.</p>
          </div>
        </div>
      </div>
    </div>
  );
}