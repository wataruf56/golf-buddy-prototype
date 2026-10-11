import { NextRequest, NextResponse } from 'next/server';
import { completionDueMs } from '@/lib/completionTiming';
import { db } from '@/lib/db';
import { pushTo, liffUrl } from '@/lib/linePush';
import { webPushText } from '@/lib/webPush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// ラウンド完了の確認フロー。以前はスタート+6hで参加者全員へ「レビューしてください」を
// 自動送信していたが、ラウンド中に「完了した」ような通知が全員に飛ぶ問題があったため廃止。
//
// 変更後：「主催者だけ」へ『ラウンドは終わりましたか？（完了／中止）』を送る（時刻は下の説明）。
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

// 2026-10-11 変更：送る時刻を「スタート+6.5時間」から「夜8時（日本時間）」に。
//   スタートが14時より前 → 開催日の20:00。14時以降 → 翌日の20:00（夜8時だとまだラウンド中・終わった直後のため）。
//   完了か中止を選ぶまで、毎日20:00にもう一度送る（最大7回）。20:00〜24:00の間だけ送る（夜中に送らない）。
const DAY = 24 * 60 * 60 * 1000;
const SEND_WINDOW_MS = 4 * 60 * 60 * 1000;
const MAX_PROMPTS = 7;
const MAX_PER_TICK = 50;

/** 最初に送る時刻（ミリ秒）。開催日（14時以降スタートなら翌日）の20:00 JST。画面のゲートと共通（lib/completionTiming） */
const firstPromptMs = completionDueMs;

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }

  const allRounds = await db.listRounds();
  const now = Date.now();
  // 完了していない（完了・中止のどちらも選ばれていない）ラウンドで、今が「k回目の20:00〜24:00」の間にあり、k回目をまだ送っていないもの
  const candidates = allRounds.map((r) => {
    if (r.status === 'completed' || (r as any).heldCancelledAt) return null;
    if (!r.date) return null;
    const first = firstPromptMs(r.date, r.startTime || '');
    if (first === null || now < first) return null;
    const k = Math.floor((now - first) / DAY);
    if (k >= MAX_PROMPTS) return null;
    if (now - (first + k * DAY) > SEND_WINDOW_MS) return null;   // その日の 20:00〜24:00 だけ
    const sentCount = Number((r as any).completionPromptCount || 0);
    if (sentCount > k) return null;                               // この日のぶんは送った
    return { r, k };
  }).filter(Boolean).slice(0, MAX_PER_TICK) as Array<{ r: any; k: number }>;

  let sent = 0;
  const results: any[] = [];
  for (const { r: round, k } of candidates) {
    const roundName = round.title || round.courseName || 'ラウンド';
    const link = `/round/${round.id}`;
    const host = await db.getUser(round.hostId);
    const drink = round.eventType === 'drink';
    const word = drink ? '飲み会' : 'ラウンド';

    const inApp = `🏌️ 「${roundName}」は終わりましたか？ アプリで「${word}完了」か「${word}中止」を選んでください。`;
    const lineText = `🏌️ お疲れさまでした！\n「${roundName}」は終わりましたか？\nアプリで「${word}完了」か「${word}中止」を選んでください。完了にすると参加者へレビュー依頼が届きます。`;

    try {
      const { addNotification } = await import('@/lib/notifications');
      addNotification(round.hostId, 'reviewReminder', inApp, link).catch(() => {});
    } catch { /* noop */ }
    if (isNotifyEnabled(host as any, 'reviewReminder')) {
      try {
        await pushTo(round.hostId, lineText, liffUrl(link), 'roundReminder');
        await webPushText(round.hostId, `${word}は終わりましたか？`, `「${roundName}」の完了／中止`, link, `complete-prompt-${round.id}`).catch(() => {});
        sent++;
      } catch (e) {
        console.warn('[round-reminders] host prompt push failed', { roundId: round.id, err: (e as Error).message });
      }
    }
    // 送信の成否に関わらず打刻（同じ日に何度も送らない）
    await db.updateRound(round.id, { completionPromptSentAt: now, completionPromptCount: k + 1 } as any);
    results.push({ roundId: round.id, host: round.hostId, k });
  }

  return NextResponse.json({ ok: true, scanned: candidates.length, sent, results }, { headers: noStore });
}
