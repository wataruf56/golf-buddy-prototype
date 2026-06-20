import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

// 管理者用：テスト用アカウント(test_*)が作ったデータを一掃する。
// テスト中に溜まったラウンド・チャット・通知・マッチいいねを削除し、
// テスト垢の表示名を正しい日本語に再設定する。文字化けデータの掃除にも使う。
const noStore = { 'Cache-Control': 'no-store' };

const TEST_USERS: { id: string; displayName: string }[] = [
  { id: 'test_taro', displayName: 'テスト太郎' },
  { id: 'test_hanako', displayName: 'テスト花子' },
  { id: 'test_jiro', displayName: 'テスト次郎' },
  { id: 'test_saki', displayName: 'テスト咲' },
];

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

const isTest = (id: any) => typeof id === 'string' && id.startsWith('test_');

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  const result = { roundsDeleted: 0, chatMsgsDeleted: 0, notifsDeleted: 0, likesDeleted: 0, reviewsDeleted: 0, namesReset: 0 };

  try {
    // 1) test_ がホストのラウンド + そのグループチャットを削除
    const rs = await db.collection('rounds').limit(1000).get();
    for (const doc of rs.docs) {
      if (!isTest(doc.data().hostId)) continue;
      try {
        const msgs = await db.collection('roundChats').doc(doc.id).collection('messages').limit(1000).get();
        const b = db.batch();
        msgs.docs.forEach((m: any) => { b.delete(m.ref); result.chatMsgsDeleted++; });
        if (!msgs.empty) await b.commit();
      } catch {}
      await doc.ref.delete();
      result.roundsDeleted++;
    }

    // 2) test_ ユーザーの通知をすべて削除
    for (const u of TEST_USERS) {
      try {
        const ns = await db.collection('users').doc(u.id).collection('notifications').limit(1000).get();
        const b = db.batch();
        ns.docs.forEach((n: any) => { b.delete(n.ref); result.notifsDeleted++; });
        if (!ns.empty) await b.commit();
      } catch {}
    }

    // 3) test_ が絡むマッチいいねを削除
    try {
      const ls = await db.collection('_matchLikes').limit(2000).get();
      const b = db.batch();
      ls.docs.forEach((d: any) => {
        const x = d.data();
        if (isTest(x.from) || isTest(x.to) || isTest(d.id.split('__')[1])) { b.delete(d.ref); result.likesDeleted++; }
      });
      if (result.likesDeleted) await b.commit();
    } catch {}

    // 3.5) test_ が絡むレビューを削除
    try {
      const rv = await db.collection('reviews').limit(3000).get();
      const b = db.batch();
      rv.docs.forEach((d: any) => {
        const x = d.data();
        if (isTest(x.reviewerId) || isTest(x.revieweeId)) { b.delete(d.ref); result.reviewsDeleted++; }
      });
      if (result.reviewsDeleted) await b.commit();
    } catch {}

    // 4) テスト垢の表示名を再設定＋カウンタ（ラウンド回数等）を0にリセット
    for (const u of TEST_USERS) {
      try {
        const us = await db.collection('users').doc(u.id).get();
        if (us.exists) {
          await us.ref.set({ displayName: u.displayName, roundCount: 0, buddyCount: 0, reviewCount: 0, reviewAvg: 0 }, { merge: true });
          result.namesReset++;
        }
      } catch {}
    }

    return NextResponse.json({ ok: true, ...result }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, ...result }, { status: 500, headers: noStore });
  }
}
