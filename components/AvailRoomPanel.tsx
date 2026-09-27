'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';
import { confirmDialog } from '@/components/ConfirmDialog';
import { store } from '@/lib/store';
import { dateLabel } from '@/lib/availabilityShared';
import type { Round, User } from '@/lib/types';

// 「行ける日」の集まり（日付ごとのチャット部屋）の詳細画面。
// ふつうの募集の画面は出さない。出すのは、顔ぶれ・チャットへの入口・
// 「行けなくなった」の3つだけ。参加の申請や承認はない（その日に「行ける」を
// 押した人が自動で入る）。
export function AvailRoomPanel({ round, users, meId }: { round: Round; users: User[]; meId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const date = (round as any).availDate as string;
  const l = dateLabel(date);
  const members = (round.applicantIds || []).map((id) => users.find((u) => u.id === id)).filter(Boolean) as User[];
  const cars = members.filter((u) => u.car === 'have').length;
  const isMember = (round.applicantIds || []).includes(meId);

  async function leave() {
    const ok = await confirmDialog({
      title: `${l.md}（${l.w}）に行けなくなりましたか？`,
      message: '「行ける日」からこの日が外れ、このチャットからも抜けます。また行けるようになったら、カレンダーから押し直せます。',
      confirmText: '行けなくなった', cancelText: 'やめる',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch('/api/availability', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ removeDate: date }),
      });
      if (!r.ok) throw new Error(String(r.status));
      toast('この日を外しました');
      store.hydrate().catch(() => {});
      router.push('/availability');
    } catch { toast('外せませんでした。もう一度お試しください', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-3">
      <div className="bg-card rounded-card shadow-card border-2 border-border p-4">
        <div className="text-[12px] font-black text-green">📅 行ける日の集まり</div>
        <div className="text-[13px] font-bold text-sub mt-1 leading-relaxed">
          {l.md}（{l.w}）に「行ける」を押した人の集まりです。この日に回るかどうか、コースや集合場所をチャットで相談してください。
          「行ける」を押した人が増えると、ここに合流します。
        </div>
        <div className="flex items-center gap-2 mt-3">
          <span className="text-[14px] font-black">メンバー</span>
          <span className="text-[11px] font-black text-white bg-green px-2 py-0.5 rounded-full leading-none">{members.length}人</span>
          {cars > 0 && <span className="text-[11px] font-bold text-sub">🚗 車あり {cars}人</span>}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {members.map((u) => (
            <Link key={u.id} href={`/profile/${u.id}`}
              className={`inline-flex items-center gap-1.5 pl-[3px] pr-2.5 py-[3px] rounded-full bg-white border-2 text-[11px] font-black leading-none ${u.car === 'have' ? 'border-border shadow-[2px_2px_0_#1E3A30]' : 'border-transparent'} ${u.id === meId ? 'ring-[3px] ring-green-light' : ''}`}>
              <Avatar user={u} size={26} emojiSize={14} />
              <span className="max-w-[7em] truncate">{u.displayName}</span>
              <span className={`font-mono ${u.gender === 'female' ? 'text-sakura' : 'text-blue'}`}>{u.age}</span>
              {u.car === 'have' && <span className="text-[10px]">🚗</span>}
            </Link>
          ))}
        </div>
        {isMember && (
          <>
            <Link href={`/round/${round.id}/chat`} className="block w-full mt-4 py-3 rounded-xl border-2 border-border bg-green text-white text-center text-[15px] font-black">
              💬 チャットを開く
            </Link>
            <button type="button" disabled={busy} onClick={leave}
              className="block w-full mt-2 py-2.5 rounded-xl border-2 border-orange bg-white text-orange text-center text-[13px] font-black disabled:opacity-60">
              この日に行けなくなった
            </button>
          </>
        )}
      </div>
    </div>
  );
}
