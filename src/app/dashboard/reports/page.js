'use client';

<<<<<<< HEAD
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/app/lib/supabase";
import { useTheme } from "@/app/context/ThemeContext";
import {
  BarChart3, TrendingUp, PieChart,
  Download, Filter, ArrowUpRight, ArrowDownRight,
  Users, Wallet, Calendar, TrendingDown, Sun, Moon
=======
import { useState, useEffect } from "react";
import { supabase } from "@/app/lib/supabase";
import {
  BarChart3, TrendingUp, PieChart,
  Download, Filter, ArrowUpRight, ArrowDownRight,
  Users, Wallet, Calendar, TrendingDown
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec
} from "lucide-react";

const FUND_COLORS = {
  income: "bg-emerald-500",
  expense: "bg-rose-500",
};

<<<<<<< HEAD
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
    textMuted:   dark ? "text-slate-400"       : "text-slate-600",
    textFaint:   dark ? "text-slate-600"       : "text-slate-500",
    divider:     dark ? "border-slate-800"     : "border-slate-300",
    dashed:      dark ? "border-slate-800"     : "border-slate-400",
    trackBg:     dark ? "bg-slate-800"         : "bg-slate-300",
    deepCard:    dark ? "bg-slate-900/60"      : "bg-slate-200",
    rowBg:       dark ? "bg-slate-900/40"      : "bg-slate-100",
    rowHover:    dark ? "hover:bg-slate-900/70" : "hover:bg-slate-200",
    toolbarBtn:  dark ? "bg-[#1a1d2e] hover:bg-slate-800 text-white border-slate-700" : "bg-slate-50 hover:bg-slate-200 text-slate-900 border-slate-300",
    iconBtn:     dark ? "bg-[#1a1d2e] border-slate-800 text-slate-400 hover:text-white" : "bg-slate-50 border-slate-400 text-slate-600 hover:text-slate-900",
  };
}

// Accent color for content text (numbers, icons, headings) — the -400
// shades read fine on the dark bg but are too pale for contrast on light.
// (Full literal class strings below so Tailwind's scanner can find them.)
const ACCENT = {
  blue:    { dark: "text-blue-400",    light: "text-blue-600" },
  indigo:  { dark: "text-indigo-400",  light: "text-indigo-600" },
  pink:    { dark: "text-pink-400",    light: "text-pink-600" },
  rose:    { dark: "text-rose-400",    light: "text-rose-600" },
  emerald: { dark: "text-emerald-400", light: "text-emerald-600" },
  purple:  { dark: "text-purple-400",  light: "text-purple-600" },
};
function A(dark, color) {
  return dark ? ACCENT[color].dark : ACCENT[color].light;
}

