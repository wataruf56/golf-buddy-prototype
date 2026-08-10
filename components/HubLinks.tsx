'use client';

import { useEffect } from 'react';

// /links（インスタのlink-in-bio）のCTA。表示（open）とクリック（line）を /api/lp/hit に
// 計測する。beaconなのでナビゲーションを妨げない。
// インスタのプロフィールにはLINEのURLを直接貼れない（ドメインブロック）ため、
// 友だち追加ボタンはこのページ経由で提供する（2026-08-10）。
// ※診断（MBTI）や募集一覧はインスタ側で別リンクとして直接貼る方針になったため、
//   このページはLINE友だち追加の1ボタンだけにしている。
const INK = '#1E3A30';
const LINE_GREEN = '#06C755';
// LINE公式アカウント「ゴルトモ」の友だち追加URL（ベーシックID @711xiyrs）。
const LINE_ADD_URL = 'https://line.me/R/ti/p/@711xiyrs';

function hit(t: 'open' | 'line') {
  try {
    const body = JSON.stringify({ t });
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      navigator.sendBeacon('/api/lp/hit', new Blob([body], { type: 'application/json' }));
      return;
    }
  } catch { /* noop */ }
  try { fetch('/api/lp/hit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t }), keepalive: true }).catch(() => {}); } catch { /* noop */ }
}

export function HubLinks() {
  useEffect(() => { hit('open'); }, []);
  return (
    <div className="w-full mt-8 flex flex-col gap-4">
      <a
        href={LINE_ADD_URL}
        onClick={() => hit('line')}
        className="block rounded-[26px] p-5 active:scale-[0.99] transition-transform"
        style={{ background: LINE_GREEN, boxShadow: '7px 8px 0 ' + INK }}
      >
        <div className="flex items-center gap-4">
          <div className="text-[44px] leading-none">💬</div>
          <div className="min-w-0 flex-1">
            <div className="text-[22px] font-black" style={{ color: '#FFFFFF' }}>LINEで友だち追加</div>
            <div className="text-[13px] font-bold mt-0.5" style={{ color: '#E8FBEF' }}>登録もラウンド参加もLINEで完結</div>
          </div>
          <div className="text-[22px]" style={{ color: '#FFFFFF' }}>›</div>
        </div>
      </a>

    </div>
  );
}
