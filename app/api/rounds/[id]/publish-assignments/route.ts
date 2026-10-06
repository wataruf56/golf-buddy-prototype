import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';
import { SYSTEM_SENDER_ID } from '@/lib/adminManagerId';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// POST /api/rounds/[id]/publish-assignments { published: boolean }
// 主催者（共同管理者）のみ。組み分け・配車を参加者に「公開する／非公開に戻す」（2026-10-06 本人要望）。
// 配信側（lib/roundView.stripAssignmentsForViewer）が assignmentsPublished === false のとき主催者以外に伏せる。
// 非公開→公開にしたときだけ、参加者（主催者以外の確定メンバー）へ お知らせ＋LINE＋グループチャットの一言。
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isRoundHost(round, meId)) {
    return NextResponse.json({ error: 'forbidden', message: '主催者のみ切り替えられます' }, { status: 403, headers: noStore });
  }
  let body: any = {};
  try { body = (await req.json()) || {}; } catch {}
  const published = body?.published === true;
  const wasPublished = round.assignmentsPublished !== false;   // 未設定（旧データ）は公開扱い

  await db.updateRound(params.id, {
    assignmentsPublished: published,
    ...(published ? { assignmentsPublishedAt: Date.now() } : {}),
  } as any);

  if (published && !wasPublished) {
    const ids = Array.from(new Set((round.applicantIds || []).filter((id) => id && id !== meId && id !== round.hostId)));
    const path = `/round/${params.id}?tab=groups`;
    const title = round.title || round.courseName || 'ラウンド';
    const text = `⛳ 「${title}」の組み分け・配車が公開されました。組・スタート時間・乗る車を確認してください。`;
    try {
      const { addNotificationMany } = await import('@/lib/notifications');
      await addNotificationMany(ids, 'pickup', text, path);
    } catch (e) { console.warn('[publish-assignments] in-app notify failed', (e as Error).message); }
    try {
      // LINE は本人の通知設定（送迎＝pickup）に従う。LINE の userId でない人（テスト垢など）は pushToMany 側で落ちる。
      const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
      const { pushToMany, liffUrl } = await import('@/lib/linePush');
      const users = await Promise.all(ids.map((id) => db.getUser(id).catch(() => null)));
      const lineIds = ids.filter((_, i) => users[i] && isNotifyEnabled(users[i] as any, 'pickup'));
      if (lineIds.length) await pushToMany(lineIds, text, liffUrl(path), 'pickup');
    } catch (e) { console.warn('[publish-assignments] LINE notify failed', (e as Error).message); }
    try {
      await db.addRoundMessage(params.id, SYSTEM_SENDER_ID, '📣 主催者が組み分け・配車を公開しました。「組み分け」「ピックアップ」タブで確認できます。');
    } catch (e) { console.warn('[publish-assignments] chat notice failed', (e as Error).message); }
  }

  return NextResponse.json({ ok: true, assignmentsPublished: published }, { headers: noStore });
}
