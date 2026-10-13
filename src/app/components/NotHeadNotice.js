'use client';

import { Info } from 'lucide-react';
import { useTheme } from '@/app/context/ThemeContext';

// For a Ministry Head whose login isn't the "Head's login" of any ministry
// yet (db/038): their powers only apply to ministries they head, so explain
// what to ask for instead of leaving them wondering why nothing is editable.

export default function NotHeadNotice({ className = '' }) {
  const { dark } = useTheme();
  const t = dark
    ? 'bg-[#3b6e9e]/10 border-[#7fb0de]/30 text-[#c9dcef]'
    : 'bg-[#eef4fa] border-[#3b6e9e]/30 text-[#2c5a85]';
  return (
    <div role="status" className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${t} ${className}`}>
      <Info size={18} strokeWidth={1.75} className="shrink-0 mt-0.5" />
      <p>
        <span className="font-semibold">You&apos;re not linked as the head of any ministry yet.</span>{' '}
        Ask the Pastor to open <span className="font-semibold">Ministries → Edit ministry</span> and choose your
        account in <span className="font-semibold">Head&apos;s login</span>. Then you can manage that ministry&apos;s
        members, training modules, events and announcements here.
      </p>
    </div>
  );
}
