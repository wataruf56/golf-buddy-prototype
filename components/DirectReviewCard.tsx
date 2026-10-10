'use client';

import { useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';
import type { User, ReviewVerdict } from '@/lib/types';

// ラウンドに紐づかないレビュー（友達申請の承認後 / QRで「同じ組」と答えた相手）。
// 選択肢は既存の ReviewOverlay とまったく同じ4択にしてある。新しい選択肢は作らない。
//   「💘 異性として気になる」は相手が異性のときだけ出す（同性なら3択）。
// 2026-10-10：ReviewOverlay と同じ聞き方に（思わない／どっちでも／行きたい ＋ 名前の横に 💘）。中身の verdict は従来どおり。
const OPTIONS: Array<{ key: ReviewVerdict; label: string; on: string }> = [
  { key: 'never', label: '思わない', on: 'bg-[#C0392B] text-white border-[#C0392B]' },
  { key: 'either', label: 'どっちでも', on: 'bg-[#9b876a] text-white border-[#9b876a]' },
  { key: 'again', label: '行きたい', on: 'bg-green text-white border-green' },
];

export function DirectReviewCard({
  user, meGender, onDone,
}: {
  user: User & { gender?: string };
  meGender?: string;
  onDone?: () => void;
}) {
  const [verdict, setVerdict] = useState<ReviewVerdict | null>('either');
  const [base, setBase] = useState<ReviewVerdict>('either');
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
      toast(j.matched ? '🎉 マッチ成立！お互いに「行きたい」です' : 'ありがとうございます');
      onDone?.();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="bg-card border-2 border-border rounded-card shadow-card p-4">
      <div className="text-center mb-2 px-2 py-2 rounded-xl border-2 border-border bg-[#FFF8E1]">
        <div className="text-[14px] font-black leading-snug">🔒 あなたが選んだものは相手には伝わりません</div>
      </div>
      <div className="flex items-center gap-3">
        <Avatar user={user} size={40} emojiSize={20} />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-black">{user.displayName}</div>
          <div className="text-[11.5px] text-sub">同じ組で回った相手</div>
        </div>
        {opposite && (
          <button type="button"
            onClick={() => (verdict === 'romantic' ? setVerdict(base) : (setBase(verdict || base), setVerdict('romantic')))}
            className={'flex-shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-black border-[1.5px] ' + (verdict === 'romantic' ? 'bg-pink-600 text-white border-pink-600' : 'bg-white text-pink-600 border-pink-600')}
          >💘 異性として気になる</button>
        )}
      </div>
      <div className="text-[12.5px] font-black text-center mt-3 mb-1.5">この人からまた次のラウンドに誘われたら、行きたいと思う？</div>
      <div className={'grid grid-cols-3 gap-1.5 ' + (verdict === 'romantic' ? 'opacity-40 grayscale pointer-events-none' : '')}>
        {OPTIONS.map((o) => {
          const on = (verdict === 'romantic' ? base : verdict) === o.key;
          return (
            <button
              key={o.key} disabled={verdict === 'romantic'} onClick={() => { setVerdict(o.key); setBase(o.key); }}
              className={'py-2.5 rounded-[12px] text-[12.5px] font-black border-[1.5px] ' + (on ? o.on : 'bg-white border-border text-sub')}
            >{on ? '✓ ' : ''}{o.label}</button>
          );
        })}
      </div>
      {verdict === 'romantic' && <div className="text-[10px] text-pink-600 font-bold mt-1 text-center">💘 を選んだので、この質問は答えなくてOK（もう一度押すと外れます）</div>}
      {verdict === 'never' && <div className="mt-1.5 text-[10.5px] font-bold text-[#C0392B] text-center">この人とはメッセージのやり取りができなくなります（相手には知られません）</div>}
      <button
        disabled={busy || !verdict} onClick={submit}
        className={'w-full mt-3 py-3 rounded-xl text-[15px] font-black border-2 ' +
          (verdict ? 'bg-green text-white border-green' : 'bg-[#EDEDED] text-[#A9A9A9] border-muted')}
      >{busy ? '送信中...' : '送信する'}</button>
    </div>
  );
}
