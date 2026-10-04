'use client';

import { useState } from 'react';
import { supabase } from '@/app/lib/supabase';
import { X, Upload, Download, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

// Secretary: add many members at once from an Excel (.xlsx) file, using
// the template in public/templates (Members sheet + a Choices sheet).
// The file is read in the browser, every row is checked and shown in a
// preview, and only good rows are added — to the Secretary's own branch,
// by the same database rules as adding one member by hand. Possible
// duplicates (same name already in the branch, or twice in the file) are
// skipped unless the Secretary ticks "import them anyway".

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
  ministry: ['ministry'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'contact', 'contact number', 'cellphone'],
  email: ['email', 'e-mail', 'email address'],
  status: ['status'],
};

const norm = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
const nameKey = (v) => norm(v).toLowerCase();

async function readRows(file) {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Please choose the Excel file (.xlsx) made from the template. Older .xls files: open in Excel and "Save As" Excel Workbook (.xlsx) first.');
  }
  const { readSheet } = await import('read-excel-file/browser');
  return readSheet(file);   // the first sheet — "Members" in the template
}

// Excel stores 09171234567 as the number 9171234567; put the 0 back.
function fixPhone(v) {
  let s = norm(v);
  if (/^9\d{9}$/.test(s)) s = '0' + s;
  return s;
}

function checkRows(rows, existingNames, ministries) {
  const header = (rows[0] || []).map((h) => nameKey(h));
  const col = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const i = header.findIndex((h) => aliases.includes(h));
    if (i >= 0) col[field] = i;
  }
  if (col.full_name === undefined) {
    throw new Error('The first row must have the column headings, including "Full name". Use the template.');
  }

  const ministryByKey = {};
  ministries.forEach((m) => { ministryByKey[m.toLowerCase()] = m; });
  const seen = new Set();
  const out = [];

  rows.slice(1).forEach((cells, idx) => {
    const get = (f) => (col[f] === undefined ? '' : norm(cells[col[f]]));
    if (!cells.some((c) => norm(c))) return;   // blank line

    const r = {
      line: idx + 2,
      full_name: get('full_name'),
      role: get('role').toLowerCase(),
      ministry: get('ministry'),
      phone: col.phone === undefined ? '' : fixPhone(cells[col.phone]),
      email: get('email').toLowerCase(),
      status: get('status').toLowerCase() || 'active',
      errors: [],
      warnings: [],
    };

    if (nameKey(r.full_name) === EXAMPLE_NAME && r.email === EXAMPLE_EMAIL) {
      r.errors.push("This is the template's example row");
    }
    if (!r.full_name) r.errors.push('Full name is missing');
    if (r.role && !ROLES.includes(r.role)) r.errors.push(`Role "${get('role')}" — use ${ROLES.join(', ')}`);
    if (r.ministry) {
      const match = ministryByKey[r.ministry.toLowerCase()];
      if (match) r.ministry = match;
      else r.errors.push(`Ministry "${r.ministry}" not recognised`);
    }
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

export default function MemberImport({ t, existingMembers, ministries, onClose, onImported }) {
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
      if (raw.length - 1 > MAX_ROWS) throw new Error(`That file has more than ${MAX_ROWS} rows. Please split it.`);
      const existing = new Set(existingMembers.map((m) => nameKey(m.full_name)));
      const checked = checkRows(raw, existing, ministries);
      if (!checked.length) throw new Error('No member rows found under the headings.');
      setRows(checked);
    } catch (err) {
      setError(err.message || 'Could not read that file.');
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
    for (let i = 0; i < toImport.length; i += BATCH) {
      const chunk = toImport.slice(i, i + BATCH);
      const { data, error: insertError } = await supabase
        .from('members')
        .insert(chunk.map((r) => ({
          full_name: r.full_name,
          role: r.role || null,
          ministry: r.ministry || null,
          phone: r.phone || null,
          email: r.email || null,
          status: r.status,
        })))
        .select('id');
      if (insertError) chunk.forEach((r) => failed.push({ line: r.line, reason: insertError.message }));
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`${t.modalBg} border ${t.modalBorder} rounded-2xl w-full max-w-4xl p-6 shadow-2xl mx-4 max-h-[90vh] flex flex-col`}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className={`text-lg font-black ${t.textPrimary}`}>Import members</h2>
            <p className={`text-xs ${t.textSub} mt-1`}>From an Excel file (.xlsx). Members are added to your branch.</p>
          </div>
          <button onClick={onClose} className={`${t.textSub} hover:text-blue-400`}><X size={18} /></button>
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
            <p>3. <span className="font-bold">Ministry</span> must be one of: {ministries.join(', ')}.</p>
            <p>4. Save it, then choose the file here. You&apos;ll see a preview before anything is added.</p>
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
                    <th className="px-3 py-2">Ministry</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Status</th><th className="px-3 py-2">Check</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${t.divider}`}>
                  {rows.map((r) => (
                    <tr key={r.line} className={t.textPrimary}>
                      <td className={`px-3 py-2 ${t.textMuted}`}>{r.line}</td>
                      <td className="px-3 py-2 font-semibold">{r.full_name || '—'}</td>
                      <td className="px-3 py-2 capitalize">{r.role || '—'}</td>
                      <td className="px-3 py-2">{r.ministry || '—'}</td>
                      <td className="px-3 py-2">{r.phone || '—'}</td>
                      <td className="px-3 py-2">{r.email || '—'}</td>
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
