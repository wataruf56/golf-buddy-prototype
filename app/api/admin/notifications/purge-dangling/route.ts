import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';
import { db } from '@/lib/db';

// POST /api/admin/notifications/purge-dangling?token=...&types=surveyMatch&dryRun=1
//
// 全ユーザーのアプリ内お知らせから、「リンク先の募集がもう存在しない」ものを消す（管理者限定）。
// 2026-10-08：検証用のテスト募集で「🎯 アンケート条件に一致する募集」が一般ユーザーのお知らせに残ってしまい、
// 募集は削除済みなので開いても「募集が見つかりません」になるだけ。これを一括で片付けるため。
//   types  … 対象の type（カンマ区切り。既定は surveyMatch だけ。all で全種別）
//   dryRun … 1 なら数えるだけで消さない
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dryRun') === '1';
  const typesRaw = (url.searchParams.get('types') || 'surveyMatch').trim();
  const types = typesRaw === 'all' ? null : new Set(typesRaw.split(',').map((s) => s.trim()).filter(Boolean));

  const roundExists = new Map<string, boolean>();
  async function exists(roundId: string): Promise<boolean> {
    const hit = roundExists.get(roundId);
    if (hit !== undefined) return hit;
    let ok = false;
    try { ok = !!(await db.getRound(roundId)); } catch { ok = true; /* 判定できないときは消さない */ }
    roundExists.set(roundId, ok);
    return ok;
  }

  const usersSnap = await adb.collection('users').select().get();
  const userIds: string[] = usersSnap.docs.map((d: any) => d.id);
  let scanned = 0, dangling = 0, deleted = 0;
  const byRound: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const toDelete: any[] = [];

  // 10人ずつ並行して、各ユーザーの notifications を読む
  for (let i = 0; i < userIds.length; i += 10) {
    await Promise.all(userIds.slice(i, i + 10).map(async (uid) => {
      const col = adb.collection('users').doc(uid).collection('notifications');
      const snap = await col.limit(200).get();
      for (const doc of snap.docs) {
        scanned += 1;
        const n = doc.data() || {};
        if (types && !types.has(String(n.type || ''))) continue;
        const m = /^\/round\/([A-Za-z0-9_-]+)/.exec(String(n.link || ''));
        if (!m) continue;
        if (await exists(m[1])) continue;
        dangling += 1;
        byRound[m[1]] = (byRound[m[1]] || 0) + 1;
        byType[String(n.type || '')] = (byType[String(n.type || '')] || 0) + 1;
        if (!dryRun) toDelete.push(doc.ref);
      }
    }));
  }

  if (!dryRun) {
    for (let i = 0; i < toDelete.length; i += 400) {
      const batch = adb.batch();
      for (const ref of toDelete.slice(i, i + 400)) batch.delete(ref);
      await batch.commit();
      deleted += Math.min(400, toDelete.length - i);
    }
  }

  return NextResponse.json({ ok: true, dryRun, users: userIds.length, scanned, dangling, deleted, byType, byRound }, { headers: noStore });
}
