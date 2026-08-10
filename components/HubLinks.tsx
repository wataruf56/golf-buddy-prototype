'use client';

import { useEffect } from 'react';

// /links（インスタのlink-in-bioハブ）のCTA。表示（open）と、どのボタンを押したか
// （line / mbti / rounds）を /api/lp/hit に計測する。beaconなのでナビゲーションを妨げない。
// インスタのプロフィールにはLINEのURLを直接貼れない（ドメインブロック）ため、
// 友だち追加ボタンはこのハブ経由で提供する（2026-08-10）。
const TEAL = '#2A8C82';
const CORAL = '#E8643C';
const CREAM = '#FBF7EC';
const INK = '#1E3A30';
const LINE_GREEN = '#06C755';
// LINE公式アカウント「ゴルトモ」の友だち追加URL（ベーシックID @711xiyrs）。
const LINE_ADD_URL = 'https://line.me/R/ti/p/@711xiyrs';

function hit(t: 'open' | 'line' | 'mbti' | 'rounds') {
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
