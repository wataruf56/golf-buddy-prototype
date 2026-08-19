'use client';

import { useEffect, useState } from 'react';
import { useStore, getMe } from '@/lib/store';

// LINE公式アカウントを友だち追加していない人に、追加をすすめる案内。
//
// 追加していないとマッチ通知・参加承認・リマインドが一切届かない。
// 実測では利用者の約3割が未追加だった（管理画面の「誰が友だち追加して
// いないか調べる」で判定した結果を users.botFollowed に保存している）。
//
// 出す条件：botFollowed === false（未追加と確定している人）だけ。
//   undefined（未判定）の人には出さない。誤って追加済みの人に見せると
//   「もう追加している」と混乱させるため。
// 閉じたら3日は出さない。毎回出すと邪魔になる。
const LINE_ADD_URL = 'https://line.me/R/ti/p/@711xiyrs';
const SNOOZE_KEY = 'gb_line_follow_snooze';
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

export function LineFollowPrompt() {
  const me = useStore(getMe);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!me) return;
    if ((me as any).botFollowed !== false) return;   // 未追加と確定した人だけ
    try {
      const until = Number(localStorage.getItem(SNOOZE_KEY) || 0);
      if (until && Date.now() < until) return;
    } catch { /* localStorage が使えなくても出す */ }
    // 画面が落ち着いてから出す（起動直後に被せない）
    const t = setTimeout(() => setShow(true), 1200);
    return () => clearTimeout(t);
  }, [me]);

  if (!show) return null;

  const close = () => {
    setShow(false);
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)); } catch { /* noop */ }
  };

  return (
    <div className="absolute inset-0 z-[190] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-card rounded-card max-w-[340px] w-full p-6 shadow-lg text-center">
        <div className="text-4xl mb-2">🔔</div>
        <h3 className="text-[17px] font-black mb-2 leading-snug">
          LINE公式アカウントに<br />登録すると便利です
        </h3>
        <p className="text-[13px] text-sub leading-relaxed mb-1">
          登録すると、通知がLINEで受け取れます。
        </p>
        <ul className="text-[12.5px] text-sub leading-relaxed mb-4 text-left inline-block">
          <li>・参加が承認されたとき</li>
          <li>・新しいメッセージが届いたとき</li>
          <li>・ラウンドの前日リマインド</li>
        </ul>
        <a
          href={LINE_ADD_URL}
          onClick={close}
          className="block w-full py-3 rounded-xl font-black text-sm text-white"
          style={{ background: '#06C755' }}
        >
          💬 LINEで友だち追加する
        </a>
        <button onClick={close} className="mt-3 text-[12px] text-muted font-bold">
          あとで
        </button>
      </div>
    </div>
  );
}
