import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import { db as appDb } from '@/lib/db';
import { dmAllowedSet } from '@/lib/dmPolicy';

// GET /api/stats/recent-logins
// 直近ログイン順のユーザー（最大30人）。ホーム「自分のプロフィール」下のグリッド表示用。
// 各ユーザーに canDm を付与：判定は lib/dmPolicy（ゴル友／同ラウンド・コンペ／申請・招待の関係／
// 募集中の主催者）に一元化。lastActiveAt は bootstrap でアプリを開くたびに更新される。
// テストアカウントは一般ユーザーから隠す。
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const MAX = 30;

export async function GET(_req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ users: [] }, { headers: noStore });

  const me = await appDb.getUser(meId);
  const blocked = new Set(me?.blockedUserIds || []);

  // テストアカウント隠し（bootstrap と同じ方針）。
  let isTestId: (id: string) => boolean = () => false;
  let hideTest = false;
  try {
    const { getTestAccountConfig, isTestAccount } = await import('@/lib/testAccounts');
    const tcfg = await getTestAccountConfig();
    const isTestMe = await isTestAccount(meId);
    const tset = new Set(tcfg.accounts.map((a) => a.id));
    isTestId = (id: string) => !!id && (id.startsWith('test_') || tset.has(id));
    hideTest = tcfg.hideFromGeneral && !isTestMe;
  } catch { /* 判定不能時は隠さない */ }

  const out: Array<Record<string, any>> = [];
  try {
    const snap = await db.collection('users').orderBy('lastActiveAt', 'desc').limit(80).get();
    for (const d of snap.docs) {
      const id = d.id;
      if (id === meId || blocked.has(id)) continue;
      if (hideTest && isTestId(id)) continue;
      const u = d.data() || {};
      if (!u.lastActiveAt || !u.displayName) continue; // 未ログイン/未設定は出さない
      out.push({
        id,
        displayName: u.displayName || 'メンバー',
        avatar: u.avatar || '⛳',
        avatarUrl: u.avatarUrl || '',
        avatarMode: u.avatarMode || undefined,
        golmotiType: u.golmotiType || undefined,
        color: u.color || '',
        lastActiveAt: u.lastActiveAt || 0,
        canDm: false, // 後段で dmAllowedSet の結果を反映
      });
      if (out.length >= MAX) break;
    }
  } catch (e) {
    return NextResponse.json({ users: [], error: (e as Error).message }, { headers: noStore });
  }

  // DM可否を一括判定（lib/dmPolicy に一元化）
  try {
    const allowed = await dmAllowedSet(meId, out.map((o) => o.id as string));
    for (const o of out) o.canDm = allowed.has(o.id as string);
  } catch { /* 判定失敗時は全員 canDm=false（安全側） */ }

  return NextResponse.json({ users: out }, { headers: noStore });
}
