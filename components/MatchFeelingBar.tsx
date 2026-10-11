'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/components/Toast';
import { confirmDialog } from '@/components/ConfirmDialog';
import { cn } from '@/lib/utils';

// 「まだ一緒にラウンドしてみたいと思う？」（2026-10-11）
// マッチしている相手（お互いに「行きたい」か💘を選んだ相手）とのDM画面の上と、その人のプロフィールに常に出す。
// レビューと同じ3択（思わない／どっちでも／行きたい）。💘でマッチしている相手には 💘 も出す。
// 選び直すと過去のレビューとマッチが書き換わる（/api/me/match-feeling → lib/matchFeeling）。相手には伝わらない。
type Kind = 'again' | 'romantic' | null;

export function MatchFeelingBar({ otherId, otherName, compact }: { otherId: string; otherName: string; compact?: boolean }) {
  const [matched, setMatched] = useState<Kind | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/me/match-feeling?userId=${encodeURIComponent(otherId)}`, { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setMatched((j?.matched as Kind) ?? null); })
      .catch(() => { if (!cancelled) setMatched(null); });
    return () => { cancelled = true; };
  }, [otherId]);

  if (!matched) return null;
  const current: 'again' | 'romantic' = matched;

  async function choose(feeling: 'never' | 'either' | 'again' | 'romantic') {
    if (busy || feeling === current) return;
    if (feeling === 'never' && !(await confirmDialog({ title: '「思わない」にしますか？', message: `${otherName}さんとのマッチが解除され、お互いにメッセージが送れなくなります。\n相手に伝わることはありません。`, confirmText: '思わない にする', danger: true }))) return;
    if (feeling === 'either' && !(await confirmDialog({ title: '「どっちでも」にしますか？', message: `${otherName}さんとのマッチが解除されます（ゴル友などほかのつながりがあれば、メッセージはそのまま送れます）。\n相手に伝わることはありません。`, confirmText: 'どっちでも にする' }))) return;
    if (feeling === 'again' && current === 'romantic' && !(await confirmDialog({ message: '💘「異性として気になる」を外して、「行きたい」（友人として）にしますか？', confirmText: '行きたい にする' }))) return;
    setBusy(true);
    try {
      const res = await fetch('/api/me/match-feeling', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: otherId, feeling }), cache: 'no-store', credentials: 'include',
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast(d?.message || '変更できませんでした', 'error'); return; }
      setMatched((d.matched as Kind) ?? null);
      toast(feeling === 'never' || feeling === 'either' ? '選び直しました（相手には伝わりません）' : '保存しました');
    } catch { toast('変更できませんでした', 'error'); }
    finally { setBusy(false); }
  }

  const opts: Array<{ key: 'never' | 'either' | 'again'; label: string; sel: string }> = [
    { key: 'never', label: '思わない', sel: 'bg-[#C0392B] text-white border-[#C0392B]' },
    { key: 'either', label: 'どっちでも', sel: 'bg-[#9b876a] text-white border-[#9b876a]' },
    { key: 'again', label: '行きたい', sel: 'bg-green text-white border-green' },
  ];
  return (
    <div className={cn('bg-card border-border', compact ? 'px-4 py-2.5 border-b' : 'rounded-card border-2 shadow-card p-3.5 mt-3')}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex-1 min-w-0 text-[12.5px] font-black leading-snug">🏌️ まだ一緒にラウンドしてみたいと思う？</div>
        {current === 'romantic' && <span className="flex-none text-[10px] font-black text-pink-600 bg-pink-100 border border-pink-600 rounded-full px-1.5 py-px">💘 気になる同士</span>}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {opts.map((o) => {
          const on = o.key === 'again';   // マッチしている＝いまは「行きたい」（💘を含む）
          return (
            <button key={o.key} type="button" disabled={busy} onClick={() => choose(o.key)} aria-pressed={on}
              className={cn('py-1.5 rounded-[10px] text-[12px] font-bold border-[1.5px] disabled:opacity-50', on ? o.sel : 'bg-card text-sub border-border')}>
              {on ? '✓ ' : ''}{o.label}
            </button>
          );
        })}
      </div>
      <div className="text-[10px] text-muted mt-1.5">🔒 選び直しても相手には伝わりません。{compact ? '' : 'お互いに「行きたい」のあいだはマッチが続きます。'}</div>
    </div>
  );
}
