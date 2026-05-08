import 'server-only';

// Whitelist gate for the swing analysis feature.
// While in closed beta, only LINE userIds listed in SWING_ALLOWED_USER_IDS may use it.
// Format: comma-separated `U....` values, e.g. "U41f8...,U00f6..."
// Empty / unset env → no one allowed (we'd rather fail closed than open).
//
// To enable for everyone (post-beta), set SWING_ALLOW_ALL=true.

export function isSwingAllowed(userId: string | null | undefined): boolean {
  if (!userId) return false;
  if ((process.env.SWING_ALLOW_ALL || '').toLowerCase() === 'true') return true;
  const raw = process.env.SWING_ALLOWED_USER_IDS || '';
  if (!raw.trim()) return false;
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return ids.includes(userId);
}
