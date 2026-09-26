import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';

// POST /api/rounds/[id]/completion-snooze  ★主催者・共同管理者限定★
//
// 「ラウンドは完了しましたか？」に「まだ」と答えたら、しばらく（3日間）は
// 完了の催促（詳細画面のプロンプト／全画面のゲート）を出さない。
//
// 【なぜ要るか】
// 開催日を過ぎた募集はゲートが全画面を塞ぐ作りだったが、主催者は完了の前に
// 直したいことがある（翌日にゴルトモへ登録した人をゲスト枠から本人に置き換える、
// 知り合い枠の人数を減らす等）。「まだ」と答えたのに編集できないのは筋が通らない。
const SNOOZE_MS = 3 * 24 * 3600 * 1000;
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isRoundHost(round, meId)) {
    return NextResponse.json({ error: 'forbidden', message: '主催者のみ操作できます' }, { status: 403, headers: noStore });
  }
  if (round.status === 'completed') {
    return NextResponse.json({ ok: true, completionSnoozedUntil: null, note: 'already completed' }, { headers: noStore });
  }
  const completionSnoozedUntil = Date.now() + SNOOZE_MS;
  await db.updateRound(params.id, { completionSnoozedUntil } as any);
  return NextResponse.json({ ok: true, completionSnoozedUntil, days: 3 }, { headers: noStore });
}
