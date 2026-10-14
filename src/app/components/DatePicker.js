'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '@/app/context/ThemeContext';
import { phToday } from '@/app/lib/phDate';
import { pickerTheme, usePicker, PickerPopover, PickerButton, RequiredProxy } from '@/app/components/pickerPopover';

// FaithSync's own date picker, in place of the browser's (which looks
// different on every browser and phone). Values are "YYYY-MM-DD" strings,
// like <input type="date">, and onChange gets { target: { name, value } }
// so it drops into the pages' existing change handlers.
//
//   min / max        first / last date that can be picked
//   isDisabled(d)    extra rule for which dates can't be picked
//   yearPicker       month and year dropdowns (birthdays: decades back)
//   clearable        a "Clear" button (default: when not required)
//   weekday          show the weekday in the box ("Sun, Oct 19, 2026")

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parts = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? { y: +s.slice(0, 4), m: +s.slice(5, 7) - 1, d: +s.slice(8, 10) } : null);
const daysIn = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const shift = (s, days) => { const p = parts(s); return new Date(Date.UTC(p.y, p.m, p.d + days)).toISOString().slice(0, 10); };
const shiftMonth = (s, n) => {
  const p = parts(s);
  const y = p.y + Math.floor((p.m + n) / 12), m = ((p.m + n) % 12 + 12) % 12;
  return iso(y, m, Math.min(p.d, daysIn(y, m)));
};

