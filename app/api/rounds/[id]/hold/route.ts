import { NextRequest, NextResponse } from 'next/server';
import { db, HoldError } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';

// POST /api/rounds/[id]/hold { userId, until, message } … 主催者・共同管理者が参加申請を「保留」にする（2026-10-13・lib/roundHold）
//   until   … お返事する期日（ms）。いまから30分後〜開催日の前日 23:59（JST）。開催日が未定なら60日先まで
//   message … 申請した人に伝えるひとこと（1〜300文字。{日時} が残っていたら期日に置き換える）
// 保留は 1人1回だけ・延長なし（2回目は 409 already_held）。申請した人にアプリ内のお知らせ＋LINE（通知設定「⏸ 申請のお返事待ち」）。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found', message: '募集が見つかりません' }, { status: 404, headers: noStore });
  if (!isRoundHost(round, meId)) return NextResponse.json({ error: 'forbidden', message: '主催者・共同管理者だけが保留にできます' }, { status: 403, headers: noStore });

  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const userId = String(body.userId || '');
  const until = Number(body.until);
  if (!userId) return NextResponse.json({ error: 'invalid', message: '相手が指定されていません' }, { status: 400, headers: noStore });

  const { holdUntilError, holdAlreadyUsed, fillHoldTemplate, HOLD_MESSAGE_MAX, roundStillActive, holdNoticeText } = await import('@/lib/roundHold');
  if (!roundStillActive(round as any)) {
    return NextResponse.json({ error: 'round_closed', message: 'この募集は完了・中止になっています' }, { status: 400, headers: noStore });
  }
  if (!(round.pendingApplicantIds || []).includes(userId)) {
    return NextResponse.json({ error: 'not_pending', message: 'この方はいま申請中ではありません（取り下げ・承認・見送り済み）' }, { status: 409, headers: noStore });
  }
  if (holdAlreadyUsed(round, userId)) {
    return NextResponse.json({ error: 'already_held', message: '保留は1人1回だけです（期日を延ばすことはできません）' }, { status: 409, headers: noStore });
  }
  const now = Date.now();
  // 画面で選んでから届くまでの遅れぶん（2分）は大目に見る
  const untilErr = holdUntilError(round, until, now, 2 * 60 * 1000);
  if (untilErr) return NextResponse.json({ error: 'invalid_until', message: untilErr }, { status: 400, headers: noStore });
  const message = fillHoldTemplate(String(body.message || '').trim(), until).slice(0, HOLD_MESSAGE_MAX).trim();
  if (!message) return NextResponse.json({ error: 'invalid_message', message: 'ひとことを入れてください' }, { status: 400, headers: noStore });

  let updated;
  try {
    updated = await db.setApplicantHold(params.id, userId, { until, message, at: now, by: meId });
  } catch (e) {
    if (e instanceof HoldError) {
      const status = e.code === 'not_found' ? 404 : 409;
      return NextResponse.json({ error: e.code, message: e.message }, { status, headers: noStore });
    }
    throw e;
  }

  // 申請した人へ：アプリ内のお知らせ（必ず）＋LINE（通知設定「⏸ 申請のお返事待ち」が ON のとき）。
  // テスト垢の操作・テスト垢の募集は lib/testIsolation が宛先を絞る（pushTo / addNotification の中）。
  try {
    const link = `/round/${params.id}`;
    const text = holdNoticeText(round as any, until);
    const { addNotification } = await import('@/lib/notifications');
    await addNotification(userId, 'applyHold', text, link).catch(() => {});
    const applicant = await db.getUser(userId);
    const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
    if (applicant && isNotifyEnabled(applicant as any, 'applyHold')) {
      const { pushTo, liffUrl } = await import('@/lib/linePush');
      await pushTo(userId, text, liffUrl(link), 'applyHold').catch(() => {});
    }
  } catch (e) { console.warn('[hold] notify failed (non-fatal)', (e as Error).message); }

  return NextResponse.json({ ok: true, round: updated }, { headers: noStore });
}
