import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';
import { warmTestIds, isTestId } from '@/lib/testAccounts';

// GET /api/admin/friend-requests?token=XXX … 友達申請の一覧（誰が誰に・どうなったか）（2026-10-13）
//   requests … friendRequests（相手のプロフィールから「どこで一緒だったか」を申告して送る申請・lib/friendLink）
//   qr       … qrPending（QRで友達になった直後の「同じ組だったか」の答え。1組につき両方向の2件）
// テスト垢どうし・テスト垢がからむものは出さない。名前は users から引く。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function GET(req: NextRequest) {
  await warmTestIds();
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });
  try {
    const [reqSnap, qrSnap] = await Promise.all([
      db.collection('friendRequests').limit(3000).get(),
      db.collection('qrPending').limit(3000).get().catch(() => ({ docs: [] })),
    ]);
    const requests = reqSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
      .filter((r: any) => !isTestId(r.fromId) && !isTestId(r.toId))
      .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
    const qr = qrSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
      .filter((r: any) => !isTestId(r.userId) && !isTestId(r.otherId))
      .sort((a: any, b: any) => (b.linkedAt || 0) - (a.linkedAt || 0));

    const ids = Array.from(new Set([...requests.flatMap((r: any) => [r.fromId, r.toId]), ...qr.flatMap((r: any) => [r.userId, r.otherId])].filter(Boolean))) as string[];
    const users: Record<string, { displayName: string; avatarUrl?: string; gender?: string; age?: number }> = {};
    for (let i = 0; i < ids.length; i += 100) {
      const refs = ids.slice(i, i + 100).map((id) => db.collection('users').doc(id));
      const snaps = refs.length ? await db.getAll(...refs) : [];
      for (const s of snaps) {
        const u = s.exists ? s.data() || {} : null;
        users[s.id] = u ? { displayName: u.displayName || '（名前なし）', avatarUrl: u.avatarUrl || '', gender: u.gender, age: u.age } : { displayName: '（退会）' };
      }
    }
    return NextResponse.json({ requests, qr, users }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
