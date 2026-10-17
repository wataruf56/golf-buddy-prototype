'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { getMe, useStore } from '@/lib/store';
import { usePopupSlot, POPUP_PRIORITY, popupEvent } from '@/lib/popupSlot';

// 初めて登録した人へ「ゴルトモの使い方を見てみませんか？」（2026-10-17）。
// 使い方は下のタブから外し、マイページの「📖 使い方」に置いた。そのため最初の1回だけ、ここから使い方のページへ案内する。
// 出すのは 2026-10-17 以降にアプリを始めた人だけ（前からの会員には出さない）。「見る」「あとで」どちらでも以後は出さない（users.guideIntroSeenAt）。
// ほかのポップアップとは重ならない（lib/popupSlot）。使い方のページを開いているときは出さない。
const SINCE = Date.UTC(2026, 9, 16, 15, 0, 0);   // 2026-10-17 0:00（日本時間）

export function GuideIntroPopup({ blocked }: { blocked: boolean }) {
  const me = useStore(getMe) as any;
  const meId = useStore((s) => s.meId);
  const hydrated = useStore((s) => s.hydrated);
  const pathname = usePathname() || '';
  const router = useRouter();
  const [closed, setClosed] = useState(false);
  const want = hydrated && !!meId && meId !== 'me' && !blocked && !closed
    && !me?.guideIntroSeenAt && Number(me?.createdAt || 0) >= SINCE && !pathname.startsWith('/guide');
  const active = usePopupSlot('guideIntro', POPUP_PRIORITY.guideIntro, want);
  if (!active) return null;

  const done = (action: 'go' | 'later') => {
    popupEvent('guideIntro', action);
    setClosed(true);
    fetch('/api/me/guide-intro-seen', { method: 'POST', cache: 'no-store', credentials: 'include' }).catch(() => {});
    if (action === 'go') router.push('/guide');
  };

  return (
    <div className="absolute inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-card rounded-[22px] max-w-[360px] w-full shadow-[5px_5px_0_#1E3A30] border-[3px] border-border overflow-hidden text-center">
        <div className="bg-green text-white px-5 pt-5 pb-4 border-b-[3px] border-border">
          <div className="text-[34px] leading-none">📖⛳</div>
          <h3 className="text-[17px] font-black leading-snug mt-2">ゴルトモへようこそ！<br />まずは使い方を見てみませんか？</h3>
        </div>
        <div className="px-5 pt-4 pb-5">
          <p className="text-[12.5px] text-sub leading-relaxed mb-4">
            ラウンドの探し方・募集のしかた・行ける日・ゴル友まで、1分でわかります。
            <br />あとで見たくなったら、<b className="text-text">マイページの「📖 使い方」</b>からいつでも見られます。
          </p>
          <button type="button" onClick={() => done('go')}
            className="w-full py-3.5 bg-orange text-white rounded-2xl font-black text-[15px] border-[2.5px] border-border shadow-[3px_3px_0_#1E3A30] active:translate-y-[2px] active:shadow-none">📖 使い方を見る</button>
          <button type="button" onClick={() => done('later')} className="block w-full mt-2 py-1.5 text-[12px] text-sub font-bold">あとで</button>
        </div>
      </div>
    </div>
  );
}
