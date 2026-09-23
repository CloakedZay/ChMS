'use client';

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/app/lib/supabase";
import { useTheme } from "@/app/context/ThemeContext";
import {
  Send, Bot, User, Sparkles, Loader2, Sun, Moon,
  Upload, FileText, Trash2, Eye, EyeOff, File as FileIcon
} from "lucide-react";

const DOC_TYPES = ["Policy", "Handbook", "FAQ", "Announcement", "Other"];
const GLOBAL_ROLES = ["admin", "pastor"];

// ─── Theme token map — same pattern as DashboardPage.js ────────────────────
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
    inputBg:     dark ? "bg-[#1a1d2e]"        : "bg-slate-50",
    inputBorder: dark ? "border-slate-800"     : "border-slate-400",
    inputText:   dark ? "text-slate-200"       : "text-slate-800",
    divider:     dark ? "border-slate-800"     : "border-slate-300",
    innerCard:   dark ? "bg-slate-900/50"      : "bg-slate-200",
    innerBorder: dark ? "border-slate-800/40"  : "border-slate-300",
    bubbleBot:   dark ? "bg-slate-900/60 text-slate-200" : "bg-slate-200 text-slate-800",
    avatarBot:   dark ? "bg-slate-500/10 border-slate-500/20" : "bg-slate-300/60 border-slate-400/40",
    emptyIcon:   dark ? "text-slate-800"       : "text-slate-400",
    iconBtn:     dark ? "bg-[#1a1d2e] border-slate-800 text-slate-400 hover:text-white" : "bg-slate-50 border-slate-400 text-slate-600 hover:text-slate-900",
    errorText:   dark ? "text-rose-400"        : "text-rose-600",
    tabBar:      dark ? "bg-[#1a1d2e]/60 border-slate-800" : "bg-slate-100/90 border-slate-300",
    tabInactive: dark ? "text-slate-500 hover:text-slate-200" : "text-slate-500 hover:text-slate-800",
    uploadBorder: dark ? "border-slate-700 hover:border-blue-500/50 text-slate-500 hover:text-blue-400" : "border-slate-400 hover:border-blue-500/50 text-slate-600 hover:text-blue-600",
    uploadBorderDisabled: dark ? "border-slate-700 text-slate-600" : "border-slate-400 text-slate-500",
  };
}

