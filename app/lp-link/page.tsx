'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// LP診断の「LINEで通知を受け取る」着地ページ。
// LP（goltomo.com の golmoti.html）から LIFF 経由で開かれる:
//   https://liff.line.me/<LIFF_ID>?to=/lp-link?v=...&type=...&areas=...&days=...
// → 既存の /liff がLINEログイン＆セッションCookieを発行してここへ遷移する。
// このページはそのセッションを使って /api/lp/link-line に紐付けを保存し、
// 最後に友だち追加へ送る。匿名 visitorId と実LINEアカウントがここで結びつく。

const FRIEND_ADD = 'https://line.me/R/ti/p/@711xiyrs';
const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || '2009973733-P5UdNex9';

export default function LpLinkPage() {
  return (
    <Suspense fallback={<Screen status="準備中..." />}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const search = useSearchParams();
  const visitorId = search?.get('v') || '';
  const resultType = search?.get('type') || '';
  const areas = (search?.get('areas') || '').split(',').filter(Boolean);
  const days = (search?.get('days') || '').split(',').filter(Boolean);
  const pickup = search?.get('pickup') || '';
  const pickupPlaces = (search?.get('places') || '').split(',').filter(Boolean);

  const [status, setStatus] = useState('通知設定を保存しています...');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/lp/link-line', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visitorId, resultType, areas, days, pickup, pickupPlaces }),
          cache: 'no-store',
          credentials: 'include',
        });
        if (cancelled) return;

        if (res.status === 401) {
          // セッション未確立 → /liff でLINEログインしてからこのページへ戻す。
          const self = `/lp-link?v=${encodeURIComponent(visitorId)}&type=${encodeURIComponent(resultType)}&areas=${encodeURIComponent(areas.join(','))}&days=${encodeURIComponent(days.join(','))}`;
          window.location.replace(`/liff?to=${encodeURIComponent(self)}`);
          return;
        }
        if (!res.ok) throw new Error(`保存に失敗しました (${res.status})`);

        setStatus('登録が完了しました！');
        setDone(true);
        // 友だち追加へ自動遷移（少し待ってからユーザーに見せる）。
        setTimeout(() => { if (!cancelled) window.location.href = FRIEND_ADD; }, 1200);
      } catch (e) {
        if (cancelled) return;
        // 失敗しても通知導線は途切れさせず、友だち追加へは進めるようにする。
        setErr((e as Error).message);
        setDone(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Screen status={status} done={done} err={err} />;
}

function Screen({ status, done, err }: { status: string; done?: boolean; err?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-bg">
      <div className="text-5xl mb-4">{done ? '🎉' : '⛳'}</div>
      <div className="text-lg font-black mb-1">ゴルトモ</div>
      <div className="text-sm text-sub mb-1">{err ? 'LINEの友だち追加にお進みください' : status}</div>
      {done && (
        <a
          href={FRIEND_ADD}
          className="mt-5 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-green text-white font-black shadow-card"
        >
          <span>LINEで友だち追加へ</span>
          <span>›</span>
        </a>
      )}
      {!done && <div className="text-3xl mt-4 animate-pulse">…</div>}
      {err && <div className="mt-4 text-[11px] text-muted max-w-xs break-words">{err}</div>}
    </div>
  );
}
