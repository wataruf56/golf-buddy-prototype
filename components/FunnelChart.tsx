'use client';

// 逆三角形のファネル図。上が広く、下へ行くほど細くなる。
//
// 幅は「いちばん上の段＝100%」の割合。段と段のあいだに、そこで消えた人数を出す。
// 数字を並べただけの表だと「どこで落ちたか」が読み取れないので、
// 形そのもので分かるようにする。
//
// 台形は SVG のポリゴンで描く。段の高さは固定、幅だけが変わる。
export type FunnelStage = {
  key: string;
  label: string;
  n: number;
  /** 補足（この段が何を意味するか） */
  note?: string;
  /** 最終ゴール（濃く塗る） */
  goal?: boolean;
  /** この段と次の段のあいだで「何が起きて消えたのか」。人数だけだと理由が分からない。 */
  lostNote?: string;
};

const W = 320;          // 図の幅
const H = 46;           // 1段の高さ
const GAP = 42;         // 段のあいだ（人数＋その理由の2行を置く）
const MIN_W = 30;       // 0人でも線が見えるようにする最小幅（大きすぎると小さい段どうしが同じ幅に見える）

export function FunnelChart({ stages, unit = '人' }: { stages: FunnelStage[]; unit?: string }) {
  const rows = stages.filter((s) => Number.isFinite(s.n));
  if (!rows.length) return null;
  const top = Math.max(rows[0].n, 1);
  const widthOf = (n: number) => Math.max(MIN_W, (Math.max(0, n) / top) * W);

  const totalH = rows.length * H + (rows.length - 1) * GAP;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W + 150} ${totalH + 8}`} width="100%" style={{ maxWidth: 470 }} role="img"
        aria-label="ファネル図">
        {rows.map((s, i) => {
          const y = i * (H + GAP);
          const wTop = widthOf(s.n);
          const wBottom = i + 1 < rows.length ? widthOf(rows[i + 1].n) : wTop * 0.82;
          const cx = W / 2;
          const pts = [
            [cx - wTop / 2, y], [cx + wTop / 2, y],
            [cx + wBottom / 2, y + H], [cx - wBottom / 2, y + H],
          ].map((p) => p.join(',')).join(' ');

          const lost = i + 1 < rows.length ? s.n - rows[i + 1].n : 0;
          const rate = s.n ? Math.round((lost / s.n) * 100) : 0;

          return (
            <g key={s.key}>
              <polygon points={pts}
                fill={s.goal ? '#2A8C82' : i === 0 ? '#FCE6DD' : '#FBF7EC'}
                stroke="#1E3A30" strokeWidth={2} strokeLinejoin="round" />
              <text x={cx} y={y + H / 2 + 1} textAnchor="middle" dominantBaseline="middle"
                fontSize={15} fontWeight={900} fill={s.goal ? '#FFFFFF' : '#1E3A30'}>
                {s.n}<tspan fontSize={10} fontWeight={700}>{unit}</tspan>
              </text>
              {/* 段の名前は右に置く（図の中に入れると狭くて読めない） */}
              <text x={W + 10} y={y + H / 2 - 4} fontSize={11.5} fontWeight={900} fill="#1E3A30">
                {s.label}
              </text>
              {s.note && (
                <text x={W + 10} y={y + H / 2 + 9} fontSize={9.5} fontWeight={700} fill="#9DB3A8">
                  {s.note}
                </text>
              )}
              {/* 脱落。人数の下に「何が起きたのか」を必ず添える。 */}
              {i + 1 < rows.length && (
                <>
                  <text x={cx} y={y + H + 15} textAnchor="middle"
                    fontSize={11} fontWeight={900} fill={lost > 0 ? '#E74C3C' : '#9DB3A8'}>
                    {lost > 0 ? `▼ ${lost}${unit}が消えた（${rate}%）` : '▼ 全員が次へ'}
                  </text>
                  {!!s.lostNote && (
                    <text x={cx} y={y + H + 30} textAnchor="middle"
                      fontSize={9.5} fontWeight={700} fill="#5E7A6C">
                      {s.lostNote}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
