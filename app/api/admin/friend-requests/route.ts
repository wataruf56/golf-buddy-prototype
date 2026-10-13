import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';
import { warmTestIds, isTestId } from '@/lib/testAccounts';

// GET /api/admin/friend-requests?token=XXX … 友達のつながりの一覧（2026-10-13）
// 「どうやって友達になったか」が分かるように、1件ずつ種類をつけて返す（新しい順）：
//   request_accepted … 友達申請 → 承認で友達（friendRequests・時刻＝返事の時刻）
//   qr               … QRコードで友達（qrPending・時刻＝読み取った時刻、scannedBy＝読み取った人 ※10/13〜）
//   qr_legacy        … 友達だが、申請の記録もQRの記録も無い組。QRの時刻を残し始めた 2026-08-23 より前のQR（時刻不明）
//   request_pending  … 友達申請を送っている（返事待ち）
//   request_declined / request_cancelled … お断り／申請者が取り消し
// User.friendIds に入る経路は QR（/api/friends）と 友達申請の承認（lib/friendLink.linkFriends）の2つだけ。
// テスト垢がからむものは出さない。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

type Item = {
  kind: 'request_accepted' | 'qr' | 'qr_legacy' | 'request_pending' | 'request_declined' | 'request_cancelled';
  a: string; b: string;          // 申請：a＝送った人・b＝受け取った人／QR：a＝読み取った人（分かれば）
  at: number;                    // その出来事の時刻（qr_legacy は 0）
  sentAt?: number;               // 申請を送った時刻
  claim?: string; accepted?: string; metAt?: string; message?: string;
  qrAnswers?: Record<string, string | null>;   // QR：それぞれの「同じ組だったか」
  stillFriends?: boolean;
};

export async function GET(req: NextRequest) {
  await warmTestIds();
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });
  try {
    const [reqSnap, qrSnap, userSnap] = await Promise.all([
      db.collection('friendRequests').limit(3000).get(),
      db.collection('qrPending').limit(3000).get().catch(() => ({ docs: [] })),
      db.collection('users').select('displayName', 'gender', 'age', 'friendIds').limit(5000).get(),
    ]);
    const users: Record<string, { displayName: string; gender?: string; age?: number }> = {};
    const friendPairs = new Set<string>();
    const key = (x: string, y: string) => [x, y].sort().join('|');
    for (const d of userSnap.docs) {
      const u = d.data() || {};
      users[d.id] = { displayName: u.displayName || '（名前なし）', gender: u.gender, age: u.age };
      if (isTestId(d.id)) continue;
      for (const f of (u.friendIds || [])) if (f && !isTestId(f) && f !== d.id) friendPairs.add(key(d.id, f));
    }
    const nameKnown = (id: string) => !!users[id];

    const items: Item[] = [];
    const covered = new Set<string>();
    // 友達申請
    for (const doc of reqSnap.docs) {
      const r = doc.data() || {};
      if (!r.fromId || !r.toId || isTestId(r.fromId) || isTestId(r.toId)) continue;
      const k = key(r.fromId, r.toId);
      const kind = r.status === 'accepted' ? 'request_accepted' : r.status === 'declined' ? 'request_declined' : r.status === 'cancelled' ? 'request_cancelled' : 'request_pending';
      if (kind === 'request_accepted') covered.add(k);
      items.push({ kind, a: r.fromId, b: r.toId, at: (kind === 'request_pending' ? r.createdAt : r.respondedAt || r.createdAt) || 0, sentAt: r.createdAt || 0,
        claim: r.claim, accepted: r.accepted, metAt: r.metAt, message: r.message, stillFriends: friendPairs.has(k) });
    }
    // QR（1組につき両方向の2件 → 1件にまとめる）
    const qrByPair = new Map<string, any[]>();
    for (const doc of qrSnap.docs) {
      const x = doc.data() || {};
      if (!x.userId || !x.otherId || isTestId(x.userId) || isTestId(x.otherId)) continue;
      const k = key(x.userId, x.otherId);
      qrByPair.set(k, [...(qrByPair.get(k) || []), x]);
    }
    for (const [k, xs] of Array.from(qrByPair.entries())) {
      covered.add(k);
      const scanner = xs.find((x) => x.scannedBy)?.scannedBy as string | undefined;
      const [p, q] = k.split('|');
      const a = scanner || p; const b = a === p ? q : p;
      const answers: Record<string, string | null> = {};
      for (const x of xs) answers[x.userId] = x.answer || null;
      items.push({ kind: 'qr', a, b, at: Math.max(...xs.map((x) => Number(x.linkedAt) || 0)), qrAnswers: answers, stillFriends: friendPairs.has(k),
        ...(scanner ? {} : { claim: 'scanner_unknown' }) });
    }
    // 友達なのに申請もQRの記録も無い組＝記録を始める前のQR
    for (const k of Array.from(friendPairs)) {
      if (covered.has(k)) continue;
      const [p, q] = k.split('|');
      if (!nameKnown(p) || !nameKnown(q)) continue;
      items.push({ kind: 'qr_legacy', a: p, b: q, at: 0, stillFriends: true });
    }
    items.sort((x, y) => (y.at || 0) - (x.at || 0));

    const ids = new Set(items.flatMap((i) => [i.a, i.b]));
    const outUsers: typeof users = {};
    for (const id of Array.from(ids)) outUsers[id] = users[id] || { displayName: '（退会）' };
    return NextResponse.json({ items, users: outUsers, friendPairCount: friendPairs.size }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
