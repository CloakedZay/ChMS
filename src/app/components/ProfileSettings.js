'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Save, Loader2, KeyRound, Cake, UserCircle, Sun, Moon } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { useAuth } from '@/app/context/AuthContext';
import { useTheme } from '@/app/context/ThemeContext';
import { ROLE_LABELS } from '@/app/lib/permissions';
import { levelBadge } from '@/app/lib/roleColors';
import { branchLabelText } from '@/app/components/BranchLabel';
import GoogleAccountCard from '@/app/components/GoogleAccountCard';
import DatePicker from '@/app/components/DatePicker';
import { phToday } from '@/app/lib/phDate';

import { friendlyError } from '@/app/lib/errors';
// "My profile" for everyone — the member portal and the staff dashboard.
//   * display name (profiles.full_name — the user's own row)
//   * birthday — on the member record if the login has one, otherwise on
//     the profile — and whether it shows in Upcoming Birthdays (db/034)
//   * level, branch, email, password, Google sign-in, theme
// Level and branch are set by the Admin (Users page), so they are shown
// read-only here.

export default function ProfileSettings() {
  const { user, role, churchName } = useAuth();
  const { dark, toggle: toggleTheme } = useTheme();
  const level = role || 'member';

  const [displayName, setDisplayName] = useState('');
  const [savedName, setSavedName]     = useState('');
  const [savingName, setSavingName]   = useState(false);
  const [nameMsg, setNameMsg]         = useState('');

  const [birthday, setBirthday]           = useState('');
  const [showBday, setShowBday]           = useState(true);
  const [birthdayState, setBirthdayState] = useState('loading'); // loading | ready | unavailable
  const [savingBday, setSavingBday]       = useState(false);
  const [bdayMsg, setBdayMsg]             = useState('');

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('full_name').eq('id', user.id).single()
      .then(({ data }) => { setDisplayName(data?.full_name || ''); setSavedName(data?.full_name || ''); });
    supabase.rpc('get_my_birthday').then(({ data, error }) => {
      if (error) { setBirthdayState('unavailable'); return; }
      const row = data?.[0];
      setBirthday(row?.birth_date || '');
      setShowBday(row?.show_birthday !== false);
      setBirthdayState('ready');
    });
  }, [user]);

  function flash(set, msg) { set(msg); setTimeout(() => set(''), 4000); }

  async function saveDisplayName() {
    const name = displayName.trim();
    if (!name || name === savedName) return;
    setSavingName(true);
    const { error } = await supabase.from('profiles').update({ full_name: name }).eq('id', user.id);
    setSavingName(false);
    if (!error) setSavedName(name);
    flash(setNameMsg, error ? friendlyError(error) : '✓ Name saved');
  }

  async function saveBirthday() {
    setSavingBday(true);
    const { error } = await supabase.rpc('set_my_birthday', { b: birthday || null, show: showBday });
    setSavingBday(false);
    flash(setBdayMsg, error ? friendlyError(error) : '✓ Birthday saved');
  }

  const t = dark
    ? { page: 'bg-[#111815]', card: 'bg-[#1b2420] border-slate-800/60', text: 'text-white', sub: 'text-slate-400', muted: 'text-slate-500',
        label: 'text-slate-400', input: 'bg-[#111815] border-slate-700 text-slate-100 placeholder:text-slate-500', divider: 'border-slate-800',
        ghost: 'border-slate-700 text-slate-300 hover:bg-white/5', avatar: 'bg-[#c5a66a]/15 text-[#dcc88f]' }
    : { page: 'bg-[#f8f7f2]', card: 'bg-white border-[#e5e3d8]', text: 'text-[#173f35]', sub: 'text-[#4c534f]', muted: 'text-[#858b87]',
        label: 'text-[#4c534f]', input: 'bg-white border-[#d9d6c8] text-[#252a28] placeholder:text-[#858b87]', divider: 'border-[#efede4]',
        ghost: 'border-[#d9d6c8] text-[#4c534f] hover:bg-[#f8f7f2]', avatar: 'bg-[#173f35] text-[#c5a66a]' };

  const initials = (savedName || user?.email || '?').split(/[\s@.]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const card = `border rounded-3xl p-6 ${t.card}`;
  const heading = `flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-4 ${t.muted}`;
  const field = `w-full border rounded-xl px-4 py-2.5 text-sm ${t.input}`;
  const primary = 'inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold px-5 h-10 rounded-xl';
  const msg = (m) => m && <p className={`text-xs font-semibold ${m.startsWith('✓') ? 'text-emerald-500' : 'text-rose-500'}`}>{m}</p>;

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen ${t.page}`}>
      <div className="mb-8">
        <h1 className={`text-2xl font-black ${t.text}`}>My Profile</h1>
        <p className={`text-sm mt-1 ${t.sub}`}>Your name, birthday and sign-in settings.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 max-w-5xl items-start">
        <div className="space-y-5">
          {/* Identity */}
          <section className={card}>
            <div className="flex items-center gap-4 mb-6">
              <span className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0 ${t.avatar}`}>{initials}</span>
              <div className="min-w-0">
                <p className={`text-lg font-bold truncate ${t.text}`}>{savedName || 'No display name set'}</p>
                <p className={`text-xs truncate ${t.muted}`}>{user?.email}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${levelBadge(level, dark)}`}>{ROLE_LABELS[level] || level}</span>
                  <span className={`text-[11px] ${t.muted}`}>{branchLabelText(role, churchName)}</span>
                </div>
              </div>
            </div>

            <label htmlFor="p-name" className={`block text-xs font-semibold mb-1.5 ${t.label}`}>Display name</label>
            <input id="p-name" type="text" value={displayName} placeholder="Your full name" maxLength={80}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveDisplayName()}
              className={field} />
            <p className={`text-[11px] mt-1.5 ${t.muted}`}>Shown in messages, follow-up notes and discipleship reviews.</p>
            <div className="flex items-center justify-between gap-3 mt-4">
              {msg(nameMsg) || <span />}
              <button onClick={saveDisplayName} disabled={savingName || !displayName.trim() || displayName.trim() === savedName} className={primary}>
                {savingName ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {savingName ? 'Saving...' : 'Save name'}
              </button>
            </div>
          </section>

          {/* Birthday */}
          {birthdayState !== 'unavailable' && (
            <section className={card}>
              <p className={heading}><Cake size={14} /> Birthday</p>
              {birthdayState === 'loading' ? (
                <div className="skeleton h-10 w-full" />
              ) : (
                <>
                  <DatePicker value={birthday} max={phToday()} yearPicker weekday={false} placeholder="Pick your birthday" ariaLabel="Birthday"
                    onChange={(e) => setBirthday(e.target.value)} className={field} />
                  <p className={`text-[11px] mt-1.5 ${t.muted}`}>Optional. Only the month and day are ever shown — never the year or your age.</p>

                  <label className="mt-4 flex items-start justify-between gap-4 cursor-pointer">
                    <span>
                      <span className={`block text-sm font-semibold ${t.text}`}>Show my birthday in Upcoming Birthdays</span>
                      <span className={`block text-[11px] mt-0.5 ${t.muted}`}>
                        Turn off to keep it private. It&apos;s still saved for church records.
                      </span>
                    </span>
                    <button type="button" role="switch" aria-checked={showBday} onClick={() => setShowBday((v) => !v)}
                      className={`relative w-11 h-6 shrink-0 rounded-full transition-colors ${showBday ? 'bg-blue-600' : dark ? 'bg-slate-700' : 'bg-[#d9d6c8]'}`}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${showBday ? 'translate-x-5' : ''}`} />
                    </button>
                  </label>
                  <div className="flex items-center justify-between gap-3 mt-4">
                    {msg(bdayMsg) || <span />}
                    <button onClick={saveBirthday} disabled={savingBday} className={primary}>
                      {savingBday ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {savingBday ? 'Saving...' : 'Save birthday'}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
        </div>

        <div className="space-y-5">
          {/* Account */}
          <section className={card}>
            <p className={heading}><UserCircle size={14} /> Account</p>
            <dl className="text-sm">
              {[
                ['Email', user?.email],
                ['Level', ROLE_LABELS[level] || level],
                ['Branch', branchLabelText(role, churchName)],
              ].map(([k, v]) => (
                <div key={k} className={`flex items-center justify-between gap-4 py-2.5 border-b ${t.divider}`}>
                  <dt className={t.muted}>{k}</dt>
                  <dd className={`font-semibold text-right truncate ${t.text}`}>{v}</dd>
                </div>
              ))}
              <div className={`flex items-center justify-between gap-4 py-2.5 border-b ${t.divider}`}>
                <dt className={t.muted}>Password</dt>
                <dd>
                  <Link href="/change-password" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-500 hover:underline">
                    <KeyRound size={14} /> Change password
                  </Link>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 pt-2.5">
                <dt className={t.muted}>Appearance</dt>
                <dd>
                  <button onClick={toggleTheme} className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-xl border text-sm font-semibold ${t.ghost}`}>
                    {dark ? <Sun size={15} /> : <Moon size={15} />} {dark ? 'Light mode' : 'Dark mode'}
                  </button>
                </dd>
              </div>
            </dl>
            <p className={`text-[11px] mt-4 ${t.muted}`}>Your level and branch are set by the administrator.</p>
          </section>

          <GoogleAccountCard dark={dark} />
        </div>
      </div>
    </div>
  );
}
