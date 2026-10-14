'use client';

import { useMemo, useState } from 'react';

// 候補日をカレンダーでまとめて選ぶ（イベントの「候補日から決める」・2026-10-15）。
// iPhone の日付入力は1日ずつしか選べないため、アプリ内のカレンダーでタップした日をそのまま候補にする。
// もう一度タップで外す。今日より前の日は選べない。max を超えては選べない。
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

export function MultiDatePicker({ selected, onToggle, max = 10, accent = '#7B5CD6' }: {
  selected: string[];                 // 'YYYY-MM-DD'
  onToggle: (date: string) => void;
  max?: number;
  accent?: string;
}) {
  const now = new Date();
  const today = ymd(now.getFullYear(), now.getMonth(), now.getDate());
  // 最初に開く月：選んだ日のうちいちばん早い月か、今月
  const first = [...selected].filter(Boolean).sort()[0];
  const [view, setView] = useState(() => {
    if (first) { const [y, m] = first.split('-').map(Number); return { y, m: m - 1 }; }
    return { y: now.getFullYear(), m: now.getMonth() };
  });
  const sel = useMemo(() => new Set(selected.filter(Boolean)), [selected]);
  const full = sel.size >= max;

  const cells = useMemo(() => {
    const startDow = new Date(view.y, view.m, 1).getDay();
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const out: Array<number | null> = Array.from({ length: startDow }, () => null);
    for (let d = 1; d <= days; d++) out.push(d);
    while (out.length % 7) out.push(null);
    return out;
  }, [view]);

  const isThisMonth = view.y === now.getFullYear() && view.m === now.getMonth();
  const move = (k: number) => setView((v) => {
    const d = new Date(v.y, v.m + k, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  return (
    <div className="rounded-xl border-[1.5px] border-border bg-card p-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <button type="button" onClick={() => move(-1)} disabled={isThisMonth} aria-label="前の月"
          className="w-8 h-8 rounded-full text-lg font-black text-sub disabled:opacity-25">‹</button>
        <div className="text-[13px] font-black">{view.y}年{view.m + 1}月</div>
        <button type="button" onClick={() => move(1)} aria-label="次の月"
          className="w-8 h-8 rounded-full text-lg font-black text-sub">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK.map((w, i) => (
          <div key={w} className={'text-[10px] font-bold py-0.5 ' + (i === 0 ? 'text-red' : i === 6 ? 'text-blue' : 'text-muted')}>{w}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const key = ymd(view.y, view.m, d);
          const past = key < today;
          const on = sel.has(key);
          const dow = i % 7;
          const disabled = past || (!on && full);
          return (
            <button key={key} type="button" disabled={disabled} onClick={() => onToggle(key)}
              aria-pressed={on} aria-label={`${view.m + 1}月${d}日${on ? '（選択中）' : ''}`}
              className={'h-9 rounded-lg text-[13px] font-bold border-[1.5px] ' + (on ? 'text-white' : past ? 'text-muted/40 border-transparent' : 'bg-bg border-transparent ' + (dow === 0 ? 'text-red' : dow === 6 ? 'text-blue' : 'text-text')) + (disabled && !past ? ' opacity-40' : '')}
              style={on ? { background: accent, borderColor: accent } : undefined}>
              {d}
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 text-[10.5px] font-bold text-center" style={{ color: accent }}>
        タップした日が候補日になります（もう一度タップで外す）・{sel.size}日選択中{full ? '（上限）' : ''}
      </div>
    </div>
  );
}
