'use client';

import { useState } from 'react';
import { PICKUP_STATIONS } from '@/lib/stations';
import { cn } from '@/lib/utils';

// ピックアップできる駅の複数選択。プリセット駅に加えて、ユーザーが任意の駅を
// 入力して「ひとつの選択肢（チップ）」として追加できる。
export function PickupStationPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [custom, setCustom] = useState('');
  const toggle = (st: string) =>
    onChange(value.includes(st) ? value.filter((x) => x !== st) : [...value, st]);
  const addCustom = () => {
    const v = custom.trim().slice(0, 20);
    if (!v) return;
    if (!value.includes(v)) onChange([...value, v]);
    setCustom('');
  };
  // プリセットにない＝ユーザーが任意入力した駅。
  const customSelected = value.filter((v) => !PICKUP_STATIONS.includes(v));

  return (
    <div>
      <div className="flex gap-1.5 flex-wrap">
        {PICKUP_STATIONS.map((st) => {
          const on = value.includes(st);
          return (
            <button
              key={st}
              type="button"
              onClick={() => toggle(st)}
              className={cn('px-3 py-1.5 text-xs font-bold rounded-full border-[1.5px]', on ? 'bg-green text-white border-green' : 'bg-bg border-border text-sub')}
            >{on ? '✓ ' : ''}{st}</button>
          );
        })}
        {customSelected.map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => toggle(st)}
            className="px-3 py-1.5 text-xs font-bold rounded-full border-[1.5px] bg-green text-white border-green"
            title="タップで削除"
          >✓ {st} ✕</button>
        ))}
      </div>
      <div className="flex gap-1.5 mt-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          placeholder="その他の駅を入力（例: 大船）"
          maxLength={20}
          className="flex-1 min-w-0 px-3 py-2 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none"
        />
        <button type="button" onClick={addCustom} className="px-4 py-2 bg-green text-white rounded-[10px] text-xs font-bold flex-shrink-0">追加</button>
      </div>
    </div>
  );
}