export default function ReportsPage() {
  const { dark, toggle: toggleTheme } = useTheme();
  const t = T(dark);

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const lastBlobUrl = useRef(null);
=======
export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec

  // Members
  const [totalMembers, setTotalMembers] = useState(0);
  const [activeMembers, setActiveMembers] = useState(0);
  const [membersByMinistry, setMembersByMinistry] = useState([]);

  // Finance
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [monthlyTotals, setMonthlyTotals] = useState([]);

  // Events
  const [totalEvents, setTotalEvents] = useState(0);
  const [upcomingEvents, setUpcomingEvents] = useState(0);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      try {
        // ── Members ──────────────────────────────────────────
        const { count: mTotal } = await supabase
          .from('members')
          .select('*', { count: 'exact', head: true });

        const { count: mActive } = await supabase
          .from('members')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active');

        const { data: members } = await supabase
          .from('members')
          .select('ministry');

        // Group by ministry
        const ministryMap = {};
        (members || []).forEach((m) => {
          const key = m.ministry || 'Unassigned';
          ministryMap[key] = (ministryMap[key] || 0) + 1;
        });
        const ministryList = Object.entries(ministryMap)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        // ── Transactions ──────────────────────────────────────
        const { data: trans } = await supabase
          .from('transactions')
          .select('amount, type, date_recorded')
          .order('date_recorded', { ascending: false });

        const income = (trans || [])
          .filter(t => t.type === 'income')
          .reduce((s, t) => s + Number(t.amount || 0), 0);

        const expense = (trans || [])
          .filter(t => t.type === 'expense')
          .reduce((s, t) => s + Number(t.amount || 0), 0);

        // Group by month (last 7 months)
        const monthMap = {};
        (trans || []).forEach((t) => {
          if (!t.date_recorded) return;
          const d = new Date(t.date_recorded);
          const key = d.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' });
          if (!monthMap[key]) monthMap[key] = { income: 0, expense: 0 };
          if (t.type === 'income') monthMap[key].income += Number(t.amount || 0);
          if (t.type === 'expense') monthMap[key].expense += Number(t.amount || 0);
        });
        const monthlyArr = Object.entries(monthMap)
          .slice(-7)
          .map(([month, vals]) => ({ month, ...vals }));

        // ── Events ────────────────────────────────────────────
        const { count: evTotal } = await supabase
          .from('events')
          .select('*', { count: 'exact', head: true });

        const { count: evUpcoming } = await supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .gte('date', new Date().toISOString().split('T')[0]);

        // Set all state
        setTotalMembers(mTotal || 0);
        setActiveMembers(mActive || 0);
        setMembersByMinistry(ministryList);
        setTotalIncome(income);
        setTotalExpense(expense);
        setRecentTransactions((trans || []).slice(0, 6));
        setMonthlyTotals(monthlyArr);
        setTotalEvents(evTotal || 0);
        setUpcomingEvents(evUpcoming || 0);

      } catch (err) {
        console.error('Reports fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchAll();
  }, []);

<<<<<<< HEAD
  // ── PDF export ─────────────────────────────────────────────────────────
  // NOTE: this is a temporary layout — a proper branded / print-ready
  // report can replace it later.
  async function handleExportPDF() {
    setExporting(true);
    // Open the tab synchronously, in direct response to the click, so
    // browsers don't treat it as an unsolicited popup and block it —
    // we fill in its location once the PDF is ready below.
    const newTab = window.open('', '_blank');
    if (newTab) {
      newTab.document.write(
        '<title>Generating report…</title><body style="font:14px -apple-system,sans-serif;padding:48px;color:#64748b">Generating your report…</body>'
      );
    }
    try {
      const [{ jsPDF }, autoTableMod] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const autoTable = autoTableMod.default;

      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 40;

      // jsPDF's standard fonts don't include the ₱ glyph, so spell it out.
      const peso = (n) => `PHP ${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

      const BLUE   = [37, 99, 235];
      const INDIGO = [99, 102, 241];
      const PINK   = [219, 39, 119];
      const ROSE   = [225, 29, 72];
      const EMERALD= [5, 150, 105];
      const INK    = [30, 41, 59];
      const SUBTLE = [100, 116, 139];

      // ── Header band ───────────────────────────────────────────────
      doc.setFillColor(...BLUE);
      doc.rect(0, 0, pageWidth, 92, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('GGCF-GMI  ·  PANDI, BULACAN', marginX, 30);
      doc.setFontSize(21);
      doc.text('Reports & Analytics', marginX, 56);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(
        `Generated ${new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}`,
        marginX, 76
      );

      let y = 122;

      // ── Summary stat cards ───────────────────────────────────────────
      const cards = [
        { label: 'TOTAL BALANCE',  value: peso(balance),                        color: BLUE },
        { label: 'ACTIVE MEMBERS', value: `${activeMembers} / ${totalMembers}`, color: INDIGO },
        { label: 'TOTAL EVENTS',   value: `${totalEvents} (${upcomingEvents} upcoming)`, color: PINK },
        { label: 'TOTAL EXPENSES', value: peso(totalExpense),                   color: ROSE },
      ];
      const cardGap = 12;
      const cardW = (pageWidth - marginX * 2 - cardGap * 3) / 4;
      const cardH = 58;
      cards.forEach((c, i) => {
        const x = marginX + i * (cardW + cardGap);
        doc.setFillColor(246, 248, 251);
        doc.roundedRect(x, y, cardW, cardH, 6, 6, 'F');
        doc.setFillColor(...c.color);
        doc.roundedRect(x, y, 4, cardH, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...SUBTLE);
        doc.text(c.label, x + 13, y + 19);
        doc.setFontSize(11.5);
        doc.setTextColor(...INK);
        doc.text(c.value, x + 13, y + 40);
      });
      y += cardH + 30;

      function sectionTitle(title, color) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...INK);
        doc.text(title, marginX, y);
        doc.setDrawColor(...color);
        doc.setLineWidth(2);
        doc.line(marginX, y + 5, marginX + 26, y + 5);
        doc.setLineWidth(1);
        y += 16;
      }

      // ── Finance Summary ──────────────────────────────────────────────
      sectionTitle('Finance Summary', BLUE);
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [['Category', 'Amount']],
        body: [
          ['Total Income', peso(totalIncome)],
          ['Total Expenses', peso(totalExpense)],
          ['Net Balance', peso(balance)],
        ],
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 7, textColor: INK },
        headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', fontSize: 9 },
        alternateRowStyles: { fillColor: [247, 249, 252] },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      });
      y = doc.lastAutoTable.finalY + 28;

      // ── Members by Ministry ──────────────────────────────────────────
      sectionTitle('Members by Ministry', INDIGO);
      const ministryRows = membersByMinistry.length > 0
        ? membersByMinistry.map((m) => {
            const pct = totalMembers > 0 ? Math.round((m.count / totalMembers) * 100) : 0;
            return [m.name, String(m.count), `${pct}%`];
          })
        : [['No member data yet.', '—', '—']];
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [['Ministry', 'Members', '% of Total']],
        body: ministryRows,
        theme: 'striped',
        styles: { fontSize: 10, cellPadding: 7, textColor: INK },
        headStyles: { fillColor: INDIGO, textColor: 255, fontStyle: 'bold', fontSize: 9 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      });
      y = doc.lastAutoTable.finalY + 28;

      // ── Recent Transactions ───────────────────────────────────────────
      sectionTitle('Recent Transactions', EMERALD);
      const txRows = recentTransactions.length > 0
        ? recentTransactions.map((tx) => {
            const dateStr = tx.date_recorded
              ? new Date(tx.date_recorded).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
              : '—';
            return [dateStr, tx.type === 'income' ? 'Income' : 'Expense', `${tx.type === 'expense' ? '-' : '+'}${peso(tx.amount)}`];
          })
        : [['—', 'No transactions recorded yet.', '—']];
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [['Date', 'Type', 'Amount']],
        body: txRows,
        theme: 'striped',
        styles: { fontSize: 10, cellPadding: 7, textColor: INK },
        headStyles: { fillColor: EMERALD, textColor: 255, fontStyle: 'bold', fontSize: 9 },
        columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 2) {
            const raw = txRows[data.row.index]?.[2];
            if (raw?.startsWith('-')) data.cell.styles.textColor = ROSE;
            else if (raw?.startsWith('+')) data.cell.styles.textColor = EMERALD;
          }
        },
      });

      // ── Footer on every page ──────────────────────────────────────────
      const pageCount = doc.internal.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setDrawColor(226, 232, 240);
        doc.line(marginX, pageHeight - 36, pageWidth - marginX, pageHeight - 36);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(...SUBTLE);
        doc.text('Temporary auto-generated report — a formatted, branded layout is coming soon.', marginX, pageHeight - 22);
        doc.setFont('helvetica', 'normal');
        doc.text(`Page ${p} of ${pageCount}`, pageWidth - marginX, pageHeight - 22, { align: 'right' });
      }

      if (lastBlobUrl.current) URL.revokeObjectURL(lastBlobUrl.current);
      const blobUrl = URL.createObjectURL(doc.output('blob'));
      lastBlobUrl.current = blobUrl;

      if (newTab && !newTab.closed) {
        newTab.location.href = blobUrl;
      } else {
        // Popup was blocked (or the user closed it while it generated) — fall back to a download.
        doc.save(`church-report-${new Date().toISOString().split('T')[0]}.pdf`);
      }
    } catch (err) {
      console.error('PDF export error:', err);
      const message = err instanceof Error ? err.message : String(err);
      // Report the error inside the tab the user is now looking at, rather
      // than alert()-ing the original (now-backgrounded) tab where it's
      // easy to miss.
      if (newTab && !newTab.closed) {
        newTab.document.open();
        newTab.document.write(
          `<title>Export failed</title><body style="font:14px -apple-system,sans-serif;padding:48px;color:#b91c1c">Could not generate the report.<br><br><code>${message.replace(/</g, '&lt;')}</code></body>`
        );
        newTab.document.close();
      } else {
        alert('Could not generate the PDF: ' + message);
      }
    } finally {
      setExporting(false);
    }
  }

=======
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec
  const balance = totalIncome - totalExpense;
  const attendanceRate = totalMembers > 0
    ? Math.round((activeMembers / totalMembers) * 100)
    : 0;

  // Bar chart: normalize heights
  const maxMonthly = Math.max(...monthlyTotals.map(m => Math.max(m.income, m.expense)), 1);

  return (
<<<<<<< HEAD
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen ${t.pageBg} ${t.textPrimary} transition-colors duration-200`}>
=======
    <div className="p-8 min-h-screen bg-[#0f111a] text-slate-100">
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
<<<<<<< HEAD
          <p className={`text-[10px] uppercase tracking-widest ${t.textFaint} mb-1`}>GGCF-GMI · Pandi, Bulacan</p>
          <h1 className={`text-3xl font-black ${t.textPrimary} tracking-tight`}>Reports & Analytics</h1>
          <p className={`${t.textMuted} text-sm mt-0.5`}>
            {loading ? 'Syncing live data...' : 'Live data from all church modules.'}
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-full border ${t.iconBtn} transition-colors shrink-0`}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border flex-1 sm:flex-none ${t.toolbarBtn}`}>
            <Filter className="w-4 h-4" /> Filter Range
          </button>
          <button
            onClick={handleExportPDF}
            disabled={exporting || loading}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-900/20 flex-1 sm:flex-none"
          >
            <Download className="w-4 h-4" /> {exporting ? 'Exporting...' : 'Export PDF'}
=======
          <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">GGCF-GMI · Pandi, Bulacan</p>
          <h1 className="text-3xl font-black text-white tracking-tight">Reports & Analytics</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {loading ? 'Syncing live data...' : 'Live data from all church modules.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 bg-[#1a1d2e] hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all border border-slate-700">
            <Filter className="w-4 h-4" /> Filter Range
          </button>
          <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-900/20">
            <Download className="w-4 h-4" /> Export PDF
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {[
          {
            label: "Total Balance",
            val: loading ? "..." : `₱${balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
            sub: "Income minus expenses",
            up: balance >= 0,
            icon: Wallet,
<<<<<<< HEAD
            color: A(dark, "blue"),
=======
            color: "text-blue-400",
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec
          },
          {
            label: "Active Members",
            val: loading ? "..." : activeMembers.toString(),
            sub: `${attendanceRate}% of ${totalMembers} total`,
            up: true,
            icon: Users,
<<<<<<< HEAD
            color: A(dark, "indigo"),
=======
            color: "text-indigo-400",
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec
          },
          {
            label: "Total Events",
            val: loading ? "..." : totalEvents.toString(),
            sub: `${upcomingEvents} upcoming`,
            up: true,
            icon: Calendar,
<<<<<<< HEAD
            color: A(dark, "pink"),
=======
            color: "text-pink-400",
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec
          },
          {
            label: "Total Expenses",
            val: loading ? "..." : `₱${totalExpense.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
            sub: "All recorded expenses",
            up: false,
            icon: TrendingDown,
<<<<<<< HEAD
            color: A(dark, "rose"),
          },
        ].map((s, i) => (
          <div key={i} className={`${t.cardBg} border ${t.cardBorder} rounded-3xl p-6 relative overflow-hidden group`}>
            <s.icon className="absolute -right-2 -bottom-2 w-16 h-16 text-white/3 group-hover:text-blue-500/10 transition-colors" />
            <p className={`text-[10px] uppercase font-bold tracking-widest ${t.textSub} mb-2`}>{s.label}</p>
            <p className={`text-2xl font-black ${s.color}`}>{s.val}</p>
            <p className={`text-xs mt-1 flex items-center gap-1 font-medium ${s.up ? A(dark, "emerald") : A(dark, "rose")}`}>
=======
            color: "text-rose-400",
          },
        ].map((s, i) => (
          <div key={i} className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 relative overflow-hidden group">
            <s.icon className="absolute -right-2 -bottom-2 w-16 h-16 text-white/3 group-hover:text-blue-500/10 transition-colors" />
            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">{s.label}</p>
            <p className={`text-2xl font-black ${s.color}`}>{s.val}</p>
            <p className={`text-xs mt-1 flex items-center gap-1 font-medium ${s.up ? 'text-emerald-400' : 'text-rose-400'}`}>
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec
              {s.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {s.sub}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

        {/* Income vs Expense Bar Chart */}
<<<<<<< HEAD
        <div className={`lg:col-span-2 ${t.cardBg} border ${t.cardBorder} rounded-3xl p-6`}>
          <div className={`flex justify-between items-center mb-6 border-b ${t.divider} pb-4`}>
            <h3 className={`text-sm font-black ${t.textPrimary} uppercase tracking-widest flex items-center gap-2`}>
              <BarChart3 className={`w-4 h-4 ${A(dark, "blue")}`} /> Monthly Finance
            </h3>
            <div className="flex gap-3 text-[10px] font-bold uppercase">
              <span className={`flex items-center gap-1 ${A(dark, "emerald")}`}>
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Income
              </span>
              <span className={`flex items-center gap-1 ${A(dark, "rose")}`}>
=======
        <div className="lg:col-span-2 bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6">
          <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-400" /> Monthly Finance
            </h3>
            <div className="flex gap-3 text-[10px] font-bold uppercase">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Income
              </span>
              <span className="flex items-center gap-1 text-rose-400">
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec
                <span className="w-2 h-2 rounded-full bg-rose-500" /> Expense
              </span>
            </div>
          </div>

          {loading ? (
            <div className="h-48 flex items-center justify-center">
<<<<<<< HEAD
              <p className={`${t.textFaint} text-sm`}>Syncing...</p>
            </div>
          ) : monthlyTotals.length === 0 ? (
            <div className={`h-48 flex items-center justify-center border border-dashed ${t.dashed} rounded-2xl`}>
              <p className={`${t.textFaint} text-sm`}>No transaction data yet.</p>
=======
              <p className="text-slate-600 text-sm">Syncing...</p>
            </div>
          ) : monthlyTotals.length === 0 ? (
            <div className="h-48 flex items-center justify-center border border-dashed border-slate-800 rounded-2xl">
              <p className="text-slate-600 text-sm">No transaction data yet.</p>
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec
            </div>
          ) : (
            <div className="h-52 flex items-end justify-between gap-2 px-2">
              {monthlyTotals.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                  <div className="w-full flex gap-1 items-end" style={{ height: '160px' }}>
                    {/* Income bar */}
                    <div
                      className="flex-1 bg-emerald-500/30 hover:bg-emerald-500/60 rounded-t-md transition-all relative group/bar"
                      style={{ height: `${Math.max((m.income / maxMonthly) * 100, 2)}%` }}
                    >
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[9px] py-0.5 px-1.5 rounded opacity-0 group-hover/bar:opacity-100 transition-opacity whitespace-nowrap">
                        ₱{m.income.toLocaleString()}
                      </div>
                    </div>
                    {/* Expense bar */}
                    <div
                      className="flex-1 bg-rose-500/30 hover:bg-rose-500/60 rounded-t-md transition-all relative group/bar"
                      style={{ height: `${Math.max((m.expense / maxMonthly) * 100, 2)}%` }}
                    >
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-rose-600 text-white text-[9px] py-0.5 px-1.5 rounded opacity-0 group-hover/bar:opacity-100 transition-opacity whitespace-nowrap">
                        ₱{m.expense.toLocaleString()}
                      </div>
                    </div>
                  </div>
<<<<<<< HEAD
                  <span className={`text-[9px] ${t.textFaint} font-bold`}>{m.month}</span>
=======
                  <span className="text-[9px] text-slate-600 font-bold">{m.month}</span>
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Members by Ministry */}
<<<<<<< HEAD
        <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl p-6`}>
          <h3 className={`text-sm font-black ${t.textPrimary} uppercase tracking-widest flex items-center gap-2 mb-5 border-b ${t.divider} pb-4`}>
            <Users className={`w-4 h-4 ${A(dark, "indigo")}`} /> Members by Ministry
          </h3>
          {loading ? (
            <p className={`${t.textFaint} text-sm text-center py-8`}>Syncing...</p>
          ) : membersByMinistry.length === 0 ? (
            <p className={`${t.textFaint} text-sm text-center py-8`}>No member data yet.</p>
=======
        <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6">
          <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 mb-5 border-b border-slate-800 pb-4">
            <Users className="w-4 h-4 text-indigo-400" /> Members by Ministry
          </h3>
          {loading ? (
            <p className="text-slate-600 text-sm text-center py-8">Syncing...</p>
          ) : membersByMinistry.length === 0 ? (
            <p className="text-slate-600 text-sm text-center py-8">No member data yet.</p>
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec
          ) : (
            <div className="space-y-4">
              {membersByMinistry.map((m) => {
                const pct = totalMembers > 0 ? Math.round((m.count / totalMembers) * 100) : 0;
                return (
                  <div key={m.name}>
                    <div className="flex justify-between text-xs mb-1.5">
<<<<<<< HEAD
                      <span className={`${t.textMuted} font-medium truncate max-w-[140px]`}>{m.name}</span>
                      <span className={`${t.textPrimary} font-black`}>{m.count} <span className={`${t.textFaint} font-normal`}>({pct}%)</span></span>
                    </div>
                    <div className={`w-full h-1.5 ${t.trackBg} rounded-full overflow-hidden`}>
=======
                      <span className="text-slate-400 font-medium truncate max-w-[140px]">{m.name}</span>
                      <span className="text-white font-black">{m.count} <span className="text-slate-600 font-normal">({pct}%)</span></span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

<<<<<<< HEAD
          <div className={`mt-6 pt-4 border-t ${t.divider} grid grid-cols-2 gap-3`}>
            <div className={`${t.deepCard} rounded-2xl p-3 text-center`}>
              <p className={`text-xl font-black ${t.textPrimary}`}>{loading ? '...' : totalMembers}</p>
              <p className={`text-[10px] ${t.textSub} mt-0.5 uppercase tracking-wider`}>Total</p>
            </div>
            <div className={`${t.deepCard} rounded-2xl p-3 text-center`}>
              <p className={`text-xl font-black ${A(dark, "emerald")}`}>{loading ? '...' : activeMembers}</p>
              <p className={`text-[10px] ${t.textSub} mt-0.5 uppercase tracking-wider`}>Active</p>
=======
          <div className="mt-6 pt-4 border-t border-slate-800 grid grid-cols-2 gap-3">
            <div className="bg-slate-900/60 rounded-2xl p-3 text-center">
              <p className="text-xl font-black text-white">{loading ? '...' : totalMembers}</p>
              <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">Total</p>
            </div>
            <div className="bg-slate-900/60 rounded-2xl p-3 text-center">
              <p className="text-xl font-black text-emerald-400">{loading ? '...' : activeMembers}</p>
              <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">Active</p>
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec
            </div>
          </div>
        </div>
      </div>

      {/* Finance Summary + Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Income vs Expense Summary */}
<<<<<<< HEAD
        <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl p-6`}>
          <h3 className={`text-sm font-black ${t.textPrimary} uppercase tracking-widest flex items-center gap-2 mb-5 border-b ${t.divider} pb-4`}>
            <PieChart className={`w-4 h-4 ${A(dark, "purple")}`} /> Finance Summary
          </h3>
          <div className="space-y-5">
            {[
              { label: "Total Income", value: totalIncome, color: "bg-emerald-500", textColor: A(dark, "emerald") },
              { label: "Total Expenses", value: totalExpense, color: "bg-rose-500", textColor: A(dark, "rose") },
              { label: "Net Balance", value: balance, color: "bg-blue-500", textColor: A(dark, "blue") },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className={t.textMuted}>{item.label}</span>
=======
        <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6">
          <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 mb-5 border-b border-slate-800 pb-4">
            <PieChart className="w-4 h-4 text-purple-400" /> Finance Summary
          </h3>
          <div className="space-y-5">
            {[
              { label: "Total Income", value: totalIncome, color: "bg-emerald-500", textColor: "text-emerald-400" },
              { label: "Total Expenses", value: totalExpense, color: "bg-rose-500", textColor: "text-rose-400" },
              { label: "Net Balance", value: balance, color: "bg-blue-500", textColor: "text-blue-400" },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-400">{item.label}</span>
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec
                  <span className={`font-black ${item.textColor}`}>
                    {loading ? '...' : `₱${item.value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                  </span>
                </div>
<<<<<<< HEAD
                <div className={`w-full h-1.5 ${t.trackBg} rounded-full overflow-hidden`}>
=======
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec
                  <div
                    className={`h-full ${item.color} rounded-full`}
                    style={{ width: totalIncome > 0 ? `${Math.min((Math.abs(item.value) / totalIncome) * 100, 100)}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-blue-600/5 border border-blue-500/20 rounded-2xl">
<<<<<<< HEAD
            <p className={`text-[10px] ${A(dark, "blue")} font-bold uppercase mb-1`}>Stewardship Note</p>
            <p className={`text-xs ${t.textSub} leading-relaxed`}>
=======
            <p className="text-[10px] text-blue-400 font-bold uppercase mb-1">Stewardship Note</p>
            <p className="text-xs text-slate-500 leading-relaxed">
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec
              Financial transparency is maintained across all fund categories as per GGCF-GMI policy.
            </p>
          </div>
        </div>

        {/* Recent Transactions */}
<<<<<<< HEAD
        <div className={`lg:col-span-2 ${t.cardBg} border ${t.cardBorder} rounded-3xl p-6`}>
          <h3 className={`text-sm font-black ${t.textPrimary} uppercase tracking-widest flex items-center gap-2 mb-5 border-b ${t.divider} pb-4`}>
            <TrendingUp className={`w-4 h-4 ${A(dark, "emerald")}`} /> Recent Transactions
          </h3>
          {loading ? (
            <p className={`${t.textFaint} text-sm text-center py-8`}>Syncing...</p>
          ) : recentTransactions.length === 0 ? (
            <div className={`py-10 text-center border border-dashed ${t.dashed} rounded-2xl`}>
              <p className={`${t.textFaint} text-sm`}>No transactions recorded yet.</p>
=======
        <div className="lg:col-span-2 bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6">
          <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 mb-5 border-b border-slate-800 pb-4">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> Recent Transactions
          </h3>
          {loading ? (
            <p className="text-slate-600 text-sm text-center py-8">Syncing...</p>
          ) : recentTransactions.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-slate-800 rounded-2xl">
              <p className="text-slate-600 text-sm">No transactions recorded yet.</p>
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec
            </div>
          ) : (
            <div className="space-y-3">
              {recentTransactions.map((tx, i) => (
<<<<<<< HEAD
                <div key={i} className={`flex items-center justify-between py-2.5 px-4 rounded-2xl ${t.rowBg} ${t.rowHover} transition-colors`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${tx.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <div>
                      <p className={`text-sm font-semibold ${t.textPrimary} capitalize`}>{tx.type}</p>
                      <p className={`text-[10px] ${t.textFaint}`}>
=======
                <div key={i} className="flex items-center justify-between py-2.5 px-4 rounded-2xl bg-slate-900/40 hover:bg-slate-900/70 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${tx.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <div>
                      <p className="text-sm font-semibold text-white capitalize">{tx.type}</p>
                      <p className="text-[10px] text-slate-600">
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec
                        {tx.date_recorded
                          ? new Date(tx.date_recorded).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </p>
                    </div>
                  </div>
<<<<<<< HEAD
                  <p className={`text-sm font-black font-mono ${tx.type === 'income' ? A(dark, "emerald") : A(dark, "rose")}`}>
=======
                  <p className={`text-sm font-black font-mono ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
>>>>>>> 6a44675267fb6ac25f3bc70915eee873865e12ec
                    {tx.type === 'expense' ? '−' : '+'}₱{Number(tx.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}