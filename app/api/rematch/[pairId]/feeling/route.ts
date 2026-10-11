import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getSession, saveSession, membersOfPair } from '@/lib/rematch';
import { applyFeeling, FEELINGS, type Feeling } from '@/lib/matchFeeling';

const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

// 再会の画面で「いまの気持ち」を選び直す。
//
// 1ヶ月前に「また回りたい」と押していても、いま同じとは限らない。
// ここで選び直すと、**過去のレビューとマッチがその場で書き換わる**。
//
//   again    … また回りたい（友人として。romantic からの切り替えもここ）
//   romantic … 異性として気になる（again も同時にON＝既存の運用に合わせる）
//   either   … どっちでもいい → マッチ解除＋**やり取りの履歴を理由にしたDMも閉じる**
//                （以前は履歴があると送り続けられた。ゴル友・同じ組など「いまの関係」があれば送れる）
//   never    … ごめんなさい   → マッチ解除＋**双方向でDMを閉じる**
//
// 「ごめんなさい」から選び直した場合は遮断を解く（また一緒に回ったときの復活）。
// 中身は lib/matchFeeling（DM画面・プロフィールの「まだ一緒にラウンドしてみたいと思う？」と共通）（2026-10-11）

export async function POST(req: NextRequest, { params }: { params: { pairId: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const pairId = params.pairId;
  const [m1, m2] = membersOfPair(pairId);
  if (meId !== m1 && meId !== m2) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }
  const s = await getSession(pairId);
  if (!s) return NextResponse.json({ error: 'notfound' }, { status: 404, headers: noStore });

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const feeling = String(body?.feeling || '') as Feeling;
  if (!FEELINGS.includes(feeling)) {
    return NextResponse.json({ error: 'bad_request', message: '選択が不正です' }, { status: 400, headers: noStore });
  }

  const otherId = s.userA === meId ? s.userB : s.userA;
  const roundId = s.roundId || '';

  // 1〜3. マッチ・過去のレビュー・DMの遮断
  await applyFeeling(meId, otherId, feeling, roundId);

  // 4. 再会セッションの扱い
  //    続ける場合は matchKind を選び直した内容に合わせる（romantic → again の切り替え）。
  //    やめる場合は終了させる。相手の画面には「この再会は終了しました」とだけ出す。
  if (feeling === 'again' || feeling === 'romantic') {
    await saveSession(pairId, { matchKind: feeling } as any);
  } else {
    const optedOutBy = Array.from(new Set([...(s.optedOutBy || []), meId]));
    await saveSession(pairId, { optedOutBy, status: 'optedout' } as any);
  }

  // 相手には通知しない（「知られることはありません」の約束）。
  return NextResponse.json({
    ok: true, feeling,
    ended: feeling === 'either' || feeling === 'never',
    blocked: feeling === 'never',
  }, { headers: noStore });
}
