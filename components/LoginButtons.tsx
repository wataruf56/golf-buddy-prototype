'use client';

import { loginHref } from '@/lib/loginLink';

// 未ログインの人に出す「新規登録」「ログイン」（2026-10-06 本人方針）。
// どちらも同じ LIFF の URL（LINE アプリの中で開き、自動ログインして元のページに戻る）。
// 新規か既存かは LINE 側が判断するので、ボタンを分ける意味は「迷わせない」ためだけ。
// Web のログイン画面は持たない。登録・ログインは LINE 公式アカウント経由だけ。
export function LoginButtons({ to, note }: { to: string; note?: string }) {
  const href = loginHref(to);
  return (
    <div>
      <div className="flex gap-2">
        <a href={href}
          className="flex-1 py-3 rounded-xl text-[15px] font-black text-white bg-orange border-2 border-[#C24E2C] shadow-[0_3px_0_#C24E2C] text-center">
          新規登録
        </a>
        <a href={href}
          className="flex-1 py-3 rounded-xl text-[15px] font-black text-green bg-card border-2 border-green text-center">
          ログイン
        </a>
      </div>
      <div className="text-[11px] text-muted text-center mt-2 leading-relaxed">
        {note || 'どちらもLINEで開きます（無料）。LINE公式アカウントの友だち追加が必要です。'}
      </div>
    </div>
  );
}
