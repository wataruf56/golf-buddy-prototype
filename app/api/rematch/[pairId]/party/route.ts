import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { db } from '@/lib/db';
import { chatIdFor } from '@/lib/utils';
import { getSession, saveSession, membersOfPair, notifyRematch } from '@/lib/rematch';

// POST /api/rematch/[pairId]/party  body: { sizes: string[] }  ('2'|'3'|'4')
// 再会の「希望人数」（2サム/3サム/フォーサム。複数可＝〜でもいい）を自分側に保存し、
// 相手へ通知＋2人のDMに設定内容を投稿する（画面内チャットに履歴として残る）。
const noStore = { 'Cache-Control': 'no-store' };
const SIZE_LABEL: Record<string, string> = { '2': '2サム', '3': '3サム', '4': 'フォーサム' };
const labelOf = (sizes: string[]) =>
  ['2', '3', '4'].filter((s) => sizes.includes(s)).map((s) => SIZE_LABEL[s]).join('・') || '指定なし';

export async function POST(req: NextRequest, { params }: { params: { pairId: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const pairId = params.pairId;
  const [m1, m2] = membersOfPair(pairId);
  if (meId !== m1 && meId !== m2) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const s = await getSession(pairId);
  if (!s) return NextResponse.json({ error: 'notfound' }, { status: 404, headers: noStore });
  if ((s.optedOutBy || []).includes(meId)) return NextResponse.json({ error: 'opted_out' }, { status: 403, headers: noStore });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const sizes: string[] = Array.from(new Set(
    (Array.isArray(body?.sizes) ? body.sizes : []).map((x: any) => String(x)).filter((x: string) => ['2', '3', '4'].includes(x)),
  ));

  const isA = s.userA === meId;
  await saveSession(pairId, { [isA ? 'partyPrefA' : 'partyPrefB']: sizes } as any);

  const otherId = isA ? s.userB : s.userA;
  const label = labelOf(sizes);
  const me = await db.getUser(meId);
  const myName = me?.displayName || '相手';
  const link = `/rematch/${pairId}`;

  // 希望が入ったときだけ通知＋チャット投稿する（クリア時は静かに保存）。
  if (sizes.length > 0) {
    // 2人のDMに履歴として投稿（画面内チャットに出る）。db.sendMessage は自動通知しないので
    // 別途 notifyRematch で相手にプッシュする。
    try {
      const participants = [s.userA, s.userB].sort() as [string, string];
      await db.sendMessage(chatIdFor(s.userA, s.userB), participants, meId, `🏌️ 希望人数：${label} でお願いします`);
    } catch { /* チャット投稿失敗は無視 */ }

    const n = {
      inApp: `${myName}さんが再会の希望人数を設定しました（${label}）`,
      line: `${myName}さんが再会の希望人数を設定しました（${label}）`,
      webTitle: '再会の希望人数',
      webBody: `${myName}さん：${label}`,
    };
    await notifyRematch(otherId, n, link);
  }

  return NextResponse.json({ ok: true, myParty: sizes }, { headers: noStore });
}
