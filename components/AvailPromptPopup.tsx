'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { usePopupSlot, POPUP_PRIORITY } from '@/lib/popupSlot';

// ラウンド（コンペ）のあと、「行ける日」が未入力の参加者に1回だけ出すポップアップ（lib/availPrompt）（2026-10-11）
// 運営が OK を出して時刻を過ぎてから。レビューが残っている間は出さない（レビュー画面が先）。
// 「入力する」でも「閉じる」でも、もう出さない。
export function AvailPromptPopup({ blocked }: { blocked: boolean }) {
  const meId = useStore((s) => s.meId);
  const hydrated = useStore((s) => s.hydrated);
  const pathname = usePathname() || '';
  const router = useRouter();
  const [prompt, setPrompt] = useState<{ roundId: string; title: string; date: string } | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!hydrated || !meId || meId === 'me' || blocked || checked) return;
    setChecked(true);
    fetch('/api/me/avail-prompt', { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.prompt) { setPrompt(j.prompt); track('avail_prompt_show', { roundId: j.prompt.roundId }); } })
      .catch(() => {});
  }, [hydrated, meId, blocked, checked]);

  // ポップアップは同時に1つだけ（lib/popupSlot）
  const active = usePopupSlot('availPrompt', POPUP_PRIORITY.availPrompt, !!prompt && !blocked && !pathname.startsWith('/availability'));
  if (!prompt || !active) return null;

  const seen = () => {
    fetch('/api/me/avail-prompt', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId: prompt.roundId }), cache: 'no-store', credentials: 'include',
    }).catch(() => {});
  };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(prompt.date || '');
  const when = m ? `${Number(m[2])}月${Number(m[3])}日の` : '';

  return (
    <div className="absolute inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-card rounded-card max-w-[360px] w-full p-6 shadow-lg text-center border-2 border-border">
        <div className="text-4xl mb-2">⛳📅</div>
        <h3 className="text-[17px] font-black leading-snug mb-2">あなたが行ける日を<br />入力してみませんか？</h3>
        <p className="text-[13px] text-sub leading-relaxed mb-1">
          {when}「{prompt.title}」でご一緒したみんなと、また一緒に行きませんか？
        </p>
        <p className="text-[12px] text-sub leading-relaxed mb-4">
          行ける日を入れておくと、同じ日に行ける人と次のラウンドを組みやすくなります。日付を押すだけで、すぐ終わります。
        </p>
        <button
          type="button"
          onClick={() => { seen(); track('avail_prompt_go', { roundId: prompt.roundId }); setPrompt(null); router.push('/availability'); }}
          className="w-full py-3.5 bg-green text-white rounded-xl font-bold text-[15px]"
        >行ける日を入力する</button>
        <button
          type="button"
          onClick={() => { seen(); track('avail_prompt_close', { roundId: prompt.roundId }); setPrompt(null); }}
          className="block w-full mt-2 py-2 text-[12px] text-sub font-bold"
        >閉じる</button>
      </div>
    </div>
  );
}
