"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/app/lib/supabase";
import {
  ChevronRight, ChevronDown, BookOpen, Upload,
  FileText, Trash2, Download, Loader2, Plus, X
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const MINISTRIES = [
  { name: "Program & Music Ministry",  head: "Mr. Israel Dadap",    members: 12, initials: "ID" },
  { name: "Mission & Evangelism",      head: "Mr. Neator Jose",     members: 9,  initials: "NJ" },
  { name: "Training & Life Ministry",  head: "Ms. Lolita Jose",     members: 8,  initials: "LJ" },
  { name: "Building & Equipment",      head: "Mr. Ariel Dela Peña", members: 6,  initials: "AD" },
  { name: "Finance Ministry",          head: "Mr. David Lopez",     members: 5,  initials: "DL" },
];

function formatBytes(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MinistriesTab() {
  const [expandedMinistry, setExpandedMinistry] = useState(null);
  const [expandedModule, setExpandedModule]     = useState(null);

  const [modules, setModules]               = useState([]);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [handouts, setHandouts]             = useState({});
  const [handoutsLoading, setHandoutsLoading] = useState({});

  const [uploading, setUploading]     = useState({});
  const [uploadDesc, setUploadDesc]   = useState({});
  const [uploadError, setUploadError] = useState({});
  const fileInputRefs                 = useRef({});

  const [showAddModule, setShowAddModule] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [newModuleDesc, setNewModuleDesc]   = useState("");
  const [addingModule, setAddingModule]     = useState(false);

  // ── Fetch modules ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setModulesLoading(true);
      const { data } = await supabase
        .from("discipleship_modules")
        .select("*")
        .order("order_index", { ascending: true });
      setModules(data || []);
      setModulesLoading(false);
    }
    load();
  }, []);

  // ── Fetch handouts per module ─────────────────────────────────────────────
  async function fetchHandouts(moduleId) {
    setHandoutsLoading(p => ({ ...p, [moduleId]: true }));
    const { data } = await supabase
      .from("module_handouts")
      .select("*")
      .eq("module_id", moduleId)
      .order("created_at", { ascending: false });
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

  // ── Upload ────────────────────────────────────────────────────────────────
  async function handleUpload(moduleId, file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setUploadError(p => ({ ...p, [moduleId]: "File too large. Max 20MB." }));
      return;
    }

    setUploading(p => ({ ...p, [moduleId]: true }));
    setUploadError(p => ({ ...p, [moduleId]: "" }));

    try {
      const filePath = `module-${moduleId}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;

      const { error: storageErr } = await supabase.storage
        .from("handouts")
        .upload(filePath, file, { contentType: file.type, upsert: false });
      if (storageErr) throw storageErr;

      const { error: dbErr } = await supabase
        .from("module_handouts")
        .insert({
          module_id:   moduleId,
          file_name:   file.name,
          file_path:   filePath,
          file_size:   file.size,
          description: uploadDesc[moduleId]?.trim() || null,
          uploaded_by: "Staff",
        });
      if (dbErr) throw dbErr;

      await fetchHandouts(moduleId);
      setUploadDesc(p => ({ ...p, [moduleId]: "" }));
      if (fileInputRefs.current[moduleId]) fileInputRefs.current[moduleId].value = "";
    } catch (err) {
      console.error("Upload error:", err);
      setUploadError(p => ({ ...p, [moduleId]: err.message || "Upload failed." }));
    } finally {
      setUploading(p => ({ ...p, [moduleId]: false }));
    }
  }

  // ── Download ──────────────────────────────────────────────────────────────
  async function handleDownload(handout) {
    const { data, error } = await supabase.storage
      .from("handouts")
      .createSignedUrl(handout.file_path, 60);
    if (error) { alert("Could not generate download link."); return; }
    window.open(data.signedUrl, "_blank");
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete(handout, moduleId) {
    if (!confirm(`Delete "${handout.file_name}"?`)) return;
    await supabase.storage.from("handouts").remove([handout.file_path]);
    await supabase.from("module_handouts").delete().eq("id", handout.id);
    await fetchHandouts(moduleId);
  }

  // ── Add module ────────────────────────────────────────────────────────────
  async function handleAddModule() {
    if (!newModuleTitle.trim()) return;
    setAddingModule(true);
    const maxOrder = modules.reduce((a, m) => Math.max(a, m.order_index), 0);
    const { error } = await supabase.from("discipleship_modules").insert({
      title:       newModuleTitle.trim(),
      description: newModuleDesc.trim() || null,
      order_index: maxOrder + 1,
      is_active:   true,
    });
    if (!error) {
      const { data } = await supabase
        .from("discipleship_modules")
        .select("*")
        .order("order_index", { ascending: true });
      setModules(data || []);
      setNewModuleTitle("");
      setNewModuleDesc("");
      setShowAddModule(false);
    }
    setAddingModule(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Ministry list */}
      <div className="space-y-3">
        {MINISTRIES.map((m) => {
          const isOpen = expandedMinistry === m.name;
          return (
            <div key={m.name} className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl overflow-hidden backdrop-blur-sm">

              {/* Ministry header row */}
              <button
                onClick={() => setExpandedMinistry(isOpen ? null : m.name)}
                className="w-full flex items-center justify-between gap-4 p-5 hover:bg-slate-800/20 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-black text-blue-400">{m.initials}</span>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-white">{m.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Head: {m.head}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-black text-white">{m.members}</p>
                    <p className="text-[10px] text-slate-600 uppercase tracking-wider">members</p>
                  </div>
                  {isOpen
                    ? <ChevronDown className="w-4 h-4 text-slate-500" />
                    : <ChevronRight className="w-4 h-4 text-slate-700" />
                  }
                </div>
              </button>

              {/* Expanded panel */}
              {isOpen && (
                <div className="border-t border-slate-800/60 px-5 py-5 space-y-5">

                  {/* Info cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-900/50 rounded-2xl p-3">
                      <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">Ministry Head</p>
                      <p className="text-sm font-bold text-white">{m.head}</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-2xl p-3">
                      <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">Members</p>
                      <p className="text-sm font-bold text-white">{m.members} assigned</p>
                    </div>
                  </div>

                  {/* Modules & Handouts */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                        Training Modules & Handouts
                      </p>
                      <button
                        onClick={() => setShowAddModule(true)}
                        className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-bold transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Module
                      </button>
                    </div>

                    {modulesLoading ? (
                      <div className="flex items-center gap-2 py-4 text-slate-600 text-xs">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading modules...
                      </div>
                    ) : modules.length === 0 ? (
                      <div className="py-8 text-center border border-dashed border-slate-800 rounded-2xl">
                        <BookOpen className="w-6 h-6 text-slate-800 mx-auto mb-2" />
                        <p className="text-xs text-slate-600">No modules yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {modules.map((mod) => {
                          const modOpen  = expandedModule === mod.id;
                          const modFiles = handouts[mod.id] || [];
                          const isLoading = handoutsLoading[mod.id];

                          return (
                            <div key={mod.id} className="bg-slate-900/40 border border-slate-800/40 rounded-2xl overflow-hidden">

                              {/* Module row */}
                              <button
                                onClick={() => toggleModule(mod.id)}
                                className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/30 transition-colors"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <BookOpen className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                  <div className="min-w-0 text-left">
                                    <p className="text-sm font-bold text-white truncate">{mod.title}</p>
                                    {mod.description && (
                                      <p className="text-xs text-slate-500 truncate">{mod.description}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] text-slate-600">
                                    {modFiles.length > 0
                                      ? `${modFiles.length} file${modFiles.length > 1 ? "s" : ""}`
                                      : "no files"}
                                  </span>
                                  {modOpen
                                    ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                                    : <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                                  }
                                </div>
                              </button>

                              {/* Files + upload */}
                              {modOpen && (
                                <div className="border-t border-slate-800/40 px-4 py-4 space-y-4">

                                  {/* File list */}
                                  {isLoading ? (
                                    <div className="flex items-center gap-2 text-slate-600 text-xs py-1">
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...
                                    </div>
                                  ) : modFiles.length === 0 ? (
                                    <p className="text-xs text-slate-600">No handouts uploaded yet.</p>
                                  ) : (
                                    <div className="space-y-2">
                                      {modFiles.map((hf) => (
                                        <div key={hf.id} className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
                                          <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-white truncate">{hf.file_name}</p>
                                            <p className="text-[10px] text-slate-500 mt-0.5">
                                              {formatBytes(hf.file_size)}
                                              {hf.description ? ` · ${hf.description}` : ""}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0">
                                            <button
                                              onClick={() => handleDownload(hf)}
                                              title="Download"
                                              className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                                            >
                                              <Download className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              onClick={() => handleDelete(hf, mod.id)}
                                              title="Delete"
                                              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Upload */}
                                  <div className="space-y-2 pt-1 border-t border-slate-800/40">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold pt-1">Upload Handout</p>
                                    <input
                                      type="text"
                                      placeholder="Short description (optional)"
                                      value={uploadDesc[mod.id] || ""}
                                      onChange={(e) => setUploadDesc(p => ({ ...p, [mod.id]: e.target.value }))}
                                      className="w-full bg-[#0f111a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                                    />
                                    <label className={`flex items-center justify-center gap-2 w-full border border-dashed rounded-xl py-3 cursor-pointer transition-colors text-xs font-bold ${
                                      uploading[mod.id]
                                        ? "border-slate-700 text-slate-600 cursor-not-allowed"
                                        : "border-slate-700 hover:border-blue-500/50 text-slate-500 hover:text-blue-400"
                                    }`}>
                                      {uploading[mod.id]
                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                                        : <><Upload className="w-4 h-4" /> Choose file · PDF, DOCX, PPT, images · max 20MB</>
                                      }
                                      <input
                                        type="file"
                                        className="hidden"
                                        accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg"
                                        disabled={uploading[mod.id]}
                                        ref={(el) => { fileInputRefs.current[mod.id] = el; }}
                                        onChange={(e) => handleUpload(mod.id, e.target.files?.[0])}
                                      />
                                    </label>
                                    {uploadError[mod.id] && (
                                      <p className="text-xs text-rose-400">{uploadError[mod.id]}</p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Coming soon */}
      <div className="bg-[#1a1d2e]/30 border border-dashed border-slate-800 rounded-3xl p-6 text-center">
        <BookOpen className="w-5 h-5 text-slate-700 mx-auto mb-2" />
        <p className="text-xs text-slate-700">Member-to-ministry mapping and discipleship tracking coming soon.</p>
      </div>

      {/* Add Module Modal */}
      {showAddModule && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1d2e] border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-black text-white">Add Training Module</h3>
              <button
                onClick={() => { setShowAddModule(false); setNewModuleTitle(""); setNewModuleDesc(""); }}
                className="text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 block">
                  Module Title <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Module 6: Spiritual Warfare"
                  value={newModuleTitle}
                  onChange={(e) => setNewModuleTitle(e.target.value)}
                  className="w-full bg-[#0f111a] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 block">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Short overview shown to members..."
                  value={newModuleDesc}
                  onChange={(e) => setNewModuleDesc(e.target.value)}
                  className="w-full bg-[#0f111a] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setShowAddModule(false); setNewModuleTitle(""); setNewModuleDesc(""); }}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddModule}
                disabled={addingModule || !newModuleTitle.trim()}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-bold text-white transition-colors flex items-center justify-center gap-2"
              >
                {addingModule
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding...</>
                  : "Add Module"
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}