import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';

// POST /api/timeline/posts { roundId, image: dataURL, text? } … ラウンド後の「今日の写真」を投稿（2026-10-17・lib/timelinePosts）。
// その募集で一緒に回った人（主催者・参加者）だけ。完了した募集だけ。1募集につき1人1枚（投稿し直すと置き換え）。
// 写真はその募集のアルバムにも入れる。
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const roundId = String(body.roundId || '');
  const image = String(body.image || '');
  const text = String(body.text || '').trim().slice(0, 100);
  const { MAX_IMAGE_LEN, POSTS, postId, cohortOf } = await import('@/lib/timelinePosts');
  if (!/^data:image\/(png|jpe?g|webp);base64,/.test(image)) return NextResponse.json({ error: 'bad_image', message: '写真を選んでください' }, { status: 400, headers: noStore });
  if (image.length > MAX_IMAGE_LEN) return NextResponse.json({ error: 'too_large', message: '写真が大きすぎます。もう一度お試しください' }, { status: 413, headers: noStore });
  const round: any = await db.getRound(roundId);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const { countedMemberIds } = await import('@/lib/hostCount');
  const members = new Set<string>([round.hostId, ...(round.coHostIds || []), ...countedMemberIds(round)]);
  if (!members.has(meId)) return NextResponse.json({ error: 'forbidden', message: 'この募集に参加した人だけが投稿できます' }, { status: 403, headers: noStore });
  if (round.status !== 'completed') return NextResponse.json({ error: 'not_completed', message: '終わったラウンドだけ投稿できます' }, { status: 400, headers: noStore });
  const me = await db.getUser(meId);
  let test = meId.startsWith('test_');
  try { const { isTestAccount } = await import('@/lib/testAccounts'); test = test || (await isTestAccount(meId)); } catch { /* noop */ }
  const id = postId(roundId, meId);
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ error: 'no_db' }, { status: 500, headers: noStore });
  // 非公開の招待・イベントは、募集名を出さない（「ラウンド」とだけ）
  const roundLabel = round.visibility === 'invite' ? '' : String(round.title || '').slice(0, 30);
  await adb.collection(POSTS).doc(id).set({
    userId: meId, roundId, roundDate: round.date || '', roundLabel, text, image,
    createdAt: Date.now(), cohort: cohortOf(me as any), test,
  }, { merge: true });   // 投稿し直しても、付いたリアクションは残す
  try { await db.addRoundPhoto(roundId, meId, image); } catch { /* アルバムに入らなくても投稿はできている */ }
  return NextResponse.json({ ok: true, id }, { headers: noStore });
}
