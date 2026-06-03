'use client';

import type { SwingDoc } from '@/types/swing';

// Score-trend graph + per-axis "課題の改善" bars, shown at the top of the swing
// tab. Data comes from swingScore / swingAxes that the worker parses out of
// each analysis. Only analyses run after this feature shipped have scores, so
// the graph fills in over time.

function statusOf(v: number): { label: string; color: string } {
  if (v >= 75) return { label: '良好', color: '#34A85A' };
  if (v >= 50) return { label: '改善中', color: '#3AA0C9' };
  return { label: '要練習', color: '#E8943A' };
}

export function SwingProgress({ swings }: { swings: SwingDoc[] }) {
  // Done analyses that carry a score, oldest → newest for the trend line.
  const scored = swings
    .filter((s) => s.status === 'done' && typeof s.swingScore === 'number')
    .sort((a, b) => (a.completedAt || a.createdAt || 0) - (b.completedAt || b.createdAt || 0));

  // Not enough data yet → gentle hint so users know the feature exists.
  if (scored.length === 0) {
    return (
      <div className="px-5 pb-3">
        <div className="bg-card rounded-card p-4 shadow-card">
          <div className="text-[13px] font-bold mb-1">📊 スイングスコアの推移</div>
          <div className="text-[11px] text-sub leading-relaxed">
            解析するたびにスコアと課題が記録され、ここに伸びが表示されます。まずは1本、分析してみましょう。
          </div>
        </div>
      </div>
    );
  }

  const latest = scored[scored.length - 1];
  const first = scored[0];
  const delta = scored.length >= 2 ? (latest.swingScore! - first.swingScore!) : 0;
  const axes = latest.swingAxes || [];

  // Build the SVG polyline. Map score 0-100 → y (top=100, bottom=0).
  const W = 320, H = 130, padX = 14, padTop = 16, padBot = 24;
  const pts = scored.map((s, i) => {
    const x = scored.length === 1
      ? W / 2
      : padX + (i * (W - padX * 2)) / (scored.length - 1);
    const y = padTop + (1 - (s.swingScore! / 100)) * (H - padTop - padBot);
    return { x, y, v: s.swingScore! };
  });
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} ${pts[pts.length - 1].x.toFixed(1)},${H - padBot} ${pts[0].x.toFixed(1)},${H - padBot}`;

  return (
    <div className="px-5 pb-3 flex flex-col gap-3">
      {/* Trend */}
      <div className="bg-card rounded-card p-4 shadow-card">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-bold">📊 スイングスコアの推移</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-green leading-none">{latest.swingScore}</span>
            {scored.length >= 2 && (
              <span className={`text-[11px] font-bold ${delta >= 0 ? 'text-green' : 'text-orange'}`}>
                {delta >= 0 ? `+${delta}` : delta} ↑
              </span>
            )}
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ marginTop: 8 }}>
          <defs>
            <linearGradient id="swgrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#34A85A" stopOpacity="0.22" />
              <stop offset="1" stopColor="#34A85A" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 50, 100].map((g) => {
            const y = padTop + (1 - g / 100) * (H - padTop - padBot);
            return <line key={g} x1={padX} y1={y} x2={W - padX} y2={y} stroke="#eef2ef" />;
          })}
          {pts.length >= 2 && <polygon points={area} fill="url(#swgrad)" />}
          {pts.length >= 2 && (
            <polyline points={line} fill="none" stroke="#2D8C4E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 5 : 3} fill="#2D8C4E" />
          ))}
          <text x={padX} y={H - 6} fontSize="9" fill="#9aa7a0">{scored.length}回の解析</text>
          <text x={W - padX} y={H - 6} fontSize="9" fill="#9aa7a0" textAnchor="end">最新</text>
        </svg>
      </div>

      {/* Per-axis improvement bars (from the latest analysis) */}
      {axes.length > 0 && (
        <div className="bg-card rounded-card p-4 shadow-card">
          <div className="text-[13px] font-bold mb-1">課題の改善状況</div>
          <div className="text-[10px] text-muted mb-2">最新の解析より</div>
          <div className="flex flex-col gap-2.5">
            {axes.map((a) => {
              const st = statusOf(a.value);
              return (
                <div key={a.label}>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px]">{a.label}</span>
                    <span className="text-[10px] font-bold" style={{ color: st.color }}>{st.label}</span>
                  </div>
                  <div className="h-2 bg-bg rounded-full overflow-hidden mt-1">
                    <div className="h-full rounded-full" style={{ width: `${a.value}%`, background: st.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
