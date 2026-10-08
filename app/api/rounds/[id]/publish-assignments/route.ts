import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';
import { SYSTEM_SENDER_ID } from '@/lib/adminManagerId';
import { carsPublishedOf, groupsPublishedOf } from '@/lib/roundView';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// POST /api/rounds/[id]/publish-assignments { published: boolean, target?: 'groups' | 'cars' }
// 主催者（共同管理者）のみ。組み分け／配車（ピックアップ）を参加者に「公開する／非公開に戻す」。
// 2026-10-08：組み分けと配車を別々に公開するように（target）。target なし（古い画面）は両方まとめて。
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
  const target: 'groups' | 'cars' | 'both' = body?.target === 'groups' || body?.target === 'cars' ? body.target : 'both';

  const wasGroups = groupsPublishedOf(round);
  const wasCars = carsPublishedOf(round);
  const now = Date.now();
  const patch: Record<string, unknown> = {};
  if (target === 'groups' || target === 'both') { patch.assignmentsPublished = published; if (published) patch.assignmentsPublishedAt = now; }
  if (target === 'cars' || target === 'both') { patch.carsPublished = published; if (published) patch.carsPublishedAt = now; }
  // 分ける前のデータ（carsPublished 未設定）は組み分けに連動していたので、組み分けだけ切り替えるときは配車の今の状態を固定する
  if (target === 'groups' && round.carsPublished === undefined) patch.carsPublished = wasCars;
  await db.updateRound(params.id, patch as any);

  const newlyGroups = published && !wasGroups && (target === 'groups' || target === 'both');
  const newlyCars = published && !wasCars && (target === 'cars' || target === 'both');
  if (newlyGroups || newlyCars) {
    const ids = Array.from(new Set((round.applicantIds || []).filter((id) => id && id !== meId && id !== round.hostId)));
    const what = newlyGroups && newlyCars ? '組み分け・配車' : newlyGroups ? '組み分け' : '配車（ピックアップ）';
    const tab = newlyGroups ? 'groups' : 'pickup';
    const path = `/round/${params.id}?tab=${tab}`;
    const title = round.title || round.courseName || 'ラウンド';
    const detail = newlyGroups && newlyCars ? '組・スタート時間・乗る車' : newlyGroups ? '組・スタート時間' : '乗る車・集合場所';
    const text = `⛳ 「${title}」の${what}が公開されました。${detail}を確認してください。`;
    try {
      const { addNotificationMany } = await import('@/lib/notifications');
      await addNotificationMany(ids, 'pickup', text, path);
    } catch (e) { console.warn('[publish-assignments] in-app notify failed', (e as Error).message); }
    try {
      const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
      const { pushToMany, liffUrl } = await import('@/lib/linePush');
      const users = await Promise.all(ids.map((id) => db.getUser(id).catch(() => null)));
      const lineIds = ids.filter((_, i) => users[i] && isNotifyEnabled(users[i] as any, 'pickup'));
      if (lineIds.length) await pushToMany(lineIds, text, liffUrl(path), 'pickup');
    } catch (e) { console.warn('[publish-assignments] LINE notify failed', (e as Error).message); }
    try {
      const tabs = newlyGroups && newlyCars ? '「組み分け」「ピックアップ」タブ' : newlyGroups ? '「組み分け」タブ' : '「ピックアップ」タブ';
      await db.addRoundMessage(params.id, SYSTEM_SENDER_ID, `📣 主催者が${what}を公開しました。${tabs}で確認できます。`);
    } catch (e) { console.warn('[publish-assignments] chat notice failed', (e as Error).message); }
  }

  const after = { ...round, ...patch } as any;
  return NextResponse.json({ ok: true, assignmentsPublished: groupsPublishedOf(after), carsPublished: carsPublishedOf(after) }, { headers: noStore });
}
