import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import { db as appDb } from '@/lib/db';

// 自分が両思い（相互いいね）になっている相手の一覧。ゴル友画面で「マッチ済み」
// バッジを出すのに使う。again=また回りたい / romantic=異性として気になる。
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(_req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ matches: {} }, { headers: noStore });

  try {
    const mine = await db.collection('_matchLikes').where('from', '==', meId).get();
    const matches: Record<string, { again: boolean; romantic: boolean }> = {};
    await Promise.all(mine.docs.map(async (d: any) => {
      const x = d.data();
      const to = x.to as string;
      const kind = x.kind as 'again' | 'romantic';
      if (!to || (kind !== 'again' && kind !== 'romantic')) return;
      const rev = await db.collection('_matchLikes').doc(`${kind}__${to}__${meId}`).get();
      if (!rev.exists) return;
      matches[to] = matches[to] || { again: false, romantic: false };
      matches[to][kind] = true;
    }));
    // 相手の表示用情報（ゴル友画面の一覧表示に使う）
    const users: Record<string, any> = {};
    await Promise.all(Object.keys(matches).map(async (id) => {
      const u = await appDb.getUser(id);
      users[id] = u
        ? { displayName: u.displayName || 'メンバー', avatar: u.avatar || '⛳', avatarUrl: (u as any).avatarUrl || '', age: u.age || 0, gender: u.gender || '' }
        : { displayName: 'メンバー', avatar: '⛳' };
    }));
    return NextResponse.json({ matches, users }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ matches: {}, error: (e as Error).message }, { headers: noStore });
  }
}
