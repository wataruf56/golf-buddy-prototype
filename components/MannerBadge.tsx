// マナー/信頼度バッジ。penalty=0 は「良好」を控えめに、1以上は警告色で表示。
// プロフィール（/profile/[id]）とインスタ風テスト版のプロフィール（/sns/u/[id]）で共用（2026-11-01 に部品へ切り出し）。
export function MannerBadge({ penalty }: { penalty: number }) {
  const p = Math.max(0, Math.floor(penalty || 0));
  if (p <= 0) {
    return (
      <div className="mt-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green bg-green-light border border-green rounded-full px-2.5 py-0.5">🤝 マナー良好</span>
      </div>
    );
  }
  const label = p === 1 ? '⚠️ 運営から注意あり' : '🚫 要注意（運営確認済み）';
  return (
    <div className="mt-1.5">
      <span className="inline-flex items-center gap-1 text-[11px] font-black text-red-600 bg-red-50 border border-red-300 rounded-full px-2.5 py-0.5">
        {label}{p > 1 ? ` ×${p}` : ''}
      </span>
    </div>
  );
}
