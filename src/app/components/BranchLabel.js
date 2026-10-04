'use client';

import { useAuth } from '@/app/context/AuthContext';
import { GLOBAL_ROLES } from '@/app/lib/permissions';

// The small line above each page title: the signed-in person's branch
// (e.g. "GGCF-GMI Branch 2"), or "All branches" for Pastor and Admin,
// who work across every branch.
export function branchLabelText(role, churchName) {
  if (GLOBAL_ROLES.includes(role)) return 'GGCF-GMI · All branches';
  return churchName || 'GGCF-GMI';
}

export default function BranchLabel() {
  const { role, churchName } = useAuth();
  return branchLabelText(role, churchName);
}
