'use client';

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/app/context/ThemeContext";
import { verseOfDayIndex, nextLocalMidnight } from "@/app/lib/verseOfDay";
import { BookOpen, Upload, Trash2, Loader2, Plus, X, Sun, Moon, Sparkles, Clock } from "lucide-react";

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
    divider:     dark ? "border-slate-800/40"  : "border-slate-300",
    emptyIcon:   dark ? "text-slate-700"       : "text-slate-400",
    rowHover:    dark ? "hover:bg-blue-500/5"  : "hover:bg-blue-100/60",
    iconBtn:     dark ? "bg-[#1a1d2e] border-slate-800 text-slate-400 hover:text-white" : "bg-slate-50 border-slate-400 text-slate-600 hover:text-slate-900",
    dropzone:    dark ? "border-slate-700 bg-[#1a1d2e]/40 hover:border-blue-500/50" : "border-slate-400 bg-slate-50 hover:border-blue-500/50",
  };
}

function inputStyle(t) {
  return `w-full ${t.inputBg} border ${t.inputBorder} ${t.inputText} rounded-xl px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 placeholder:text-slate-500`;
}

export default function BibleVersesPage() {
  const { dark, toggle: toggleTheme } = useTheme();
  const t = T(dark);
  const fileInputRef = useRef(null);

  const [verses, setVerses]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage]     = useState(null); // { type: 'success' | 'error', text }
  const [showAddForm, setShowAddForm] = useState(false);
  const [manualRef, setManualRef]   = useState('');
  const [manualText, setManualText] = useState('');
  const [saving, setSaving]         = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [clearing, setClearing]     = useState(false);

  async function fetchVerses() {
    setLoading(true);
    try {
      const res = await fetch('/api/bible-verses');
      const json = await res.json();
      setVerses(json.verses || []);
    } catch {
      setVerses([]);
    }
    setLoading(false);
  }

  useEffect(() => { fetchVerses(); }, []);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/bible-verses', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error || 'Upload failed.' });
      } else {
        setMessage({ type: 'success', text: `Added ${json.count} verse${json.count === 1 ? '' : 's'} from the PDF.` });
        await fetchVerses();
      }
    } catch {
      setMessage({ type: 'error', text: 'Something went wrong uploading the file.' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleManualAdd(e) {
    e.preventDefault();
    if (!manualRef.trim() || !manualText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/bible-verses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: manualRef, verse_text: manualText }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error || 'Could not save verse.' });
      } else {
        setManualRef('');
        setManualText('');
        setShowAddForm(false);
        await fetchVerses();
      }
    } catch {
      setMessage({ type: 'error', text: 'Something went wrong saving the verse.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    const confirmed = window.confirm('Delete this verse?');
    if (!confirmed) return;
    setDeletingId(id);
    try {
      await fetch(`/api/bible-verses?id=${id}`, { method: 'DELETE' });
      await fetchVerses();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleClearAll() {
    const confirmed = window.confirm(`Delete all ${verses.length} verses? This cannot be undone.`);
    if (!confirmed) return;
    setClearing(true);
    try {
      await fetch('/api/bible-verses?all=true', { method: 'DELETE' });
      await fetchVerses();
    } finally {
      setClearing(false);
    }
  }

  const todaysVerse = verses.length > 0 ? verses[verseOfDayIndex(verses.length)] : null;
  const nextChange = nextLocalMidnight();
  const nextChangeLabel = nextChange.toLocaleString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen ${t.pageBg} transition-colors duration-200`}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8">
        <div>
          <p className={`text-[10px] uppercase tracking-widest ${t.textMuted} mb-1`}>GGCF-GMI · Pandi, Bulacan</p>
          <h1 className={`text-2xl font-black ${t.textPrimary}`}>Bible Verses</h1>
          <p className={`${t.textSub} text-sm mt-0.5`}>Upload a PDF of verses — one is shown on the member dashboard each day, rotating automatically at midnight.</p>
        </div>
        <button
          onClick={toggleTheme}
          className={`p-2 rounded-full border ${t.iconBtn} transition-colors shrink-0`}
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      {/* Now Showing */}
      <div className="bg-gradient-to-br from-blue-600/10 to-indigo-600/10 border border-blue-500/20 rounded-3xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <h2 className="text-xs uppercase tracking-widest font-bold text-blue-400">Now Showing on Member Dashboard</h2>
        </div>
        {loading ? (
          <p className={`text-sm ${t.textSub}`}>Loading...</p>
        ) : todaysVerse ? (
          <>
            <p className={`text-lg font-semibold leading-relaxed italic ${t.textPrimary}`}>&ldquo;{todaysVerse.verse_text}&rdquo;</p>
            <p className="text-sm text-blue-400 font-bold mt-3">— {todaysVerse.reference}</p>
          </>
        ) : (
          <p className={`text-sm ${t.textSub}`}>No verses yet — upload a PDF or add one below to get started.</p>
        )}
        <div className={`flex items-start gap-2 mt-4 pt-4 border-t ${t.divider} text-xs ${t.textMuted} leading-relaxed`}>
          <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <p>
            This picks one verse per day from your list below, in a fixed rotation that only advances at <span className={`font-bold ${t.textSub}`}>12:00 AM local time</span> — next change <span className={`font-bold ${t.textSub}`}>{nextChangeLabel}</span>.
            {verses.length > 0 && ` If it seems to jump around mid-day, that's because adding or removing verses (currently ${verses.length}) reshuffles which one lands on today — the daily 12 AM schedule itself never changes.`}
          </p>
        </div>
      </div>

      {/* Upload */}
      <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl p-6 mb-6 backdrop-blur-sm`}>
        <h2 className={`text-sm font-black ${t.textPrimary} mb-3 flex items-center gap-2`}>
          <Upload className="w-4 h-4 text-blue-400" /> Upload Verses PDF
        </h2>
        <label
          className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-2xl py-10 cursor-pointer transition-colors ${t.dropzone}`}
        >
          {uploading ? (
            <>
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
              <p className={`text-sm ${t.textSub}`}>Parsing PDF...</p>
            </>
          ) : (
            <>
              <Upload className={`w-6 h-6 ${t.textMuted}`} />
              <p className={`text-sm ${t.textSub}`}>Click to choose a PDF, or drag one here</p>
              <p className={`text-xs ${t.textMuted}`}>Verses are detected by &ldquo;Book Chapter:Verse&rdquo; references, e.g. John 3:16</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={uploading}
            onChange={handleFileChange}
          />
        </label>
        {message && (
          <p className={`text-xs font-bold mt-3 ${message.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
            {message.text}
          </p>
        )}
      </div>

      {/* Manual add */}
      <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl p-6 mb-6 backdrop-blur-sm`}>
        <div className="flex items-center justify-between">
          <h2 className={`text-sm font-black ${t.textPrimary} flex items-center gap-2`}>
            <Plus className="w-4 h-4 text-blue-400" /> Add a Verse Manually
          </h2>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${t.iconBtn} transition-colors`}
          >
            {showAddForm ? <X size={14} /> : 'Add'}
          </button>
        </div>
        {showAddForm && (
          <form onSubmit={handleManualAdd} className="mt-4 space-y-3">
            <input
              type="text"
              placeholder="Reference, e.g. John 3:16"
              value={manualRef}
              onChange={(e) => setManualRef(e.target.value)}
              className={inputStyle(t)}
              required
            />
            <textarea
              rows={3}
              placeholder="Verse text..."
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              className={inputStyle(t)}
              required
            />
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
            >
              {saving ? 'Saving...' : 'Save Verse'}
            </button>
          </form>
        )}
      </div>

      {/* List */}
      <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl overflow-hidden backdrop-blur-sm`}>
        <div className={`px-6 py-4 border-b ${t.divider} flex items-center justify-between`}>
          <h2 className={`text-sm font-black ${t.textPrimary} flex items-center gap-2`}>
            <BookOpen className="w-4 h-4 text-blue-400" /> {loading ? 'Loading...' : `${verses.length} Verse${verses.length === 1 ? '' : 's'}`}
          </h2>
          {verses.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={clearing}
              className="text-xs font-bold text-rose-400 hover:text-rose-300 disabled:opacity-50 transition-colors"
            >
              {clearing ? 'Clearing...' : 'Clear All'}
            </button>
          )}
        </div>
        {loading ? (
          <p className={`text-center py-14 ${t.textSub} text-sm`}>Loading verses...</p>
        ) : verses.length === 0 ? (
          <div className="text-center py-14">
            <BookOpen className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-2`} />
            <p className={`${t.textSub} text-sm`}>No verses yet. Upload a PDF above to get started.</p>
          </div>
        ) : (
          <div className={`divide-y ${t.divider}`}>
            {verses.map((v) => (
              <div key={v.id} className={`flex items-start justify-between gap-4 px-6 py-4 ${t.rowHover} transition-colors`}>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-blue-400">{v.reference}</p>
                  <p className={`text-sm ${t.textPrimary} mt-1`}>{v.verse_text}</p>
                </div>
                <button
                  onClick={() => handleDelete(v.id)}
                  disabled={deletingId === v.id}
                  className="text-slate-600 hover:text-rose-400 disabled:opacity-50 transition-colors shrink-0 p-1"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
