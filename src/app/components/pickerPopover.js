'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@/app/context/ThemeContext';

// Shared by DatePicker and TimePicker: a panel that opens under its button
// (or above it when there's no room), drawn on top of the page so a
// scrolling form or modal can't cut it off. Closes on Escape or a click
// outside.

export function pickerTheme(dark) {
  return dark
    ? { pop: 'bg-[#1b2420] border-slate-700 text-slate-200 shadow-black/40', head: 'text-white', muted: 'text-slate-500',
        hover: 'hover:bg-white/10', off: 'text-slate-700 cursor-not-allowed', chip: 'border-slate-700 text-slate-300 hover:bg-white/5',
        on: 'bg-[#2f6b58] text-white', today: 'ring-1 ring-inset ring-[#c5a66a]', divider: 'border-slate-800',
        select: 'bg-[#111815] border-slate-700 text-slate-200' }
    : { pop: 'bg-white border-[#e5e3d8] text-[#252a28] shadow-black/10', head: 'text-[#173f35]', muted: 'text-[#858b87]',
        hover: 'hover:bg-[#f0efe8]', off: 'text-[#d3d1c8] cursor-not-allowed', chip: 'border-[#d9d6c8] text-[#4c534f] hover:bg-[#f8f7f2]',
        on: 'bg-[#173f35] text-white', today: 'ring-1 ring-inset ring-[#c5a66a]', divider: 'border-[#efede4]',
        select: 'bg-white border-[#d9d6c8] text-[#252a28]' };
}

export function usePicker() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);
  return { open, setOpen, close, triggerRef };
}

export function PickerPopover({ open, triggerRef, onClose, width = 296, label, children }) {
  const { dark } = useTheme();
  const s = pickerTheme(dark);
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.min(width, window.innerWidth - 16);
    const h = popRef.current?.offsetHeight || 0;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    let top = r.bottom + 6;
    if (h && top + h > window.innerHeight - 8 && r.top - h - 6 >= 8) top = r.top - h - 6;
    setPos({ top, left, width: w });
  }, [triggerRef, width]);

  // Placed once it has been drawn (off-screen until then), so its height is
  // known and it can open upwards when there's no room below.
  useLayoutEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(place);
    return () => { cancelAnimationFrame(id); setPos(null); };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      onClose(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(true); } };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('touchstart', onDown);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('touchstart', onDown);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, onClose, place, triggerRef]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div ref={popRef} role="dialog" aria-label={label}
      style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width ?? width, zIndex: 70 }}
      className={`border rounded-2xl shadow-2xl p-3 ${s.pop}`}>
      {children}
    </div>,
    document.body,
  );
}

// The button that opens a picker: looks like the page's own input.
export function PickerButton({ triggerRef, open, onOpen, id, className = '', disabled, icon: Icon, text, placeholder, ariaLabel, title }) {
  const { dark } = useTheme();
  const s = pickerTheme(dark);
  return (
    <button ref={triggerRef} type="button" id={id} onClick={onOpen} disabled={disabled}
      aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel} title={title}
      className={`${className} flex items-center gap-2 text-left disabled:opacity-50`}>
      <Icon size={15} className={`shrink-0 ${s.muted}`} />
      <span className={`truncate ${text ? '' : s.muted}`}>{text || placeholder}</span>
    </button>
  );
}

// Lets the browser's "please fill in this field" work on a picker.
export function RequiredProxy({ value, required }) {
  if (!required) return null;
  return (
    <input tabIndex={-1} aria-hidden="true" required value={value || ''} onChange={() => {}}
      className="absolute left-0 bottom-0 w-full h-px opacity-0 pointer-events-none" />
  );
}
