import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pushTo, liffUrl } from '@/lib/linePush';
import { webPushText } from '@/lib/webPush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// ラウンド完了の確認フロー。以前はスタート+6hで参加者全員へ「レビューしてください」を
// 自動送信していたが、ラウンド中に「完了した」ような通知が全員に飛ぶ問題があったため廃止。
//
// 変更後：スタート時間 +6.5h に「主催者だけ」へ『ラウンドは完了しましたか？』を送る。
// 主催者がラウンド画面で「完了しました」を押すと完了処理が走り、そこで初めて参加者全員へ
// レビュー依頼が届く（完了通知＝主催者確認制）。参加者への時間ベースの自動通知はしない。
//
// 冪等性: round.completionPromptSentAt を打刻し、同じラウンドへは1回だけ送る。
// Auth: Vercel Cron の Bearer CRON_SECRET / vercel-cron UA / ?secret=。

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

const COMPLETION_PROMPT_DELAY_MS = 6.5 * 60 * 60 * 1000; // スタート時間 +6時間半
const MAX_PER_TICK = 50;

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }

  const allRounds = await db.listRounds();
  const now = Date.now();
  // まだ募集中(open)＝未完了で、スタート+6.5hを過ぎ、未送信のラウンドが対象。
  // closed（主催者が事前に中止）や completed（既に完了）は対象外。
  const candidates = allRounds.filter((r) => {
    if (r.completionPromptSentAt) return false;   // already prompted
    if (r.status !== 'open') return false;         // completed/closed は対象外
    if (!r.date || !r.startTime) return false;     // 日時未確定は送れない
    const target = scheduledMs(r.date, r.startTime);
    if (target === null) return false;
    return now >= target + COMPLETION_PROMPT_DELAY_MS;
  }).slice(0, MAX_PER_TICK);

  let sent = 0;
  const results: any[] = [];
  for (const round of candidates) {
    const roundName = round.title || round.courseName || 'ラウンド';
    const link = `/round/${round.id}`;
    const host = await db.getUser(round.hostId);

    const inApp = `🏌️ 「${roundName}」は完了しましたか？ 完了していたら「完了しました」を押してください（参加者にレビュー依頼が届きます）👇`;
    const lineText = `🏌️ お疲れさまでした！\n「${roundName}」は完了しましたか？\n完了していたらアプリで「完了しました」を押してください。参加者へレビュー依頼が届きます👇`;

    // 主催者のアプリ内インボックスには常に記録（LINE設定に関係なく）。
    try {
      const { addNotification } = await import('@/lib/notifications');
      addNotification(round.hostId, 'reviewReminder', inApp, link).catch(() => {});
    } catch { /* noop */ }
    if (isNotifyEnabled(host as any, 'reviewReminder')) {
      try {
        await pushTo(round.hostId, lineText, liffUrl(link), 'roundReminder');
        await webPushText(round.hostId, 'ラウンドは完了しましたか？', `「${roundName}」の完了確認`, link, `complete-prompt-${round.id}`).catch(() => {});
        sent++;
      } catch (e) {
        console.warn('[round-reminders] host prompt push failed', { roundId: round.id, err: (e as Error).message });
      }
    }

    // 送信の成否に関わらず打刻（LINE不通時に毎tick再送しないため）。
    await db.updateRound(round.id, { completionPromptSentAt: now } as any);
    results.push({ roundId: round.id, host: round.hostId });
  }

  return NextResponse.json({ ok: true, scanned: candidates.length, sent, results }, { headers: noStore });
}

/**
 * Combine a "YYYY-MM-DD" + "HH:mm" pair into a JST ms timestamp.
 * Returns null if either field is malformed.
 */
function scheduledMs(date: string, startTime: string): number | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{1,2}):(\d{2})/.exec(startTime);
  if (!dm || !tm) return null;
  const [, y, mo, d] = dm;
  const [, h, mi] = tm;
  const utcMs = Date.UTC(+y, +mo - 1, +d, +h - 9, +mi);
  return Number.isFinite(utcMs) ? utcMs : null;
}
