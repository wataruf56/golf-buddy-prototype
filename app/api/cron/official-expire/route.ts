import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ADMIN_MANAGER_ID } from '@/lib/adminManagerId';
import { listThreads, officialOf, takenSeats, totalSeats, type OfficialInfo } from '@/lib/officialThread';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
export const dynamic = 'force-dynamic';

// 締め切りを過ぎた「運営が立てた枠」を閉じる。
//
// 集まらなかった枠を出しっぱなしにすると、次の枠を立てられない（同時1本のため）。
// 誰も手を挙げていなければ黙って閉じる。手を挙げた人がいたときだけ、
// 「今回は見送ります」と伝える——待たされたまま放置されるのが一番よくない。
//
// 日程調整中（deciding）は締め切りの対象外。人はもう集まっているので、
// 決まるまで時間がかかっても閉じてはいけない。

function authorizeCron(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const expected = process.env.CRON_SECRET || '';
  if (expected && auth === `Bearer ${expected}`) return true;
  if ((req.headers.get('user-agent') || '').includes('vercel-cron')) return true;
  if (expected && new URL(req.url).searchParams.get('secret') === expected) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }

  const now = Date.now();
  let closed = 0;
  let notified = 0;

  const threads = await listThreads();
  for (const round of threads) {
    const o = officialOf(round);
    if (!o || o.stage !== 'recruiting' || now <= o.expiresAt) continue;

    const next: OfficialInfo = { ...o, stage: 'closed' };
    try {
      await db.updateRound(round.id, { official: next, status: 'closed' } as any);
      closed++;
    } catch (e) {
      console.error('[official-expire] close failed', round.id, e);
      continue;
    }

    const members = (round.applicantIds || []).filter((id) => id !== ADMIN_MANAGER_ID);
    if (!members.length) continue; // 誰もいなければ黙って閉じる

    const text = `「${round.title}」は${takenSeats(round)}/${totalSeats(round)}人のままだったので、今回は見送りにしました。またすぐ次の枠を出します。`;
    try {
      await db.addRoundMessage(round.id, ADMIN_MANAGER_ID, text);
      const users: Record<string, any> = {};
      (await db.listUsers(members)).forEach((u: any) => { if (u) users[u.id] = u; });
      const { addNotification } = await import('@/lib/notifications');
      const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
      const { pushTo, liffUrl } = await import('@/lib/linePush');
      await Promise.all(members.map(async (uid) => {
        await addNotification(uid, 'applyApproved', text, `/round/${round.id}`);
        if (isNotifyEnabled(users[uid], 'applyApproved')) {
          pushTo(uid, text, liffUrl('/home'), 'official_expired').catch(() => {});
        }
        notified++;
      }));
    } catch (e) {
      console.error('[official-expire] notice failed (non-fatal)', round.id, e);
    }
  }

  return NextResponse.json({ ok: true, closed, notified }, { headers: noStore });
}
