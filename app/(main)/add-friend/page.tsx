'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';
import { readApiError } from '@/lib/apiError';
import { chatIdFor } from '@/lib/utils';
import { track } from '@/lib/telemetry';
import type { User } from '@/lib/types';

// QRを読み取った側が開く「友達になる」確認ページ。/add-friend?u={userId}
export default function AddFriendPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const router = useRouter();
  const search = useSearchParams();
  const meId = useStore((s) => s.meId);
  const hydrated = useStore((s) => s.hydrated);
  const targetId = search?.get('u') || '';
  const [target, setTarget] = useState<User | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound'>('loading');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!targetId) { setState('notfound'); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/users/${encodeURIComponent(targetId)}`, { cache: 'no-store' });
        if (cancelled) return;
        if (!r.ok) { setState('notfound'); return; }
        const j = await r.json();
        setTarget(j.user || null);
        setState(j.user ? 'ready' : 'notfound');
      } catch { if (!cancelled) setState('notfound'); }
    })();
    return () => { cancelled = true; };
  }, [targetId]);

  const isSelf = !!meId && targetId === meId;

  async function addFriend() {
    if (!meId) {
      router.push(`/liff?to=${encodeURIComponent(`/add-friend?u=${targetId}`)}`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/friends', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetId }), cache: 'no-store',
      });
      if (!res.ok) { toast(await readApiError(res), 'error'); return; }
      track('friend_add_ok', {});
      setDone(true);
      toast('友達になりました🤝');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <div className="p-5 text-center text-sub">読み込み中...</div>;
  if (state === 'notfound' || !target) return <div className="p-5 text-center text-sub">相手が見つかりませんでした。QRコードをもう一度読み取ってください。</div>;

  return (
    <div className="px-5 py-3">
      <div className="text-2xl font-black tracking-tight mb-1">友達になる</div>
      <div className="text-[13px] text-sub mb-5">QRコードから読み取りました。友達になるとメッセージができます。</div>

      <div className="bg-card rounded-card p-6 shadow-card text-center">
        <div className="flex flex-col items-center gap-1.5 mb-4">
          <Avatar user={target} size={64} />
          <div className="text-lg font-black">{target.displayName}</div>
          <div className="text-[11px] text-sub">
            {[target.gender === 'male' ? '👨 男性' : target.gender === 'female' ? '👩 女性' : '', target.age ? `${target.age}歳` : '', target.area].filter(Boolean).join(' ・ ')}
          </div>
        </div>

        {isSelf ? (
          <div className="py-4 text-sub text-sm">これはあなた自身のQRコードです。</div>
        ) : done ? (
          <div className="space-y-2">
            <div className="py-3 bg-green-light text-green rounded-xl text-sm font-black">🤝 友達になりました</div>
            <Link href={`/chat/${chatIdFor(meId, target.id)}?other=${target.id}`} className="block w-full py-3 bg-blue text-white rounded-xl text-sm font-black">💬 メッセージを送る</Link>
            <Link href="/buddies" className="block w-full py-2.5 text-sub text-xs font-bold">ゴル友一覧を見る</Link>
          </div>
        ) : (
          <>
            <button onClick={addFriend} disabled={busy} className="w-full py-4 bg-green text-white rounded-xl text-[15px] font-black disabled:opacity-50">
              {busy ? '処理中…' : !meId ? 'ログインして友達になる' : `${target.displayName}さんと友達になる`}
            </button>
            {hydrated && !meId && (
              <div className="text-[11px] text-muted mt-2">友達になるにはログインが必要です</div>
            )}
          </>
        )}
      </div>

      <div className="text-center mt-4">
        <Link href="/mypage" className="text-sm text-blue font-semibold">← マイページ</Link>
      </div>
    </div>
  );
}
