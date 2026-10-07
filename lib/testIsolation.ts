import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ADMIN_MANAGER_ID } from './adminManagerId';

// ─────────────────────────────────────────────────────────────────────────────
// テスト隔離（2026-10-08・重大）
//
// テスト垢（test_〜、または管理画面で登録したテストアカウント）が起こした操作の通知は、
// テスト垢と管理者以外には **絶対に** 届けない。
//
// 背景：検証用に test_ の主催者で募集を作ったところ、「🎯 あなたのアンケート条件に一致する
// ラウンドが投稿されました」の LINE 通知が一般ユーザーに届いてしまった。
//
// 仕組み：
//   1. lib/session.getMeId() が Cookie からユーザーを特定した瞬間（同期）に、そのリクエストの
//      「操作した人」を AsyncLocalStorage に入れる。
//   2. LINE push（lib/linePush）とアプリ内通知（lib/notifications）は送る直前に必ずここを通り、
//      操作した人がテスト垢なら、宛先をテスト垢＋管理者だけに絞る。
//   3. 操作した人が分からないとき（cron・管理トークン経由）でも、通知のリンクが /round/<id> なら
//      その募集の主催者を見て、テスト垢の募集なら同じく絞る。
// ─────────────────────────────────────────────────────────────────────────────

type Actor = { meId: string | null };
const als = new AsyncLocalStorage<Actor>();

/** getMeId() から同期的に呼ぶ（await の前）。呼び出し元ハンドラの以後の処理すべてに引き継がれる。 */
export function enterRequestActor(meId: string | null): void {
  try { als.enterWith({ meId }); } catch { /* noop */ }
}

export function currentActorId(): string | null {
  return als.getStore()?.meId ?? null;
}

export const isTestPrefixedId = (id: string | null | undefined): boolean => !!id && id.startsWith('test_');

/** 管理者（ADMIN_USER_IDS / ADMIN_NOTIFY_USER_IDS）＋管理人アカウント。テスト中でもここには届いてよい。 */
export function adminRecipientSet(): Set<string> {
  const raw = `${process.env.ADMIN_USER_IDS || ''},${process.env.ADMIN_NOTIFY_USER_IDS || ''}`;
  const set = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  set.add(ADMIN_MANAGER_ID);
  return set;
}

const roundHostCache = new Map<string, { host: string; ts: number }>();
async function roundHostOf(roundId: string): Promise<string> {
  const hit = roundHostCache.get(roundId);
  if (hit && Date.now() - hit.ts < 60_000) return hit.host;
  let host = '';
  try { const { db } = await import('./db'); host = (await db.getRound(roundId))?.hostId || ''; } catch { /* noop */ }
  roundHostCache.set(roundId, { host, ts: Date.now() });
  return host;
}

async function isTestActorOrSubject(link?: string): Promise<{ test: boolean; why: string }> {
  const { isTestAccount } = await import('./testAccounts');
  const actor = currentActorId();
  if (actor && (await isTestAccount(actor))) return { test: true, why: `actor ${actor}` };
  // 操作した人が分からない（cron など）ときは、通知の対象の募集で判定する。リンクは liff URL（%2Fround%2F…）のこともある。
  let l = link || '';
  try { l = decodeURIComponent(l); } catch { /* noop */ }
  const m = /\/round\/([A-Za-z0-9_-]+)/.exec(l);
  if (m) {
    const host = await roundHostOf(m[1]);
    if (host && (await isTestAccount(host))) return { test: true, why: `round ${m[1]} host ${host}` };
  }
  return { test: false, why: '' };
}

/**
 * 通知の宛先を「テスト隔離」する。テスト垢の操作（またはテスト垢の募集）なら、
 * テスト垢と管理者以外の宛先を落とす。通常の操作ではそのまま返す。
 */
export async function isolateRecipients(ids: string[], link: string | undefined, where: string): Promise<string[]> {
  if (!ids.length) return ids;
  const { test, why } = await isTestActorOrSubject(link);
  if (!test) return ids;
  const { isTestAccount } = await import('./testAccounts');
  const admins = adminRecipientSet();
  const kept: string[] = [];
  for (const id of ids) {
    if (admins.has(id) || isTestPrefixedId(id) || (await isTestAccount(id))) kept.push(id);
  }
  const dropped = ids.length - kept.length;
  if (dropped > 0) console.warn(`[test-isolation] ${where}: dropped ${dropped} non-test recipient(s) (${why})`);
  return kept;
}
