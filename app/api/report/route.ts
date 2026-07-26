import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';

// ユーザーによる通報。不適切な行為・ドタキャン・連絡が取れない等を運営へ報告する。
// _reports に保存し、運営（管理画面 /admin/reports）で確認 → 事実確認のうえ「評価を下げる」。
// 自動での評価変更はしない（運営確認後に反映）。
const noStore = { 'Cache-Control': 'no-store, must-revalidate', 'Content-Type': 'application/json; charset=utf-8' };
const REASONS = new Set(['inappropriate', 'noshow', 'no_contact', 'other']);
const reasonJa = (r: string) =>
  r === 'inappropriate' ? '不適切な行為' : r === 'noshow' ? 'ドタキャン' : r === 'no_contact' ? '連絡が取れない' : 'その他';

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;

  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId || '');
  // 後方互換：旧クライアントは reason に自由文を入れていた。新クライアントは
  // reason=カテゴリ + detail=自由文 を送る。reason がカテゴリでなければ「その他」扱いにし、
  // 元の文字列を detail に落とす。
  let reason = String(body.reason || '');
  let detail = String(body.detail || '').trim().slice(0, 1000);
  if (!REASONS.has(reason)) {
    if (reason && !detail) detail = reason.slice(0, 1000);
    reason = 'other';
  }
  const roundId = body.roundId ? String(body.roundId).slice(0, 64) : null;

  if (!userId) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
  if (userId === meId) return NextResponse.json({ error: 'cannot report self' }, { status: 400, headers: noStore });

  const [target, reporter] = await Promise.all([db.getUser(userId), db.getUser(meId)]);

  const adb = getAdminDb() as any;
  if (adb) {
    try {
      await adb.collection('_reports').add({
        reporterId: meId,
        reporterName: reporter?.displayName || '',
        targetId: userId,
        targetName: target?.displayName || '',
        reason,
        detail,
        roundId,
        status: 'open',
        createdAt: Date.now(),
      });
    } catch (e) {
      // 保存に失敗しても旧APIの互換保存を試みる。
      try { await db.reportUser(meId, userId, `${reasonJa(reason)}: ${detail}`); } catch {}
      console.error('[report] store failed', (e as Error).message);
    }
  } else {
    await db.reportUser(meId, userId, `${reasonJa(reason)}: ${detail}`);
  }

  // 運営へLINE通知（best-effort）。
  const adminIds = (process.env.ADMIN_NOTIFY_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (adminIds.length) {
    try {
      const { pushToMany, liffUrl } = await import('@/lib/linePush');
      await pushToMany(
        adminIds,
        `🚨 通報が届きました\n対象: ${target?.displayName || userId.slice(0, 10)}\n種別: ${reasonJa(reason)}${detail ? '\n内容: ' + detail.slice(0, 80) : ''}`,
        liffUrl('/admin/reports'),
      ).catch(() => {});
    } catch { /* noop */ }
  }

  return NextResponse.json({ ok: true }, { headers: noStore });
}
