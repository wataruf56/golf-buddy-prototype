import 'server-only';

// Admin allow-list. Comma-separated LINE userIds in env `ADMIN_USER_IDS`.
// Falls back to ADMIN_NOTIFY_USER_IDS (already configured for new-signup pings)
// so we don't have to re-enter the same id twice.

export function isAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const raw = (process.env.ADMIN_USER_IDS || process.env.ADMIN_NOTIFY_USER_IDS || '').trim();
  if (!raw) return false;
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return ids.includes(userId);
}
