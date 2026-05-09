'use client';

import { getMe, useStore } from '@/lib/store';
import { getCohort, cohortLabel } from '@/lib/ageGate';

// Eye-catching banner for matching pages.
// Adapts the label to the user's cohort (20〜30代 vs 40〜50代).
export function MatchingBanner() {
  const me = useStore(getMe);
  const c = getCohort(me?.age);
  const label = c ? cohortLabel(c) : '20〜30代限定コミュニティ';
  // Cohort B uses a slightly different gradient so members can tell them apart at a glance.
  const grad = c === 'b'
    ? 'from-amber-600 to-orange-500'
    : 'from-green to-emerald-500';
  return (
    <div className={`bg-gradient-to-r ${grad} text-white px-5 py-2.5 text-center`}>
      <div className="text-[11px] font-bold tracking-wider opacity-90">GOLTOMO</div>
      <div className="text-[15px] font-black leading-tight">🎯 {label}</div>
    </div>
  );
}
