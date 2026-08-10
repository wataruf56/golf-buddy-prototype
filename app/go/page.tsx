'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

// 流入経路タグを運ぶための中継ページ（app.goltomo.com/go?ref=xxx）。
//
// 課題：外部（インスタ・診断LP・チラシ等）から LINE公式の友だち追加URL
//   https://line.me/R/ti/p/@711xiyrs
// へ直接飛ばすと、LINE のURLにはパラメータを載せられず、かつ goltomo.com と
// app.goltomo.com はオリジンが違って localStorage を共有できないため、
// 「どこから来た人か」が完全に失われる（実際に登録44人中0人しかタグが付いていなかった）。
//
// 解決：このページを必ず1枚挟む。ここは app.goltomo.com＝アプリ本体と同一オリジンなので、
// ここで localStorage に gb_ref を書いておけば、その人が後日リッチメニュー等から
// LIFFアプリ（app.goltomo.com/liff）を開いたときに /liff がそれを読み、
// /api/auth/liff が新規登録時の acquisitionSource として保存できる。
//
// 使い方：外部リンクは https://app.goltomo.com/go?ref=ig_bio のようにする。
//   ?to=line （既定）… LINE友だち追加へ転送
//   ?to=app        … LIFFアプリへ転送（?ref= はURLでも運ぶ）
const LINE_ADD_URL = 'https://line.me/R/ti/p/@711xiyrs';
const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || '2009973733-P5UdNex9';

export default function GoPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();

  useEffect(() => {
    const norm = (s: string | null) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 40);
    const ref = norm(search?.get('ref') || search?.get('utm_source') || search?.get('source') || '');
    const to = (search?.get('to') || 'line').toLowerCase();

    try {
      // 初回タッチ優先（すでに記録済みなら上書きしない）。
      if (ref && !localStorage.getItem('gb_ref')) {
        localStorage.setItem('gb_ref', ref);
        localStorage.setItem('gb_ref_at', String(Date.now()));
      }
      if (document.referrer && !localStorage.getItem('gb_referrer')) {
        localStorage.setItem('gb_referrer', document.referrer.slice(0, 200));
      }
    } catch { /* localStorage が使えない環境でも転送は続行 */ }

    // 計測（開封数）。失敗しても転送は止めない。
    try {
      const body = JSON.stringify({ t: 'go', ref });
      if ('sendBeacon' in navigator) navigator.sendBeacon('/api/lp/hit', new Blob([body], { type: 'application/json' }));
    } catch { /* noop */ }

    const target = to === 'app'
      ? `https://liff.line.me/${LIFF_ID}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`
      : LINE_ADD_URL;
    // replace で履歴を汚さない（戻るでこの中継ページに戻らない）。
    window.location.replace(target);
  }, [search]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
      <div className="text-4xl mb-3">⛳</div>
      <div className="text-[15px] font-black mb-1">LINEを開いています…</div>
      <div className="text-[12px] text-sub">自動で移動しない場合は
        <a href={LINE_ADD_URL} className="text-green font-bold underline ml-1">こちらをタップ</a>
      </div>
    </div>
  );
}
