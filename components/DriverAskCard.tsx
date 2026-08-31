'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';
import { track } from '@/lib/telemetry';

// 管理者の代理ラウンド募集：車を出せる人に声をかけるカード。
//
// 【この機能の入口】
// プロフィールで「車あり」と答えた人にだけ出す。聞くのは1点だけ——
// 「あなたの車で、駅から一緒に行きませんか？」。
// ラウンドの可否ではなく、車を出せるかを聞く形にしている。
//
// 【駅を選んだ瞬間に募集が始まる】
// 枠を人手で作らせないのがこの機能の肝。駅を選んで登録したら、その場で
// 枠が立ち、本人が最初のメンバーになり、周りへの声かけが始まる。
//
// 計測（管理画面のファネル）：
//   pr_driver_view    … 声かけを見た
//   pr_driver_open    … 「駅を選ぶ」を押した
//   pr_driver_done    … 駅を登録した（＝枠が立った）
//   pr_driver_later   … 「あとで」を押した
type Ask = { show: boolean; title?: string; body?: string; stations?: string[]; snoozeDays?: number };

export function DriverAskCard() {
  const router = useRouter();
  const [ask, setAsk] = useState<Ask | null>(null);
  const [open, setOpen] = useState(false);      // 駅を選ぶ画面
  const [popup, setPopup] = useState(false);    // 最初の声かけ
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await fetch('/api/proxy-recruit/driver', { cache: 'no-store', credentials: 'include' });
        const j = await r.json();
        if (dead || !j?.show) return;
        setAsk(j);
        setPopup(true);
        track('pr_driver_view', {});
      } catch { /* 出せなくてもホームは動く */ }
    })();
    return () => { dead = true; };
  }, []);

  async function later() {
    setPopup(false); setOpen(false);
    track('pr_driver_later', {});
    try {
      await fetch('/api/proxy-recruit/driver', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snooze: true }), credentials: 'include',
      });
    } catch { /* 押した見た目だけ先に返す */ }
    setAsk(null);
  }

  function toStations() {
    setPopup(false); setOpen(true);
    track('pr_driver_open', {});
  }

  async function submit() {
    if (!picked.length) { toast('拾える駅を選んでください', 'error'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/proxy-recruit/driver', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stations: picked }), credentials: 'include',
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.message || '登録できませんでした');
      track('pr_driver_done', { n: picked.length });
      setOpen(false); setAsk(null);
      toast('募集を立てました。仲間が集まるのを待ちましょう');
      router.push(`/round/${j.id}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally { setBusy(false); }
  }

  if (!ask?.show) return null;

  return (
    <>
      {/* 閉じても戻ってこられるカード。ポップアップだけだと一度閉じたら終わってしまう */}
      <div className="px-5 pb-3">
        <button onClick={toStations}
          className="block w-full text-left border-2 border-green rounded-card p-4 bg-green-light">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚗</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black text-green-dark">{ask.title}</div>
              <div className="text-[11px] text-sub font-bold mt-0.5">
                拾える駅を選ぶだけ・運営が参加者を集めます
              </div>
            </div>
            <span className="text-green">›</span>
          </div>
        </button>
      </div>

      {/* 最初の声かけ */}
      {popup && (
        <div className="fixed inset-0 bg-black/45 z-[150] flex items-center justify-center p-5" onClick={later}>
          <div className="bg-card border-[3px] border-border rounded-card shadow-lg p-5 w-full max-w-[330px]"
            onClick={(e) => e.stopPropagation()}>
            <div className="text-center text-[34px] leading-none">🚗</div>
            <div className="text-[17px] font-black text-center mt-2 leading-snug">{ask.title}</div>
            <div className="text-[12.5px] font-bold text-sub text-center mt-2 leading-relaxed whitespace-pre-wrap">
              {ask.body}
            </div>
            {/* 先へ進む一番のボタンなので、アプリで一番強い色（オレンジ）を使う。
                白文字＋濃い縁で、クリーム地の上でもはっきり読めるようにする。 */}
            <button onClick={toStations}
              className="w-full mt-4 py-3.5 rounded-xl text-[15px] font-black border-2 text-white
                bg-orange border-border shadow-card">
              駅を選ぶ
            </button>
            <button onClick={later}
              className="w-full mt-2 py-2.5 rounded-xl text-[13px] font-bold border-2 border-hair bg-white text-muted">
              あとで
            </button>
          </div>
        </div>
      )}

      {/* 駅を選ぶ */}
      {open && (
        <div className="fixed inset-0 bg-black/45 z-[150] flex items-end sm:items-center justify-center"
          onClick={() => setOpen(false)}>
          <div className="bg-card border-t-[3px] sm:border-[3px] border-border sm:rounded-card rounded-t-card
            shadow-lg p-5 w-full sm:max-w-[360px] max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="text-[17px] font-black leading-snug">拾える駅を選んでください</div>
            <div className="text-[11.5px] font-bold text-sub mt-1.5 leading-relaxed">
              複数選べます。選んだ駅の近くにいる人へ、運営から声をかけます。
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              {(ask.stations || []).map((s) => {
                const on = picked.includes(s);
                return (
                  <button key={s}
                    onClick={() => setPicked((p) => on ? p.filter((x) => x !== s) : [...p, s])}
                    className={'text-[13px] font-black border-2 rounded-full px-3.5 py-2 ' +
                      (on ? 'bg-green border-border text-white' : 'bg-white border-border')}>
                    {s}
                  </button>
                );
              })}
            </div>

            <div className="text-[11.5px] font-bold text-sub mt-4 leading-relaxed bg-bg border border-hair rounded-xl p-3">
              登録すると<b className="text-text">その場で募集が立ちます</b>。<br />
              日程とコースは、集まってから相談して決められます。
            </div>

            <button onClick={submit} disabled={busy || !picked.length}
              className={'w-full mt-4 py-3.5 rounded-xl text-[15px] font-black border-2 text-white ' +
                (picked.length ? 'bg-orange border-orange' : 'bg-muted border-muted')}>
              {busy ? '登録中...' : `この${picked.length || ''}駅で募集を立てる`}
            </button>
            <button onClick={later}
              className="w-full mt-2 py-2.5 rounded-xl text-[13px] font-bold border-2 border-hair bg-white text-muted">
              あとで
            </button>
          </div>
        </div>
      )}
    </>
  );
}
