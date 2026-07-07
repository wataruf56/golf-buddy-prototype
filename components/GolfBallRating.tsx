'use client';

// ⛳ ゴルフボールで 0〜5 の評価を表示（0.5刻み・半分対応）。Googleマップの星と
// 同じ感覚：塗られたボール＝評価、右に数値＋（評価人数）。

const DIMPLES: Array<[number, number]> = [
  [10, 6], [7, 8.5], [13, 8.5], [10, 10.5], [7.5, 12.8], [12.5, 12.8], [10, 14.5],
];

// 1つ分のゴルフボール（color で塗り分け）。viewBox 20x20。
function Ball({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ display: 'block' }} aria-hidden>
      <circle cx="10" cy="10" r="9" fill={color} stroke="rgba(0,0,0,0.16)" strokeWidth="0.6" />
      {DIMPLES.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1" fill="rgba(0,0,0,0.13)" />
      ))}
    </svg>
  );
}

// fill: 0（空）/ 0.5（半分）/ 1（満）。左から fill 分だけ塗る。
function BallSlot({ fill, size }: { fill: number; size: number }) {
  const filled = '#3AA05A'; // グリーン
  const empty = '#DEE4DF';  // ライトグレー
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-block', flex: '0 0 auto' }}>
      <Ball color={empty} size={size} />
      {fill > 0 && (
        <span style={{ position: 'absolute', top: 0, left: 0, width: `${Math.min(1, fill) * 100}%`, height: '100%', overflow: 'hidden' }}>
          <span style={{ position: 'absolute', top: 0, left: 0 }}>
            <Ball color={filled} size={size} />
          </span>
        </span>
      )}
    </span>
  );
}

export function GolfBallRating({ value, count, size = 18, showNumber = true }: {
  value: number;      // 0〜5（0.5刻み）
  count?: number;     // 評価人数（あれば括弧書きで表示）
  size?: number;
  showNumber?: boolean;
}) {
  const v = Math.max(0, Math.min(5, value || 0));
  const slots = [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.min(1, v - i)));
  const hasRating = (count ?? 0) > 0;
  return (
    <span className="inline-flex items-center gap-1.5" style={{ lineHeight: 1 }}>
      <span className="inline-flex items-center gap-[3px]">
        {slots.map((f, i) => <BallSlot key={i} fill={f} size={size} />)}
      </span>
      {showNumber && (
        hasRating ? (
          <span className="inline-flex items-baseline gap-1">
            <span className="font-black text-text" style={{ fontSize: size * 0.9 }}>{v.toFixed(1)}</span>
            {typeof count === 'number' && <span className="text-muted font-bold" style={{ fontSize: size * 0.72 }}>({count})</span>}
          </span>
        ) : (
          <span className="text-muted font-bold" style={{ fontSize: size * 0.72 }}>評価なし</span>
        )
      )}
    </span>
  );
}
