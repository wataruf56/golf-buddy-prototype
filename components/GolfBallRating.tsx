'use client';

// ★ 星で 0〜5 の評価を表示（0.5刻み・半分対応）。Googleマップ等と同じ一般的な
// レビュー表示：塗られた星＝評価、右に数値＋（評価人数）。
// ※ コンポーネント名は互換のため GolfBallRating のまま（見た目は星）。

// Material の星アイコン（viewBox 0 0 24 24）。
const STAR_PATH = 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';

function Star({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }} aria-hidden>
      <path d={STAR_PATH} fill={color} stroke="rgba(0,0,0,0.12)" strokeWidth="0.5" strokeLinejoin="round" />
    </svg>
  );
}

// fill: 0（空）/ 0.5（半分）/ 1（満）。左から fill 分だけ塗る。
function StarSlot({ fill, size }: { fill: number; size: number }) {
  const filled = '#FBBF24'; // ゴールド（一般的なレビューの星色）
  const empty = '#E2E5E9';  // ライトグレー
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-block', flex: '0 0 auto' }}>
      <Star color={empty} size={size} />
      {fill > 0 && (
        <span style={{ position: 'absolute', top: 0, left: 0, width: `${Math.min(1, fill) * 100}%`, height: '100%', overflow: 'hidden' }}>
          <span style={{ position: 'absolute', top: 0, left: 0 }}>
            <Star color={filled} size={size} />
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
        {slots.map((f, i) => <StarSlot key={i} fill={f} size={size} />)}
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
