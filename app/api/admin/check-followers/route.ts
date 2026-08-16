import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

// 管理画面：全ユーザーが公式アカウントを友だち追加しているかを一括判定する。
//
// LINE Messaging API の GET /v2/bot/profile/{userId} は、
//   友だち     → 200（プロフィールが返る）
//   友だちでない → 404
// を返す。**メッセージを1通も送らずに**友だち状態が分かるので、これで判定する。
// （liff.getFriendship はログインチャネルに公式アカウントを連携しないと取れず、
//   実データでは全員 undefined のままだった）
//
// 結果は users.botFollowed / botFollowedAt に保存し、
// 利用レポートの「LINE通知が届かない人」に反映される。
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
const LINE = 'https://api.line.me/v2/bot';

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

// GET は現状の内訳を返すだけ（判定は走らせない）。
export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'no_db' }, { status: 500, headers: noStore });
  try {
    const snap = await db.collection('users').limit(3000).get();
    let total = 0, followed = 0, notFollowed = 0, unknown = 0, checkedAt = 0;
    const notFollowedList: Array<{ id: string; name: string }> = [];
    snap.docs.forEach((d: any) => {
      const u = d.data() || {};
      if (u.isSystem) return;
      total++;
      if (u.botFollowed === true) followed++;
      else if (u.botFollowed === false) {
        notFollowed++;
        notFollowedList.push({ id: u.id || d.id, name: u.displayName || '（名前なし）' });
      } else unknown++;
      if (Number(u.botFollowedAt || 0) > checkedAt) checkedAt = Number(u.botFollowedAt);
    });
    return NextResponse.json({ total, followed, notFollowed, unknown, checkedAt, notFollowedList }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}

// POST で全ユーザーを判定し直す。
export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  if (!accessToken) return NextResponse.json({ error: 'no LINE_CHANNEL_ACCESS_TOKEN' }, { status: 500, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'no_db' }, { status: 500, headers: noStore });

  try {
    const snap = await db.collection('users').limit(3000).get();
    const users = snap.docs
      .map((d: any) => ({ id: (d.data() || {}).id || d.id, ...(d.data() || {}) }))
      .filter((u: any) => !u.isSystem && String(u.id || '').startsWith('U')); // LINEのuserIdは U で始まる

    const now = Date.now();
    let followed = 0, notFollowed = 0, errored = 0;
    const notFollowedList: Array<{ id: string; name: string }> = [];

    // 同時実行は控えめに（レート制限と Cloud Run のCPUを考慮）
    const CONCURRENCY = 8;
    for (let i = 0; i < users.length; i += CONCURRENCY) {
      const chunk = users.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(async (u: any) => {
        let isFriend: boolean | null = null;
        try {
          const r = await fetch(`${LINE}/profile/${encodeURIComponent(u.id)}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: 'no-store',
          });
          if (r.ok) isFriend = true;
          else if (r.status === 404) isFriend = false;
          else isFriend = null;   // 401/429 など＝判定不能
        } catch { isFriend = null; }

        if (isFriend === null) { errored++; return; }
        if (isFriend) followed++;
        else { notFollowed++; notFollowedList.push({ id: u.id, name: u.displayName || '（名前なし）' }); }
        try {
          await db.collection('users').doc(u.id).set(
            { botFollowed: isFriend, botFollowedAt: now }, { merge: true },
          );
        } catch { /* 保存に失敗しても集計結果は返す */ }
      }));
    }

    return NextResponse.json({
      ok: true, checked: users.length, followed, notFollowed, errored,
      notFollowedList: notFollowedList.slice(0, 100), checkedAt: now,
    }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
