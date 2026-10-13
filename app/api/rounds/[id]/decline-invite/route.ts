import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

// POST /api/rounds/[id]/decline-invite  body: { reason?: string }
// 招待された本人が「行けない」を押したとき（2026-10-13）。
//   ・invitedIds から外す → ホームの「ラウンドに招待されています」と募集ページの 💌 バナーが消える
//   ・round.inviteDeclined[本人] = { at, reason? } に記録を残す（招待した側が「行けない」と分かるように）
//   ・招待した側へ**アプリ内のお知らせだけ**（LINEは送らない）
//       主催者の招待 → 主催者／運営の招待（invitedBy='admin'）→ 管理者（ADMIN_NOTIFY_USER_IDS）
// 文言は「行けない」。「拒否」「お断り」とは書かない。
// 理由は任意（一言のチップ。lib/inviteStatus DECLINE_REASONS）。招待し直せば記録は消える（lib/db.inviteToRound）。
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const existing = await db.getRound(params.id);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  const { stripRoundForViewer } = await import('@/lib/roundView');
  // もう参加している人はこの経路では抜けない（参加の取りやめは /leave）
  if ((existing.applicantIds || []).includes(meId)) {
    return NextResponse.json({ error: 'already_joined', message: 'すでに参加しています。取りやめる場合は「参加を取りやめる」からどうぞ' }, { status: 400, headers: noStore });
  }
  if (!(existing.invitedIds || []).includes(meId)) {
    // 二度押し・別の端末で返事済み：成功扱いでそのまま返す
    if ((existing.inviteDeclined || {})[meId]) return NextResponse.json({ round: stripRoundForViewer(existing, meId) }, { headers: noStore });
    return NextResponse.json({ error: 'not_invited', message: 'このラウンドに招待されていません' }, { status: 403, headers: noStore });
  }

  let reason = '';
  try { const body = await req.json(); reason = String(body?.reason || '').trim().slice(0, 40); } catch { /* 理由なしでよい */ }

  const round = await db.declineInvite(params.id, meId, reason || undefined);

  // 招待した側へアプリ内のお知らせ（LINEは送らない）。テスト垢の募集なら addNotification が自動で絞る（lib/testIsolation）。
  try {
    const me = await db.getUser(meId);
    const name = me?.displayName || 'ゲスト';
    const link = `/round/${params.id}`;
    const why = reason ? `（${reason}）` : '';
    const { addNotification, addNotificationMany } = await import('@/lib/notifications');
    if ((existing.invitedBy || {})[meId] === 'admin') {
      const raw = (process.env.ADMIN_NOTIFY_USER_IDS || process.env.ADMIN_USER_IDS || '').trim();
      const adminIds = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (adminIds.length) {
        await addNotificationMany(adminIds, 'applyReceived', `📣 運営の招待：${name}さんは今回「${existing.title}」に行けないそうです${why}`, link);
      }
    } else {
      await addNotification(existing.hostId, 'applyReceived', `🙏 ${name}さんは今回「${existing.title}」に行けないそうです${why}`, link);
    }
  } catch { /* お知らせの失敗で返事は止めない */ }

  return NextResponse.json({ round: stripRoundForViewer(round, meId) }, { headers: noStore });
}
