'use client';

// ラウンドの費用入力。基本は男女同額（単一入力）。「男女で金額が違う」をONにすると
// 男性・女性の金額を個別に入力できる（無料・割引プランなどに対応）。
// 親が price / priceMale / priceFemale / split の状態を保持する制御コンポーネント。

const inputCls = 'w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none';

export function PriceField({
  split, onSplitChange,
  price, onPriceChange,
  priceMale, onPriceMaleChange,
  priceFemale, onPriceFemaleChange,
  singlePlaceholder = '例: ¥8,000〜',
}: {
  split: boolean;
  onSplitChange: (v: boolean) => void;
  price: string;
  onPriceChange: (v: string) => void;
  priceMale: string;
  onPriceMaleChange: (v: string) => void;
  priceFemale: string;
  onPriceFemaleChange: (v: string) => void;
  singlePlaceholder?: string;
}) {
  return (
    <div>
      {!split ? (
        <input value={price} onChange={(e) => onPriceChange(e.target.value)} placeholder={singlePlaceholder} className={inputCls} />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-blue w-14 flex-shrink-0">👨 男性</span>
            <input value={priceMale} onChange={(e) => onPriceMaleChange(e.target.value)} placeholder="例: ¥8,000〜" className={inputCls + ' flex-1'} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-pink-600 w-14 flex-shrink-0">👩 女性</span>
            <input value={priceFemale} onChange={(e) => onPriceFemaleChange(e.target.value)} placeholder="例: ¥6,000〜（無料・割引など）" className={inputCls + ' flex-1'} />
          </div>
        </div>
      )}
      <label className="mt-2 flex items-center gap-2 cursor-pointer text-[12px] font-bold text-sub select-none">
        <input
          type="checkbox"
          checked={split}
          onChange={(e) => onSplitChange(e.target.checked)}
          className="w-4 h-4 accent-green"
        />
        ♂♀ 男女で金額が違う（無料・割引プランなど）
      </label>
      {split && (
        <div className="mt-1 text-[10px] text-muted">入力した金額は、見ている人の性別に応じて表示されます。</div>
      )}
    </div>
  );
}
