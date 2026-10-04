'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Portal } from '@/components/Portal';
import { toast } from '@/components/Toast';
import { store } from '@/lib/store';

// LINE公式アカウントの友だち追加を**必須**にする関所（2026-10-04 本人判断）。
//
// 【どこで出すか】本登録（プロフィール登録）と、募集への参加申込の前。
// 共有リンクから来た人が「見る → 登録 → 参加」と進むときに、必ず友だち追加を通す。
// 追加していないと承認・メッセージ・前日リマインドが一切届かないため。
//
// 【判定】サーバー（/api/me/friendship＝Messaging API）で確かめる。本人の申告では通さない。
//   ・開いた瞬間にまず黙って確かめ、追加済みならこの画面は出さずに通す
//   ・未追加なら案内を出す。「友だち追加する」→ LINE の追加画面 → 戻ってくると自動で再判定
//   ・判定できない（LINE側のエラー等）ときは、会員を閉じ込めないよう通す
// 「あとで」は無い。
const LINE_ADD_URL = 'https://line.me/R/ti/p/@711xiyrs';

type Props = {
  /** 何のために必要か（文面に差し込む） */
  reason?: string;
  /** 通ったとき（追加済み・判定不能） */
  onPass: () => void;
};

export function FriendGate({ reason = '参加の承認やメッセージ、前日のリマインドはLINEで届きます。', onPass }: Props) {
  const [state, setState] = useState<'checking' | 'blocked'>('checking');
  const [busy, setBusy] = useState(false);
  const passed = useRef(false);

  const pass = useCallback(() => {
    if (passed.current) return;
    passed.current = true;
    store.refreshMe().catch(() => {});
    onPass();
  }, [onPass]);

  const check = useCallback(async (silent: boolean) => {
    setBusy(true);
    try {
      const r = await fetch('/api/me/friendship', { method: 'POST', credentials: 'include', cache: 'no-store' });
      const j = r.ok ? await r.json() : { friend: null };
      if (j.friend === true || j.friend === null) { pass(); return; }
      setState('blocked');
      if (!silent) toast('まだ友だち追加が確認できません。追加してから、もう一度押してください', 'error');
    } catch {
      // 確かめられないときは閉じ込めない
      pass();
    } finally { setBusy(false); }
  }, [pass]);

  // 開いた瞬間に黙って確かめる
  useEffect(() => { check(true); }, [check]);

  // LINE の追加画面から戻ってきたら自動で確かめ直す
  useEffect(() => {
    if (state !== 'blocked') return;
    const onBack = () => { if (document.visibilityState === 'visible') check(true); };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => { document.removeEventListener('visibilitychange', onBack); window.removeEventListener('focus', onBack); };
  }, [state, check]);

  if (state !== 'blocked') return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[320] bg-text/55 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="friend-gate-title">
        <div className="w-full max-w-[380px] bg-card border-[3px] border-border rounded-2xl shadow-lg p-5">
          <div className="text-[11px] font-black text-green tracking-wide">あと1ステップ（必須）</div>
          <h2 id="friend-gate-title" className="text-[18px] font-black leading-snug mt-0.5 mb-2">LINE公式アカウントを<br />友だち追加してください</h2>
          <p className="text-[12.5px] text-sub font-bold leading-relaxed m-0">
            {reason}
            追加していないと連絡が届かないため、ゴルトモでは友だち追加を必須にしています。
          </p>
          <a href={LINE_ADD_URL} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full mt-4 py-3 rounded-xl border-2 border-border font-black text-white text-[15px]"
            style={{ background: '#06C755' }}>
            <img src="/line-logo.png" alt="" width="184" height="183" className="h-5 w-auto bg-white rounded border border-border p-0.5" style={{ boxSizing: 'content-box' }} />
            LINEで友だち追加する
          </a>
          <button type="button" disabled={busy} onClick={() => check(false)}
            className="block w-full mt-2 py-3 rounded-xl border-2 border-border bg-white text-[14px] font-black disabled:opacity-60">
            {busy ? '確認中…' : '✓ 追加しました（確認する）'}
          </button>
          <div className="text-[11px] text-muted font-bold mt-2 leading-relaxed">
            追加したのに進めないときは、LINEのトーク一覧に「ゴルトモ」があるか確かめて、もう一度「確認する」を押してください。
          </div>
        </div>
      </div>
    </Portal>
  );
}
