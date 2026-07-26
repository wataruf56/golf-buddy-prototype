import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

// 管理者用（1回だけ実行）：既存ユーザー全員の「気になる系」LINE通知を一括OFFにする移行。
//   interestReceived（自分の募集に気になるが押された）
//   interestDeadline（気になるラウンドの締切間近）
// 初期値OFF化はコード側で対応済みだが、既にprefsを保存しているユーザーはこれで一括OFFにする。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'no_db' }, { status: 500, headers: noStore });
  try {
    const snap = await db.collection('users').get();
    let updated = 0;
    let batch = db.batch();
    let n = 0;
    for (const d of snap.docs) {
      const cur = d.data()?.notifyPrefs || {};
      const next = { ...cur, interestReceived: false, interestDeadline: false };
      batch.set(d.ref, { notifyPrefs: next }, { merge: true });
      updated++; n++;
      if (n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
    }
    if (n > 0) await batch.commit();
    return NextResponse.json({ ok: true, updated }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
