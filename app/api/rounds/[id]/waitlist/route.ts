import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isRoundHost } from '@/lib/roundHost';
import { asSlotGender, slotFullFor, slotGenderLabel } from '@/lib/genderSlots';
import { membersAsUsers } from '@/lib/genderSlotsServer';
import { stripRoundForViewer } from '@/lib/roundView';
import type { RoundWaitEntry } from '@/lib/types';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// POST /api/rounds/[id]/waitlist { on: boolean }
// 自分の性別の枠が満員のとき「空きが出たら参加したい」を登録／取り消す（2026-10-07 本人要望）。
// 登録すると主催者（＋共同管理者）にお知らせ＋LINE。空きが出たら lib/genderSlotsServer.notifyWaitlistIfOpened が本人へ知らせる。
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch {}
  const on = body?.on !== false;

  const me = await db.getUser(meId);
  const g = asSlotGender(me?.gender);
  if (!g) return NextResponse.json({ error: 'gender_required', message: '空き待ちにはプロフィールの性別の登録が必要です' }, { status: 400, headers: noStore });
  if (isRoundHost(round, meId) || (round.applicantIds || []).includes(meId) || (round.pendingApplicantIds || []).includes(meId)) {
    return NextResponse.json({ error: 'already_member', message: 'すでにこの募集に入っています' }, { status: 400, headers: noStore });
  }
  if (round.status !== 'open' || round.eventType === 'drink') {
    return NextResponse.json({ error: 'not_open', message: 'この募集は空き待ちできません' }, { status: 400, headers: noStore });
  }

  let list: RoundWaitEntry[] = round.waitlist || [];
  if (on) {
    const users = await membersAsUsers(round);
    if (!slotFullFor(round, users, g)) {
      return NextResponse.json({ error: 'slot_open', message: 'いまは参加申請できます' }, { status: 400, headers: noStore });
    }
    if (!list.some((e) => e.userId === meId)) {
      list = [...list, { userId: meId, gender: g, at: Date.now() }];
      await db.updateRound(params.id, { waitlist: list } as any);
      // 主催者へ：誰が、どの枠で、いま何人待っているか。
      try {
        const targets = Array.from(new Set([round.hostId, ...(round.coHostIds || [])])).filter((x) => x && x !== meId);
        const name = me?.displayName || 'メンバー';
        const n = list.filter((e) => e.gender === g).length;
        const link = `/round/${params.id}`;
        const text = `🔔 ${name}さんが「${round.title}」の${slotGenderLabel(g)}枠の空きを待っています（空き待ち ${n}人）`;
        const { addNotificationMany } = await import('@/lib/notifications');
        await addNotificationMany(targets, 'applyReceived', text, link);
        const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
        const { pushToMany, liffUrl } = await import('@/lib/linePush');
        const hosts = await Promise.all(targets.map((id) => db.getUser(id).catch(() => null)));
        const lineIds = targets.filter((_, i) => hosts[i] && isNotifyEnabled(hosts[i] as any, 'applyReceived'));
        if (lineIds.length) await pushToMany(lineIds, text, liffUrl(link), 'joined');
      } catch (e) { console.warn('[waitlist] host notify failed', (e as Error).message); }
    }
  } else {
    if (list.some((e) => e.userId === meId)) {
      list = list.filter((e) => e.userId !== meId);
      await db.updateRound(params.id, { waitlist: list } as any);
    }
  }
  const updated = await db.getRound(params.id);
  return NextResponse.json({ ok: true, round: updated ? stripRoundForViewer(updated, meId) : null }, { headers: noStore });
}
