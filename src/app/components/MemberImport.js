'use client';

import { useState } from 'react';
import { supabase } from '@/app/lib/supabase';
import { X, Upload, Download, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

import { friendlyError, UserError } from '@/app/lib/errors';
import { phToday } from '@/app/lib/phDate';
import { useDialog } from '@/app/lib/useDialog';
// Secretary: add many members at once from an Excel (.xlsx) file, using
// the template in public/templates (Members sheet + a Choices sheet).
// The file is read in the browser, every row is checked and shown in a
// preview, and only good rows are added — to the Secretary's own branch,
// by the same database rules as adding one member by hand. Possible
// duplicates (same name already in the branch, or twice in the file) are
// skipped unless the Secretary ticks "import them anyway". Ministries are
// not imported: the Pastor or a ministry's head assigns them (Ministries
// page); a Ministry column in an old file is simply ignored.

const TEMPLATE_URL = '/templates/faithsync-members-template.xlsx';
// The template's example row; skipped if someone forgets to delete it.
const EXAMPLE_NAME = 'juan dela cruz';
const EXAMPLE_EMAIL = 'juan@example.com';
const ROLES = ['pastor', 'leader', 'member', 'volunteer'];
const STATUSES = ['active', 'busy', 'inactive'];
const MAX_ROWS = 1000;
const BATCH = 100;

// Header text in the file → our field. Forgiving about wording and case.
const HEADER_ALIASES = {
  full_name: ['full name', 'fullname', 'name', 'member name', 'pangalan'],
  role: ['role'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'contact', 'contact number', 'cellphone'],
  email: ['email', 'e-mail', 'email address'],
  status: ['status'],
  birth_date: ['birthday', 'birth date', 'birthdate', 'date of birth', 'dob', 'kaarawan'],
  joined_on: ['date joined', 'joined', 'joined on', 'member since', 'membership date'],   // optional (db/076)
};

const norm = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
const nameKey = (v) => norm(v).toLowerCase();

async function readRows(file) {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new UserError('Please choose the Excel file (.xlsx) made from the template. Older .xls files: open in Excel and "Save As" Excel Workbook (.xlsx) first.');
  }
  const { readSheet } = await import('read-excel-file/browser');
  return readSheet(file);   // the first sheet — "Members" in the template
}

const pad = (n) => String(n).padStart(2, '0');

