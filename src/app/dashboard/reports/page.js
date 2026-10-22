'use client';

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/app/lib/supabase";
import { useTheme } from "@/app/context/ThemeContext";
import { useAuth } from "@/app/context/AuthContext";
import { can, GLOBAL_ROLES, ROLE_LABELS } from "@/app/lib/permissions";
import {
  BarChart3, TrendingUp, PieChart,
  Download, ArrowUpRight, ArrowDownRight,
  Users, Wallet, Calendar, TrendingDown, Sun, Moon, UserMinus, CalendarClock, UserCheck, RefreshCw, UserPlus
} from "lucide-react";
import Link from "next/link";
import BranchLabel, { branchLabelText } from "@/app/components/BranchLabel";
import { phToday } from "@/app/lib/phDate";
import { alertDialog } from "@/app/lib/dialog";
import { countsInTotals } from "@/app/lib/financeTotals";
import { fetchAll } from "@/app/lib/fetchAll";

import { friendlyError } from '@/app/lib/errors';
import { peso, pesoPdf } from "@/app/lib/format";
import { baseTheme } from '@/app/lib/theme';
// Event statuses in order, for the "Events by Status" section shown to
// levels without finance access.
const EVENT_STATUSES = [
  { key: "planning", label: "Planning", bar: "bg-slate-500" },
  { key: "pending",  label: "Pending",  bar: "bg-orange-500" },
  { key: "approved", label: "Approved", bar: "bg-emerald-500" },
  { key: "done",     label: "Done",     bar: "bg-blue-500" },
  { key: "cancelled", label: "Cancelled", bar: "bg-rose-500" },   // db/051
];

const FUND_COLORS = {
  income: "bg-emerald-500",
  expense: "bg-rose-500",
};

