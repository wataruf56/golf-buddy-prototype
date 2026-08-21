'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { track } from '@/lib/telemetry';

// LIFF entry: initialize SDK → ensure logged in → exchange idToken for our cookie → redirect.
// Default redirect target is /home, override with ?to=/round/xxx etc.
//
// Auto-recovers from an expired LINE ID token by calling liff.logout() and
// re-running liff.login(). A `?retried=1` flag in the redirect URI prevents
// the recovery from looping if the second attempt also fails — we surface a
// clear error to the user instead of leaving them on a spinner forever.
export default function LiffEntryPage() {
  return (
    <Suspense fallback={<LiffLoading status="LIFFを起動中..." />}>
      <LiffEntryInner />
    </Suspense>
  );
}

// LINEへ飛んだ後、どこで人が落ちているかを測る。
//
// 【なぜ作り直したか】
// 旧版は liff_open / liff_login / liff_signup の3段しかなく、しかも
//   - liff_signup が「セッション発行に成功した」だけで発火していた
//     → 既存会員の再ログインまで「登録完了」に数えていた（総ユーザー数が増えないのに
//       登録完了が増える、の正体）
//   - visitorId が localStorage 依存で、LP(goltomo.com) と LIFF(app.goltomo.com) で
//     別IDになっていた → 同じ人を最後まで追えていなかった
// を抱えていた。ここでは段階を細かくし、新規と既存を分け、LPのIDを引き継ぐ。
//
//   liff_open    … LIFF起動画面に到達（＝LINEアプリ内で開けた）
//   liff_sdk     … LIFF SDKの初期化に成功（失敗するとここで止まる）
//   liff_login   … LINEログインへ転送した（戻って来ない人＝ログイン画面で離脱）
//   liff_back    … ログインから戻ってきた（liff_login との差が「戻らなかった人」）
//   liff_auth    … サーバー認証OK（セッション発行）
//   liff_new     … 新規会員として作成された ★これが本当の「登録完了」
//   liff_return  … 既存会員の再ログイン（登録数には数えない）
//   liff_error   … 途中で失敗（note に理由）
const LIFF_VID_KEY = 'gb_vid';
const LIFF_BACK_KEY = 'gb_liff_await_login';

// LPから ?v= で渡ってきた visitorId を最優先で使う。無ければ自前で採番。
function liffVisitorId(fromUrl?: string | null): string {
  try {
    const passed = (fromUrl || '').replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 40);
    if (passed) { localStorage.setItem(LIFF_VID_KEY, passed); return passed; }
    let v = localStorage.getItem(LIFF_VID_KEY);
    if (!v) { v = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); localStorage.setItem(LIFF_VID_KEY, v); }
    return v;
  } catch { return 'v_' + Math.random().toString(36).slice(2, 10); }
}

function liffTrack(event: string, ctx: { vid: string; entry: string; ref: string; fromLp: string }, extra?: Record<string, unknown>) {
  try {
    const body = JSON.stringify({
      visitorId: ctx.vid,
      event: 'step', page: 'liff', entry: ctx.entry, ref: ctx.ref, fromLp: ctx.fromLp, step: event,
      isMobile: /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent) ? 1 : 0,
      ...(extra || {}),
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('https://app.goltomo.com/api/lp/track', new Blob([body], { type: 'text/plain' }));
    } else {
      fetch('https://app.goltomo.com/api/lp/track', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, keepalive: true, mode: 'no-cors' }).catch(() => {});
    }
  } catch { /* 計測でログインを止めない */ }
}

// 入口の判定。サーバー側(app/api/lp/track)が受け付ける値だけを返す
// （知らない値は 'direct' に潰されてしまい、内訳が壊れるため）。
function liffEntryOf(ref: string, menu: string): string {
  if (menu) return 'richmenu';
  if (/^ig(_|$)|^insta/.test(ref) || ref === 'share_img') return 'instagram';
  if (/^line(_|$)/.test(ref) || ref === 'richmenu') return 'richmenu';
  if (/^(google|yahoo|bing|search|seo)/.test(ref)) return 'search';
  if (ref) return 'other';
  return 'line';
}

