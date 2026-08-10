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

// 匿名の訪問者ID（localStorage永続）。同じ人が何度開いても「1人」と数えるためのユニーク計測用。
function visitorId(): string {
  try {
    let v = localStorage.getItem('gb_links_vid');
    if (!v) {
      v = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('gb_links_vid', v);
    }
    return v;
  } catch { return ''; }
}

// 流入経路タグ（?ref=）を localStorage に記録する。/links は app.goltomo.com＝アプリ本体と
// 同一オリジンなので、ここで書いておけば、後日リッチメニュー等からアプリを開いたときに
// /liff がこれを読み、新規登録時の acquisitionSource として保存できる。
// （LINEの友だち追加URLにはパラメータを載せられないため、この方法でしか経路を運べない）
function rememberRef() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const raw = sp.get('ref') || sp.get('utm_source') || sp.get('source') || 'ig_bio';
    const ref = String(raw).trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 40) || 'ig_bio';
    if (!localStorage.getItem('gb_ref')) {
      localStorage.setItem('gb_ref', ref);
      localStorage.setItem('gb_ref_at', String(Date.now()));
    }
    if (document.referrer && !localStorage.getItem('gb_referrer')) {
      localStorage.setItem('gb_referrer', document.referrer.slice(0, 200));
    }
  } catch { /* noop */ }
}

function hit(t: 'open' | 'line') {
  try {
    const body = JSON.stringify({ t, v: visitorId() });
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      navigator.sendBeacon('/api/lp/hit', new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch('/api/lp/hit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* noop */ }
}

export function HubLinks() {
  useEffect(() => { rememberRef(); hit('open'); }, []);
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

      {/* 友だち追加後の使い方ガイド：リッチメニュー右上「現在募集中」の場所を実画像＋ハイライトで示す */}
      <div className="rounded-[26px] p-5" style={{ background: '#FFFFFF', boxShadow: '7px 8px 0 ' + INK }}>
        <div className="text-[15px] font-black leading-relaxed" style={{ color: INK }}>
          友だち追加後は、トーク画面下のメニュー<span style={{ color: '#E8643C' }}>右上「現在募集中」</span>から、いつでも募集中のラウンドを見られます👇
        </div>
        <div className="relative mt-3 rounded-2xl overflow-hidden" style={{ border: '2px solid #E7F2EC' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/richmenu-guide.png" alt="LINEリッチメニュー：右上の「現在募集中」ボタン" className="block w-full h-auto" />
          {/* 右上セルのハイライト枠（画像は3列2行・外周約1.4%余白） */}
          <div
            className="absolute pointer-events-none rounded-2xl"
            style={{ top: '1.2%', left: '66.6%', width: '32%', height: '49%', border: '4px solid #E8643C', boxShadow: '0 0 0 3px rgba(232,100,60,0.35)' }}
          />
          <div
            className="absolute pointer-events-none px-2.5 py-1 rounded-full text-[12px] font-black"
            style={{ top: '52%', left: '66.6%', background: '#E8643C', color: '#FFFFFF' }}
          >
            👆 ここをタップ！
          </div>
        </div>
      </div>

    </div>
  );
}