// A birthday cell can be a real Excel date, an Excel date serial number, or
// typed text (2024-05-14, 5/14/1990, May 14 1990). Returns 'YYYY-MM-DD',
// '' when the cell is blank, or null when it can't be understood.
function parseBirthday(cell) {
  if (cell === null || cell === undefined || String(cell).trim() === '') return '';
  let y, m, d;
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return null;
    // Excel dates arrive as UTC midnight; anything else is a local time.
    const utc = cell.getUTCHours() === 0 && cell.getUTCMinutes() === 0;
    [y, m, d] = utc
      ? [cell.getUTCFullYear(), cell.getUTCMonth() + 1, cell.getUTCDate()]
      : [cell.getFullYear(), cell.getMonth() + 1, cell.getDate()];
  } else if (typeof cell === 'number') {
    const dt = new Date(Math.round((cell - 25569) * 86400 * 1000));
    [y, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  } else {
    const s = String(cell).trim();
    let mt;
    if ((mt = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) {
      [y, m, d] = [+mt[1], +mt[2], +mt[3]];
    } else if ((mt = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) {
      [y, m, d] = [+mt[3], +mt[1], +mt[2]];            // month first, as is usual here
      if (m > 12 && d <= 12) [m, d] = [d, m];          // 25/12/1990 → day first
    } else {
      const dt = new Date(s + ' UTC');
      if (Number.isNaN(dt.getTime())) return null;
      [y, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
    }
  }
  const check = new Date(Date.UTC(y, m - 1, d));
  const real = check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
  if (!real || y < 1900 || check.getTime() > Date.now()) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// Excel stores 09171234567 as the number 9171234567; put the 0 back.
function fixPhone(v) {
  let s = norm(v);
  if (/^9\d{9}$/.test(s)) s = '0' + s;
  return s;
}

function checkRows(rows, existingNames) {
  const header = (rows[0] || []).map((h) => nameKey(h));
  const col = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const i = header.findIndex((h) => aliases.includes(h));
    if (i >= 0) col[field] = i;
  }
  if (col.full_name === undefined) {
    throw new UserError('The first row must have the column headings, including "Full name". Use the template.');
  }

  const seen = new Set();
  const out = [];

  rows.slice(1).forEach((cells, idx) => {
    const get = (f) => (col[f] === undefined ? '' : norm(cells[col[f]]));
    if (!cells.some((c) => norm(c))) return;   // blank line

    const r = {
      line: idx + 2,
      full_name: get('full_name'),
      role: get('role').toLowerCase(),
      phone: col.phone === undefined ? '' : fixPhone(cells[col.phone]),
      email: get('email').toLowerCase(),
      status: get('status').toLowerCase() || 'active',
      birth_date: '',
      joined_on: '',
      errors: [],
      warnings: [],
    };

    if (nameKey(r.full_name) === EXAMPLE_NAME && r.email === EXAMPLE_EMAIL) {
      r.errors.push("This is the template's example row");
    }
    if (col.birth_date !== undefined) {
      const b = parseBirthday(cells[col.birth_date]);
      if (b === null) r.errors.push(`Birthday "${norm(cells[col.birth_date])}" — use YYYY-MM-DD, e.g. 1990-05-14`);
      else r.birth_date = b;
    }
    // Same date rules as the birthday (a real date, not in the future).
    if (col.joined_on !== undefined) {
      const j = parseBirthday(cells[col.joined_on]);
      if (j === null) r.errors.push(`Date joined "${norm(cells[col.joined_on])}" — use YYYY-MM-DD, e.g. 2024-01-07`);
      else r.joined_on = j;
    }
    if (!r.full_name) r.errors.push('Full name is missing');
    if (r.role && !ROLES.includes(r.role)) r.errors.push(`Role "${get('role')}" — use ${ROLES.join(', ')}`);
    if (!STATUSES.includes(r.status)) r.errors.push(`Status "${get('status')}" — use ${STATUSES.join(', ')}`);
    if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) r.errors.push('Email looks wrong');

    const key = nameKey(r.full_name);
    if (key) {
      if (existingNames.has(key)) r.warnings.push('Already a member with this name');
      else if (seen.has(key)) r.warnings.push('Twice in this file');
      seen.add(key);
    }
    out.push(r);
  });
  return out;
}

export default function MemberImport({ t, existingMembers, onClose, onImported }) {
  const [fileName, setFileName]     = useState('');
  const [reading, setReading]       = useState(false);
  const [rows, setRows]             = useState(null);
  const [error, setError]           = useState('');
  const [includeDupes, setIncludeDupes] = useState(false);
  const [importing, setImporting]   = useState(false);
  const [result, setResult]         = useState(null);   // { added, failed: [{line, reason}] }

  async function handleFile(file) {
    if (!file) return;
    setFileName(file.name);
    setError('');
    setRows(null);
    setResult(null);
    setReading(true);
    try {
      const raw = await readRows(file);
      if (raw.length - 1 > MAX_ROWS) throw new UserError(`That file has more than ${MAX_ROWS} rows. Please split it.`);
      const existing = new Set(existingMembers.map((m) => nameKey(m.full_name)));
      const checked = checkRows(raw, existing);
      if (!checked.length) throw new UserError('No member rows found under the headings.');
      setRows(checked);
    } catch (err) {
      setError(friendlyError(err, 'Could not read that file. Please use the Excel template.'));
    } finally {
      setReading(false);
    }
  }

  const good  = rows?.filter((r) => !r.errors.length && !r.warnings.length) || [];
  const dupes = rows?.filter((r) => !r.errors.length && r.warnings.length) || [];
  const bad   = rows?.filter((r) => r.errors.length) || [];
  const toImport = includeDupes ? [...good, ...dupes] : good;

  async function handleImport() {
    if (!toImport.length) return;
    setImporting(true);
    const failed = [];
    let added = 0;
    // Only send birth_date when the file has any, so importing still works
    // for a file without the column (or before db/026 is run).
    const withBirthdays = toImport.some((r) => r.birth_date);
    // Same for the date joined (db/076); a blank cell gets today.
    const withJoined = toImport.some((r) => r.joined_on);
    for (let i = 0; i < toImport.length; i += BATCH) {
      const chunk = toImport.slice(i, i + BATCH);
      const { data, error: insertError } = await supabase
        .from('members')
        .insert(chunk.map((r) => ({
          full_name: r.full_name,
          role: r.role || null,
          phone: r.phone || null,
          email: r.email || null,
          status: r.status,
          ...(withBirthdays ? { birth_date: r.birth_date || null } : {}),
          // A batch insert leaves a column out of a row as empty, not its
          // default — so a blank cell sends today itself.
          ...(withJoined ? { joined_on: r.joined_on || phToday() } : {}),
        })))
        .select('id');
      if (insertError) chunk.forEach((r) => failed.push({ line: r.line, reason: friendlyError(insertError) }));
      else added += data?.length || 0;
    }
    setImporting(false);
    setResult({ added, failed, skipped: bad.length + (includeDupes ? 0 : dupes.length) });
    if (added) onImported?.();
  }

  const badge = (r) => r.errors.length
    ? <span className="flex items-center gap-1 text-rose-400"><XCircle size={13} /> {r.errors.join('; ')}</span>
    : r.warnings.length
      ? <span className="flex items-center gap-1 text-orange-400"><AlertTriangle size={13} /> {r.warnings.join('; ')}</span>
      : <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 size={13} /> OK</span>;

  // Pop-ups: focus, Tab, Esc and a name for screen readers (lib/useDialog).
  const importDialogRef = useDialog(true, () => { if (!importing) onClose(); });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div ref={importDialogRef} role="dialog" aria-modal="true" aria-label="Import members" className={`${t.modalBg} border ${t.modalBorder} rounded-2xl w-full max-w-4xl p-6 shadow-2xl mx-4 max-h-[90vh] flex flex-col`}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className={`text-lg font-black ${t.textPrimary}`}>Import members</h2>
            <p className={`text-xs ${t.textSub} mt-1`}>From an Excel file (.xlsx). Members are added to your branch.</p>
          </div>
          <button aria-label="Close" onClick={onClose} className={`${t.textSub} hover:text-blue-400`}><X size={18} /></button>
        </div>

        {/* Step 1: template + file */}
        {!result && (
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <a href={TEMPLATE_URL} download
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border ${t.iconBtn}`}>
              <Download size={15} /> Download Excel template
            </a>
            <label className={`flex-1 flex items-center justify-center gap-2 border border-dashed rounded-xl py-2.5 px-4 text-sm font-bold cursor-pointer ${t.inputBorder} ${t.textSub} hover:text-blue-400 ${reading || importing ? 'opacity-50 pointer-events-none' : ''}`}>
              {reading ? <><Loader2 size={15} className="animate-spin" /> Reading...</> : <><Upload size={15} /> {fileName || 'Choose the filled-in file'}</>}
              <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
                onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
        )}

        {error && <p className="mb-4 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{error}</p>}

        {!rows && !error && !result && (
          <div className={`text-xs ${t.textSub} leading-relaxed space-y-1`}>
            <p>1. Download the Excel template and fill in the <span className="font-bold">Members</span> sheet, one person per row. Only <span className="font-bold">Full name</span> is required. The <span className="font-bold">Choices</span> sheet lists the words to use.</p>
            <p>2. <span className="font-bold">Role:</span> {ROLES.join(', ')}. <span className="font-bold">Status:</span> {STATUSES.join(', ')} (blank = active).</p>
            <p>3. <span className="font-bold">Birthday</span> (optional): write it as YYYY-MM-DD, like 1990-05-14. A normal Excel date works too.</p>
            <p>4. Ministries aren&apos;t imported — the Pastor or each ministry&apos;s head adds members on the Ministries page.</p>
            <p>5. Save it, then choose the file here. You&apos;ll see a preview before anything is added.</p>
          </div>
        )}

        {/* Step 2: preview */}
        {rows && !result && (
          <>
            <div className="flex flex-wrap gap-4 text-xs font-bold mb-3">
              <span className="text-emerald-400">{good.length} ready</span>
              <span className="text-orange-400">{dupes.length} possible duplicate{dupes.length === 1 ? '' : 's'}</span>
              <span className="text-rose-400">{bad.length} with problems (will be skipped)</span>
            </div>
            <div className={`flex-1 overflow-auto border ${t.cardBorder} rounded-xl`}>
              <table className="w-full text-left text-xs">
                <thead className={`${t.tableHeadBg} ${t.textSub} uppercase tracking-widest text-[10px] sticky top-0`}>
                  <tr>
                    <th className="px-3 py-2">Row</th><th className="px-3 py-2">Full name</th><th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Phone</th><th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Birthday</th><th className="px-3 py-2">Joined</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Check</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${t.divider}`}>
                  {rows.map((r) => (
                    <tr key={r.line} className={t.textPrimary}>
                      <td className={`px-3 py-2 ${t.textMuted}`}>{r.line}</td>
                      <td className="px-3 py-2 font-semibold">{r.full_name || '—'}</td>
                      <td className="px-3 py-2 capitalize">{r.role || '—'}</td>
                      <td className="px-3 py-2">{r.phone || '—'}</td>
                      <td className="px-3 py-2">{r.email || '—'}</td>
                      <td className="px-3 py-2">{r.birth_date || '—'}</td>
                      <td className="px-3 py-2">{r.joined_on || 'Today'}</td>
                      <td className="px-3 py-2 capitalize">{r.status}</td>
                      <td className="px-3 py-2">{badge(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {dupes.length > 0 && (
              <label className={`mt-3 flex items-center gap-2 text-sm ${t.textPrimary} cursor-pointer w-fit`}>
                <input type="checkbox" checked={includeDupes} onChange={(e) => setIncludeDupes(e.target.checked)} className="accent-orange-500" />
                Import the {dupes.length} possible duplicate{dupes.length === 1 ? '' : 's'} anyway
              </label>
            )}
            <div className="flex gap-3 mt-4">
              <button onClick={onClose} className={`flex-1 ${t.cancelBtn} rounded-xl py-2.5 text-sm font-semibold`}>Cancel</button>
              <button onClick={handleImport} disabled={importing || !toImport.length}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold">
                {importing ? <><Loader2 size={15} className="animate-spin" /> Importing...</> : `Import ${toImport.length} member${toImport.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}

        {/* Step 3: result */}
        {result && (
          <div className="space-y-3">
            <p className={`text-sm ${t.textPrimary}`}>
              <span className="font-black text-emerald-400">{result.added} imported</span>
              {result.skipped > 0 && <>, <span className="font-bold text-orange-400">{result.skipped} skipped</span></>}
              {result.failed.length > 0 && <>, <span className="font-bold text-rose-400">{result.failed.length} failed</span></>}.
            </p>
            {result.failed.length > 0 && (
              <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 max-h-40 overflow-auto">
                {result.failed.map((f) => <p key={f.line}>Row {f.line}: {f.reason}</p>)}
              </div>
            )}
            <p className={`text-xs ${t.textSub}`}>Imported members now appear in the list, each with a Create login button.</p>
            <button onClick={onClose} className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-2.5 text-sm font-bold">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