// ─── Theme token map — same pattern as DashboardPage.js ────────────────────
// Light mode is deliberately dimmed a notch off pure white/slate-100 (~90%
// as bright) so it doesn't glare next to the dark theme.
function T(dark) {
  return {
    ...baseTheme(dark),
    textMuted:  dark ? "text-slate-400"       : "text-slate-600",
    textFaint:  dark ? "text-slate-600"       : "text-slate-500",
    divider:    dark ? "border-slate-800"     : "border-slate-300",
    trackBg:    dark ? "bg-slate-800"         : "bg-slate-300",
    rowBg:      dark ? "bg-slate-900/40"      : "bg-slate-100",
    rowHover:   dark ? "hover:bg-slate-900/70" : "hover:bg-slate-200",
    toolbarBtn: dark ? "bg-[#1b2420] hover:bg-slate-800 text-white border-slate-700" : "bg-slate-50 hover:bg-slate-200 text-slate-900 border-slate-300",
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
  const { role, churchName } = useAuth();
  // Finance sections only for levels with finance reports (Pastor, Leader,
  // Finance). Admin and Secretary get member and event figures instead —
  // the database wouldn't return finance rows to them anyway.
  const showFinance = can(role, 'financeReports');
  // Admin and Pastor see every branch, together or one at a time; everyone
  // else only ever gets their own branch from the database.
  const isGlobal = GLOBAL_ROLES.includes(role);
  const [branch, setBranch] = useState('all');
  const [churches, setChurches] = useState([]);
  const church = isGlobal && branch !== 'all' ? branch : null;
  const churchLabel = church ? churches.find((c) => c.id === church)?.name : null;

  useEffect(() => {
    if (!isGlobal) return;
    supabase.from('churches').select('id, name').order('name').then(({ data }) => setChurches(data || []));
  }, [isGlobal]);

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const lastBlobUrl = useRef(null);

  // Members
  const [totalMembers, setTotalMembers] = useState(0);
  const [activeMembers, setActiveMembers] = useState(0);
  const [inactiveMembers, setInactiveMembers] = useState(0);
  const [membersByMinistry, setMembersByMinistry] = useState([]);

  // Finance
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [monthlyTotals, setMonthlyTotals] = useState([]);

  // Events
  const [totalEvents, setTotalEvents] = useState(0);
  const [upcomingEvents, setUpcomingEvents] = useState(0);
  const [eventsByStatus, setEventsByStatus] = useState({});

  // Bumped to reload the figures (Refresh button, coming back to the tab).
  const [reloadKey, setReloadKey] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    const reload = () => { if (document.visibilityState === 'visible') setReloadKey((k) => k + 1); };
    document.addEventListener('visibilitychange', reload);
    return () => document.removeEventListener('visibilitychange', reload);
  }, []);

  useEffect(() => {
    // Not named fetchAll: that would hide the imported fetchAll helper, and
    // the transactions query below would call this function forever.
    async function loadReport() {
      setLoading(true);
      setLoadError('');
      try {
        // ── Members ──────────────────────────────────────────
        // Supabase reports a failed query in `error` instead of throwing, so
        // collect them — otherwise a failure just shows as zeros.
        const errors = [];
        const check = (res) => { if (res.error) errors.push(res.error); return res; };
        // The chosen branch only (Admin, Pastor); otherwise unchanged.
        const scoped = (q) => (church ? q.eq('church_id', church) : q);

        const { count: mTotal } = check(await scoped(supabase
          .from('member_directory')
          .select('*', { count: 'exact', head: true })));

        const { count: mActive } = check(await scoped(supabase
          .from('member_directory')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active')));

        const { count: mInactive } = check(await scoped(supabase
          .from('member_directory')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'inactive')));

        const { data: members } = check(await fetchAll(() => scoped(supabase
          .from('member_directory')
          .select('ministry'))
          .order('id')));

        // Group by ministry. The directory lists a member's real ministries
        // as "A, B" (db/023); someone in two ministries counts in both.
        const ministryMap = {};
        (members || []).forEach((m) => {
          const names = m.ministry ? m.ministry.split(', ') : ['Unassigned'];
          names.forEach((key) => { ministryMap[key] = (ministryMap[key] || 0) + 1; });
        });
        const ministryList = Object.entries(ministryMap)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        // ── Transactions (only for levels that can see finance) ──
        const { data: allTrans } = showFinance
          ? check(await fetchAll(() => scoped(supabase
              .from('transactions')
              .select('amount, type, date_recorded, status'))
              .order('date_recorded', { ascending: false })
              .order('id', { ascending: false })))
          : { data: [] };
        // Voided entries stay in the ledger but never count in a report.
        const trans = allTrans?.filter(countsInTotals);

        const income = (trans || [])
          .filter(t => t.type === 'income')
          .reduce((s, t) => s + Number(t.amount || 0), 0);

        const expense = (trans || [])
          .filter(t => t.type === 'expense')
          .reduce((s, t) => s + Number(t.amount || 0), 0);

        // Group by month: the last 7 months up to this one, oldest first,
        // with ₱0 for a month with no entries so a quiet month still shows.
        // date_recorded is a plain date ("2026-10-21"), so its first 7
        // characters are the month.
        const monthMap = {};
        (trans || []).forEach((t) => {
          if (!t.date_recorded) return;
          const key = String(t.date_recorded).slice(0, 7);
          if (!monthMap[key]) monthMap[key] = { income: 0, expense: 0 };
          if (t.type === 'income') monthMap[key].income += Number(t.amount || 0);
          if (t.type === 'expense') monthMap[key].expense += Number(t.amount || 0);
        });
        const monthlyArr = (trans || []).length === 0 ? [] : lastMonths(7).map((key) => ({
          month: new Date(`${key}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'short', year: '2-digit' }),
          ...(monthMap[key] || { income: 0, expense: 0 }),
        }));

        // ── Events ────────────────────────────────────────────
        const { count: evTotal } = check(await scoped(supabase
          .from('events')
          .select('*', { count: 'exact', head: true })));

        // Upcoming = approved, from today (Philippine date) on.
        const { count: evUpcoming } = check(await scoped(supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'approved')
          .gte('date', phToday())));

        const { data: evStatuses } = check(await fetchAll(() => scoped(supabase
          .from('events')
          .select('status'))
          .order('id')));
        const statusMap = {};
        (evStatuses || []).forEach((e) => {
          const key = e.status || 'planning';
          statusMap[key] = (statusMap[key] || 0) + 1;
        });

        // Set all state
        setTotalMembers(mTotal || 0);
        setActiveMembers(mActive || 0);
        setInactiveMembers(mInactive || 0);
        setMembersByMinistry(ministryList);
        setTotalIncome(income);
        setTotalExpense(expense);
        setRecentTransactions((trans || []).slice(0, 6));
        setMonthlyTotals(monthlyArr);
        setTotalEvents(evTotal || 0);
        setUpcomingEvents(evUpcoming || 0);
        setEventsByStatus(statusMap);
        setUpdatedAt(new Date());

        if (errors.length > 0) {
          console.error('Reports fetch errors:', errors);
          setLoadError(friendlyError(errors[0], 'Some figures could not be loaded.'));
        }
      } catch (err) {
        console.error('Reports fetch error:', err);
        setLoadError(friendlyError(err, 'Could not load the reports.'));
      } finally {
        setLoading(false);
      }
    }

    loadReport();
  }, [showFinance, reloadKey, church]);

  // ── PDF export ─────────────────────────────────────────────────────────
  // A4 church report in the app's colours (green and gold), with the logo,
  // the branch picked above, every section on the page, and page numbers.
  // New members and attendance are fetched here, for the same branch, since
  // their sections load them on their own.
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
      const [{ jsPDF }, autoTableMod, joinRes, attRes, logo] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
        supabase.rpc('member_join_trend', church ? { p_months: 12, p_church: church } : { p_months: 12 }),
        can(role, 'attendance')
          ? supabase.rpc('attendance_events', { p_church: church })
          : Promise.resolve({ data: [] }),
        fetch('/logo.png')
          .then((r) => (r.ok ? r.blob() : null))
          .then((b) => b && new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); }))
          .catch(() => null),
      ]);
      const autoTable = autoTableMod.default;

      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 40;
      const bottom = pageHeight - 56;   // keep clear of the footer
      const contentW = pageWidth - marginX * 2;

      // jsPDF's standard fonts don't include the ₱ glyph, so spell it out.
      const peso = pesoPdf;
      const fmtDate = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

      const GREEN  = [23, 63, 53];
      const GOLD   = [197, 166, 106];
      const INK    = [30, 41, 59];
      const SUBTLE = [100, 116, 139];
      const ROSE   = [190, 18, 60];
      const POS    = [4, 120, 87];
      const ZEBRA  = [248, 247, 242];
      const LINE   = [229, 227, 216];

      const branchText = (churchLabel || branchLabelText(role, churchName));
      const generated = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });

      // ── Letterhead ────────────────────────────────────────────────
      let textX = marginX;
      if (logo) {
        try { doc.addImage(logo, 'PNG', marginX, 30, 52, 52); textX = marginX + 64; } catch { /* no logo */ }
      }
      doc.setTextColor(...GREEN);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text("God's Grace Christian Fellowship Global Ministries Inc.", textX, 48);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...SUBTLE);
      doc.text(branchText, textX, 63);
      doc.text(`FaithSync Church Management · Generated ${generated}`, textX, 76);

      doc.setDrawColor(...GOLD);
      doc.setLineWidth(1.5);
      doc.line(marginX, 96, pageWidth - marginX, 96);
      doc.setLineWidth(1);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(...INK);
      doc.text('Church Report', marginX, 128);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...SUBTLE);
      doc.text(`Prepared for: ${ROLE_LABELS[role] || role || 'Staff'} · Figures as of ${new Date().toLocaleDateString('en-PH', { dateStyle: 'medium' })}`, marginX, 144);

      let y = 166;

      // ── Summary cards ─────────────────────────────────────────────
      const cards = showFinance ? [
        { label: 'NET BALANCE',    value: peso(balance) },
        { label: 'ACTIVE MEMBERS', value: `${activeMembers} of ${totalMembers}` },
        { label: 'EVENTS',         value: `${totalEvents} (${upcomingEvents} upcoming)` },
        { label: 'TOTAL EXPENSES', value: peso(totalExpense) },
      ] : [
        { label: 'ACTIVE MEMBERS',   value: `${activeMembers} of ${totalMembers}` },
        { label: 'INACTIVE MEMBERS', value: String(inactiveMembers) },
        { label: 'EVENTS',           value: String(totalEvents) },
        { label: 'UPCOMING EVENTS',  value: String(upcomingEvents) },
      ];
      const cardGap = 10;
      const cardW = (contentW - cardGap * 3) / 4;
      const cardH = 56;
      cards.forEach((c, i) => {
        const x = marginX + i * (cardW + cardGap);
        doc.setFillColor(...ZEBRA);
        doc.setDrawColor(...LINE);
        doc.roundedRect(x, y, cardW, cardH, 5, 5, 'FD');
        doc.setFillColor(...GOLD);
        doc.rect(x, y + 8, 3, cardH - 16, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...SUBTLE);
        doc.text(c.label, x + 12, y + 20);
        doc.setFontSize(11);
        doc.setTextColor(...GREEN);
        doc.text(doc.splitTextToSize(c.value, cardW - 20)[0], x + 12, y + 40);
      });
      y += cardH + 28;

      // ── Helpers ───────────────────────────────────────────────────
      function ensure(space) {
        if (y + space > bottom) { doc.addPage(); y = 56; }
      }
      function section(title, note) {
        ensure(80);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...GREEN);
        doc.text(title, marginX, y);
        if (note) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(...SUBTLE);
          doc.text(note, pageWidth - marginX, y, { align: 'right' });
        }
        doc.setDrawColor(...GOLD);
        doc.setLineWidth(1.5);
        doc.line(marginX, y + 5, marginX + 28, y + 5);
        doc.setLineWidth(1);
        y += 14;
      }
      function table(head, body, columnStyles = {}, extra = {}) {
        autoTable(doc, {
          startY: y,
          margin: { left: marginX, right: marginX, bottom: 56 },
          head: [head],
          body,
          theme: 'plain',
          styles: { fontSize: 9.5, cellPadding: 6, textColor: INK, lineColor: LINE },
          headStyles: { fillColor: GREEN, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
          alternateRowStyles: { fillColor: ZEBRA },
          columnStyles,
          ...extra,
        });
        y = doc.lastAutoTable.finalY + 26;
      }
      const right = { halign: 'right' };

      // ── Membership ────────────────────────────────────────────────
      section('Membership', `${totalMembers} members · ${activeMembers} active · ${inactiveMembers} inactive`);
      table(
        ['Ministry', 'Members', '% of members'],
        membersByMinistry.length
          ? membersByMinistry.map((m) => [m.name, String(m.count), `${totalMembers ? Math.round((m.count / totalMembers) * 100) : 0}%`])
          : [['No member data yet.', '—', '—']],
        { 1: right, 2: right },
      );

      // ── New members per month ─────────────────────────────────────
      const joins = joinRes.error ? [] : joinRes.data || [];
      if (joins.length) {
        const joinedTotal = joins.reduce((a, r) => a + r.joined, 0);
        section('New Members per Month', `${joinedTotal} in the last 12 months`);
        table(
          ['Month', 'Joined'],
          [...joins].reverse().map((r) => [
            new Date(`${String(r.month).slice(0, 7)}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
            String(r.joined),
          ]),
          { 1: right },
        );
      }

      // ── Events ────────────────────────────────────────────────────
      section('Events by Status', `${totalEvents} events · ${upcomingEvents} upcoming`);
      table(
        ['Status', 'Events'],
        EVENT_STATUSES.map((st) => [st.label, String(eventsByStatus[st.key] || 0)]),
        { 1: right },
      );

      // ── Attendance ────────────────────────────────────────────────
      const taken = (attRes.data || []).filter((e) => e.members_present + e.visitors > 0);
      if (taken.length) {
        const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
        const recent = taken.filter((e) => e.date >= since);
        const possible = recent.reduce((a, e) => a + e.active_members, 0);
        const rate = possible ? `${Math.round((recent.reduce((a, e) => a + e.members_present, 0) / possible) * 100)}%` : '—';
        const visitors = recent.reduce((a, e) => a + e.visitors, 0);
        section('Event Attendance', `Last 90 days: ${rate} attendance · ${visitors} visitors`);
        table(
          ['Event', 'Date', 'Members', 'Visitors', 'Rate'],
          taken.slice(0, 10).map((e) => [
            e.title,
            fmtDate(e.date),
            String(e.members_present),
            String(e.visitors),
            `${e.active_members ? Math.min(100, Math.round((e.members_present / e.active_members) * 100)) : 0}%`,
          ]),
          { 2: right, 3: right, 4: right },
        );
      }

      // ── Finance (finance levels only) ─────────────────────────────
      if (showFinance) {
        section('Finance Summary', 'Voided entries are not counted');
        table(
          ['', 'Amount'],
          [['Total income', peso(totalIncome)], ['Total expenses', peso(totalExpense)], ['Net balance', peso(balance)]],
          { 1: { halign: 'right', fontStyle: 'bold' } },
        );

        if (monthlyTotals.length) {
          section('Monthly Income and Expenses', 'Last 7 months');
          const monthRows = monthlyTotals.map((m) => [m.month, peso(m.income), peso(m.expense), peso(m.income - m.expense)]);
          table(['Month', 'Income', 'Expenses', 'Net'], monthRows, { 1: right, 2: right, 3: { halign: 'right', fontStyle: 'bold' } }, {
            didParseCell: (data) => {
              if (data.section === 'body' && data.column.index === 3) {
                const m = monthlyTotals[data.row.index];
                data.cell.styles.textColor = m && m.income - m.expense < 0 ? ROSE : POS;
              }
            },
          });
        }

        section('Recent Transactions');
        const txRows = recentTransactions.length
          ? recentTransactions.map((tx) => [
              tx.date_recorded ? fmtDate(tx.date_recorded) : '—',
              tx.type === 'income' ? 'Income' : 'Expense',
              `${tx.type === 'expense' ? '-' : '+'}${peso(tx.amount)}`,
            ])
          : [['—', 'No transactions recorded yet.', '—']];
        table(['Date', 'Type', 'Amount'], txRows, { 2: { halign: 'right', fontStyle: 'bold' } }, {
          didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 2) {
              const raw = txRows[data.row.index]?.[2];
              if (raw?.startsWith('-')) data.cell.styles.textColor = ROSE;
              else if (raw?.startsWith('+')) data.cell.styles.textColor = POS;
            }
          },
        });
      }

      // ── Footer on every page ──────────────────────────────────────
      const pageCount = doc.internal.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setDrawColor(...LINE);
        doc.line(marginX, pageHeight - 38, pageWidth - marginX, pageHeight - 38);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...SUBTLE);
        doc.text(`GGCF-GMI · ${branchText} · For church leadership use only`, marginX, pageHeight - 24);
        doc.text(`Page ${p} of ${pageCount}`, pageWidth - marginX, pageHeight - 24, { align: 'right' });
      }

      if (lastBlobUrl.current) URL.revokeObjectURL(lastBlobUrl.current);
      const blobUrl = URL.createObjectURL(doc.output('blob'));
      lastBlobUrl.current = blobUrl;

      if (newTab && !newTab.closed) {
        newTab.location.href = blobUrl;
      } else {
        // Popup was blocked (or the user closed it while it generated) — fall back to a download.
        doc.save(`church-report-${phToday()}.pdf`);
      }
    } catch (err) {
      console.error('PDF export error:', err);
      // Report the error inside the tab the user is now looking at, rather
      // than alert()-ing the original (now-backgrounded) tab where it's
      // easy to miss.
      if (newTab && !newTab.closed) {
        newTab.document.open();
        newTab.document.write(
          `<title>Export failed</title><body style="font:14px -apple-system,sans-serif;padding:48px;color:#b91c1c">Could not generate the report. Please close this tab and try again.</body>`
        );
        newTab.document.close();
      } else {
        alertDialog('Could not generate the PDF. ' + friendlyError(err, 'Please try again.'));
      }
    } finally {
      setExporting(false);
    }
  }

  const balance = totalIncome - totalExpense;
  const attendanceRate = totalMembers > 0
    ? Math.round((activeMembers / totalMembers) * 100)
    : 0;

  const summaryCards = showFinance ? [
          {
            label: "Total Balance",
            val: loading ? "..." : peso(balance),
            sub: "Income minus expenses",
            up: balance >= 0,
            icon: Wallet,
            color: A(dark, "blue"),
          },
          {
            label: "Active Members",
            val: loading ? "..." : activeMembers.toString(),
            sub: `${attendanceRate}% of ${totalMembers} total`,
            up: true,
            icon: Users,
            color: A(dark, "indigo"),
          },
          {
            label: "Total Events",
            val: loading ? "..." : totalEvents.toString(),
            sub: `${upcomingEvents} upcoming`,
            up: true,
            icon: Calendar,
            color: A(dark, "pink"),
          },
          {
            label: "Total Expenses",
            val: loading ? "..." : peso(totalExpense),
            sub: "All recorded expenses",
            up: false,
            icon: TrendingDown,
            color: A(dark, "rose"),
          },
  ] : [
          {
            label: "Active Members",
            val: loading ? "..." : activeMembers.toString(),
            sub: `${attendanceRate}% of ${totalMembers} total`,
            up: true,
            icon: Users,
            color: A(dark, "indigo"),
          },
          {
            label: "Inactive Members",
            val: loading ? "..." : inactiveMembers.toString(),
            sub: "Not archived, not active",
            up: false,
            icon: UserMinus,
            color: A(dark, "rose"),
          },
          {
            label: "Total Events",
            val: loading ? "..." : totalEvents.toString(),
            sub: "All recorded events",
            up: true,
            icon: Calendar,
            color: A(dark, "pink"),
          },
          {
            label: "Upcoming Events",
            val: loading ? "..." : upcomingEvents.toString(),
            sub: "From today onward",
            up: true,
            icon: CalendarClock,
            color: A(dark, "emerald"),
          },
  ];

  const maxStatus = Math.max(...EVENT_STATUSES.map((st) => eventsByStatus[st.key] || 0), 1);

  // Bar chart: normalize heights
  const maxMonthly = Math.max(...monthlyTotals.map(m => Math.max(m.income, m.expense)), 1);

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen ${t.pageBg} ${t.textPrimary} transition-colors duration-200`}>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <p className={`text-[10px] uppercase tracking-widest ${t.textFaint} mb-1`}>{churchLabel || <BranchLabel />}</p>
          <h1 className={`text-3xl font-black ${t.textPrimary} tracking-tight`}>Reports & Analytics</h1>
          <p className={`${t.textMuted} text-sm mt-0.5`}>
            {loading
              ? 'Syncing live data...'
              : updatedAt
                ? `Live data from all church modules · updated ${updatedAt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`
                : 'Live data from all church modules.'}
          </p>
          {loadError && <p className={`${A(dark, "rose")} text-sm mt-1`}>{loadError}</p>}
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-full border ${t.iconBtn} transition-colors shrink-0`}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {isGlobal && churches.length > 1 && (
            <select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch"
              className={`px-3 py-2 rounded-xl text-sm font-bold border flex-1 sm:flex-none ${t.toolbarBtn}`}>
              <option value="all">All branches</option>
              {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={loading}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border disabled:opacity-50 flex-1 sm:flex-none ${t.toolbarBtn}`}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            onClick={handleExportPDF}
            disabled={exporting || loading}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-900/20 flex-1 sm:flex-none"
          >
            <Download className="w-4 h-4" /> {exporting ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {summaryCards.map((s, i) => (
          <div key={i} className={`${t.cardBg} border ${t.cardBorder} rounded-3xl p-6 relative overflow-hidden group`}>
            <s.icon className="absolute -right-2 -bottom-2 w-16 h-16 text-white/3 group-hover:text-blue-500/10 transition-colors" />
            <p className={`text-[10px] uppercase font-bold tracking-widest ${t.textSub} mb-2`}>{s.label}</p>
            <p className={`text-2xl font-black ${s.color}`}>{s.val}</p>
            <p className={`text-xs mt-1 flex items-center gap-1 font-medium ${s.up ? A(dark, "emerald") : A(dark, "rose")}`}>
              {s.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {s.sub}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

        {/* Events by Status (levels without finance) */}
        {!showFinance && (
          <div className={`lg:col-span-2 ${t.cardBg} border ${t.cardBorder} rounded-3xl p-6`}>
            <h3 className={`text-sm font-black ${t.textPrimary} uppercase tracking-widest flex items-center gap-2 mb-6 border-b ${t.divider} pb-4`}>
              <Calendar className={`w-4 h-4 ${A(dark, "pink")}`} /> Events by Status
            </h3>
            {loading ? (
              <p className={`${t.textFaint} text-sm text-center py-8`}>Syncing...</p>
            ) : totalEvents === 0 ? (
              <div className={`py-10 text-center border border-dashed ${t.dashed} rounded-2xl`}>
                <p className={`${t.textFaint} text-sm`}>No events yet.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {EVENT_STATUSES.map((st) => {
                  const n = eventsByStatus[st.key] || 0;
                  return (
                    <div key={st.key}>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className={`${t.textMuted} font-medium`}>{st.label}</span>
                        <span className={`${t.textPrimary} font-black`}>{n}</span>
                      </div>
                      <div className={`w-full h-2 ${t.trackBg} rounded-full overflow-hidden`}>
                        <div className={`h-full ${st.bar} rounded-full transition-all duration-700`} style={{ width: `${(n / maxStatus) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Income vs Expense Bar Chart */}
        {showFinance && (
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
                <span className="w-2 h-2 rounded-full bg-rose-500" /> Expense
              </span>
            </div>
          </div>

          {loading ? (
            <div className="h-48 flex items-center justify-center">
              <p className={`${t.textFaint} text-sm`}>Syncing...</p>
            </div>
          ) : monthlyTotals.length === 0 ? (
            <div className={`h-48 flex items-center justify-center border border-dashed ${t.dashed} rounded-2xl`}>
              <p className={`${t.textFaint} text-sm`}>No transaction data yet.</p>
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
                  <span className={`text-[9px] ${t.textFaint} font-bold`}>{m.month}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Members by Ministry */}
        <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl p-6`}>
          <h3 className={`text-sm font-black ${t.textPrimary} uppercase tracking-widest flex items-center gap-2 mb-5 border-b ${t.divider} pb-4`}>
            <Users className={`w-4 h-4 ${A(dark, "indigo")}`} /> Members by Ministry
          </h3>
          {loading ? (
            <p className={`${t.textFaint} text-sm text-center py-8`}>Syncing...</p>
          ) : membersByMinistry.length === 0 ? (
            <p className={`${t.textFaint} text-sm text-center py-8`}>No member data yet.</p>
          ) : (
            <div className="space-y-4">
              {membersByMinistry.map((m) => {
                const pct = totalMembers > 0 ? Math.round((m.count / totalMembers) * 100) : 0;
                return (
                  <div key={m.name}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className={`${t.textMuted} font-medium truncate max-w-[140px]`}>{m.name}</span>
                      <span className={`${t.textPrimary} font-black`}>{m.count} <span className={`${t.textFaint} font-normal`}>({pct}%)</span></span>
                    </div>
                    <div className={`w-full h-1.5 ${t.trackBg} rounded-full overflow-hidden`}>
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

          <div className={`mt-6 pt-4 border-t ${t.divider} grid grid-cols-2 gap-3`}>
            <div className={`${t.deepCard} rounded-2xl p-3 text-center`}>
              <p className={`text-xl font-black ${t.textPrimary}`}>{loading ? '...' : totalMembers}</p>
              <p className={`text-[10px] ${t.textSub} mt-0.5 uppercase tracking-wider`}>Total</p>
            </div>
            <div className={`${t.deepCard} rounded-2xl p-3 text-center`}>
              <p className={`text-xl font-black ${A(dark, "emerald")}`}>{loading ? '...' : activeMembers}</p>
              <p className={`text-[10px] ${t.textSub} mt-0.5 uppercase tracking-wider`}>Active</p>
            </div>
          </div>
        </div>
      </div>

      <NewMembersTrend t={t} dark={dark} reloadKey={reloadKey} church={church} />

      {can(role, 'attendance') && <EventAttendanceReport t={t} dark={dark} reloadKey={reloadKey} church={church} canTake={can(role, 'attendance', 'edit')} />}

      {/* Finance Summary + Recent Transactions (finance levels only) */}
      {showFinance && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Income vs Expense Summary */}
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
                  <span className={`font-black ${item.textColor}`}>
                    {loading ? '...' : peso(item.value)}
                  </span>
                </div>
                <div className={`w-full h-1.5 ${t.trackBg} rounded-full overflow-hidden`}>
                  <div
                    className={`h-full ${item.color} rounded-full`}
                    style={{ width: totalIncome > 0 ? `${Math.min((Math.abs(item.value) / totalIncome) * 100, 100)}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-blue-600/5 border border-blue-500/20 rounded-2xl">
            <p className={`text-[10px] ${A(dark, "blue")} font-bold uppercase mb-1`}>Stewardship Note</p>
            <p className={`text-xs ${t.textSub} leading-relaxed`}>
              Financial transparency is maintained across all fund categories as per GGCF-GMI policy.
            </p>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className={`lg:col-span-2 ${t.cardBg} border ${t.cardBorder} rounded-3xl p-6`}>
          <h3 className={`text-sm font-black ${t.textPrimary} uppercase tracking-widest flex items-center gap-2 mb-5 border-b ${t.divider} pb-4`}>
            <TrendingUp className={`w-4 h-4 ${A(dark, "emerald")}`} /> Recent Transactions
          </h3>
          {loading ? (
            <p className={`${t.textFaint} text-sm text-center py-8`}>Syncing...</p>
          ) : recentTransactions.length === 0 ? (
            <div className={`py-10 text-center border border-dashed ${t.dashed} rounded-2xl`}>
              <p className={`${t.textFaint} text-sm`}>No transactions recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentTransactions.map((tx, i) => (
                <div key={i} className={`flex items-center justify-between py-2.5 px-4 rounded-2xl ${t.rowBg} ${t.rowHover} transition-colors`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${tx.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <div>
                      <p className={`text-sm font-semibold ${t.textPrimary} capitalize`}>{tx.type}</p>
                      <p className={`text-[10px] ${t.textFaint}`}>
                        {tx.date_recorded
                          ? new Date(tx.date_recorded).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </p>
                    </div>
                  </div>
                  <p className={`text-sm font-black font-mono ${tx.type === 'income' ? A(dark, "emerald") : A(dark, "rose")}`}>
                    {tx.type === 'expense' ? '−' : '+'}{peso(tx.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

// ─── Monthly trend chart ───────────────────────────────────────────────────
// One series of columns, oldest month on the left. Columns are capped at
// 24px with a rounded top, on hairline gridlines; the latest month carries
// its value, the rest show theirs on hover or keyboard focus, and every
// value is also in the "Show as table" view.
//   points: [{ key, label, sub, value, detail }]  label = "Oct", sub = "'26" or ""
function niceMax(v) {
  if (v <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * step).find((n) => n >= v) || v;
}

function MonthlyColumns({ t, points, color, unit, ariaLabel }) {
  const [hover, setHover] = useState(null);
  const top = niceMax(Math.max(...points.map((p) => p.value), 0));
  const ticks = [top, top / 2, 0];
  const fmt = (n) => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1));
  const last = points.length - 1;

  return (
    <div>
      <div className="flex gap-2" role="group" aria-label={ariaLabel}>
        {/* Y axis */}
        <div className={`flex flex-col justify-between h-44 text-[10px] tabular-nums ${t.textSub} text-right shrink-0 -mt-1.5`} aria-hidden="true">
          {ticks.map((v) => <span key={v}>{fmt(v)}</span>)}
        </div>
        <div className="relative flex-1 min-w-0">
          {/* Gridlines */}
          <div className="absolute inset-x-0 top-0 h-44 flex flex-col justify-between pointer-events-none" aria-hidden="true">
            {ticks.map((v) => <div key={v} className={`border-t ${t.divider}`} />)}
          </div>
          {/* Columns */}
          <div className="relative h-44 flex items-end">
            {points.map((p, i) => {
              const h = top > 0 ? (p.value / top) * 100 : 0;
              const show = hover === i;
              return (
                <button
                  key={p.key}
                  type="button"
                  className="relative flex-1 h-full flex items-end justify-center focus:outline-none group"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  aria-label={`${p.label} ${p.sub || ''}: ${fmt(p.value)} ${unit}${p.detail ? `, ${p.detail}` : ''}`}
                >
                  {/* Value on the latest month */}
                  {i === last && !show && (
                    <span className={`absolute text-[10px] font-bold tabular-nums ${t.textPrimary}`} style={{ bottom: `calc(${h}% + 4px)` }}>
                      {fmt(p.value)}
                    </span>
                  )}
                  <span
                    className={`block w-full max-w-[24px] mx-[1px] rounded-t ${color} transition-opacity ${hover !== null && !show ? 'opacity-50' : ''} group-focus-visible:ring-2 group-focus-visible:ring-blue-400`}
                    style={{ height: p.value > 0 ? `max(${h}%, 2px)` : '0' }}
                  />
                  {show && (
                    <span className={`absolute z-10 px-2.5 py-1.5 rounded-lg shadow-lg border text-left whitespace-nowrap pointer-events-none ${t.modalBg} ${t.modalBorder}`}
                      style={{ bottom: `calc(${h}% + 6px)`, left: i > points.length / 2 ? 'auto' : '50%', right: i > points.length / 2 ? '50%' : 'auto' }}>
                      <span className={`block text-sm font-black tabular-nums ${t.textPrimary}`}>{fmt(p.value)} <span className="text-[10px] font-semibold">{unit}</span></span>
                      <span className={`block text-[10px] ${t.textSub}`}>{p.monthName}{p.detail ? ` · ${p.detail}` : ''}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {/* Baseline + month labels */}
          <div className={`border-t ${t.cardBorder}`} />
          <div className="flex" aria-hidden="true">
            {points.map((p) => (
              <span key={p.key} className={`flex-1 text-center text-[9px] font-bold leading-tight pt-1 ${t.textSub}`}>
                {p.label}{p.sub && <span className="block font-normal">{p.sub}</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
      <details className="mt-3">
        <summary className={`text-[11px] font-semibold cursor-pointer ${t.textSub}`}>Show as table</summary>
        <table className="w-full mt-2 text-xs">
          <thead><tr className={`text-left ${t.textSub}`}><th className="py-1 font-semibold">Month</th><th className="py-1 font-semibold text-right">{unit}</th></tr></thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.key} className={`border-t ${t.divider} ${t.textPrimary}`}>
                <td className="py-1">{p.monthName}{p.detail ? <span className={t.textSub}> · {p.detail}</span> : ''}</td>
                <td className="py-1 text-right font-bold tabular-nums">{fmt(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// "2026-10-01" → the fields MonthlyColumns shows. The year rides under
// January and the first month.
function monthPoint(isoMonth, i) {
  const d = new Date(`${isoMonth.slice(0, 7)}-01T00:00:00`);
  return {
    key: isoMonth.slice(0, 7),
    label: d.toLocaleDateString('en-PH', { month: 'short' }),
    sub: i === 0 || d.getMonth() === 0 ? `'${String(d.getFullYear()).slice(2)}` : '',
    monthName: d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
  };
}

// The last n months, oldest first, as "YYYY-MM" (Philippine date).
function lastMonths(n) {
  const [y, m] = phToday().split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

// New members per month (db/076): by the date each member joined.
// church: one branch (db/083), or null for every branch the caller sees.
function NewMembersTrend({ t, dark, reloadKey, church }) {
  const [state, setState] = useState({ rows: null, error: '' });
  useEffect(() => {
    const args = church ? { p_months: 12, p_church: church } : { p_months: 12 };
    supabase.rpc('member_join_trend', args).then(({ data, error }) => setState({
      rows: error ? [] : data || [],
      error: !error ? ''
        : /does not exist|schema cache|Could not find/i.test(error.message)
          ? `Not set up yet — ask the administrator to run ${church ? 'db/083_join_trend_by_branch.sql' : 'db/076_member_joined_on.sql'}.`
          : friendlyError(error, 'Could not load new members.'),
    }));
  }, [reloadKey, church]);

  const rows = state.rows || [];
  const points = rows.map((r, i) => ({ ...monthPoint(r.month, i), value: r.joined }));
  const total = rows.reduce((a, r) => a + r.joined, 0);
  const thisMonth = rows.at(-1)?.joined ?? 0;
  const prevMonth = rows.at(-2)?.joined ?? 0;

  return (
    <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl p-6 mb-6`}>
      <h3 className={`text-sm font-black ${t.textPrimary} uppercase tracking-widest flex items-center gap-2 mb-5 border-b ${t.divider} pb-4`}>
        <UserPlus className={`w-4 h-4 ${A(dark, "indigo")}`} /> New Members per Month
        <span className={`ml-auto text-[10px] ${t.textSub} normal-case tracking-normal font-semibold`}>Last 12 months · by date joined</span>
      </h3>
      {state.rows === null ? (
        <p className={`${t.textFaint} text-sm text-center py-8`}>Syncing...</p>
      ) : state.error ? (
        <p className={`text-sm ${A(dark, "rose")} py-4`}>{state.error}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="grid grid-cols-3 lg:grid-cols-1 gap-3 content-start">
            {[
              { label: 'This month', value: thisMonth, note: `${prevMonth} last month` },
              { label: 'Last 12 months', value: total },
              { label: 'Average per month', value: Math.round((total / 12) * 10) / 10 },
            ].map((c) => (
              <div key={c.label} className={`${t.deepCard} rounded-2xl p-3 text-center`}>
                <p className={`text-xl font-black ${t.textPrimary}`}>{c.value}</p>
                <p className={`text-[10px] ${t.textSub} mt-0.5 uppercase tracking-wider`}>{c.label}</p>
                {c.note && <p className={`text-[10px] ${t.textFaint} mt-0.5`}>{c.note}</p>}
              </div>
            ))}
          </div>
          <div className="lg:col-span-3">
            {total === 0 ? (
              <div className={`h-44 flex items-center justify-center border border-dashed ${t.dashed} rounded-2xl`}>
                <p className={`${t.textFaint} text-sm`}>Nobody joined in the last 12 months.</p>
              </div>
            ) : (
              <MonthlyColumns t={t} points={points} color="bg-indigo-500" unit="joined"
                ariaLabel="New members per month, last 12 months" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Event attendance (db/041): the last 90 days at a glance, and the most
// recent events whose attendance was taken.
function EventAttendanceReport({ t, dark, reloadKey, church, canTake }) {
  const [{ events, since }, setReport] = useState({ events: null, since: '' });
  useEffect(() => {
    supabase.rpc('attendance_events', { p_church: church }).then(({ data }) => setReport({
      events: data || [],
      since: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
    }));
  }, [reloadKey, church]);

  const taken = (events || []).filter((e) => e.members_present + e.visitors > 0);
  const recent = taken.filter((e) => e.date >= since);
  const possible = recent.reduce((a, e) => a + e.active_members, 0);
  const rate = possible ? Math.round((recent.reduce((a, e) => a + e.members_present, 0) / possible) * 100) : null;
  const avgTotal = recent.length ? Math.round(recent.reduce((a, e) => a + e.members_present + e.visitors, 0) / recent.length) : null;
  const visitors = recent.reduce((a, e) => a + e.visitors, 0);
  const pct = (e) => (e.active_members ? Math.min(100, Math.round((e.members_present / e.active_members) * 100)) : 0);
  const date = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

  // Trend: average attendance (members + visitors) per event, each of the
  // last 12 months — only events whose attendance was taken count.
  const trend = lastMonths(12).map((month, i) => {
    const inMonth = taken.filter((e) => String(e.date).slice(0, 7) === month);
    const people = inMonth.reduce((a, e) => a + e.members_present + e.visitors, 0);
    return {
      ...monthPoint(month, i),
      value: inMonth.length ? Math.round((people / inMonth.length) * 10) / 10 : 0,
      detail: inMonth.length ? `${inMonth.length} event${inMonth.length === 1 ? '' : 's'}` : 'no attendance taken',
    };
  });
  const trendHasData = trend.some((p) => p.value > 0);

  return (
    <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl p-6 mb-8`}>
      <h3 className={`text-sm font-black ${t.textPrimary} uppercase tracking-widest flex items-center gap-2 mb-5 border-b ${t.divider} pb-4`}>
        <UserCheck className={`w-4 h-4 ${A(dark, "blue")}`} /> Event Attendance
        <Link href="/dashboard/attendance" className={`ml-auto text-[10px] ${A(dark, "blue")} normal-case tracking-normal font-bold hover:underline`}>{canTake ? 'Take attendance' : 'View attendance'} →</Link>
      </h3>
      {events === null ? (
        <p className={`${t.textFaint} text-sm text-center py-8`}>Syncing...</p>
      ) : taken.length === 0 ? (
        <div className={`py-10 text-center border border-dashed ${t.dashed} rounded-2xl`}>
          <p className={`${t.textFaint} text-sm`}>No attendance taken yet. After an event, open Attendance and tick who came.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="grid grid-cols-3 lg:grid-cols-1 gap-3 content-start">
            {[
              { label: 'Attendance rate · 90 days', value: rate === null ? '—' : `${rate}%` },
              { label: 'Average per event', value: avgTotal ?? '—' },
              { label: 'Visitors · 90 days', value: visitors },
            ].map((c) => (
              <div key={c.label} className={`${t.deepCard} rounded-2xl p-3 text-center`}>
                <p className={`text-xl font-black ${t.textPrimary}`}>{c.value}</p>
                <p className={`text-[10px] ${t.textSub} mt-0.5 uppercase tracking-wider`}>{c.label}</p>
              </div>
            ))}
          </div>
          <div className="lg:col-span-2 space-y-4">
            {taken.slice(0, 6).map((e) => (
              <div key={e.id}>
                <div className="flex justify-between gap-3 text-xs mb-1.5">
                  <span className={`${t.textMuted} font-medium truncate`}>{e.title} <span className={t.textFaint}>· {date(e.date)}</span></span>
                  <span className={`${t.textPrimary} font-black whitespace-nowrap`}>
                    {e.members_present} <span className={`${t.textFaint} font-normal`}>+ {e.visitors} visitors ({pct(e)}%)</span>
                  </span>
                </div>
                <div className={`w-full h-1.5 ${t.trackBg} rounded-full overflow-hidden`}>
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-700" style={{ width: `${pct(e)}%` }} />
                </div>
              </div>
            ))}
          </div>
          {trendHasData && (
            <div className={`lg:col-span-3 pt-5 border-t ${t.divider}`}>
              <p className={`text-[10px] uppercase tracking-widest font-bold ${t.textSub} mb-4`}>
                Average attendance per event · last 12 months
              </p>
              <MonthlyColumns t={t} points={trend} color="bg-blue-500" unit="people per event"
                ariaLabel="Average attendance per event by month, last 12 months" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
