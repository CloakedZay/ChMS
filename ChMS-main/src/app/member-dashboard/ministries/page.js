'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/app/lib/supabase';
import {
  ChevronRight, ChevronDown, BookOpen, FileText,
  Download, Loader2, ClipboardList,
} from 'lucide-react';

const MINISTRIES = [
  { name: 'Program & Music Ministry', head: 'Mr. Israel Dadap',    members: 12, initials: 'ID' },
  { name: 'Mission & Evangelism',     head: 'Mr. Neator Jose',     members: 9,  initials: 'NJ' },
  { name: 'Training & Life Ministry', head: 'Ms. Lolita Jose',     members: 8,  initials: 'LJ' },
  { name: 'Building & Equipment',     head: 'Mr. Ariel Dela Peña', members: 6,  initials: 'AD' },
  { name: 'Finance Ministry',         head: 'Mr. David Lopez',     members: 5,  initials: 'DL' },
];

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function MemberMinistriesPage() {
  const [expandedMinistry, setExpandedMinistry] = useState(null);
  const [expandedModule, setExpandedModule]     = useState(null);

  const [modules, setModules]               = useState([]);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [handouts, setHandouts]             = useState({});
  const [handoutsLoading, setHandoutsLoading] = useState({});

  useEffect(() => {
    async function loadModules() {
      setModulesLoading(true);
      const { data } = await supabase
        .from('discipleship_modules')
        .select('*')
        .eq('is_active', true)
        .order('order_index', { ascending: true });
      setModules(data || []);
      setModulesLoading(false);
    }
    loadModules();
  }, []);

  async function fetchHandouts(moduleId) {
    setHandoutsLoading(p => ({ ...p, [moduleId]: true }));
    const { data } = await supabase
      .from('module_handouts')
      .select('*')
      .eq('module_id', moduleId)
      .order('created_at', { ascending: false });
    setHandouts(p => ({ ...p, [moduleId]: data || [] }));
    setHandoutsLoading(p => ({ ...p, [moduleId]: false }));
  }

  function toggleModule(moduleId) {
    if (expandedModule === moduleId) {
      setExpandedModule(null);
    } else {
      setExpandedModule(moduleId);
      if (!handouts[moduleId]) fetchHandouts(moduleId);
    }
  }

  async function handleDownload(handout) {
    const { data, error } = await supabase.storage
      .from('handouts')
      .createSignedUrl(handout.file_path, 60);
    if (error) { alert('Could not generate download link.'); return; }
    window.open(data.signedUrl, '_blank');
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">GGCF-GMI · Pandi, Bulacan</p>
        <h1 className="text-2xl font-black text-white">Ministries</h1>
        <p className="text-slate-500 text-sm mt-0.5">Tap a ministry to see its training modules and handouts</p>
      </div>

      <div className="space-y-3">
        {MINISTRIES.map((m) => {
          const isOpen = expandedMinistry === m.name;
          return (
            <div key={m.name} className="bg-[#1a1d2e] border border-white/10 rounded-3xl overflow-hidden">

              <button
                onClick={() => setExpandedMinistry(isOpen ? null : m.name)}
                className="w-full flex items-center justify-between gap-4 p-5 hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-black text-blue-400">{m.initials}</span>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-white">{m.name}</p>
                    <p className="text-xs text-white/40 mt-0.5">Head: {m.head}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-black text-white">{m.members}</p>
                    <p className="text-[10px] text-white/30 uppercase tracking-wider">members</p>
                  </div>
                  {isOpen
                    ? <ChevronDown className="w-4 h-4 text-white/50" />
                    : <ChevronRight className="w-4 h-4 text-white/20" />
                  }
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-white/10 px-5 py-5 space-y-4">
                  <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">
                    Training Modules & Handouts
                  </p>

                  {modulesLoading ? (
                    <div className="flex items-center gap-2 py-4 text-white/30 text-xs">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading modules...
                    </div>
                  ) : modules.length === 0 ? (
                    <div className="py-8 text-center border border-dashed border-white/10 rounded-2xl">
                      <BookOpen className="w-6 h-6 text-white/20 mx-auto mb-2" />
                      <p className="text-xs text-white/30">No modules yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {modules.map((mod) => {
                        const modOpen  = expandedModule === mod.id;
                        const modFiles = handouts[mod.id] || [];
                        const isLoading = handoutsLoading[mod.id];

                        return (
                          <div key={mod.id} className="bg-white/[0.03] border border-white/5 rounded-2xl overflow-hidden">

                            <button
                              onClick={() => toggleModule(mod.id)}
                              className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <BookOpen className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <div className="min-w-0 text-left">
                                  <p className="text-sm font-bold text-white truncate">{mod.title}</p>
                                  {mod.description && (
                                    <p className="text-xs text-white/40 truncate">{mod.description}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] text-white/30">
                                  {modFiles.length > 0
                                    ? `${modFiles.length} file${modFiles.length > 1 ? 's' : ''}`
                                    : 'no files'}
                                </span>
                                {modOpen
                                  ? <ChevronDown className="w-3.5 h-3.5 text-white/50" />
                                  : <ChevronRight className="w-3.5 h-3.5 text-white/30" />
                                }
                              </div>
                            </button>

                            {modOpen && (
                              <div className="border-t border-white/5 px-4 py-4">
                                {isLoading ? (
                                  <div className="flex items-center gap-2 text-white/30 text-xs py-1">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...
                                  </div>
                                ) : modFiles.length === 0 ? (
                                  <p className="text-xs text-white/30">No handouts uploaded yet.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {modFiles.map((hf) => (
                                      <button
                                        key={hf.id}
                                        onClick={() => handleDownload(hf)}
                                        className="w-full flex items-center gap-3 p-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-blue-500/20 rounded-xl transition-colors group"
                                      >
                                        <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                                        <div className="flex-1 min-w-0 text-left">
                                          <p className="text-xs font-bold text-white truncate">{hf.file_name}</p>
                                          <p className="text-[10px] text-white/30 mt-0.5">
                                            {formatBytes(hf.file_size)}
                                            {hf.description ? ` · ${hf.description}` : ''}
                                          </p>
                                        </div>
                                        <Download className="w-3.5 h-3.5 text-slate-600 group-hover:text-blue-400 transition-colors shrink-0" />
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 bg-[#1a1d2e] border border-dashed border-white/10 rounded-3xl p-6 text-center">
        <ClipboardList className="w-5 h-5 text-slate-700 mx-auto mb-2" />
        <p className="text-xs text-white/30">Want to join a ministry? Talk to your ministry head or pastor.</p>
      </div>
    </div>
  );
}
