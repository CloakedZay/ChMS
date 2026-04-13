import React from 'react';
import { 
  Users, UserCircle, Calendar, Plus, 
  MoreVertical, Music, Baby, Rocket, 
  BookOpen, HeartHandshake 
} from "lucide-react";

const MINISTRIES = [
  {
    id: 1,
    name: "Worship & Arts",
    head: "Dante Agustin",
    members: 12,
    schedule: "Saturdays 4:00 PM",
    icon: Music,
    color: "bg-blue-500",
  },
  {
    id: 2,
    name: "Youth Ministry",
    head: "Sarah J. Cruz",
    members: 45,
    schedule: "Fridays 6:00 PM",
    icon: Rocket,
    color: "bg-purple-500",
  },
  {
    id: 3,
    name: "Children's Ministry",
    head: "Maria Lopez",
    members: 30,
    schedule: "Sundays 9:00 AM",
    icon: Baby,
    color: "bg-pink-500",
  },
  {
    id: 4,
    name: "Training & Life",
    head: "Pastor Benjie",
    members: 20,
    schedule: "Wednesdays 7:00 PM",
    icon: BookOpen,
    color: "bg-emerald-500",
  },
  {
    id: 5,
    name: "Outreach & Missions",
    head: "David Lopez",
    members: 15,
    schedule: "Varies",
    icon: HeartHandshake,
    color: "bg-orange-500",
  },
];

export default function MinistriesPage() {
  return (
    <div className="p-8">
      {/* Header Area */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Ministries</h1>
          <p className="text-slate-400 text-sm">Coordinate departments and monitor volunteer activity.</p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all">
          <Plus className="w-4 h-4" /> Add Ministry
        </button>
      </div>

      {/* Stats Cards (Optional but looks good) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
          <p className="text-slate-500 text-xs uppercase font-bold tracking-wider">Total Volunteers</p>
          <p className="text-3xl font-black text-white mt-1">122</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
          <p className="text-slate-500 text-xs uppercase font-bold tracking-wider">Active Departments</p>
          <p className="text-3xl font-black text-white mt-1">5</p>
        </div>
      </div>

      {/* Ministries Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {MINISTRIES.map((m) => (
          <div key={m.id} className="group bg-slate-900/40 border border-slate-800 rounded-2xl p-6 hover:border-blue-500/50 transition-all relative overflow-hidden">
            {/* Background Glow */}
            <div className={`absolute -right-4 -top-4 w-24 h-24 opacity-5 blur-2xl rounded-full ${m.color}`} />
            
            <div className="flex justify-between items-start mb-6">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white ${m.color} shadow-lg shadow-black/20`}>
                <m.icon className="w-6 h-6" />
              </div>
              <button className="text-slate-600 hover:text-white transition-colors">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>

            <h3 className="text-xl font-bold text-white mb-4">{m.name}</h3>
            
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <UserCircle className="w-4 h-4 text-blue-400" />
                <span className="font-medium text-slate-200">{m.head}</span>
                <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded uppercase font-bold">Head</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <Users className="w-4 h-4 text-blue-400" />
                <span>{m.members} Volunteers</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <Calendar className="w-4 h-4 text-blue-400" />
                <span>{m.schedule}</span>
              </div>
            </div>

            <button className="w-full py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 text-sm font-semibold transition-all">
              Manage Department
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}