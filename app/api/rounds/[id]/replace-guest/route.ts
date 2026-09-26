import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';
import { pushTo, liffUrl } from '@/lib/linePush';
import { webPushText } from '@/lib/webPush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';

// POST /api/rounds/[id]/replace-guest  body: { userId, guestId?, gender? }  ★主催者限定★
// ゲスト枠を「当日アプリ登録した本人（登録ユーザー）」に置き換える。
//   guestId 指定 = 名前付きゲスト(gst_...)の置換（組み分け/来れなかった記録も付け替え）
//   guestId 無し = 知り合い枠(external の人数)を1つ、その人に置き換え
// 置き換わった本人は「参加確定」に入り、以後レビュー対象になる（除外→再招待→承認 の手間が不要）。
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;

  const existing = await db.getRound(params.id);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!isRoundHost(existing, meId)) {
    return NextResponse.json({ error: 'forbidden', message: '主催者のみ置き換えできます' }, { status: 403 });
  }
  // 完了後でも置き換えられる。
  // 別サイトで募集して来た人がゲスト枠のまま参加し、翌日にゴルトモへ登録するケースがある。
  // その人を本人に置き換えると、同じ組だった人との間にレビューが新しく立つ（下の reReviewAfterChange）。

  let userId = '';
  let guestId = '';
  let gender = '';
  try {
    const body = await req.json();
    userId = String(body?.userId || '').trim();
    guestId = String(body?.guestId || '').trim();
    gender = String(body?.gender || '').trim();
  } catch { /* ignore */ }
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  if (userId === meId) return NextResponse.json({ error: 'cannot_replace_with_host' }, { status: 400 });

  const invitee = await db.getUser(userId);
  if (!invitee) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  // ラウンドは年代(コホート)で分かれているので、別年代の人には置き換えられない（招待と同じ制約）。
  if (existing.hostCohort) {
    const { getCohort } = await import('@/lib/ageGate');
    if (getCohort(invitee.age) !== existing.hostCohort) {
      return NextResponse.json({ error: 'cohort_mismatch', message: 'この募集とは別の年代のユーザーには置き換えできません' }, { status: 403 });
    }
  }

  if (guestId) {
    if (!guestId.startsWith('gst_') || !(existing.guests || []).some((g) => g.id === guestId)) {
      return NextResponse.json({ error: 'guest_not_found', message: 'そのゲストが見つかりません' }, { status: 400 });
    }
  } else {
    const ext = (existing.externalMale || 0) + (existing.externalFemale || 0) + (existing.externalCount || 0);
    if (ext <= 0) return NextResponse.json({ error: 'no_external', message: '置き換えられる知り合い枠がありません' }, { status: 400 });
  }

  const round = await db.replaceGuestWithUser(params.id, { userId, guestId: guestId || undefined, gender: gender || invitee.gender });

  // 完了したラウンドなら、新しくできた「同じ組」のペアにレビューを立てる。
  // 置き換わった本人と、その組にいた人の双方に未提出レビューが出る。
  if (existing.status === 'completed') {
    try {
      const { reReviewAfterChange, notifyNewReviewPairs } = await import('@/lib/reReview');
      const r = await reReviewAfterChange(params.id, existing, round);
      await notifyNewReviewPairs(round, r.notify.filter((x) => x !== userId));   // 本人には下の通知でまとめて伝える
    } catch (e) { console.warn('[replace-guest] re-review failed (non-fatal)', (e as Error).message); }
  }

  // 置き換わった本人へ通知（アプリ内お知らせ＋LINE/Web push）。
  try {
    const host = await db.getUser(meId);
    const hostName = host?.displayName || '主催者';
    const link = `/round/${params.id}`;
    const text = existing.status === 'completed'
      ? `🏌️ ${hostName}さんのラウンド「${existing.title}」の参加者として登録されました。一緒に回った人のレビューをお願いします。`
      : `🏌️ ${hostName}さんのラウンド「${existing.title}」に参加者として追加されました。`;
    const { addNotification } = await import('@/lib/notifications');
    addNotification(userId, 'invited', text, link).catch(() => {});
    if (isNotifyEnabled(invitee as any, 'invited')) {
      pushTo(userId, text, liffUrl(link), 'invited').catch(() => {});
      webPushText(userId, 'ラウンドに追加されました', text, link, `replace-${params.id}`).catch(() => {});
    }
  } catch { /* 通知失敗は致命的でない */ }

  return NextResponse.json({ round });
}
