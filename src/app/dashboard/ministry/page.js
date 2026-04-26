'use client';

import React, { useState } from 'react';
import { 
  Users, UserCircle, Calendar, Plus, 
  MoreVertical, Music, Baby, Rocket, 
  BookOpen, HeartHandshake, ChevronRight,
  GraduationCap, Target, Award, Clock
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

const TRAINING_TRACKS = [
  {
    id: 1,
    title: "Foundation of Faith",
    description: "Basic Christian doctrines and church orientation for new members.",
    level: "Beginner",
    levelColor: "bg-emerald-500/15 text-emerald-400",
    sessions: 4,
    enrolled: 0,
    completed: 0,
    icon: BookOpen,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10",
  },
  {
    id: 2,
    title: "Evangelism Training",
    description: "Equipping members to share the Gospel effectively in the community.",
    level: "Intermediate",
    levelColor: "bg-blue-500/15 text-blue-400",
    sessions: 6,
    enrolled: 0,
    completed: 0,
    icon: Target,
    iconColor: "text-blue-400",
    iconBg: "bg-blue-500/10",
  },
  {
    id: 3,
    title: "Discipleship Program",
    description: "One-on-one and group mentoring for spiritual growth and leadership.",
    level: "Intermediate",
    levelColor: "bg-blue-500/15 text-blue-400",
    sessions: 8,
    enrolled: 0,
    completed: 0,
    icon: GraduationCap,
    iconColor: "text-purple-400",
    iconBg: "bg-purple-500/10",
  },
  {
    id: 4,
    title: "Ministry Leadership",
    description: "Advanced training for ministry heads and future church leaders.",
    level: "Advanced",
    levelColor: "bg-orange-500/15 text-orange-400",
    sessions: 10,
    enrolled: 0,
    completed: 0,
    icon: Award,
    iconColor: "text-orange-400",
    iconBg: "bg-orange-500/10",
  },
];

export default function MinistriesPage() {
  const [activeTab, setActiveTab] = useState("ministries");

  return (
    <div className="p-8 min-h-screen bg-[#0f111a]">

      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">GGCF-GMI · Pandi, Bulacan</p>
          <h1 className="text-3xl font-black text-white tracking-tight">Ministries</h1>
          <p className="text-slate-400 text-sm mt-0.5">Coordinate departments and monitor volunteer activity.</p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all">
          <Plus className="w-4 h-4" /> Add Ministry
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#1a1d2e]/60 border border-slate-800 rounded-xl p-1 w-fit mb-8">
        {["ministries", "training"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-1.5 rounded-lg text-sm font-bold capitalize transition-all ${
              activeTab === tab ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:text-slate-200"
            }`}
          >
            {tab === "training" ? "Training & Discipleship" : "Ministries"}
          </button>
        ))}
      </div>

      {/* ── MINISTRIES TAB ── */}
      {activeTab === "ministries" && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="bg-[#1a1d2e]/50 border border-slate-800 p-6 rounded-3xl">
              <p className="text-slate-500 text-xs uppercase font-bold tracking-wider">Total Volunteers</p>
              <p className="text-3xl font-black text-white mt-1">122</p>
            </div>
            <div className="bg-[#1a1d2e]/50 border border-slate-800 p-6 rounded-3xl">
              <p className="text-slate-500 text-xs uppercase font-bold tracking-wider">Active Departments</p>
              <p className="text-3xl font-black text-white mt-1">5</p>
            </div>
            <div className="bg-[#1a1d2e]/50 border border-slate-800 p-6 rounded-3xl">
              <p className="text-slate-500 text-xs uppercase font-bold tracking-wider">Training Tracks</p>
              <p className="text-3xl font-black text-white mt-1">{TRAINING_TRACKS.length}</p>
            </div>
          </div>

          {/* Ministries Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {MINISTRIES.map((m) => (
              <div key={m.id} className="group bg-[#1a1d2e]/50 border border-slate-800 rounded-3xl p-6 hover:border-blue-500/50 transition-all relative overflow-hidden">
                <div className={`absolute -right-4 -top-4 w-24 h-24 opacity-5 blur-2xl rounded-full ${m.color}`} />
                
                <div className="flex justify-between items-start mb-6">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white ${m.color} shadow-lg shadow-black/20`}>
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
        </>
      )}

      {/* ── TRAINING TAB ── */}
      {activeTab === "training" && (
        <div className="space-y-8">

          {/* Training Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Enrolled", value: "0", icon: Users, color: "text-blue-400" },
              { label: "Completed Tracks", value: "0", icon: Award, color: "text-emerald-400" },
              { label: "In Progress", value: "0", icon: Clock, color: "text-yellow-400" },
              { label: "Training Tracks", value: TRAINING_TRACKS.length.toString(), icon: BookOpen, color: "text-purple-400" },
            ].map((s) => (
              <div key={s.label} className="bg-[#1a1d2e]/50 border border-slate-800 rounded-3xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500">{s.label}</p>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Notice */}
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl px-5 py-4 flex items-start gap-3">
            <GraduationCap className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-blue-300">Training module is ready</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Member enrollment and progress tracking will reflect here once members begin their training tracks.
              </p>
            </div>
          </div>

          {/* Training Tracks */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black text-white uppercase tracking-widest">Training Tracks</h2>
              <button className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                <Plus className="w-3 h-3" /> Add Track
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {TRAINING_TRACKS.map((track) => (
                <div key={track.id} className="bg-[#1a1d2e]/50 border border-slate-800 rounded-3xl p-6 hover:border-slate-700 transition-all group">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${track.iconBg}`}>
                      <track.icon className={`w-5 h-5 ${track.iconColor}`} />
                    </div>
                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${track.levelColor}`}>
                      {track.level}
                    </span>
                  </div>

                  <h3 className="text-base font-black text-white mb-1">{track.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed mb-5">{track.description}</p>

                  {/* Progress bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-[10px] text-slate-600 mb-1.5">
                      <span>Progress</span>
                      <span>0 / {track.sessions} sessions</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full w-0" />
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Users className="w-3.5 h-3.5" />
                        <span>{track.enrolled} enrolled</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Award className="w-3.5 h-3.5" />
                        <span>{track.completed} done</span>
                      </div>
                    </div>
                    <button className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors">
                      View <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}