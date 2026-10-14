import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { getCohort } from '@/lib/ageGate';

// GET /api/me/invite-candidates … 非公開の招待で招待できる人（2026-10-14）。
// ゴル友（友達リスト：QR・友達申請・相互マッチ）＋ 同じ組で回ったことがある人。同じ年代だけ。
//   tags: friend（友達リスト）／group（同じ組で回った）
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function GET() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const me = await db.getUser(meId);
  const { friendSetOf } = await import('@/lib/friendSet');
  const { sameGroupPartnerIds } = await import('@/lib/pastPartners');
  const [friends, partners] = await Promise.all([friendSetOf(meId), sameGroupPartnerIds(meId).catch(() => new Set<string>())]);
  const ids = Array.from(new Set<string>([...Array.from(friends), ...Array.from(partners as Set<string>)])).filter((x) => x !== meId).slice(0, 300);
  let banned = new Set<string>();
  try { const { getBannedIdSet } = await import('@/lib/banAccess'); banned = await getBannedIdSet(); } catch { /* noop */ }
  const users = ids.length ? await db.listUsers(ids) : [];
  const myCohort = getCohort(me?.age);
  const blocked = new Set(me?.blockedUserIds || []);
  const out = users
    .filter((u) => u && !(u as any).isSystem && !banned.has(u.id) && !blocked.has(u.id) && getCohort(u.age) === myCohort)
    .map((u) => ({
      id: u.id, displayName: u.displayName || 'メンバー', avatar: u.avatar || '⛳', avatarUrl: (u as any).avatarUrl || '',
      age: u.age || 0, gender: u.gender || '', car: (u as any).car || '', lastActiveAt: (u as any).lastActiveAt || 0,
      tags: [...(friends.has(u.id) ? ['friend'] : []), ...((partners as Set<string>).has(u.id) ? ['group'] : [])],
    }))
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  return NextResponse.json({ candidates: out }, { headers: noStore });
}