function LiffEntryInner() {
  const router = useRouter();
  const search = useSearchParams();
  const to = search?.get('to') || '/home';
  const retried = search?.get('retried') === '1';
  const [status, setStatus] = useState<string>('LIFFを起動中...');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '';
    if (!liffId) {
      setErrorMsg('NEXT_PUBLIC_LIFF_ID が未設定です。Vercel の環境変数に LIFF ID を入れてください。');
      return;
    }

    // Build the URL we want LINE to send the user back to after liff.login().
    // We deliberately encode `to` and `retried=1` so they survive the OAuth
    // round-trip even when LIFF SDK rewrites the query into ?liff.state=.
    const buildRetryRedirect = () =>
      `${window.location.origin}/liff?retried=1&to=${encodeURIComponent(to)}`;

    // 計測用のコンテキスト。?v= はLPから引き継いだID、?ref= はどのLPから来たか。
    const urlRefRaw = (search?.get('ref') || search?.get('utm_source') || search?.get('source') || '')
      .trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 40);
    const urlMenu = (search?.get('e') || '').toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 40);
    const ctx = {
      vid: liffVisitorId(search?.get('v')),
      entry: liffEntryOf(urlRefRaw, urlMenu),
      ref: urlRefRaw,
      // どのLPから飛んできたか（top=普通のLP / mbti=診断LP / links=リンクハブ）。
      // LPのCTAが ?lp= を付けてくれる。リッチメニュー等から直接来た場合は空。
      fromLp: (search?.get('lp') || '').replace(/[^a-z]/g, '').slice(0, 20),
    };

    let cancelled = false;
    (async () => {
      try {
        liffTrack('liff_open', ctx);
        // ログインへ送り出した印が残っていれば「戻ってきた」。
        // liff_login と liff_back の差が、そのままログイン画面で消えた人数になる。
        try {
          if (sessionStorage.getItem(LIFF_BACK_KEY)) {
            sessionStorage.removeItem(LIFF_BACK_KEY);
            liffTrack('liff_back', ctx);
          }
        } catch { /* noop */ }

        setStatus('LIFF SDK 読み込み中...');
        const liff = (await import('@line/liff')).default;
        await liff.init({ liffId });
        if (cancelled) return;
        liffTrack('liff_sdk', ctx);

        if (!liff.isLoggedIn()) {
          if (retried) {
            throw new Error('LINE ログインに失敗しました。LINE アプリを再起動してからもう一度お試しください。');
          }
          setStatus('LINE ログインへ転送...');
          liffTrack('liff_login', ctx);
          try { sessionStorage.setItem(LIFF_BACK_KEY, '1'); } catch { /* noop */ }
          liff.login({ redirectUri: buildRetryRedirect() });
          return;
        }

        setStatus('セッション発行中...');
        const idToken = liff.getIDToken();
        if (!idToken) throw new Error('idToken が取得できませんでした');

        // 公式LINEアカウントの友だち追加状況を取得（プロバイダーにOAが
        // 紐付いている場合のみ有効。取得できなければ undefined のまま送る）。
        let friendFlag: boolean | undefined = undefined;
        try {
          const fs = await liff.getFriendship();
          if (fs && typeof fs.friendFlag === 'boolean') friendFlag = fs.friendFlag;
        } catch { /* getFriendship 非対応環境では無視 */ }

        // 流入経路：着地時に記憶した ?ref= と referrer を登録時に渡す（新規のみ保存される）。
        // このLIFF URLに直接 ?ref= が付いていた場合もここで拾って初回タッチとして記録する。
        let ref = '', referrer = '';
        try {
          const urlRef = urlRefRaw;
          if (urlRef && !localStorage.getItem('gb_ref')) {
            localStorage.setItem('gb_ref', urlRef);
            localStorage.setItem('gb_ref_at', String(Date.now()));
          }
          ref = localStorage.getItem('gb_ref') || '';
          referrer = localStorage.getItem('gb_referrer') || (document.referrer || '').slice(0, 200);
        } catch {}

        const res = await fetch('/api/auth/liff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, friendFlag, ref, referrer }),
          cache: 'no-store',
          credentials: 'include',
        });

        if (!res.ok) {
          const text = await res.text();
          liffTrack('liff_error', ctx, { note: `auth ${res.status}` });
          // Expired ID token: the SDK is handing back a stale cached token.
          // Log out + log in once to force a refresh; the URL flag above
          // stops us from doing this twice in a row.
          if (res.status === 401 && /expired/i.test(text)) {
            if (retried) {
              throw new Error('セッションが繰り返し期限切れになります。LINE アプリを再起動してからもう一度お試しください。');
            }
            setStatus('セッション更新中...');
            try { liff.logout(); } catch {}
            liff.login({ redirectUri: buildRetryRedirect() });
            return;
          }
          throw new Error(`auth failed: ${res.status} ${text.slice(0, 200)}`);
        }

        // サーバーが返す isNewUser で「本当に会員が増えたのか」を分ける。
        // これが無かったせいで、旧版は既存会員の再ログインを登録完了に数えていた。
        let isNew = false;
        try { isNew = !!(await res.clone().json())?.isNewUser; } catch { /* 旧レスポンス互換 */ }

        // リッチメニューからの入口（?e=）を記録。ログイン確立後に送る（userIdが付く）。
        try {
          if (urlMenu) track('menu_entry', { menu: urlMenu });
        } catch {}

        liffTrack('liff_auth', ctx);
        liffTrack(isNew ? 'liff_new' : 'liff_return', ctx);
        setStatus('完了。ホームへ移動します...');
        router.replace(to);
      } catch (e) {
        if (cancelled) return;
        liffTrack('liff_error', ctx, { note: (e as Error).message.slice(0, 60) });
        setErrorMsg((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [router, to, retried]);

  return <LiffLoading status={status} errorMsg={errorMsg} />;
}

function LiffLoading({ status, errorMsg }: { status: string; errorMsg?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-bg">
      <div className="text-4xl mb-4 animate-pulse">⛳</div>
      <div className="text-base font-bold mb-2">ゴルトモ</div>
      <div className="text-sm text-sub mb-2">{status}</div>
      {errorMsg && (
        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-xs max-w-sm break-words">
          {errorMsg}
        </div>
      )}
    </div>
  );
}
