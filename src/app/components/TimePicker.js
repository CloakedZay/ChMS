'use client';

import { useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';
import { useTheme } from '@/app/context/ThemeContext';
import { formatEventTime } from '@/app/lib/eventTime';
import { pickerTheme, usePicker, PickerPopover, PickerButton, RequiredProxy } from '@/app/components/pickerPopover';

// FaithSync's own time picker. Values are "HH:MM" (24-hour), like
// <input type="time">; onChange gets { target: { name, value } }.
// Common church times are one tap; any other time is hour / minute / AM-PM.

const PRESETS = ['06:00', '08:00', '09:00', '10:00', '13:00', '15:00', '16:00', '18:00', '19:00'];
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const pad = (n) => String(n).padStart(2, '0');

function split(v) {
  const m = /^(\d{1,2}):(\d{2})/.exec(v || '');
  if (!m) return null;
  const h = +m[1];
  return { h12: h % 12 || 12, min: +m[2], pm: h >= 12 };
}
const join = ({ h12, min, pm }) => `${pad((h12 % 12) + (pm ? 12 : 0))}:${pad(min)}`;

export default function TimePicker({
  value, onChange, name, id, required, clearable, placeholder = 'Add a time', className, ariaLabel, title, disabled, presets = PRESETS,
}) {
  const { dark } = useTheme();
  const s = pickerTheme(dark);
  const { open, setOpen, close, triggerRef } = usePicker();
  const cur = split(value);
  const listRef = useRef(null);

  const emit = (v) => onChange?.({ target: { name, value: v, type: 'time' } });
  const set = (changes) => emit(join({ h12: 6, min: 0, pm: true, ...cur, ...changes }));

  // Bring the chosen hour and minute into view when it opens.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      listRef.current?.querySelectorAll('[aria-pressed="true"]').forEach((el) => el.scrollIntoView({ block: 'nearest' }));
      listRef.current?.closest('[role="dialog"]')?.querySelector('button')?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  const minutes = cur && !MINUTES.includes(cur.min) ? [...MINUTES, cur.min].sort((a, b) => a - b) : MINUTES;
  const cell = (on) => `w-full h-8 rounded-lg text-sm tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c5a66a] ${on ? `${s.on} font-bold` : s.hover}`;
  const showClear = (clearable ?? !required) && !!value;

  return (
    <div className="relative">
      <PickerButton triggerRef={triggerRef} open={open} onOpen={() => setOpen(!open)}
        id={id} className={className} disabled={disabled} icon={Clock}
        text={formatEventTime(value)} placeholder={placeholder} ariaLabel={ariaLabel} title={title} />
      <RequiredProxy value={value} required={required} />

      <PickerPopover open={open} triggerRef={triggerRef} onClose={close} width={288} label="Choose a time">
        {presets.length > 0 && (
          <>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${s.muted}`}>Common times</p>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {presets.map((p) => (
                <button key={p} type="button" onClick={() => { emit(p); close(true); }} aria-pressed={value?.slice(0, 5) === p}
                  className={`h-8 rounded-lg border text-xs font-semibold ${value?.slice(0, 5) === p ? `${s.on} border-transparent` : s.chip}`}>
                  {formatEventTime(p)}
                </button>
              ))}
            </div>
          </>
        )}

        <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${s.muted}`}>Or set it</p>
        <div ref={listRef} className="grid grid-cols-[1fr_1fr_4.5rem] gap-2">
          <div role="listbox" aria-label="Hour" className="max-h-40 overflow-y-auto space-y-0.5 pr-0.5">
            {HOURS.map((h) => (
              <button key={h} type="button" aria-pressed={cur?.h12 === h} onClick={() => set({ h12: h })} className={cell(cur?.h12 === h)}>{h}</button>
            ))}
          </div>
          <div role="listbox" aria-label="Minute" className="max-h-40 overflow-y-auto space-y-0.5 pr-0.5">
            {minutes.map((m) => (
              <button key={m} type="button" aria-pressed={cur?.min === m} onClick={() => set({ min: m })} className={cell(cur?.min === m)}>:{pad(m)}</button>
            ))}
          </div>
          <div role="listbox" aria-label="AM or PM" className="space-y-0.5">
            {[['AM', false], ['PM', true]].map(([label, pm]) => (
              <button key={label} type="button" aria-pressed={!!cur && cur.pm === pm} onClick={() => set({ pm })} className={cell(!!cur && cur.pm === pm)}>{label}</button>
            ))}
          </div>
        </div>

        <div className={`flex items-center justify-between mt-3 pt-2 border-t ${s.divider}`}>
          {showClear ? (
            <button type="button" onClick={() => { emit(''); close(true); }} className={`px-2.5 h-8 rounded-lg text-xs font-semibold ${s.muted} ${s.hover}`}>Clear</button>
          ) : <span />}
          <button type="button" onClick={() => close(true)} className={`px-3 h-8 rounded-lg text-xs font-bold ${s.on}`}>Done</button>
        </div>
      </PickerPopover>
    </div>
  );
}
