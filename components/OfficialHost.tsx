// Shared rendering for a ゴルトモ公式 (official) round's host area, plus a small
// inline badge. An official round is one whose host is an admin (server sets
// round.isOfficial). We deliberately DON'T show the admin's personal LINE
// name/photo for official posts — instead a branded ⛳ icon + "ゴルトモ公式".

export function OfficialBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded-full bg-green text-white text-[9px] font-black align-middle ${className}`}
    >
      <span>✓</span>
      <span>公式</span>
    </span>
  );
}

// Branded avatar for official posts — a green ⛳ disc instead of the host's photo.
export function OfficialAvatar({ size = 28 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-green flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <span style={{ fontSize: Math.round(size * 0.55) }}>⛳</span>
    </div>
  );
}

// Full host row for an official round (avatar + name + badge).
export function OfficialHostRow({ size = 28, compact = false }: { size?: number; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'pt-2.5 border-t border-border'}`}>
      <OfficialAvatar size={size} />
      <div className="text-xs font-black">ゴルトモ公式</div>
      <OfficialBadge />
    </div>
  );
}
