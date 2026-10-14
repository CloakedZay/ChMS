'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info, HelpCircle } from 'lucide-react';
import { useTheme } from '@/app/context/ThemeContext';
import { subscribeDialogs, closeDialog } from '@/app/lib/dialog';

// Draws the pop-ups asked for with confirmDialog() / alertDialog()
// (lib/dialog.js), one at a time, in the app's own style. Escape or a click
// outside means Cancel (OK for an alert). For a red (delete-type) question
// the Cancel button has the focus, so Enter can't delete by accident.

export default function DialogHost() {
  const { dark } = useTheme();
  const [queue, setQueue] = useState([]);
  const okRef = useRef(null);
  const cancelRef = useRef(null);
  useEffect(() => subscribeDialogs((q) => setQueue([...q])), []);

  const d = queue[0];
  useEffect(() => {
    if (!d) return;
    const el = d.kind === 'confirm' && d.danger ? cancelRef.current : okRef.current;
    el?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeDialog(d.id, d.kind === 'alert' ? undefined : false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [d]);

  if (!d) return null;

  const t = dark
    ? { box: 'bg-[#1b2420] border-slate-700', text: 'text-white', sub: 'text-slate-300', cancel: 'bg-slate-800 hover:bg-slate-700 text-white' }
    : { box: 'bg-slate-50 border-slate-300', text: 'text-slate-900', sub: 'text-slate-700', cancel: 'bg-slate-300 hover:bg-slate-400 text-slate-900' };
  const Icon = d.kind === 'alert' ? Info : d.danger ? AlertTriangle : HelpCircle;
  const tone = d.danger ? 'bg-red-500/15 text-red-500' : 'bg-[#c5a66a]/20 text-[#9c7f45]';
  const cancel = () => closeDialog(d.id, d.kind === 'alert' ? undefined : false);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="fs-dialog-msg"
        className={`w-full max-w-md border rounded-2xl p-6 shadow-2xl ${t.box}`}>
        <div className="flex items-start gap-4">
          <span className={`w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center ${tone}`}>
            <Icon size={19} strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            {d.title && <h2 className={`text-base font-black mb-1 ${t.text}`}>{d.title}</h2>}
            <p id="fs-dialog-msg" className={`text-sm leading-relaxed whitespace-pre-line break-words ${d.title ? t.sub : t.text}`}>{d.message}</p>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          {d.kind === 'confirm' && (
            <button ref={cancelRef} type="button" onClick={cancel}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c5a66a] ${t.cancel}`}>
              {d.cancelText}
            </button>
          )}
          <button ref={okRef} type="button" onClick={() => closeDialog(d.id, d.kind === 'alert' ? undefined : true)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c5a66a] ${
              d.danger ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}>
            {d.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
