import 'server-only';
import { db } from './db';
import { isSwingAllowed } from './swingAccess';

// Per-user monthly free quota for swing analysis.
//
// Rules
// -----
// - Whitelisted users (admin-approved via /admin/users → "Swing解析を許可" or
//   env SWING_ALLOWED_USER_IDS / SWING_ALLOW_ALL=true) bypass the counter
//   entirely and have unlimited runs.
// - Everyone else gets SWING_FREE_LIMIT runs per calendar month (UTC+9).
//   Default = 1.
// - The counter is stored on the user document in `swingUsage` so we don't
//   need a new collection. Auto-resets when the month rolls over.
// - We count ANY successful submit, regardless of whether the analysis
//   eventually succeeds or fails. Otherwise users could re-roll free runs
//   by force-quitting after submit.

const DEFAULT_LIMIT = 1;

function freeLimit(): number {
  const raw = (process.env.SWING_FREE_LIMIT || '').trim();
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 0) return n;
  return DEFAULT_LIMIT;
}

/** YYYY-MM in JST. Quota windows align with the user's local calendar. */
export function currentMonthLabel(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export type QuotaStatus = {
  /** True when the caller may submit a new analysis. */
  allowed: boolean;
  /** True when the caller is on the unlimited whitelist. */
  whitelisted: boolean;
  /** Runs already consumed in the current month (0 if unlimited). */
  used: number;
  /** Free monthly cap (0 means quota disabled). Ignored when whitelisted. */
  limit: number;
  /** YYYY-MM month label the counters apply to. */
  month: string;
  /** Lifetime runs (informational only). */
  lifetime: number;
};

export async function getSwingQuota(userId: string | null | undefined): Promise<QuotaStatus> {
  const month = currentMonthLabel();
  const limit = freeLimit();
  if (!userId) {
    return { allowed: false, whitelisted: false, used: 0, limit, month, lifetime: 0 };
  }
  if (await isSwingAllowed(userId)) {
    return { allowed: true, whitelisted: true, used: 0, limit, month, lifetime: 0 };
  }
  const u = await db.getUser(userId);
  const usage = (u as any)?.swingUsage;
  // Stale month → effectively zero used.
  const used = usage?.month === month ? Number(usage.count) || 0 : 0;
  const lifetime = Number(usage?.lifetimeCount) || 0;
  return {
    allowed: used < limit,
    whitelisted: false,
    used,
    limit,
    month,
    lifetime,
  };
}

/**
 * Increment the calling user's monthly + lifetime swing-analysis counter.
 * No-ops for whitelisted users (we don't bother tracking them since they're
 * unlimited). Safe to call multiple times — it always reads, increments,
 * writes; in the rare case of a race the worst outcome is one over-count by
 * 1, which we'll happily eat to avoid the operational complexity of a real
 * Firestore transaction here.
 */
export async function incrementSwingUsage(userId: string): Promise<void> {
  if (!userId) return;
  if (await isSwingAllowed(userId)) return;
  const month = currentMonthLabel();
  const u = await db.getUser(userId);
  const prev = (u as any)?.swingUsage;
  const sameMonth = prev?.month === month;
  const next = {
    month,
    count: (sameMonth ? Number(prev.count) || 0 : 0) + 1,
    lifetimeCount: (Number(prev?.lifetimeCount) || 0) + 1,
  };
  await db.updateUser(userId, { swingUsage: next } as any);
}
