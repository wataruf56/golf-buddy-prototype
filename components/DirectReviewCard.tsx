'use client';

import { useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';
import type { User, ReviewVerdict } from '@/lib/types';

// ラウンドに紐づかないレビュー（友達申請の承認後 / QRで「同じ組」と答えた相手）。
// 選択肢は既存の ReviewOverlay とまったく同じ4択にしてある。新しい選択肢は作らない。
//   「💘 異性として気になる」は相手が異性のときだけ出す（同性なら3択）。
const OPTIONS: Array<{ key: ReviewVerdict; label: string; on: string; oppositeOnly?: boolean }> = [
  { key: 'again', label: '🏌️ また回りたい', on: 'bg-green text-white border-green' },
  { key: 'romantic', label: '💘 異性として気になる', on: 'bg-pink-600 text-white border-pink-600', oppositeOnly: true },
  { key: 'never', label: '🙇 ごめんなさい', on: 'bg-[#C0392B] text-white border-[#C0392B]' },
  { key: 'either', label: '🤷 どっちでもいい', on: 'bg-[#9b876a] text-white border-[#9b876a]' },
];

export function DirectReviewCard({
  user, meGender, onDone,
}: {
  user: User & { gender?: string };
  meGender?: string;
  onDone?: () => void;
}) {
  const [verdict, setVerdict] = useState<ReviewVerdict | null>(null);
  const [busy, setBusy] = useState(false);

  const g1 = meGender, g2 = (user as any)?.gender;
  // 自分の性別が分からないときは出す（サーバー側で弾かれるので実害はない）。
  const opposite = !g1 || !g2 ? true
    : (g1 === 'male' || g1 === 'female') && (g2 === 'male' || g2 === 'female') && g1 !== g2;

  async function submit() {
    if (!verdict) return;
    setBusy(true);
    try {
      const r = await fetch('/api/friends/review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revieweeId: user.id, verdict }), credentials: 'include',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || '送信に失敗しました');
      toast(j.matched ? '🎉 マッチ成立！「また回りたい」同士です' : 'ありがとうございます');
      onDone?.();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="bg-card border-2 border-border rounded-card shadow-card p-4">
      <div className="flex items-center gap-3">
        <Avatar user={user} size={40} emojiSize={20} />
        <div>
          <div className="text-[15px] font-black">{user.displayName}</div>
          <div className="text-[11.5px] text-sub">同じ組で回った相手</div>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {OPTIONS.filter((o) => !o.oppositeOnly || opposite).map((o) => (
          <button
            key={o.key} onClick={() => setVerdict(o.key)}
            className={'w-full py-2.5 rounded-full text-[13px] font-black border-2 ' +
              (verdict === o.key ? o.on : 'bg-white border-border')}
          >{verdict === o.key ? '✓ ' : ''}{o.label}</button>
        ))}
      </div>
      <button
        disabled={busy || !verdict} onClick={submit}
        className={'w-full mt-3 py-3 rounded-xl text-[15px] font-black border-2 ' +
          (verdict ? 'bg-green text-white border-green' : 'bg-[#EDEDED] text-[#A9A9A9] border-muted')}
      >{busy ? '送信中...' : '送信する'}</button>
    </div>
  );
}
