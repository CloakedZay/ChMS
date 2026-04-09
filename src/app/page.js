import Link from "next/link";
import { Users, CalendarDays, BarChart3, ShieldCheck, ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-600/30">
      
      {/* Navigation Header */}
      <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white uppercase italic">FaithSync</span>
          </div>
          <Link
            href="/login"
            className="text-sm font-medium text-slate-400 hover:text-blue-400 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="py-24 md:py-32 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/10 blur-[120px] pointer-events-none" />
        
        <div className="max-w-5xl mx-auto px-6 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 border border-blue-500/30 bg-blue-500/5 px-4 py-1.5 mb-8 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            <span className="text-xs font-bold tracking-widest text-blue-400 uppercase">
              Capstone Project 2026
            </span>
          </div>
          
          <h1 className="text-5xl lg:text-7xl font-black tracking-tight text-white mb-6 leading-[1.1]">
            Management built for <br />
            <span className="bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">Modern Ministries.</span>
          </h1>
          
          <p className="max-w-2xl text-lg text-slate-400 mb-12 leading-relaxed">
            Manage your church members, events, and finances all in one place. 
            Designed to reduce technical friction so you can focus on your community.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/login"
              className="group flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-10 py-4 rounded-xl shadow-2xl shadow-blue-900/20 transition-all active:scale-95"
            >
              Log In
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </header>

      {/* Feature Section */}
      <main id="features" className="max-w-7xl mx-auto px-6 py-24 border-t border-slate-900">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <FeatureCard 
            Icon={Users}
            title="Member Tracking" 
            desc="Keep a detailed directory of your congregation with intelligent search and filtering."
          />
          <FeatureCard 
            Icon={CalendarDays}
            title="Event Planning" 
            desc="Coordinate services and small groups with a powerful, integrated calendar system."
          />
          <FeatureCard 
            Icon={BarChart3}
            title="Financial Oversight" 
            desc="Track tithes and offerings with secure, transparent financial reporting tools."
          />
        </div>
      </main>

      <footer className="border-t border-slate-900 py-12 text-center text-slate-600 text-sm">
        Built with Next.js & Tailwind CSS
      </footer>
    </div>
  );
}

function FeatureCard({ title, desc, Icon }) {
  return (
    <div className="group p-8 bg-slate-900/50 rounded-2xl border border-slate-800 hover:border-blue-500/50 hover:bg-slate-900 transition-all duration-300">
      <div className="w-12 h-12 bg-blue-500/10 rounded-xl mb-6 flex items-center justify-center border border-blue-500/20 group-hover:bg-blue-600 transition-colors">
        <Icon className="w-6 h-6 text-blue-400 group-hover:text-white transition-colors" />
      </div>
      <h3 className="text-xl font-bold mb-3 text-white tracking-tight">{title}</h3>
      <p className="text-slate-400 leading-relaxed text-sm">{desc}</p>
    </div>
  );
}