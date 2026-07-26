import { db } from './db';
import { ADMIN_MANAGER_ID, ADMIN_MANAGER_NAME } from './adminManagerId';

// 運営の「管理人」サポート窓口アカウント。通報対応などで運営↔ユーザーがDMできる。
// 一般ユーザーの検索・招待・マッチング一覧には出さず、DM相手としてのみ振る舞う。
export { ADMIN_MANAGER_ID, ADMIN_MANAGER_NAME } from './adminManagerId';

export function isSystemUserId(id: string | null | undefined): boolean {
  return id === ADMIN_MANAGER_ID;
}

// 「管理人」ユーザードキュメントが無ければ作る（初回のDM時などに呼ぶ）。
let _ensured = false;
export async function ensureAdminManager(): Promise<void> {
  if (_ensured) return;
  try {
    const existing = await db.getUser(ADMIN_MANAGER_ID);
    if (!existing) {
      await db.upsertUser({
        id: ADMIN_MANAGER_ID,
        displayName: ADMIN_MANAGER_NAME,
        avatar: '🛡️',
        color: '#2A8C82',
        age: 0, area: '', scoreRange: '', playStyle: '', frequency: '',
        reviewAvg: 0, reviewCount: 0, roundCount: 0, buddyCount: 0,
        isSystem: true,
      } as any);
    } else if (!(existing as any).isSystem) {
      await db.upsertUser({ id: ADMIN_MANAGER_ID, isSystem: true } as any);
    }
    _ensured = true;
  } catch (e) {
    console.error('[ensureAdminManager] failed', e);
  }
}
