import { NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { listHobbyTags } from '@/lib/hobbyTags';

// 趣味タグの共有リスト（人気順）。プロフィール編集のサジェストに使う。
const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const tags = await listHobbyTags(300);
  return NextResponse.json({ tags }, { headers: noStore });
}
