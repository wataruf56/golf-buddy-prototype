'use client';

import type { SwingMode } from '@/types/swing';

const MODES: { id: SwingMode; emoji: string; title: string; desc: string }[] = [
  { id: 'self', emoji: '🏌️', title: '自分のスイング解析', desc: '7フェーズ評価＋改善点TOP3' },
  { id: 'compare', emoji: '🆚', title: 'プロと比較', desc: 'プロ動画と自分の動画を対比' },
  { id: 'past', emoji: '📈', title: '過去と比較', desc: '前回と今回の変化を判定' },
  { id: 'range_vs_round', emoji: '🏟️', title: '練習場 vs ラウンド', desc: '練習場と本番の差分を可視化' },
  { id: 'question', emoji: '❓', title: '自由質問', desc: '動画について自由に質問' },
];

export function ModeSelector({ value, onChange }: { value: SwingMode | ''; onChange: (m: SwingMode) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {MODES.map((m) => {
        const active = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={`flex items-center gap-3 p-3.5 rounded-xl border-[1.5px] text-left ${
              active ? 'border-green bg-green-light' : 'border-border bg-card'
            }`}
          >
            <span className="text-2xl">{m.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold">{m.title}</div>
              <div className="text-[11px] text-sub mt-0.5">{m.desc}</div>
            </div>
            <span className={`text-lg ${active ? 'text-green' : 'text-muted'}`}>›</span>
          </button>
        );
      })}
    </div>
  );
}
