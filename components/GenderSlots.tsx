'use client';

import type { Round, User } from '@/lib/types';
import { genderSlotStatus } from '@/lib/genderSlots';

// 募集ページの「募集枠（男女別）」。男性 2/2 満員・女性 1/2 あと1 のように、枠ごとの埋まり具合を押す前に見せる（2026-10-07）。
// 内訳の無い旧募集・飲み会では出さない。
export function GenderSlots({ round, users }: { round: Round; users: User[] }) {
  if (round.eventType === 'drink') return null;
  const st = genderSlotStatus(round, users);
  if (!st.has) return null;
  const cols: Array<{ key: string; icon: string; label: string; cap: number; used: number; full: boolean; left: number }> = [];
  if (st.male.cap > 0 || st.male.used > 0) cols.push({ key: 'male', icon: '👨', label: '男性', ...st.male });
  if (st.female.cap > 0 || st.female.used > 0) cols.push({ key: 'female', icon: '👩', label: '女性', ...st.female });
  if (st.any.cap > 0) cols.push({ key: 'any', icon: '🙂', label: 'どちらでも', cap: st.any.cap, used: st.any.used, full: st.any.used >= st.any.cap, left: Math.max(0, st.any.cap - st.any.used) });
  if (!cols.length) return null;
  return (
    <div className="mb-4">
      <div className="text-[11px] font-bold text-sub mb-0.5">募集枠（男女別）</div>
      <div className="text-[10px] text-muted mb-1.5">※ 主催者と知り合い枠を除いた、ゴルトモから募集する人数</div>
      <div className="flex gap-2">
        {cols.map((c) => (
          <div key={c.key} className="flex-1 min-w-0 bg-card border border-hair rounded-xl px-2.5 py-2">
            <div className="text-[10px] font-bold text-sub">{c.icon} {c.label}</div>
            <div className="text-[14px] font-black flex items-center gap-1.5 flex-wrap">
              <span>{c.used} / {c.cap}</span>
              {c.full
                ? <span className="text-[9px] font-black px-1.5 py-[1px] rounded-full" style={{ background: '#FFF1C9', color: '#8A5A00', border: '1px solid #C9A24A' }}>満員</span>
                : <span className="text-[9px] font-black px-1.5 py-[1px] rounded-full bg-orange-light text-orange border border-orange">あと{c.left}</span>}
            </div>
            <div className="h-1.5 bg-bg rounded overflow-hidden border border-hair mt-1">
              <div className="h-full rounded" style={{ width: `${Math.min(100, Math.round((c.used / Math.max(1, c.cap)) * 100))}%`, background: c.full ? '#C9A24A' : '#E8643C' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
