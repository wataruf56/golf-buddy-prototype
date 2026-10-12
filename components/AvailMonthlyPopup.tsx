'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { usePopupSlot, POPUP_PRIORITY, popupEvent } from '@/lib/popupSlot';

// 毎月の「行ける日を入れませんか？」（lib/availMonthly）（2026-10-12）。
// 月末の2日前〜月末に、翌月・翌々月の行ける日が未入力の人へ。ほかのポップアップとは重ならない（lib/popupSlot）。
// 「入力する」でも「閉じる」でも、その月はもう出さない。行ける日の画面では出さない。
type Prompt = { key: string; months: string[]; title: string; body: string };

export function AvailMonthlyPopup({ blocked }: { blocked: boolean }) {
  const meId = useStore((s) => s.meId);
  const hydrated = useStore((s) => s.hydrated);
  const pathname = usePathname() || '';
  const router = useRouter();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!hydrated || !meId || meId === 'me' || blocked || checked) return;
    setChecked(true);
    fetch('/api/me/avail-monthly', { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.prompt) setPrompt(j.prompt); }).catch(() => {});
  }, [hydrated, meId, blocked, checked]);

  const active = usePopupSlot('availMonthly', POPUP_PRIORITY.availMonthly, !!prompt && !blocked && !pathname.startsWith('/availability'));
  if (!prompt || !active) return null;

  const done = (action: 'go' | 'close') => {
    popupEvent('availMonthly', action, { month: prompt.key });
    fetch('/api/me/avail-monthly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: prompt.key }), cache: 'no-store', credentials: 'include' }).catch(() => {});
    setPrompt(null);
    if (action === 'go') router.push('/availability');
  };
  const monthLabels = prompt.months.map((m) => `${Number(m.slice(5, 7))}月`);

  return (
    <div className="absolute inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-card rounded-[22px] max-w-[360px] w-full shadow-[5px_5px_0_#1E3A30] border-[3px] border-border overflow-hidden text-center">
        <div className="bg-green text-white px-5 pt-5 pb-4 border-b-[3px] border-border">
          <div className="text-[34px] leading-none">📅⛳</div>
          <h3 className="text-[17px] font-black leading-snug mt-2 whitespace-pre-line">{prompt.title}</h3>
        </div>
        <div className="px-5 pt-4 pb-5">
          <div className="flex justify-center gap-2 mb-3">
            {monthLabels.map((m) => (
              <span key={m} className="px-3 py-1.5 rounded-xl bg-orange-light border-2 border-orange text-orange text-[14px] font-black">{m}</span>
            ))}
          </div>
          <p className="text-[12.5px] text-sub leading-relaxed mb-4">{prompt.body}</p>
          <button type="button" onClick={() => done('go')}
            className="w-full py-3.5 bg-orange text-white rounded-2xl font-black text-[15px] border-[2.5px] border-border shadow-[3px_3px_0_#1E3A30] active:translate-y-[2px] active:shadow-none">📅 行ける日を入力する</button>
          <button type="button" onClick={() => done('close')} className="block w-full mt-2 py-1.5 text-[12px] text-sub font-bold">閉じる</button>
        </div>
      </div>
    </div>
  );
}
