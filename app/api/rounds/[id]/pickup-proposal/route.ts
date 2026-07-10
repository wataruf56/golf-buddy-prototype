import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import type { PickupProposal } from '@/lib/types';

const noStore = { 'Cache-Control': 'no-store' };

// 主催者→参加者への「この駅でどう？」提案と、その受け手の応答をまとめて扱う。
//   action:'propose' (主催者)  { userId, station }  → 提案を登録＆通知
//   action:'cancel'  (主催者)  { userId }           → 提案を取り消し
//   action:'accept'  (受け手)                       → 自分のピックアップ場所を提案駅のみに
//   action:'discuss' (受け手)                       → 相談スレッドを立て主催者にメンション
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  const members = new Set([round.hostId, ...(round.applicantIds || [])]);
  if (!members.has(meId)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = String(body?.action || '');
  const isHost = round.hostId === meId;

  // ---- 主催者: 提案する ----
  if (action === 'propose') {
    if (!isHost) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
    const userId = String(body?.userId || '');
    const station = String(body?.station || '').trim().slice(0, 20);
    if (!members.has(userId) || userId === meId || !station) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
    }
    // 提案はピックアップ希望者（status='want'）にだけ行える。
    const targetPickup = round.participantPickups?.[userId];
    if (targetPickup?.status !== 'want') {
      return NextResponse.json({ error: 'not_seeker', message: 'ピックアップ希望の人にのみ提案できます' }, { status: 400, headers: noStore });
    }
    const proposal: PickupProposal = { station, by: meId, at: Date.now() };
    await db.updateRound(params.id, { pickupProposals: { [userId]: proposal } } as any);

    // 受け手へ通知（アプリ内お知らせ＋LINE）。
    try {
      const [host, target] = await Promise.all([db.getUser(meId), db.getUser(userId)]);
      const hostName = host?.displayName || '主催者';
      const path = `/round/${params.id}`;
      const { renderNotif } = await import('@/lib/notificationTemplateStore');
      const n = await renderNotif('pickupPropose', { '主催者名': hostName, '募集タイトル': round.title, '駅': station });
      const { addNotification } = await import('@/lib/notifications');
      if (n.inApp) addNotification(userId, 'pickup', n.inApp, path).catch(() => {});
      const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
      if (target && isNotifyEnabled(target, 'pickup')) {
        const { pushTo, liffUrl } = await import('@/lib/linePush');
        const { webPushTo } = await import('@/lib/webPush');
        pushTo(userId, n.line, liffUrl(path)).catch(() => {});
        webPushTo(userId, { title: n.webTitle, body: n.webBody, url: path, tag: `pickup-${params.id}` }).catch(() => {});
      }
    } catch { /* 通知失敗は無視 */ }

    return NextResponse.json({ ok: true, proposal }, { headers: noStore });
  }

  // ---- 主催者: 取り消す ----
  if (action === 'cancel') {
    if (!isHost) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
    const userId = String(body?.userId || '');
    if (!members.has(userId)) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
    await db.updateRound(params.id, { pickupProposals: { [userId]: null } } as any);
    return NextResponse.json({ ok: true }, { headers: noStore });
  }

  // 以下は受け手（自分宛ての提案）の応答。
  const mine = round.pickupProposals?.[meId];
  if (!mine) return NextResponse.json({ error: 'no_proposal' }, { status: 400, headers: noStore });

  // ---- 受け手: OK（ピックアップ場所を提案駅のみにする） ----
  if (action === 'accept') {
    const pp = { ...(round.participantPickups || {}) };
    pp[meId] = { status: 'want', stations: [mine.station] };
    await db.updateRound(params.id, {
      participantPickups: pp,
      pickupProposals: { [meId]: null },
    } as any);
    return NextResponse.json({ ok: true, station: mine.station }, { headers: noStore });
  }

  // ---- 受け手: 相談したい（スレッドを立てて主催者にメンション） ----
  if (action === 'discuss') {
    const me = await db.getUser(meId);
    const host = await db.getUser(round.hostId);
    const hostName = host?.displayName || '主催者';
    const myName = me?.displayName || '参加者';

    // 同名の相談スレッドがあれば再利用、なければ作成。
    const threadName = `🚗 ピックアップ相談（${myName}さん）`;
    const threads = await db.listRoundThreads(params.id);
    let thread = threads.find((t) => t.name === threadName);
    if (!thread) thread = await db.createRoundThread(params.id, threadName, meId);

    const text = `@${hostName} ピックアップについて相談したい。`;
    await db.addRoundMessage(params.id, meId, text, thread.id);

    // 提案は応答済みとしてクリア。
    await db.updateRound(params.id, { pickupProposals: { [meId]: null } } as any);

    // 主催者へメンション通知。
    try {
      const chatPath = `/round/${params.id}/chat?thread=${encodeURIComponent(thread.id)}`;
      const { renderNotif } = await import('@/lib/notificationTemplateStore');
      const n = await renderNotif('mentionPickupDiscuss', { '相談者名': myName, '募集タイトル': round.title });
      const { addNotification } = await import('@/lib/notifications');
      if (n.inApp) addNotification(round.hostId, 'mention', n.inApp, chatPath).catch(() => {});
      const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
      if (host && isNotifyEnabled(host, 'mention')) {
        const { pushTo, liffUrl } = await import('@/lib/linePush');
        const { webPushTo } = await import('@/lib/webPush');
        pushTo(round.hostId, n.line, liffUrl(chatPath)).catch(() => {});
        webPushTo(round.hostId, { title: n.webTitle, body: n.webBody, url: chatPath, tag: `mention-${params.id}` }).catch(() => {});
      }
    } catch { /* 通知失敗は無視 */ }

    return NextResponse.json({ ok: true, threadId: thread.id }, { headers: noStore });
  }

  return NextResponse.json({ error: 'bad_action' }, { status: 400, headers: noStore });
}
