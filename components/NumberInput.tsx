'use client';

// 数値入力の共通コンポーネント。
// ⚠️ 数値入力は必ずこれ（または同等の text+inputMode パターン）を使うこと。
// 素の <input type="number"> を制御値で使うと「15」と打っても「015」のように先頭ゼロが
// 残る React の癖がある（value が数値的に等しいと DOM 文字列を上書きしないため）。
// ここでは type="text" + inputMode="numeric" にし、onChange で数字以外と先頭ゼロを除去、
// 親へは number|null を返す。下限は確定時(onBlur)にクランプ（入力途中で弾かないため）。
type Props = {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  id?: string;
};

export function NumberInput({ value, onChange, min, max, placeholder, className, ariaLabel, id }: Props) {
  const display = value == null ? '' : String(value); // 数値→文字列化なので先頭ゼロは付かない
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={className}
      value={display}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
        if (digits === '') { onChange(null); return; }
        let n = parseInt(digits, 10);
        if (max != null && n > max) n = max; // 上限だけ入力中にクランプ
        onChange(n);
      }}
      onBlur={() => {
        if (value == null) return;
        let n = value;
        if (min != null && n < min) n = min;
        if (max != null && n > max) n = max;
        if (n !== value) onChange(n);
      }}
    />
  );
}
