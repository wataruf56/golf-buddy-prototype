'use client';

import { useRouter } from 'next/navigation';
import { PhoneFrame } from '@/components/PhoneFrame';

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export default function LoginPage() {
  const router = useRouter();

  function handleLogin() {
    // 共有リンク等から ?callbackUrl=/round/xxx が付いていれば、ログイン後そこへ戻す。
    // 安全のため内部パス（/始まり・//除く）のみ許可。無ければホームへ。
    let cb = '/home';
    try {
      const p = new URLSearchParams(window.location.search).get('callbackUrl');
      if (p && p.startsWith('/') && !p.startsWith('//')) cb = p;
    } catch {}
    if (isDemo) {
      router.push(cb);
      return;
    }
    // ブラウザ（Safari/Chrome）でも LIFF 経由でログインする。Firebase Hosting は
    // `__session` Cookie しか Cloud Run へ転送しないため、NextAuth の Cookie では
    // セッションが確立できずログイン画面をループしてしまう。/liff は idToken を
    // 検証して __session を発行し、ログイン後は ?to= のページへ戻す。
    window.location.href = `/liff?to=${encodeURIComponent(cb)}`;
  }

  return (
    <PhoneFrame>
      <div className="screen px-6 flex flex-col items-center justify-center text-center">
        <div className="w-24 h-24 rounded-full bg-green-light flex items-center justify-center text-5xl mb-6">⛳</div>
        <h1 className="text-3xl font-black mb-2">ゴルトモ</h1>
        <p className="text-sm text-sub mb-12">ゴル友マッチング × AIスイング解析<br />同年代のゴルファーと一緒にラウンドを回ろう</p>

        <button
          onClick={handleLogin}
          className="w-full max-w-[280px] py-4 bg-[#06C755] text-white rounded-xl text-base font-bold flex items-center justify-center gap-2 mb-3"
        >
          <span className="text-xl">💬</span>
          {isDemo ? 'デモモードでログイン' : 'LINEでログイン'}
        </button>

        {isDemo && (
          <div className="text-[11px] text-muted mt-2 max-w-[280px]">
            デモモードが有効です（NEXT_PUBLIC_DEMO_MODE=true）<br />
            LINE認証をスキップしてサンプルデータで動作します
          </div>
        )}

        <div className="text-[11px] text-muted mt-8 max-w-[280px]">
          ログインすることで利用規約とプライバシーポリシーに同意したものとみなされます
        </div>
      </div>
    </PhoneFrame>
  );
}
