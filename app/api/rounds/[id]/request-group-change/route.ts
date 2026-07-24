import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { addNotification } from '@/lib/notifications';
import { pushTo, liffUrl } from '@/lib/linePush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';

const noStore = { 'Cache-Control': 'no-store' };

// POST /api/rounds/[id]/request-group-change
// 参加者が「この人とは一緒に回っていない」等の理由で、主催者に組分けの見直しを依頼する。
// 主催者へ通知（アプリ内＋LINE push）。主催者が組を直すと、その組だけレビューがやり直しになる。
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  const members = new Set([round.hostId, ...(round.applicantIds || [])]);
  if (!members.has(meId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }
  if (round.hostId === meId) {
    // 主催者自身は依頼不要（自分で直せる）。
    return NextResponse.json({ ok: true, self: true }, { headers: noStore });
  }

  const me = await db.getUser(meId);
  const link = `/round/${params.id}?tab=groups`;
  const text = `「${round.title}」で${me?.displayName || '参加者'}さんが組分けの変更を希望しています（一緒に回っていない相手がいる等）。組分けをご確認ください。`;

  await addNotification(round.hostId, 'groupChange', text, link);
  try {
    const host = await db.getUser(round.hostId);
    if (isNotifyEnabled(host as any, 'groupChange')) {
      pushTo(round.hostId, text, liffUrl(link)).catch(() => {});
    }
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true }, { headers: noStore });
}
