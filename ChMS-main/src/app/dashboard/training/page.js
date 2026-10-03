"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/app/lib/supabase";
import { useTheme } from "@/app/context/ThemeContext";
import {
  BookOpen, ChevronRight, ChevronDown, Upload, FileText, Trash2, Download,
  Loader2, Plus, X, Sun, Moon, CheckCircle, XCircle, Clock, MessageSquare,
  Eye, EyeOff, HelpCircle, Users,
} from "lucide-react";

function formatBytes(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// Light mode is deliberately dimmed a notch off pure white/slate-100 (~90%
// as bright) so it doesn't glare next to the dark theme.
function T(dark) {
  return {
    pageBg:      dark ? "bg-[#0f111a]"        : "bg-slate-200",
    cardBg:      dark ? "bg-[#1a1d2e]/50"     : "bg-slate-100/90",
    cardBorder:  dark ? "border-slate-800/60"  : "border-slate-300",
    textPrimary: dark ? "text-white"           : "text-slate-900",
    textSub:     dark ? "text-slate-500"       : "text-slate-600",
    textMuted:   dark ? "text-slate-600"       : "text-slate-500",
    inputBg:     dark ? "bg-[#0f111a]"        : "bg-slate-50",
    inputBorder: dark ? "border-slate-800"     : "border-slate-400",
    divider:     dark ? "border-slate-800/60"  : "border-slate-300",
    innerDivider:dark ? "border-slate-800/40"  : "border-slate-300",
    innerCard:   dark ? "bg-slate-900/50"      : "bg-slate-200",
    deepCard:    dark ? "bg-slate-900/40"      : "bg-slate-200",
    deeperCard:  dark ? "bg-slate-800/30"      : "bg-slate-200",
    deeperBorder:dark ? "border-slate-700/30"  : "border-slate-300",
    hoverRow:    dark ? "hover:bg-slate-800/20" : "hover:bg-slate-200",
    hoverRow2:   dark ? "hover:bg-slate-800/30" : "hover:bg-slate-200",
    emptyIcon:   dark ? "text-slate-800"       : "text-slate-400",
    dashed:      dark ? "border-slate-800"     : "border-slate-400",
    modalBg:     dark ? "bg-[#1a1d2e]"        : "bg-slate-50",
    modalBorder: dark ? "border-slate-800"     : "border-slate-300",
    cancelBtn:   dark ? "border-slate-700 text-slate-400 hover:text-white hover:border-slate-500" : "border-slate-400 text-slate-600 hover:text-slate-900 hover:border-slate-500",
    uploadBorder:  dark ? "border-slate-700 hover:border-blue-500/50 text-slate-500 hover:text-blue-400" : "border-slate-400 hover:border-blue-500/50 text-slate-600 hover:text-blue-600",
    uploadBorderDisabled: dark ? "border-slate-700 text-slate-600" : "border-slate-400 text-slate-500",
    iconBtn:     dark ? "bg-[#1a1d2e] border-slate-800 text-slate-400 hover:text-white" : "bg-slate-50 border-slate-400 text-slate-600 hover:text-slate-900",
    tabBar:      dark ? "bg-[#1a1d2e]/60 border-slate-800" : "bg-slate-100/90 border-slate-300",
    tabInactive: dark ? "text-slate-500 hover:text-slate-200" : "text-slate-500 hover:text-slate-800",
  };
}

const ACCENT = {
  blue:    { dark: "text-blue-400",    light: "text-blue-600" },
  emerald: { dark: "text-emerald-400", light: "text-emerald-600" },
  yellow:  { dark: "text-yellow-400",  light: "text-yellow-600" },
  rose:    { dark: "text-rose-400",    light: "text-rose-600" },
};
function A(dark, color) {
  return dark ? ACCENT[color].dark : ACCENT[color].light;
}

export default function TrainingPage() {
  const { dark, toggle: toggleTheme } = useTheme();
  const t = T(dark);

  const [activeTab, setActiveTab] = useState("modules");
  const [loading, setLoading]     = useState(true);

  // ── Modules & questions ───────────────────────────────────────────────────
  const [modules, setModules]     = useState([]);
  const [questions, setQuestions] = useState([]);
  const [expandedModule, setExpandedModule] = useState(null);

  const [showAddModule, setShowAddModule]   = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [newModuleDesc, setNewModuleDesc]   = useState("");
  const [addingModule, setAddingModule]     = useState(false);

  const [newQuestionText, setNewQuestionText] = useState({});
  const [addingQuestion, setAddingQuestion]   = useState({});

  // ── Handouts ───────────────────────────────────────────────────────────────
  const [handouts, setHandouts]               = useState({});
  const [handoutsLoading, setHandoutsLoading] = useState({});
  const [uploading, setUploading]     = useState({});
  const [uploadDesc, setUploadDesc]   = useState({});
  const [uploadError, setUploadError] = useState({});
  const fileInputRefs                 = useRef({});

  // ── Submissions review ────────────────────────────────────────────────────
  const [submissions, setSubmissions]             = useState([]);
  const [memberProfiles, setMemberProfiles]       = useState({});
  const [expandedMember, setExpandedMember]       = useState(null);
  const [expandedModReview, setExpandedModReview] = useState(null);
  const [reviewNotes, setReviewNotes]             = useState({});
  const [reviewing, setReviewing]                 = useState({});

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      const [{ data: mods }, { data: qs }, { data: subs }] = await Promise.all([
        supabase.from("discipleship_modules").select("*").order("order_index", { ascending: true }),
        supabase.from("discipleship_questions").select("*").order("order_index", { ascending: true }),
        supabase.from("discipleship_progress").select("*, discipleship_questions(question, order_index, module_id)").order("created_at", { ascending: false }),
      ]);
      setModules(mods || []);
      setQuestions(qs || []);
      setSubmissions(subs || []);
      if (subs && subs.length > 0) {
        const ids = [...new Set(subs.map((s) => s.member_id))];
        const { data: profiles } = await supabase.from("profiles").select("id, email, full_name, role").in("id", ids);
        const map = {};
        (profiles || []).forEach((p) => { map[p.id] = p; });
        setMemberProfiles(map);
      }
      setLoading(false);
    }
    fetchAll();
  }, []);

  async function refetchModules() {
    const { data } = await supabase.from("discipleship_modules").select("*").order("order_index", { ascending: true });
    setModules(data || []);
  }

  async function refetchQuestions() {
    const { data } = await supabase.from("discipleship_questions").select("*").order("order_index", { ascending: true });
    setQuestions(data || []);
  }

  // ── Module CRUD ────────────────────────────────────────────────────────────
  async function handleAddModule() {
    if (!newModuleTitle.trim()) return;
    setAddingModule(true);
    const maxOrder = modules.reduce((a, m) => Math.max(a, m.order_index || 0), 0);
    const { error } = await supabase.from("discipleship_modules").insert({
      title:       newModuleTitle.trim(),
      description: newModuleDesc.trim() || null,
      order_index: maxOrder + 1,
      is_active:   true,
    });
    if (!error) {
      await refetchModules();
      setNewModuleTitle("");
      setNewModuleDesc("");
      setShowAddModule(false);
    } else {
      alert("Error adding module: " + error.message);
    }
    setAddingModule(false);
  }

  async function handleToggleActive(mod) {
    const { error } = await supabase.from("discipleship_modules").update({ is_active: !mod.is_active }).eq("id", mod.id);
    if (!error) setModules((prev) => prev.map((m) => (m.id === mod.id ? { ...m, is_active: !mod.is_active } : m)));
    else alert("Error updating module: " + error.message);
  }

  // ── Question CRUD ──────────────────────────────────────────────────────────
  async function handleAddQuestion(moduleId) {
    const text = (newQuestionText[moduleId] || "").trim();
    if (!text) return;
    setAddingQuestion((p) => ({ ...p, [moduleId]: true }));
    const modQs = questions.filter((q) => q.module_id === moduleId);
    const maxOrder = modQs.reduce((a, q) => Math.max(a, q.order_index || 0), 0);
    const { error } = await supabase.from("discipleship_questions").insert({
      module_id:   moduleId,
      question:    text,
      order_index: maxOrder + 1,
    });
    if (!error) {
      await refetchQuestions();
      setNewQuestionText((p) => ({ ...p, [moduleId]: "" }));
    } else {
      alert("Error adding question: " + error.message);
    }
    setAddingQuestion((p) => ({ ...p, [moduleId]: false }));
  }

  async function handleDeleteQuestion(q) {
    if (!window.confirm("Delete this question?")) return;
    const { error } = await supabase.from("discipleship_questions").delete().eq("id", q.id);
    if (!error) setQuestions((prev) => prev.filter((x) => x.id !== q.id));
    else alert("Error deleting question: " + error.message);
  }

  // ── Handouts ───────────────────────────────────────────────────────────────
  async function fetchHandouts(moduleId) {
    setHandoutsLoading((p) => ({ ...p, [moduleId]: true }));
    const { data } = await supabase.from("module_handouts").select("*").eq("module_id", moduleId).order("created_at", { ascending: false });
    setHandouts((p) => ({ ...p, [moduleId]: data || [] }));
    setHandoutsLoading((p) => ({ ...p, [moduleId]: false }));
  }

  function toggleModule(moduleId) {
    if (expandedModule === moduleId) {
      setExpandedModule(null);
    } else {
      setExpandedModule(moduleId);
      if (!handouts[moduleId]) fetchHandouts(moduleId);
    }
  }

  async function handleUpload(moduleId, file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setUploadError((p) => ({ ...p, [moduleId]: "File too large. Max 20MB." }));
      return;
    }
    setUploading((p) => ({ ...p, [moduleId]: true }));
    setUploadError((p) => ({ ...p, [moduleId]: "" }));
    try {
      const filePath = `module-${moduleId}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const { error: storageErr } = await supabase.storage
        .from("handouts")
        .upload(filePath, file, { contentType: file.type, upsert: false });
      if (storageErr) throw storageErr;

      const { error: dbErr } = await supabase.from("module_handouts").insert({
        module_id:   moduleId,
        file_name:   file.name,
        file_path:   filePath,
        file_size:   file.size,
        description: uploadDesc[moduleId]?.trim() || null,
        uploaded_by: "Staff",
      });
      if (dbErr) throw dbErr;

      await fetchHandouts(moduleId);
      setUploadDesc((p) => ({ ...p, [moduleId]: "" }));
      if (fileInputRefs.current[moduleId]) fileInputRefs.current[moduleId].value = "";
    } catch (err) {
      console.error("Upload error:", err);
      setUploadError((p) => ({ ...p, [moduleId]: err.message || "Upload failed." }));
    } finally {
      setUploading((p) => ({ ...p, [moduleId]: false }));
    }
  }

  async function handleDownload(handout) {
    const { data, error } = await supabase.storage.from("handouts").createSignedUrl(handout.file_path, 60);
    if (error) { alert("Could not generate download link."); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function handleDeleteHandout(handout, moduleId) {
    if (!confirm(`Delete "${handout.file_name}"?`)) return;
    await supabase.storage.from("handouts").remove([handout.file_path]);
    await supabase.from("module_handouts").delete().eq("id", handout.id);
    await fetchHandouts(moduleId);
  }

  // ── Submissions review ────────────────────────────────────────────────────
  async function handleReview(progressId, status) {
    setReviewing((p) => ({ ...p, [progressId]: true }));
    const note = reviewNotes[progressId]?.trim() || null;
    await supabase.from("discipleship_progress").update({ status, notes: note, reviewed_at: new Date().toISOString(), reviewed_by: "Pastor" }).eq("id", progressId);
    setSubmissions((prev) => prev.map((s) => (s.id === progressId ? { ...s, status, notes: note } : s)));
    setReviewing((p) => ({ ...p, [progressId]: false }));
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const totalModules   = modules.length;
  const activeModules  = modules.filter((m) => m.is_active).length;
  const pendingCount   = submissions.filter((s) => s.status === "pending").length;
  const approvedCount  = submissions.filter((s) => s.status === "approved").length;

  const byMember = submissions.reduce((acc, s) => {
    if (!acc[s.member_id]) acc[s.member_id] = [];
    acc[s.member_id].push(s);
    return acc;
  }, {});

  const card = `${t.cardBg} border ${t.cardBorder} rounded-3xl backdrop-blur-sm`;

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen ${t.pageBg} ${t.textPrimary} transition-colors duration-200`}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8">
        <div>
          <p className={`text-[10px] uppercase tracking-widest ${t.textMuted} mb-1`}>GGCF-GMI · Pandi, Bulacan</p>
          <h1 className={`text-2xl font-black ${t.textPrimary}`}>Training</h1>
          <p className={`${t.textSub} text-sm mt-0.5`}>Manage discipleship modules, questions, handouts, and review member submissions</p>
        </div>
        <button
          onClick={toggleTheme}
          className={`p-2 rounded-full border ${t.iconBtn} transition-colors shrink-0`}
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Modules",  value: loading ? "..." : totalModules,   color: t.textPrimary },
          { label: "Active Modules", value: loading ? "..." : activeModules,  color: A(dark, "blue") },
          { label: "Pending Review", value: loading ? "..." : pendingCount,   color: A(dark, "yellow") },
          { label: "Approved",       value: loading ? "..." : approvedCount,  color: A(dark, "emerald") },
        ].map((s) => (
          <div key={s.label} className={`${card} p-5`}>
            <p className={`text-[10px] uppercase tracking-widest ${t.textSub} font-bold mb-2`}>{s.label}</p>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className={`flex gap-1 ${t.tabBar} border rounded-xl p-1 w-fit mb-6`}>
        {[
          { key: "modules",     label: "Modules & Content" },
          { key: "submissions", label: "Submissions Review" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-1.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === tab.key ? "bg-blue-600 text-white shadow" : t.tabInactive
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── MODULES & CONTENT ── */}
      {activeTab === "modules" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddModule(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold text-xs transition-all active:scale-95"
            >
              <Plus size={14} /> Add Module
            </button>
          </div>

          {loading ? (
            <div className={`flex items-center justify-center gap-2 py-14 ${t.textMuted} text-sm`}>
              <Loader2 className="w-4 h-4 animate-spin" /> Loading modules...
            </div>
          ) : modules.length === 0 ? (
            <div className={`py-16 text-center border border-dashed ${t.dashed} rounded-3xl`}>
              <BookOpen className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-3`} />
              <p className={`${t.textMuted} text-sm`}>No training modules yet.</p>
              <p className={`${t.textMuted} text-xs mt-1 opacity-60`}>Add one to start building your discipleship curriculum.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {modules.map((mod) => {
                const isOpen    = expandedModule === mod.id;
                const modQs     = questions.filter((q) => q.module_id === mod.id);
                const modFiles  = handouts[mod.id] || [];
                const filesLoad = handoutsLoading[mod.id];

                return (
                  <div key={mod.id} className={`${card} overflow-hidden`}>
                    <div className={`flex items-center justify-between gap-4 p-5 ${t.hoverRow} transition-colors`}>
                      <button onClick={() => toggleModule(mod.id)} className="flex items-center gap-4 flex-1 min-w-0 text-left">
                        <div className="w-10 h-10 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                          <BookOpen className="w-4 h-4 text-blue-400" />
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-bold ${t.textPrimary} truncate`}>{mod.title}</p>
                          <p className={`text-xs ${t.textSub} mt-0.5 truncate`}>{mod.description || "No description"}</p>
                        </div>
                      </button>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-[10px] ${t.textMuted}`}>{modQs.length} question{modQs.length !== 1 ? "s" : ""}</span>
                        <button
                          onClick={() => handleToggleActive(mod)}
                          title={mod.is_active ? "Visible to members — click to hide" : "Hidden from members — click to activate"}
                          className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
                            mod.is_active
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                              : "bg-slate-500/10 text-slate-500 border-slate-500/20 hover:bg-slate-500/20"
                          }`}
                        >
                          {mod.is_active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          {mod.is_active ? "Active" : "Hidden"}
                        </button>
                        <button onClick={() => toggleModule(mod.id)} className={t.textMuted}>
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className={`border-t ${t.divider} px-5 py-5 space-y-5`}>

                        {/* Questions */}
                        <div>
                          <p className={`text-[10px] uppercase tracking-widest ${t.textSub} font-bold mb-3 flex items-center gap-1.5`}>
                            <HelpCircle className="w-3 h-3" /> Questions
                          </p>
                          {modQs.length === 0 ? (
                            <p className={`text-xs ${t.textMuted} mb-3`}>No questions yet — members can&apos;t submit answers until you add some.</p>
                          ) : (
                            <div className="space-y-2 mb-3">
                              {modQs.map((q, qi) => (
                                <div key={q.id} className={`flex items-center gap-3 p-3 ${t.deepCard} rounded-xl border ${t.innerDivider}`}>
                                  <span className="text-xs font-black text-blue-400 shrink-0">Q{qi + 1}</span>
                                  <p className={`flex-1 text-xs ${t.textPrimary}`}>{q.question}</p>
                                  <button
                                    onClick={() => handleDeleteQuestion(q)}
                                    className={`${t.textMuted} hover:text-rose-400 hover:bg-rose-500/10 p-1 rounded-lg transition-colors shrink-0`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Add a question..."
                              value={newQuestionText[mod.id] || ""}
                              onChange={(e) => setNewQuestionText((p) => ({ ...p, [mod.id]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === "Enter") handleAddQuestion(mod.id); }}
                              className={`flex-1 ${t.inputBg} border ${t.inputBorder} rounded-xl px-3 py-2 text-xs ${t.textPrimary} placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors`}
                            />
                            <button
                              onClick={() => handleAddQuestion(mod.id)}
                              disabled={addingQuestion[mod.id] || !(newQuestionText[mod.id] || "").trim()}
                              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors shrink-0"
                            >
                              {addingQuestion[mod.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                              Add
                            </button>
                          </div>
                        </div>

                        {/* Handouts */}
                        <div className={`pt-4 border-t ${t.innerDivider}`}>
                          <p className={`text-[10px] uppercase tracking-widest ${t.textSub} font-bold mb-3`}>Handouts</p>

                          {filesLoad ? (
                            <div className={`flex items-center gap-2 ${t.textMuted} text-xs py-1 mb-3`}>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...
                            </div>
                          ) : modFiles.length === 0 ? (
                            <p className={`text-xs ${t.textMuted} mb-3`}>No handouts uploaded yet.</p>
                          ) : (
                            <div className="space-y-2 mb-3">
                              {modFiles.map((hf) => (
                                <div key={hf.id} className={`flex items-center gap-3 p-3 ${t.deeperCard} rounded-xl border ${t.deeperBorder}`}>
                                  <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-xs font-bold ${t.textPrimary} truncate`}>{hf.file_name}</p>
                                    <p className={`text-[10px] ${t.textSub} mt-0.5`}>
                                      {formatBytes(hf.file_size)}
                                      {hf.description ? ` · ${hf.description}` : ""}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => handleDownload(hf)} title="Download" className={`p-1.5 ${t.textSub} hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors`}>
                                      <Download className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => handleDeleteHandout(hf, mod.id)} title="Delete" className={`p-1.5 ${t.textSub} hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors`}>
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="space-y-2">
                            <input
                              type="text"
                              placeholder="Short description (optional)"
                              value={uploadDesc[mod.id] || ""}
                              onChange={(e) => setUploadDesc((p) => ({ ...p, [mod.id]: e.target.value }))}
                              className={`w-full ${t.inputBg} border ${t.inputBorder} rounded-xl px-3 py-2 text-xs ${t.textPrimary} placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors`}
                            />
                            <label className={`flex items-center justify-center gap-2 w-full border border-dashed rounded-xl py-3 cursor-pointer transition-colors text-xs font-bold ${
                              uploading[mod.id] ? `${t.uploadBorderDisabled} cursor-not-allowed` : t.uploadBorder
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
                              <p className={`text-xs ${dark ? "text-rose-400" : "text-rose-600"}`}>{uploadError[mod.id]}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SUBMISSIONS REVIEW ── */}
      {activeTab === "submissions" && (
        <div className="space-y-5">
          {loading ? (
            <div className={`flex items-center justify-center gap-2 py-14 ${t.textMuted} text-sm`}>
              <Loader2 className="w-4 h-4 animate-spin" /> Loading submissions...
            </div>
          ) : submissions.length === 0 ? (
            <div className={`py-16 text-center border border-dashed ${t.dashed} rounded-3xl`}>
              <Users className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-3`} />
              <p className={`${t.textMuted} text-sm`}>No submissions yet.</p>
              <p className={`${t.textMuted} text-xs mt-1 opacity-60`}>Members will appear here once they submit their answers.</p>
            </div>
          ) : (
            Object.entries(byMember).map(([memberId, subs]) => {
              const profile     = memberProfiles[memberId];
              const displayName = profile?.full_name || profile?.email?.split("@")[0] || `Member ...${memberId.slice(-6)}`;
              const pending     = subs.filter((s) => s.status === "pending").length;
              const approved    = subs.filter((s) => s.status === "approved").length;
              const isOpen      = expandedMember === memberId;

              const byModule = subs.reduce((acc, s) => {
                const modId = s.discipleship_questions?.module_id || s.module_id;
                if (!acc[modId]) acc[modId] = [];
                acc[modId].push(s);
                return acc;
              }, {});

              return (
                <div key={memberId} className={`${card} overflow-hidden`}>
                  <button
                    onClick={() => setExpandedMember(isOpen ? null : memberId)}
                    className={`w-full flex items-center justify-between gap-4 p-5 ${t.hoverRow} transition-colors`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                        <span className="text-[11px] font-black text-blue-400">
                          {displayName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                        </span>
                      </div>
                      <div className="text-left">
                        <p className={`text-sm font-bold ${t.textPrimary}`}>{displayName}</p>
                        <p className={`text-xs ${t.textSub} mt-0.5`}>{subs.length} answer{subs.length !== 1 ? "s" : ""} submitted</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {pending > 0 && <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">{pending} pending</span>}
                      {approved > 0 && <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">{approved} approved</span>}
                      {isOpen ? <ChevronDown className={`w-4 h-4 ${t.textSub}`} /> : <ChevronRight className={`w-4 h-4 ${t.textMuted}`} />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className={`border-t ${t.divider} px-5 py-4 space-y-3`}>
                      {Object.entries(byModule).map(([modId, modSubs]) => {
                        const mod        = modules.find((m) => m.id === Number(modId));
                        const modOpen    = expandedModReview === `${memberId}-${modId}`;
                        const modPending = modSubs.filter((s) => s.status === "pending").length;

                        return (
                          <div key={modId} className={`${t.innerCard} border ${t.innerDivider} rounded-2xl overflow-hidden`}>
                            <button
                              onClick={() => setExpandedModReview(modOpen ? null : `${memberId}-${modId}`)}
                              className={`w-full flex items-center justify-between gap-3 px-4 py-3 ${t.hoverRow2} transition-colors`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <BookOpen className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <p className={`text-sm font-bold ${t.textPrimary} truncate`}>{mod?.title || `Module ${modId}`}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {modPending > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-yellow-500/15 text-yellow-400">{modPending} pending</span>}
                                {modOpen ? <ChevronDown className={`w-3.5 h-3.5 ${t.textSub}`} /> : <ChevronRight className={`w-3.5 h-3.5 ${t.textMuted}`} />}
                              </div>
                            </button>

                            {modOpen && (
                              <div className={`border-t ${t.innerDivider} px-4 py-4 space-y-5`}>
                                {modSubs
                                  .sort((a, b) => (a.discipleship_questions?.order_index || 0) - (b.discipleship_questions?.order_index || 0))
                                  .map((sub, qi) => {
                                    const isReviewing = reviewing[sub.id];
                                    return (
                                      <div key={sub.id} className="space-y-2">
                                        <p className={`text-xs font-bold ${t.textSub}`}>
                                          <span className="text-blue-400 mr-1">Q{qi + 1}.</span>
                                          {sub.discipleship_questions?.question || "—"}
                                        </p>
                                        <div className={`${dark ? "bg-[#0f111a]" : "bg-slate-200"} border ${t.innerDivider} rounded-xl px-4 py-3`}>
                                          <p className={`text-sm ${t.textPrimary} leading-relaxed`}>{sub.answer}</p>
                                          <p className={`text-[10px] ${t.textMuted} mt-2`}>
                                            Submitted {sub.created_at ? new Date(sub.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                                          </p>
                                        </div>

                                        {sub.status === "approved" ? (
                                          <div className={`flex items-center gap-2 text-xs ${A(dark, "emerald")} font-bold`}>
                                            <CheckCircle className="w-3.5 h-3.5" /> Approved
                                            {sub.notes && <span className={`${t.textSub} font-normal ml-1`}>· Note: {sub.notes}</span>}
                                          </div>
                                        ) : sub.status === "rejected" ? (
                                          <div className="space-y-1.5">
                                            <div className={`flex items-center gap-2 text-xs ${A(dark, "rose")} font-bold`}>
                                              <XCircle className="w-3.5 h-3.5" /> Rejected
                                              {sub.notes && <span className={`${t.textSub} font-normal ml-1`}>· Note: {sub.notes}</span>}
                                            </div>
                                            <div className="flex gap-2 pt-1">
                                              <button onClick={() => handleReview(sub.id, "approved")} disabled={isReviewing} className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                                <CheckCircle className="w-3 h-3" /> Approve
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="space-y-2 pt-1">
                                            <div className={`flex items-center gap-1.5 text-xs ${A(dark, "yellow")} font-bold mb-2`}>
                                              <Clock className="w-3.5 h-3.5" /> Awaiting Review
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <MessageSquare className={`w-3.5 h-3.5 ${t.textMuted} shrink-0`} />
                                              <input
                                                type="text"
                                                placeholder="Add note (optional, shown to member if rejected)"
                                                value={reviewNotes[sub.id] || ""}
                                                onChange={(e) => setReviewNotes((p) => ({ ...p, [sub.id]: e.target.value }))}
                                                className={`flex-1 ${dark ? "bg-[#0f111a]" : "bg-slate-50"} border ${t.inputBorder} rounded-xl px-3 py-2 text-xs ${t.textPrimary} placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors`}
                                              />
                                            </div>
                                            <div className="flex gap-2">
                                              <button onClick={() => handleReview(sub.id, "approved")} disabled={isReviewing} className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-4 py-2 rounded-xl transition-colors disabled:opacity-50">
                                                <CheckCircle className="w-3.5 h-3.5" /> {isReviewing ? "Saving..." : "Approve"}
                                              </button>
                                              <button onClick={() => handleReview(sub.id, "rejected")} disabled={isReviewing} className="flex items-center gap-1.5 text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-4 py-2 rounded-xl transition-colors disabled:opacity-50">
                                                <XCircle className="w-3.5 h-3.5" /> {isReviewing ? "Saving..." : "Reject"}
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Add Module Modal */}
      {showAddModule && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`${t.modalBg} border ${t.modalBorder} rounded-3xl p-6 w-full max-w-md shadow-2xl`}>
            <div className="flex items-center justify-between mb-5">
              <h3 className={`text-base font-black ${t.textPrimary}`}>Add Training Module</h3>
              <button
                onClick={() => { setShowAddModule(false); setNewModuleTitle(""); setNewModuleDesc(""); }}
                className={`${t.textSub} hover:text-blue-400 transition-colors`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className={`text-[10px] uppercase tracking-wider ${t.textSub} font-bold mb-1.5 block`}>
                  Module Title <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Module 6: Spiritual Warfare"
                  value={newModuleTitle}
                  onChange={(e) => setNewModuleTitle(e.target.value)}
                  className={`w-full ${t.inputBg} border ${t.inputBorder} rounded-xl px-4 py-2.5 text-sm ${t.textPrimary} placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors`}
                />
              </div>
              <div>
                <label className={`text-[10px] uppercase tracking-wider ${t.textSub} font-bold mb-1.5 block`}>
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Short overview shown to members..."
                  value={newModuleDesc}
                  onChange={(e) => setNewModuleDesc(e.target.value)}
                  className={`w-full ${t.inputBg} border ${t.inputBorder} rounded-xl px-4 py-2.5 text-sm ${t.textPrimary} placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors resize-none`}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setShowAddModule(false); setNewModuleTitle(""); setNewModuleDesc(""); }}
                className={`flex-1 py-2.5 rounded-xl border text-sm transition-colors ${t.cancelBtn}`}
              >
                Cancel
              </button>
              <button
                onClick={handleAddModule}
                disabled={addingModule || !newModuleTitle.trim()}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-bold text-white transition-colors flex items-center justify-center gap-2"
              >
                {addingModule ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding...</> : "Add Module"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
