import { NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { snsAllowed } from '@/lib/snsTest';
import { addComment, deleteComment, getReactions, isReactionKey, setLike } from '@/lib/snsTestReactions';

// GET  /api/sns/reactions?key=… … 投稿のいいね・コメント（テスト版・運営だけ・lib/snsTestReactions）
// POST /api/sns/reactions { key, action: 'like', on } | { key, action: 'comment', text } | { key, action: 'deleteComment', id }（誰にも通知しない）
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';
const MESSAGES: Record<string, string> = { empty: 'コメントを入力してください', too_many: 'これ以上コメントできません' };

export async function GET(req: Request) {
  const meId = await getMeId();
  if (!(await snsAllowed(meId))) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const key = new URL(req.url).searchParams.get('key') || '';
  if (!isReactionKey(key)) return NextResponse.json({ error: 'bad_key' }, { status: 400, headers: noStore });
  return NextResponse.json(await getReactions(meId!, key), { headers: noStore });
}

export async function POST(req: Request) {
  const meId = await getMeId();
  if (!(await snsAllowed(meId))) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const body = await req.json().catch(() => ({}));
  const key = String(body?.key || '');
  if (!isReactionKey(key)) return NextResponse.json({ error: 'bad_key' }, { status: 400, headers: noStore });
  try {
    if (body?.action === 'like') return NextResponse.json(await setLike(meId!, key, !!body.on), { headers: noStore });
    if (body?.action === 'comment') return NextResponse.json(await addComment(meId!, key, body.text), { headers: noStore });
    if (body?.action === 'deleteComment') return NextResponse.json(await deleteComment(meId!, key, String(body.id || '')), { headers: noStore });
    return NextResponse.json({ error: 'bad_action' }, { status: 400, headers: noStore });
  } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ error: m, message: MESSAGES[m] || 'うまくいきませんでした' }, { status: MESSAGES[m] ? 400 : 500, headers: noStore });
  }
}
