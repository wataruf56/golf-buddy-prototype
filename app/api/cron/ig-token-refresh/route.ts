import { NextRequest, NextResponse } from 'next/server';
import { pushToMany } from '@/lib/linePush';
import { igRefreshToken } from '@/lib/igPublish';

// Instagram の長期トークンを更新する。
//
// 長期トークンは約60日で失効する。失効すると投稿が止まるので、月1回程度この
// エンドポイントを叩いて延長する。
//
// ※ 新しいトークンは Secret Manager に手で入れ直す必要がある（Cloud Run の
//   env は Secret のバージョンを参照しているため、ここからは書き換えられない）。
//   そのため新トークンはレスポンスに含めず、LINEで「更新が必要」とだけ知らせて
//   実際の差し替えは管理者が行う。うっかりログに残さないための割り切り。
//
// Auth: Bearer CRON_SECRET / ?secret=

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function authorize(req: NextRequest): boolean {
  const expected = (process.env.CRON_SECRET || '').trim();
  if (!expected) return false;
  const auth = req.headers.get('authorization') || '';
  if (auth === `Bearer ${expected}`) return true;
  return new URL(req.url).searchParams.get('secret') === expected;
}

function adminIds(): string[] {
  const raw = (process.env.ADMIN_NOTIFY_USER_IDS || process.env.ADMIN_USER_IDS || '').trim();
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  }
  try {
    const { token, expiresInDays } = await igRefreshToken();
    // トークン本体はレスポンスにもログにも出さない。長さだけ返す。
    const ids = adminIds();
    if (ids.length && expiresInDays > 0 && expiresInDays < 20) {
      await pushToMany(
        ids,
        `⚠️ Instagramのトークン残り約${expiresInDays}日です。Secret Manager の ig-access-token を更新してください。`,
        undefined, 'ig_token',
      );
    }
    return NextResponse.json(
      { ok: true, expiresInDays, tokenLength: token.length },
      { headers: noStore },
    );
  } catch (e) {
    const ids = adminIds();
    if (ids.length) {
      await pushToMany(ids, `⚠️ Instagramトークンの更新に失敗しました: ${(e as Error).message.slice(0, 150)}`, undefined, 'ig_token');
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
