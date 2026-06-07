'use client';

import { cn } from '@/lib/utils';

// ＋／− で数値を増減する共通ステッパー（募集人数・性別内訳などで使用）。
export function Stepper({
  value, onMinus, onPlus, minusDisabled, plusDisabled, suffix, sm,
}: {
  value: number;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
  suffix?: string;
  sm?: boolean;
}) {
  const btn = cn(
    'flex items-center justify-center font-black bg-card text-text disabled:text-muted disabled:bg-bg',
    sm ? 'w-10 h-10 text-lg' : 'w-12 h-12 text-xl'
  );
  return (
    <div className="inline-flex items-center border-2 border-border rounded-xl overflow-hidden bg-bg">
      <button type="button" onClick={onMinus} disabled={minusDisabled} className={cn(btn, 'border-r-2 border-border')}>−</button>
      <div className={cn('text-center font-mono font-black', sm ? 'min-w-[44px] text-lg' : 'min-w-[60px] text-xl')}>
        {value}{suffix && <span className="text-xs font-bold ml-0.5">{suffix}</span>}
      </div>
      <button type="button" onClick={onPlus} disabled={plusDisabled} className={cn(btn, 'border-l-2 border-border')}>＋</button>
    </div>
  );
}