export default function ChatbotPage() {
  const { dark, toggle: toggleTheme } = useTheme();
  const t = T(dark);

  const [activeTab, setActiveTab] = useState("chat");

  // ── Profile / branch scoping (same pattern as finance & events pages) ──────
  const [profile, setProfile] = useState(null);
  const [churches, setChurches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);

  const isGlobal = profile && GLOBAL_ROLES.includes(profile.role);
  const churchId = isGlobal ? selectedBranch : profile?.church_id || null;

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setProfileLoading(false); return; }
      const { data } = await supabase.from('profiles').select('role, church_id').eq('id', user.id).single();
      setProfile(data || null);

      if (data && GLOBAL_ROLES.includes(data.role)) {
        const { data: churchList } = await supabase.from('churches').select('id, name').order('name', { ascending: true });
        setChurches(churchList || []);
        if (churchList?.length) setSelectedBranch(churchList[0].id);
      }
      setProfileLoading(false);
    }
    init();
  }, []);

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen flex flex-col ${t.pageBg} ${t.textPrimary} transition-colors duration-200`}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
        <div>
          <p className={`text-[10px] uppercase tracking-widest ${t.textMuted} mb-1`}>GGCF-GMI · Pandi, Bulacan</p>
          <h1 className={`text-2xl font-black ${t.textPrimary}`}>Church Assistant</h1>
          <p className={`${t.textSub} text-sm mt-0.5`}>Ask questions answered from your church's reference documents</p>
        </div>
        <button
          onClick={toggleTheme}
          className={`p-2 rounded-full border ${t.iconBtn} transition-colors shrink-0`}
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      {isGlobal && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-6">
          <span className={`text-[10px] uppercase tracking-widest ${t.textSub} font-bold`}>Branch</span>
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className={`w-full sm:w-auto ${t.inputBg} border ${t.inputBorder} rounded-xl py-2 px-4 text-sm ${t.inputText} focus:outline-none focus:border-blue-500 transition-colors`}
          >
            {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Tabs */}
      <div className={`flex gap-1 ${t.tabBar} border rounded-xl p-1 w-fit mb-6`}>
        {[
          { key: "chat", label: "Chat" },
          { key: "documents", label: "Documents" },
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

      {activeTab === "chat" ? (
        <ChatPanel t={t} dark={dark} churchId={churchId} loadingChurch={profileLoading} />
      ) : (
        <DocumentsPanel t={t} dark={dark} churchId={churchId} loadingChurch={profileLoading} />
      )}
    </div>
  );
}

// ─── Chat tab ────────────────────────────────────────────────────────────────

function ChatPanel({ t, dark, churchId, loadingChurch }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function handleSend(e) {
    e.preventDefault();
    const question = input.trim();
    if (!question || sending || !churchId) return;

    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, church_id: churchId }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.answer || data.error || "Sorry, something went wrong.", isError: !res.ok },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Sorry, I couldn't reach the assistant. Please try again.", isError: true },
      ]);
    } finally {
      setSending(false);
    }
  }

  const disabled = sending || loadingChurch || !churchId;

  return (
    <div className={`flex-1 flex flex-col ${t.cardBg} border ${t.cardBorder} rounded-3xl overflow-hidden backdrop-blur-sm min-h-0`}>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 min-h-[50vh]">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-16">
            <Sparkles className={`w-8 h-8 ${t.emptyIcon} mb-3`} />
            <p className={`text-sm font-bold ${t.textPrimary}`}>Ask me anything about the church</p>
            <p className={`text-xs ${t.textMuted} mt-1 max-w-xs`}>
              {loadingChurch
                ? "Loading your profile..."
                : !churchId
                ? "No church is linked to your account yet — contact your admin."
                : "Answers are based only on documents your church admin has uploaded."}
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex items-start gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                m.role === "user" ? "bg-blue-600/20 border-blue-500/20" : t.avatarBot
              }`}>
                {m.role === "user" ? <User className="w-4 h-4 text-blue-400" /> : <Bot className={`w-4 h-4 ${t.textSub}`} />}
              </div>
              <div className={`max-w-[80%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user" ? "bg-blue-600 text-white" : m.isError ? `${t.bubbleBot} ${t.errorText}` : t.bubbleBot
              }`}>
                {m.text}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${t.avatarBot}`}>
              <Bot className={`w-4 h-4 ${t.textSub}`} />
            </div>
            <div className={`rounded-2xl px-4 py-2.5 text-sm ${t.bubbleBot} flex items-center gap-2`}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className={`flex items-center gap-2 p-3 sm:p-4 border-t ${t.divider}`}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={!churchId && !loadingChurch ? "No church linked to this account..." : "Ask a question..."}
          disabled={disabled}
          className={`flex-1 min-w-0 ${t.inputBg} border ${t.inputBorder} rounded-full py-2.5 px-4 text-sm ${t.inputText} placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60`}
        />
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white flex items-center justify-center transition-all active:scale-95 shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

// ─── Documents tab ───────────────────────────────────────────────────────────

function DocumentsPanel({ t, dark, churchId, loadingChurch }) {
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const fileInputRef = useRef(null);

  async function fetchDocuments() {
    if (!churchId) { setDocuments([]); setLoadingDocs(false); return; }
    setLoadingDocs(true);
    try {
      const res = await fetch(`/api/chatbot/documents?church_id=${encodeURIComponent(churchId)}`);
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch {
      setDocuments([]);
    } finally {
      setLoadingDocs(false);
    }
  }

  useEffect(() => { fetchDocuments(); }, [churchId]);

  function handleFileChange(e) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    if (f && !title) setTitle(f.name.replace(/\.[^/.]+$/, ""));
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!file || !title.trim() || !churchId) return;

    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File too large. Max 10MB.");
      return;
    }

    setUploading(true);
    setUploadError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title.trim());
      formData.append("doc_type", docType);
      formData.append("church_id", churchId);

      const res = await fetch("/api/chatbot/documents", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setUploadError(data.error || "Upload failed.");
        return;
      }

      setTitle("");
      setDocType(DOC_TYPES[0]);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await fetchDocuments();
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function toggleActive(doc) {
    setBusyId(doc.id);
    try {
      await fetch("/api/chatbot/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: doc.id, is_active: !doc.is_active }),
      });
      setDocuments((prev) => prev.map((d) => d.id === doc.id ? { ...d, is_active: !d.is_active } : d));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(doc) {
    if (!confirm(`Delete "${doc.title}"? This can't be undone.`)) return;
    setBusyId(doc.id);
    try {
      await fetch(`/api/chatbot/documents?id=${encodeURIComponent(doc.id)}`, { method: "DELETE" });
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } finally {
      setBusyId(null);
    }
  }

  if (loadingChurch) {
    return <p className={`${t.textMuted} text-sm text-center py-16`}>Loading...</p>;
  }

  if (!churchId) {
    return (
      <div className={`py-16 text-center border border-dashed ${t.innerBorder} rounded-3xl`}>
        <FileIcon className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-2`} />
        <p className={`${t.textMuted} text-sm`}>No church is linked to your account yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Upload */}
      <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl p-6 backdrop-blur-sm`}>
        <h3 className={`text-[10px] uppercase font-bold tracking-widest ${t.textSub} mb-4`}>Upload a Document</h3>
        <form onSubmit={handleUpload} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={`block text-[10px] uppercase tracking-widest ${t.textSub} font-bold mb-1.5`}>Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Membership Handbook"
                className={`w-full ${t.inputBg} border ${t.inputBorder} rounded-xl px-4 py-2.5 text-sm ${t.inputText} placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors`}
              />
            </div>
            <div>
              <label className={`block text-[10px] uppercase tracking-widest ${t.textSub} font-bold mb-1.5`}>Document Type</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className={`w-full ${t.inputBg} border ${t.inputBorder} rounded-xl px-4 py-2.5 text-sm ${t.inputText} focus:outline-none focus:border-blue-500 transition-colors`}
              >
                {DOC_TYPES.map((dt) => <option key={dt} value={dt}>{dt}</option>)}
              </select>
            </div>
          </div>

          <label className={`flex items-center justify-center gap-2 w-full border border-dashed rounded-xl py-3 cursor-pointer transition-colors text-xs font-bold ${
            uploading ? `${t.uploadBorderDisabled} cursor-not-allowed` : t.uploadBorder
          }`}>
            {uploading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
              : <><Upload className="w-4 h-4" /> {file ? file.name : "Choose a file · PDF, DOCX, TXT · max 10MB"}</>
            }
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.txt"
              disabled={uploading}
              onChange={handleFileChange}
            />
          </label>

          {uploadError && <p className={`text-xs ${t.errorText}`}>{uploadError}</p>}

          <button
            type="submit"
            disabled={uploading || !file || !title.trim()}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-bold text-white transition-colors flex items-center justify-center gap-2"
          >
            {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : "Add to Knowledge Base"}
          </button>
        </form>
      </div>

      {/* List */}
      <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl overflow-hidden backdrop-blur-sm`}>
        <div className={`px-6 py-4 border-b ${t.divider}`}>
          <h3 className={`text-[10px] uppercase font-bold tracking-widest ${t.textSub}`}>Reference Documents</h3>
        </div>
        {loadingDocs ? (
          <p className={`${t.textMuted} text-sm text-center py-10`}>Loading documents...</p>
        ) : documents.length === 0 ? (
          <div className="py-14 text-center">
            <FileText className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-2`} />
            <p className={`${t.textMuted} text-sm`}>No documents yet. Upload one above.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/20">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 px-6 py-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${t.innerCard} ${t.innerBorder}`}>
                  <FileText className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${t.textPrimary} truncate`}>{doc.title}</p>
                  <p className={`text-[10px] ${t.textMuted} mt-0.5`}>
                    {doc.doc_type}
                    {doc.created_at ? ` · ${new Date(doc.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                    {!doc.is_active ? ' · Inactive' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleActive(doc)}
                    disabled={busyId === doc.id}
                    title={doc.is_active ? "Deactivate (hide from assistant)" : "Activate (use in assistant)"}
                    className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${t.textSub} hover:text-blue-400 hover:bg-blue-500/10`}
                  >
                    {doc.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => handleDelete(doc)}
                    disabled={busyId === doc.id}
                    title="Delete"
                    className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${t.textSub} hover:text-rose-400 hover:bg-rose-500/10`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
