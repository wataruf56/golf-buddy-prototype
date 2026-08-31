'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { track } from '@/lib/telemetry';
import { takeLpOrigin } from '@/lib/lpOrigin';
import { QRCodeSVG } from 'qrcode.react';

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
//   liff_pc      … PCで開かれたのでQRを出して止めた（LINEの赤いエラーに着かせない）
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

/**
 * PC（＝LINEアプリの外・スマホでもない）で開かれたか。
 *
 * ここで止めないと liff.login() がLINEのログインへ飛ばし、PCでは
 * **LINEの赤いエラー画面**に着いて終わる。ファネルで一番人が消えていた場所で、
 * 戻り道も無いので、そのまま二度と来ない。
 *
 * スマホのブラウザ（LINEの外のSafari/Chrome）は素通しにする。
 * そちらは liff.login() から LINEアプリへ繋がって正常に進むため。
 */
function isDesktopBrowser(): boolean {
  try {
    const ua = navigator.userAgent || '';
    if (/Line\//i.test(ua)) return false;                 // LINEアプリの中
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return false;  // スマホ・タブレット
    return true;
  } catch { return false; }
}

/**
 * このページに実際に渡ってきたパラメータを組み立てる。
 *
 * 【なぜ素の searchParams では足りないか】
 * LINEは LIFF URL の元のクエリを **`?liff.state=` に畳んで**渡してくることがある。
 * 例: /liff?lp=top&v=abc → /liff?liff.state=%3Flp%3Dtop%26v%3Dabc
 * このとき `search.get('lp')` は null になる。
 *
 * ここを見落としていたせいで、**LPから来た人がほぼ全員「LINEの中から直接来た人」に
 * 分類されていた**（7日間でLPから12人がLINEへ進んだのに、LP経由と分かったのは2人）。
 * その結果、管理画面のLPファネルの最後の段「会員になった」がずっと0のままだった。
 *
 * liff.state があれば中身を開いて、素のクエリに無いものだけ補う。
 */
function readLiffParams(search: URLSearchParams | null): URLSearchParams {
  const out = new URLSearchParams(search?.toString() || '');
  const state = out.get('liff.state');
  if (state) {
    try {
      // 値は「?a=1&b=2」か「/path?a=1」の形で来る。? の後ろだけを取る。
      const q = state.startsWith('?') ? state.slice(1) : (state.split('?')[1] || '');
      new URLSearchParams(q).forEach((v, k) => { if (!out.get(k)) out.set(k, v); });
    } catch { /* 開けなければ素のクエリだけで進む */ }
  }
  return out;
}

function LiffEntryInner() {
  const router = useRouter();
  const search = useSearchParams();
  const to = search?.get('to') || '/home';
  const retried = search?.get('retried') === '1';
  const [status, setStatus] = useState<string>('LIFFを起動中...');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [pc, setPc] = useState(false);

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
    // liff.state に畳まれている場合があるので、開いたものから読む。
    const q = readLiffParams(search);
    const urlRefRaw = (q.get('ref') || q.get('utm_source') || q.get('source') || '')
      .trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 40);
    const urlMenu = (q.get('e') || '').toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 40);
    const ctx = {
      vid: liffVisitorId(q.get('v')),
      entry: liffEntryOf(urlRefRaw, urlMenu),
      ref: urlRefRaw,
      // どのLPから飛んできたか（top=普通のLP / mbti=診断LP / links=リンクハブ）。
      // LPのCTAが ?lp= を付けてくれる。リッチメニュー等から直接来た場合は空。
      // ただし /links（インスタのリンクハブ）はLINEの友だち追加URLへ直接飛ばすため
      // パラメータを運べない。同一オリジンに残した記憶をここで拾う（一度きり）。
      fromLp: (q.get('lp') || '').replace(/[^a-z]/g, '').slice(0, 20) || takeLpOrigin(),
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

        // LIFF SDK は初期化のときに liff.state を展開して URL を書き戻すことがある。
        // 初期化前に読めていなかった印を、ここでもう一度拾い直す。
        // liff_open には間に合わないが、**肝心の liff_new（会員になった）には間に合う**。
        try {
          const q2 = readLiffParams(new URLSearchParams(window.location.search));
          const lp2 = (q2.get('lp') || '').replace(/[^a-z]/g, '').slice(0, 20);
          if (!ctx.fromLp && lp2) ctx.fromLp = lp2;
          const ref2 = (q2.get('ref') || q2.get('utm_source') || '')
            .toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 40);
          if (!ctx.ref && ref2) { ctx.ref = ref2; ctx.entry = liffEntryOf(ref2, urlMenu); }
        } catch { /* 拾えなくても先へ進む */ }

        liffTrack('liff_sdk', ctx);

        if (!liff.isLoggedIn()) {
          // PCはここで止める。この先の liff.login() がLINEの赤いエラー画面に着き、
          // 戻り道が無いまま終わってしまう。代わりにQRを出してスマホへ渡す。
          if (isDesktopBrowser()) {
            liffTrack('liff_pc', ctx);
            setPc(true);
            return;
          }
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
          // ?ref= が無い人（検索・直リンクなど）でも「どこから来たか」は分かる。
          // どのLPを踏んだか(lp)と、リッチメニューのどのボタンか(e)を一緒に送り、
          // サーバー側で流入経路を組み立てる。これが無いと全員 unknown になる。
          body: JSON.stringify({ idToken, friendFlag, ref, referrer, lp: ctx.fromLp, menu: urlMenu }),
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

  if (pc) return <PcQr to={to} />;
  return <LiffLoading status={status} errorMsg={errorMsg} />;
}

/**
 * PCで開いた人に出す画面。
 * ゴルトモはLINEの中で動くので、PCでは最後まで進めない。
 * 「使えません」で終わらせず、**同じURLのQR**を出して、そのままスマホへ渡す。
 */
function PcQr({ to }: { to: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('to', to);
      u.searchParams.delete('retried');
      setUrl(u.toString());
    } catch { setUrl('https://app.goltomo.com/liff'); }
  }, [to]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-bg">
      {/* 名乗りを先に置く。QRだけの無名のページは、初めて見る人には
          怪しいページに見えて読み取ってもらえない。 */}
      <div className="flex items-center gap-2 mb-6">
        <span className="w-9 h-9 rounded-full bg-orange text-white border-2 border-border grid place-items-center text-[17px]">⛳</span>
        <span className="text-[19px] font-black">ゴルトモ</span>
      </div>
      <div className="text-[19px] font-black mb-1">📱 スマホで開いてください</div>
      <div className="text-[12.5px] text-sub font-bold leading-relaxed mb-5 max-w-[300px]">
        ゴルトモはLINEの中で動くため、パソコンでは最後まで進めません。<br />
        下のQRコードをスマホのカメラで読み取ってください。
      </div>

      <div className="bg-white border-[3px] border-border rounded-card shadow-card p-4">
        {url ? <QRCodeSVG value={url} size={196} level="M" includeMargin={false} />
             : <div className="w-[196px] h-[196px]" />}
      </div>

      <div className="text-[11.5px] text-muted font-bold mt-4 leading-relaxed max-w-[300px]">
        スマホのカメラで読み取ると、そのまま続きから始められます。<br />
        うまくいかないときは、LINEで「ゴルトモ」を友だち追加してください。
      </div>
      <div className="text-[11px] text-muted font-bold mt-2">
        20〜30代限定のゴルフ友達マッチング
      </div>

      <a href="/" className="mt-5 text-[12px] font-black text-blue underline">
        サービスの説明を見る ›
      </a>
    </div>
  );
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
