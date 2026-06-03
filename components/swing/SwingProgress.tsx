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

  // Per-axis history: for each fixed axis, the series of values across all
  // scored analyses (oldest→newest) so we can show the trajectory + change.
  const AXIS_ORDER = ['体重移動', '手打ちの抑制', '頭の位置', 'スイング軌道', 'テンポ'];
  const seenAxes = new Set<string>();
  scored.forEach((s) => (s.swingAxes || []).forEach((a) => seenAxes.add(a.label)));
  const axisLabels = [
    ...AXIS_ORDER.filter((l) => seenAxes.has(l)),
    ...Array.from(seenAxes).filter((l) => !AXIS_ORDER.includes(l)),
  ];
  const axisData = axisLabels
    .map((label) => {
      const series = scored
        .map((s) => (s.swingAxes || []).find((a) => a.label === label)?.value)
        .filter((v): v is number => typeof v === 'number');
      return { label, series, latest: series[series.length - 1], first: series[0] };
    })
    .filter((a) => typeof a.latest === 'number');

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

      {/* Per-axis improvement — shows the trajectory across all analyses so the
          change over time is clear, not just the latest snapshot. */}
      {axisData.length > 0 && (
        <div className="bg-card rounded-card p-4 shadow-card">
          <div className="text-[13px] font-bold mb-0.5">課題の改善状況</div>
          <div className="text-[10px] text-muted mb-2.5">
            {scored.length >= 2 ? `解析${scored.length}回分の推移（初回→最新）` : '解析を重ねると推移が表示されます'}
          </div>
          <div className="flex flex-col gap-3">
            {axisData.map((a) => {
              const st = statusOf(a.latest);
              const delta = a.series.length >= 2 ? a.latest - a.first : 0;
              const improved = delta > 0;
              return (
                <div key={a.label} className="flex items-center gap-3">
                  <div className="w-[68px] flex-shrink-0">
                    <div className="text-[12px] font-semibold leading-tight">{a.label}</div>
                    <div className="text-[10px] font-bold" style={{ color: st.color }}>{st.label}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <AxisSpark values={a.series} color={st.color} />
                  </div>
                  <div className="w-[52px] text-right flex-shrink-0">
                    <div className="text-[16px] font-black leading-none" style={{ color: st.color }}>{a.latest}</div>
                    {a.series.length >= 2 && (
                      <div className={`text-[10px] font-bold ${improved ? 'text-green' : delta < 0 ? 'text-orange' : 'text-muted'}`}>
                        {delta > 0 ? `+${delta}` : delta}{improved ? ' ↑' : delta < 0 ? ' ↓' : ''}
                      </div>
                    )}
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

// Tiny per-axis sparkline. y is fixed to a 0-100 scale so the line's height
// also reflects the absolute level, not just the shape.
function AxisSpark({ values, color }: { values: number[]; color: string }) {
  const w = 140, h = 30, p = 4;
  const x = (i: number) => (values.length <= 1 ? w / 2 : p + (i * (w - p * 2)) / (values.length - 1));
  const y = (v: number) => p + (1 - v / 100) * (h - p * 2);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <line x1={p} y1={y(50)} x2={w - p} y2={y(50)} stroke="#eef2ef" strokeWidth="1" />
      {values.length >= 2 && (
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 3.5 : 2} fill={color} />
      ))}
    </svg>
  );
}
