// Swing pages are open to anyone logged in. Per-user enforcement happens at
// /api/swing/submit via the monthly quota (lib/swingQuota) — whitelisted
// users get unlimited runs, everyone else gets SWING_FREE_LIMIT/month.
//
// The old SwingAccessGate ("開発準備中です") used to wrap this layout when
// the feature was closed beta. Removed so the new quota UI on /swing can
// actually render for non-whitelisted users.
export default function SwingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
