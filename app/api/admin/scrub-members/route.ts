import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';
import { scrubMemberFromRound, strayMemberIds } from '@/lib/roundMembership';

// 運営用：募集の中に残っている「もう参加していない人」の痕跡を掃除する。
//
// 辞退・除外・却下のときに applicantIds からしか外していなかった時期のデータが対象。
// 組み分け・後半の組・送迎の回答・配車・提案・入金・組み分け希望・スコアから、
// 主催者・共同管理者・参加確定・ゲストのどれでもないIDを消す。
//   GET ?token=...            … 数えるだけ（dryRun）
//   GET ?token=...&apply=1    … 実際に消す
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
export const dynamic = 'force-dynamic';

function authed(req: NextRequest): boolean {
  const t = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && t === expected;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const apply = new URL(req.url).searchParams.get('apply') === '1';
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });
  const admin = require('firebase-admin');
  const { FieldPath, FieldValue } = admin.firestore;

  const snap = await adb.collection('rounds').limit(1000).get();
  const hits: Array<{ id: string; title: string; status: string; stray: string[] }> = [];
  for (const d of snap.docs) {
    const data = d.data() || {};
    const stray = strayMemberIds(data);
    if (!stray.length) continue;
    hits.push({ id: d.id, title: data.title || '', status: data.status || '', stray });
    if (!apply) continue;
    // 1人ずつ差分を取り、配列は置き換え・map のキーは FieldValue.delete() で消す
    const args: any[] = [];
    let cur: any = { ...data };
    for (const uid of stray) {
      const s = scrubMemberFromRound(cur, uid);
      for (const [k, v] of Object.entries(s.arrays)) { args.push(new FieldPath(k), v); }
      for (const [k, key] of s.deleteKeys) args.push(new FieldPath(k, key), FieldValue.delete());
      for (const [k, key, v] of s.setKeys) args.push(new FieldPath(k, key), v);
      // 次の人の差分は、消したあとの形から取る
      const { applyScrubInPlace } = await import('@/lib/roundMembership');
      cur = applyScrubInPlace({ ...cur }, s);
    }
    // 同じ FieldPath が2回並ぶと update が拒むので、後勝ちで畳む
    const merged = new Map<string, [any, any]>();
    for (let i = 0; i < args.length; i += 2) merged.set(String(args[i]), [args[i], args[i + 1]]);
    const flat = Array.from(merged.values()).flat();
    if (flat.length) await d.ref.update(...flat);
  }
  return NextResponse.json({ apply, rounds: hits.length, people: hits.reduce((a, h) => a + h.stray.length, 0), hits }, { headers: noStore });
}