export function formatPickedDate(s, weekday = true) {
  if (!parts(s)) return '';
  return new Date(`${s}T00:00:00`).toLocaleDateString('en-PH', {
    ...(weekday ? { weekday: 'short' } : {}), month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function DatePicker({
  value, onChange, name, id, min, max, isDisabled, required, clearable, yearPicker, weekday = true,
  placeholder = 'Pick a date', className, ariaLabel, title, disabled,
}) {
  const { dark } = useTheme();
  const s = pickerTheme(dark);
  const { open, setOpen, close, triggerRef } = usePicker();
  const today = phToday();
  const blocked = (d) => (min && d < min) || (max && d > max) || (isDisabled ? isDisabled(d) : false);

  const start = () => {
    if (parts(value)) return value;
    if (!blocked(today)) return today;
    if (min && today < min) return min;
    if (max && today > max) return max;
    return today;
  };
  const [focus, setFocus] = useState(start);
  const gridRef = useRef(null);
  const view = parts(focus);

  function openPicker() {
    setFocus(start());
    setOpen(true);
  }

  // Keep keyboard focus on the focused day while the calendar is open.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => gridRef.current?.querySelector(`[data-date="${focus}"]`)?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, focus]);

  function pick(d) {
    if (blocked(d)) return;
    onChange?.({ target: { name, value: d, type: 'date' } });
    close(true);
  }

  function onKey(e) {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next = null;
    if (e.key in moves) next = shift(focus, moves[e.key]);
    else if (e.key === 'PageUp') next = shiftMonth(focus, e.shiftKey ? -12 : -1);
    else if (e.key === 'PageDown') next = shiftMonth(focus, e.shiftKey ? 12 : 1);
    else if (e.key === 'Home') next = shift(focus, -new Date(`${focus}T00:00:00Z`).getUTCDay());
    else if (e.key === 'End') next = shift(focus, 6 - new Date(`${focus}T00:00:00Z`).getUTCDay());
    if (next) { e.preventDefault(); setFocus(next); }
  }

  const cells = useMemo(() => {
    const lead = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
    return [...Array(lead).fill(null), ...Array.from({ length: daysIn(view.y, view.m) }, (_, i) => iso(view.y, view.m, i + 1))];
  }, [view.y, view.m]);

  const prevMonthEnd = shift(iso(view.y, view.m, 1), -1);
  const nextMonthStart = shift(iso(view.y, view.m, daysIn(view.y, view.m)), 1);
  const canPrev = !min || prevMonthEnd >= min;
  const canNext = !max || nextMonthStart <= max;
  const showClear = (clearable ?? !required) && !!value;

  const years = useMemo(() => {
    if (!yearPicker) return [];
    const hi = parts(max)?.y ?? +today.slice(0, 4) + 5;
    const lo = parts(min)?.y ?? hi - 110;
    return Array.from({ length: hi - lo + 1 }, (_, i) => hi - i);
  }, [yearPicker, min, max, today]);

  const setYM = (y, m) => setFocus(iso(y, m, Math.min(view.d, daysIn(y, m))));

  return (
    <div className="relative">
      <PickerButton triggerRef={triggerRef} open={open} onOpen={() => (open ? close(false) : openPicker())}
        id={id} className={className} disabled={disabled} icon={CalendarDays}
        text={formatPickedDate(value, weekday)} placeholder={placeholder} ariaLabel={ariaLabel} title={title} />
      <RequiredProxy value={value} required={required} />

      <PickerPopover open={open} triggerRef={triggerRef} onClose={close} label="Choose a date">
        <div className="flex items-center justify-between gap-2 mb-2">
          <button type="button" onClick={() => setFocus(shiftMonth(focus, -1))} disabled={!canPrev} aria-label="Previous month"
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.hover} disabled:opacity-30 disabled:pointer-events-none`}>
            <ChevronLeft size={16} />
          </button>
          {yearPicker ? (
            <div className="flex gap-1.5">
              <select value={view.m} onChange={(e) => setYM(view.y, +e.target.value)} aria-label="Month"
                className={`border rounded-lg px-2 h-8 text-sm ${s.select}`}>
                {MONTHS.map((n, i) => <option key={n} value={i}>{n}</option>)}
              </select>
              <select value={view.y} onChange={(e) => setYM(+e.target.value, view.m)} aria-label="Year"
                className={`border rounded-lg px-2 h-8 text-sm ${s.select}`}>
                {!years.includes(view.y) && <option value={view.y}>{view.y}</option>}
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          ) : (
            <p className={`text-sm font-bold ${s.head}`} aria-live="polite">{MONTHS[view.m]} {view.y}</p>
          )}
          <button type="button" onClick={() => setFocus(shiftMonth(focus, 1))} disabled={!canNext} aria-label="Next month"
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.hover} disabled:opacity-30 disabled:pointer-events-none`}>
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {WEEK.map((w) => <span key={w} className={`text-center text-[10px] font-bold uppercase ${s.muted}`}>{w}</span>)}
        </div>
        <div ref={gridRef} role="grid" onKeyDown={onKey} className="grid grid-cols-7 gap-0.5">
          {cells.map((d, i) => {
            if (!d) return <span key={`x${i}`} />;
            const off = blocked(d);
            const on = d === value;
            return (
              <button key={d} type="button" data-date={d} tabIndex={d === focus ? 0 : -1}
                onClick={() => pick(d)} aria-disabled={off || undefined} aria-pressed={on}
                aria-label={formatPickedDate(d)}
                className={`h-9 rounded-lg text-sm tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c5a66a] ${
                  on ? `${s.on} font-bold` : off ? s.off : `${s.hover} ${d === today ? `${s.today} font-bold` : ''}`}`}>
                {+d.slice(8)}
              </button>
            );
          })}
        </div>

        <div className={`flex items-center justify-between mt-2 pt-2 border-t ${s.divider}`}>
          {!blocked(today) ? (
            <button type="button" onClick={() => pick(today)} className={`px-2.5 h-8 rounded-lg text-xs font-semibold ${s.hover}`}>Today</button>
          ) : <span />}
          {showClear && (
            <button type="button" onClick={() => { onChange?.({ target: { name, value: '', type: 'date' } }); close(true); }}
              className={`px-2.5 h-8 rounded-lg text-xs font-semibold ${s.muted} ${s.hover}`}>Clear</button>
          )}
        </div>
      </PickerPopover>
    </div>
  );
}
