'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from '@/components/Toast';
import { dateLabel } from '@/lib/availabilityShared';

// 「行ける日」で声をかける（2026-10-11）。
// 「また回りたい」でマッチした相手（と友達）に、自分が「行ける日」に入れている日を何日か選んで
// 「この日、入れてみませんか？」とまとめて送る。送ると相手にDM（＋お知らせ・LINE）が届く。
// 再会エンジンの候補日カレンダー（また回りたい）は「行ける日」と同じことなので、これに置き換えた。
export function AvailNudgeBox({ partnerId, partnerName, onSent }: { partnerId: string; partnerName: string; onSent?: () => void }) {
  const [mine, setMine] = useState<string[] | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/availability', { cache: 'no-store', credentials: 'include' }).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/availability/nudge?toUserId=${encodeURIComponent(partnerId)}`, { cache: 'no-store', credentials: 'include' }).then((r) => (r.ok ? r.json() : null)),
    ]).then(([a, n]) => {
      if (cancelled) return;
      setMine(Array.isArray(a?.mine) ? a.mine : []);
      setSent(Array.isArray(n?.sentDates) ? n.sentDates : []);
    }).catch(() => { if (!cancelled) setMine([]); });
    return () => { cancelled = true; };
  }, [partnerId]);

  async function send() {
    if (!pick.size || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/availability/nudge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId: partnerId, dates: Array.from(pick).sort() }), cache: 'no-store', credentials: 'include',
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast(d?.message || '送れませんでした', 'error'); return; }
      setSent((s) => Array.from(new Set([...s, ...(d.dates || [])])));
      setPick(new Set());
      toast(`${partnerName}さんに声をかけました`);
      onSent?.();
    } catch { toast('送れませんでした', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="bg-card rounded-card p-4 shadow-card mb-4">
      <div className="text-[13px] font-black mb-1">📣 行ける日で声をかける</div>
      <div className="text-[11px] text-sub leading-relaxed mb-3">
        あなたが「行ける日」に入れている日から選んで、{partnerName}さんに「この日、入れてみませんか？」と送れます。何日でも選べます。
      </div>
      {mine === null ? (
        <div className="text-[12px] text-muted">読み込み中...</div>
      ) : mine.length === 0 ? (
        <div className="text-[12px] text-sub leading-relaxed">
          まだ「行ける日」が入っていません。先に行ける日を入れると、ここから声をかけられます。
          <Link href="/availability" className="block mt-2 w-full py-2.5 bg-green text-white rounded-xl text-[13px] font-bold text-center">📅 行ける日を入れる</Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {mine.map((d) => {
              const l = dateLabel(d);
              const on = pick.has(d);
              const done = sent.includes(d);
              return (
                <button key={d} type="button" disabled={done || busy} aria-pressed={on}
                  onClick={() => setPick((p) => { const n = new Set(p); if (n.has(d)) n.delete(d); else n.add(d); return n; })}
                  className={'px-3 py-2 rounded-xl text-[12px] font-black border-[1.5px] ' + (done ? 'bg-bg text-muted border-border' : on ? 'bg-green text-white border-green' : 'bg-card text-text border-border')}>
                  {on ? '✓ ' : ''}{l.md}（{l.w}）{done ? ' 送信済み' : ''}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={send} disabled={!pick.size || busy}
            className="w-full py-3 bg-orange text-white rounded-xl text-[13px] font-bold disabled:opacity-40">
            {busy ? '送信中...' : pick.size ? `${pick.size}日ぶん、${partnerName}さんに声をかける` : '日付を選んでください'}
          </button>
          <div className="text-[10px] text-muted mt-1.5">相手にはメッセージで届きます（同じ日は1回だけ送れます）。</div>
        </>
      )}
    </div>
  );
}
