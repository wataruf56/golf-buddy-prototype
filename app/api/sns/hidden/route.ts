import { NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { snsAllowed } from '@/lib/snsTest';
import { setTileHidden } from '@/lib/snsTestPosts';

// POST /api/sns/hidden { key: 'own_ラウンドID', on } … 本物のアルバム・今日の写真のマスを、テスト版の画面で非表示にする／戻す（運営だけ・本物の写真は書き換えない）
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const meId = await getMeId();
  if (!(await snsAllowed(meId))) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const body = await req.json().catch(() => ({}));
  const key = String(body?.key || '');
  if (!/^own_[\w-]{1,120}$/.test(key)) return NextResponse.json({ error: 'bad_key' }, { status: 400, headers: noStore });
  await setTileHidden(meId!, key, !!body?.on);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
