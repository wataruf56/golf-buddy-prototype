'use client';

import { useEffect } from 'react';

// /links（インスタのlink-in-bioハブ）の2つのCTA。表示（open）と、どちらのボタンを
// 押したか（mbti / rounds）を /api/lp/hit に計測する。beaconなのでナビゲーションを妨げない。
const TEAL = '#2A8C82';
const CORAL = '#E8643C';
const CREAM = '#FBF7EC';
const INK = '#1E3A30';

function hit(t: 'open' | 'mbti' | 'rounds') {
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
        href="https://goltomo.com/golmoti.html?ref=ig_bio"
        onClick={() => hit('mbti')}
        className="block rounded-[26px] p-5 active:scale-[0.99] transition-transform"
        style={{ background: TEAL, boxShadow: '7px 8px 0 ' + INK }}
      >
        <div className="flex items-center gap-4">
          <div className="text-[44px] leading-none">✨</div>
          <div className="min-w-0 flex-1">
            <div className="text-[22px] font-black" style={{ color: CREAM }}>ゴルフMBTI 診断</div>
            <div className="text-[13px] font-bold mt-0.5" style={{ color: '#EAF3EF' }}>無料・16タイプ／あなたのゴルフタイプは？</div>
          </div>
          <div className="text-[22px]" style={{ color: CREAM }}>›</div>
        </div>
      </a>

      <a
        href="/links/rounds"
        onClick={() => hit('rounds')}
        className="block rounded-[26px] p-5 active:scale-[0.99] transition-transform"
        style={{ background: CORAL, boxShadow: '7px 8px 0 ' + INK }}
      >
        <div className="flex items-center gap-4">
          <div className="text-[44px] leading-none">⛳</div>
          <div className="min-w-0 flex-1">
            <div className="text-[22px] font-black" style={{ color: CREAM }}>ラウンド募集</div>
            <div className="text-[13px] font-bold mt-0.5" style={{ color: '#FDE8E1' }}>いま募集中のラウンドを見る</div>
          </div>
          <div className="text-[22px]" style={{ color: CREAM }}>›</div>
        </div>
      </a>
    </div>
  );
}
