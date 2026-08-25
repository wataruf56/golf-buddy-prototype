import 'server-only';
import { getAdminDb } from './firebase';

// 操作ログ（監査ログ）。**誰が・誰に・何をしたか**を1件1行で残す。
//
// なぜ要るか：会員を消した／利用を止めた／全員にLINEを送った、といった
// 取り返しのつかない操作が、これまでどこにも残っていなかった。
// 「誰がやったか」が追えないと、事故が起きたときに原因にたどり着けないし、
// 事業を人に渡すときに操作の責任が説明できない。
//
// 人が押した操作だけでなく、**自動で動くもの（再会エンジンなど）も同じ台帳に書く**。
// ユーザーから見れば「運営から何かされた」ことに変わりはないため。
//
// 書き込みは必ず握りつぶす。ログの失敗で本来の操作を止めてはいけない。

const COLL = '_auditLog';

export type AuditActorKind =
  | 'admin'     // 管理者本人（LINEログインで本人が特定できている）
  | 'token'     // 管理トークン経由（共有パスワードのため本人までは特定できない）
  | 'system';   // 自動処理（cron・再会エンジンなど）

export type AuditEntry = {
  ts: number;
  action: string;            // 'user.delete' / 'rematch.notify' など（下の ACTION 参照）
  actorKind: AuditActorKind;
  actorId: string;           // userId / 'token' / 'system:rematch'
  actorName?: string;
  targetId?: string;         // 操作された相手（会員ID・ラウンドIDなど）
  targetName?: string;
  targetKind?: 'user' | 'round' | 'pair' | 'config' | 'broadcast';
  /** 画面に出す一言。「何をしたか」が読んで分かる日本語にする。 */
  summary: string;
  detail?: Record<string, unknown>;
  ip?: string;
  ua?: string;
};

/** 使う action の一覧。増やすときはここに足して、画面のラベルも足す。 */
export const AUDIT_ACTION = {
  userDelete: 'user.delete',
  userBan: 'user.ban',
  userUnban: 'user.unban',
  userRestrict: 'user.restrict',
  swingAllow: 'user.swing_allow',
  supportSend: 'user.support_send',
  pushTest: 'user.push_test',
  broadcast: 'broadcast.send',
  reviewBlast: 'broadcast.review_blast',
  roundDelete: 'round.delete',
  officialCreate: 'official.create',
  officialClose: 'official.close',
  officialDelete: 'official.delete',
  configSave: 'config.save',
  testDataReset: 'data.reset_test',
  rematchNotify: 'rematch.notify',
  rematchRun: 'rematch.run',
  rematchReset: 'rematch.reset',
} as const;

/**
 * 1件書く。失敗しても例外は投げない。
 * `req` を渡すと IP と User-Agent も残す（誰の端末からかの手がかり）。
 */
export async function audit(
  entry: Omit<AuditEntry, 'ts'>,
  req?: { headers: { get(name: string): string | null } },
): Promise<void> {
  const db = getAdminDb() as any;
  if (!db) return;
  const row: AuditEntry = {
    ts: Date.now(),
    ...entry,
    ...(req
      ? {
          ip: (req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 45) || undefined,
          ua: (req.headers.get('user-agent') || '').slice(0, 180) || undefined,
        }
      : {}),
  };
  // undefined は Firestore が嫌がるので落とす
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (v !== undefined) clean[k] = v;
  try {
    await db.collection(COLL).add(clean);
  } catch (e) {
    console.error('[audit] write failed (non-fatal)', (e as Error).message);
  }
}

/**
 * 管理APIの「誰が」を決める。
 * 管理画面は共有トークンで動いているので、本人が特定できないことがある。
 * そこを 'token' として**正直に**残す（特定できたフリをしない）。
 */
export async function adminActor(meId?: string | null): Promise<Pick<AuditEntry, 'actorKind' | 'actorId' | 'actorName'>> {
  if (!meId) return { actorKind: 'token', actorId: 'token', actorName: '管理トークン（本人不明）' };
  let name = '';
  try {
    const { db } = await import('./db');
    name = (await db.getUser(meId))?.displayName || '';
  } catch { /* 名前は取れなくてもよい */ }
  return { actorKind: 'admin', actorId: meId, actorName: name || undefined };
}

/** 自動処理の「誰が」。 */
export const systemActor = (name: string): Pick<AuditEntry, 'actorKind' | 'actorId' | 'actorName'> => ({
  actorKind: 'system',
  actorId: `system:${name}`,
  actorName: name === 'rematch' ? '再会エンジン（自動）' : `${name}（自動）`,
});

/** 直近のログを読む。action / targetId / actorId で絞れる。 */
export async function listAudit(opts: {
  limit?: number; action?: string; targetId?: string; actorId?: string; since?: number;
} = {}): Promise<AuditEntry[]> {
  const db = getAdminDb() as any;
  if (!db) return [];
  const limit = Math.min(1000, Math.max(1, opts.limit || 200));
  try {
    // 複合インデックスを増やしたくないので、ts で引いてから絞る。
    const snap = await db.collection(COLL).orderBy('ts', 'desc').limit(limit * 4).get();
    let rows: AuditEntry[] = snap.docs.map((d: any) => d.data() as AuditEntry);
    if (opts.since) rows = rows.filter((r) => (r.ts || 0) >= opts.since!);
    if (opts.action) rows = rows.filter((r) => r.action === opts.action);
    if (opts.targetId) rows = rows.filter((r) => r.targetId === opts.targetId);
    if (opts.actorId) rows = rows.filter((r) => r.actorId === opts.actorId);
    return rows.slice(0, limit);
  } catch (e) {
    console.error('[audit] read failed', (e as Error).message);
    return [];
  }
}
