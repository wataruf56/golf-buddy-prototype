'use client';

import { useState } from 'react';
import { Portal } from '@/components/Portal';
import { toast } from '@/components/Toast';
import { useStore, getMe } from '@/lib/store';
import { usePopupSlot, popupEvent } from '@/lib/popupSlot';
import { INTRO_AREAS, INTRO_BUDGETS, INTRO_CARS, composeIntro } from '@/lib/roomIntro';

// 行ける日の部屋に入るときの「ひとこと」（2026-10-12・lib/roomIntro）。
// 選ぶだけの3問 → 本人の発言として最初のあいさつを部屋のチャットに入れる。「最初に話す人」をなくすため。
// 1部屋1回だけ（送る・送らない、どちらでも以後は出さない）。ほかの自動ポップアップとは重ならない（lib/popupSlot）。
export function RoomIntroSheet({ roomId, dateLabel, onDone }: { roomId: string; dateLabel?: string; onDone: (sent: boolean) => void }) {
  const me = useStore(getMe);
  const [areas, setAreas] = useState<string[]>([]);
  const [budget, setBudget] = useState('');
  const [car, setCar] = useState(me?.car === 'have' ? 'drive' : '');
  const [busy, setBusy] = useState(false);
  const active = usePopupSlot('roomIntro', 58, true);
  if (!active) return null;

  const toggleArea = (a: string) => setAreas((cur) => {
    if (a === 'どこでも') return cur.includes(a) ? [] : ['どこでも'];
    const base = cur.filter((x) => x !== 'どこでも');
    return base.includes(a) ? base.filter((x) => x !== a) : [...base, a].slice(0, 3);
  });
  const preview = composeIntro(me?.displayName || 'あなた', { areas, budget, car });

  async function submit(skip: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/rounds/${roomId}/room-intro`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', credentials: 'include',
        body: JSON.stringify(skip ? { skip: true } : { areas, budget, car }),
      });
      if (!res.ok) throw new Error(String(res.status));
      popupEvent('roomIntro', skip ? 'skip' : 'send');
      if (!skip) toast('あいさつを送りました');
      onDone(!skip);
    } catch { toast('送れませんでした', 'error'); }
    finally { setBusy(false); }
  }

  const chip = (on: boolean) => 'px-3 py-1.5 rounded-full text-[12.5px] font-bold border-[1.5px] ' + (on ? 'bg-green text-white border-green' : 'bg-card text-text border-border');
  return (
    <Portal>
      <div className="fixed inset-0 z-[150] bg-black/50 flex items-end justify-center">
        <div className="bg-bg rounded-t-[22px] w-full max-w-[480px] max-h-[88vh] overflow-y-auto border-t-[3px] border-border px-4 pt-4 pb-6">
          <div className="text-center">
            <div className="text-[26px] leading-none">👋</div>
            <div className="text-[16px] font-black mt-1.5">{dateLabel ? `${dateLabel}の` : ''}チャットにあいさつしよう</div>
            <div className="text-[11.5px] text-sub mt-1">選ぶだけで、あなたのあいさつがチャットに入ります</div>
          </div>

          <Q n={1} title="行きたい方面（3つまで）">
            <div className="flex flex-wrap gap-1.5">
              {INTRO_AREAS.map((a) => <button key={a} type="button" onClick={() => toggleArea(a)} className={chip(areas.includes(a))}>{a}</button>)}
            </div>
          </Q>
          <Q n={2} title="予算（プレー代）">
            <div className="flex flex-wrap gap-1.5">
              {INTRO_BUDGETS.map((b) => <button key={b.key} type="button" onClick={() => setBudget(budget === b.key ? '' : b.key)} className={chip(budget === b.key)}>{b.label}</button>)}
            </div>
          </Q>
          <Q n={3} title="車">
            <div className="flex flex-wrap gap-1.5">
              {INTRO_CARS.map((c) => <button key={c.key} type="button" onClick={() => setCar(car === c.key ? '' : c.key)} className={chip(car === c.key)}>{c.label}</button>)}
            </div>
          </Q>

          <div className="mt-4">
            <div className="text-[11px] font-bold text-sub mb-1">送られるメッセージ</div>
            <div className="flex justify-end">
              <div className="max-w-[85%] px-3.5 py-2.5 text-[13px] leading-relaxed bg-green text-white" style={{ borderRadius: '14px 14px 4px 14px' }}>{preview}</div>
            </div>
          </div>

          <button type="button" disabled={busy} onClick={() => submit(false)}
            className="mt-4 w-full py-3.5 bg-orange text-white rounded-2xl font-black text-[15px] border-[2.5px] border-border shadow-[3px_3px_0_#1E3A30] disabled:opacity-50">この内容であいさつする</button>
          <button type="button" disabled={busy} onClick={() => submit(true)} className="block w-full mt-2 py-1.5 text-[12px] text-sub font-bold">あいさつしないで入る</button>
        </div>
      </div>
    </Portal>
  );
}

function Q({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-5 h-5 rounded-full bg-orange text-white text-[10px] font-black grid place-items-center">{n}</span>
        <span className="text-[13px] font-black">{title}</span>
      </div>
      {children}
    </div>
  );
}
