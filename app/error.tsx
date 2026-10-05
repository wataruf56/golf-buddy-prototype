'use client';

import { useEffect, useState } from 'react';
import { CURRENT_BUILD, forceUpdate } from '@/lib/appUpdate';
import { isStaleBundleError, reportClientError } from '@/components/ClientErrorReporter';

// 画面の描画中に例外が起きたときの受け皿（Next.js の error boundary）。
// これが無いと英語の「Application error: a client-side exception has occurred」だけが出て、
// 本人は何もできず、運営にも何が起きたか残らなかった（2026-10-06・シェアURLを Safari で開いて発生）。
// - 中身は /api/client-error に送る（未ログインでも可）
// - 配信直後に古い画面が新しい部品を読みに行って失敗したとき（Safari: "Importing a module script failed."、
//   Chrome: ChunkLoadError）は、1回だけ自動で入れ直す（キャッシュと SW を消して読み直す）
// - それ以外は日本語で案内し、「読み直す」「もう一度試す」「ホームへ」を出す
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    reportClientError('boundary', error, { digest: error?.digest || '' });
    if (isStaleBundleError(error)) {
      const key = `gb_auto_reload_${CURRENT_BUILD || 'x'}`;
      try {
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          setReloading(true);
          forceUpdate();
        }
      } catch { /* sessionStorage が使えない環境ではボタンに任せる */ }
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-card rounded-2xl shadow-card p-5 text-center">
        <div className="text-[40px] leading-none mb-2">🙇</div>
        <div className="text-[16px] font-black text-text mb-1">{reloading ? '最新の状態に読み直しています…' : '画面の表示に失敗しました'}</div>
        <div className="text-[12px] text-sub leading-relaxed mb-4">
          {reloading
            ? 'そのままお待ちください。'
            : '一時的な不具合の可能性があります。読み直すと直ることが多いです。直らない場合は、ホームから開き直してみてください。'}
        </div>
        {!reloading && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => { setReloading(true); forceUpdate(); }}
              className="w-full py-3 rounded-xl bg-green text-white text-[14px] font-black"
            >
              🔄 読み直す
            </button>
            <button onClick={() => reset()} className="w-full py-2.5 rounded-xl bg-bg text-text text-[13px] font-bold border border-border">
              もう一度試す
            </button>
            <a href="/home" className="w-full py-2.5 rounded-xl text-[13px] font-bold text-blue">ホームへ</a>
          </div>
        )}
        <div className="text-[10px] text-muted mt-4 break-all">
          {String(error?.message || '').slice(0, 120)}{error?.digest ? ` (${error.digest})` : ''}
        </div>
      </div>
    </div>
  );
}
