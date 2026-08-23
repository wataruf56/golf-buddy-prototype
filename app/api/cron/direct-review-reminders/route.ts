import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { listDirectReviewsToNotify, markNotified } from '@/lib/friendLink';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// QRで「同じ組だった」と答えた相手へのレビュー依頼を、**翌朝** 届ける。
// （QRを読み取った当日の夜に催促するのはやめた。交換したその日のうちに
//   答えるとは限らないし、通知が増えるだけなので。）
//
// 友達申請の承認から生まれたレビューは dueAt=いま なので、この cron が
// 次に回ったときに1通だけ通知される。承認画面でその場で答えた人は
// status='done' になっているため、催促は飛ばない。
//
// 1人に何通も飛ばさないよう、相手ごとではなく **人ごとにまとめて1通** 送る。
function authorizeCron(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const expected = process.env.CRON_SECRET || '';
  if (expected && auth === `Bearer ${expected}`) return true;
  const ua = req.headers.get('user-agent') || '';
  if (ua.includes('vercel-cron')) return true;
  const url = new URL(req.url);
  if (expected && url.searchParams.get('secret') === expected) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }

  const due = await listDirectReviewsToNotify(300);
  if (!due.length) return NextResponse.json({ ok: true, sent: 0 }, { headers: noStore });

  // reviewerId ごとにまとめる
  const byUser: Record<string, string[]> = {};
  const idsByUser: Record<string, string[]> = {};
  for (const d of due) {
    (byUser[d.reviewerId] = byUser[d.reviewerId] || []).push(d.revieweeId);
    (idsByUser[d.reviewerId] = idsByUser[d.reviewerId] || []).push(d.id);
  }

  const link = '/friends/confirm?tab=review';
  let sent = 0;
  const doneIds: string[] = [];

  for (const [uid, targets] of Object.entries(byUser)) {
    try {
      const user = await db.getUser(uid);
      if (!user) { doneIds.push(...idsByUser[uid]); continue; }
      const n = targets.length;
      const text = `🏌️ 同じ組で回った${n}人を評価してください`;
      const { addNotification } = await import('@/lib/notifications');
      await addNotification(uid, 'reviewReminder', text, link);
      const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
      if (isNotifyEnabled(user as any, 'reviewReminder')) {
        const { pushTo, liffUrl } = await import('@/lib/linePush');
        pushTo(uid, text, liffUrl(link), 'review').catch(() => {});
      }
      sent++;
      doneIds.push(...idsByUser[uid]);
    } catch (e) {
      console.error('[direct-review-reminders] failed for', uid, e);
    }
  }

  await markNotified(doneIds);
  return NextResponse.json({ ok: true, sent, marked: doneIds.length }, { headers: noStore });
}
