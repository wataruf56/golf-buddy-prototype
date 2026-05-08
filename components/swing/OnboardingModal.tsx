'use client';

import { useEffect, useState } from 'react';

const KEY = 'gb_swing_onboarded_v1';

const STEPS = [
  {
    emoji: '🏌️',
    title: 'AIコーチがスイングを見ます',
    body: 'スイング動画をアップロードすると、PGAツアープロを指導するレベルのAIコーチが、7フェーズに分けて具体的にアドバイスしてくれます。',
  },
  {
    emoji: '📹',
    title: '撮り方が大事',
    body: '横から、全身が映るように、明るい場所で撮ってください。スマホスタンドや三脚があるとベスト。3〜10秒の長さがおすすめ。',
  },
  {
    emoji: '⏱',
    title: '解析には1〜2分かかります',
    body: 'AIが動画を見て分析するのに少し時間が必要です。完了するとLINEに通知が届きます。',
  },
  {
    emoji: '🆚',
    title: '4つのモード',
    body: '「自分解析」「プロ比較」「過去比較」「自由質問」から選べます。まずは「自分解析」から試してみてください。',
  },
];

export function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(KEY)) setOpen(true);
  }, []);

  function close() {
    localStorage.setItem(KEY, '1');
    setOpen(false);
  }

  if (!open) return null;
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
      <div className="bg-card rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="p-6 text-center">
          <div className="text-5xl mb-3">{s.emoji}</div>
          <div className="text-base font-black mb-3">{s.title}</div>
          <div className="text-[13px] text-sub leading-relaxed">{s.body}</div>
        </div>

        <div className="flex justify-center gap-1.5 pb-3">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-green' : 'w-1.5 bg-border'}`} />
          ))}
        </div>

        <div className="flex p-3 gap-2 border-t border-border">
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)} className="flex-1 py-3 text-sm font-bold text-sub">
              戻る
            </button>
          )}
          <button
            onClick={() => isLast ? close() : setStep((s) => s + 1)}
            className="flex-1 py-3 bg-green text-white rounded-lg text-sm font-bold"
          >
            {isLast ? '始める！' : '次へ'}
          </button>
        </div>

        <button onClick={close} className="block w-full pb-3 text-[10px] text-muted">スキップ</button>
      </div>
    </div>
  );
}
