import { NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { snsAllowed } from '@/lib/snsTest';
import { createStory } from '@/lib/snsTestTalk';

// POST /api/sns/story { text, bg, date, choices[], scope, photo?, video? } … ひとことを載せる（テスト版・運営だけ・snsTestStories にだけ書く）
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const meId = await getMeId();
  if (!(await snsAllowed(meId))) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const body = await req.json().catch(() => ({}));
  try {
    const id = await createStory(meId!, body);
    return NextResponse.json({ ok: true, id }, { headers: noStore });
  } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ error: m, message: m === 'empty' ? 'ひとことか写真を入れてください' : m === 'one_choice' ? '選択肢は2つ以上にしてください' : m === 'bad_video' ? '動画を確認できませんでした。もう一度お試しください' : 'うまくいきませんでした' }, { status: m === 'empty' || m === 'one_choice' || m === 'bad_video' ? 400 : 500, headers: noStore });
  }
}
