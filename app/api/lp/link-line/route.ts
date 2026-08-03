import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { isDemoMode } from '@/lib/demoMode';
import { getAdminDb } from '@/lib/firebase';
import { db as dataDb } from '@/lib/db';

// LP診断の「興味シグナル」を、実際のLINEアカウント(userId)と紐付けて保存する。
// 呼び出し元は LIFF 経由でログイン済みの /lp-link ページ。getMeId() が
// LIFFセッションCookie / NextAuth から LINE userId を解決する。
//
// 保存先 Firestore `_lpSignal`:
//   { lineUserId, visitorId, resultType, areas[], days[], ts }
// これで「どのLINEユーザーが・どのタイプで・どのエリア×曜日の募集を待っているか」
// が個人単位で分かり、本当の個別通知（ラウンド募集があったらPush）に使える。

const s = (v: any, n = 120) => (v == null ? '' : String(v).slice(0, n));
const arr = (v: any) => (Array.isArray(v) ? v.map((x: any) => s(x, 40)).slice(0, 30) : []);

export async function POST(req: NextRequest) {
  const lineUserId = await getMeId();
  if (!lineUserId) {
    // 未ログイン（LIFFセッション未確立）。呼び出し側は /liff に誘導して再試行する。
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  // LINEユーザーの公開プロフィールも一緒に保存しておく（管理画面で「誰が」興味登録したか
  // 一目で分かるように）。氏名・アイコン・年齢・エリア・登録状況など。取得失敗しても紐付けは続行。
  let profile: Record<string, unknown> = {};
  try {
    const u = await dataDb.getUser(lineUserId);
    if (u) {
      profile = {
        displayName: s(u.displayName, 60),
        avatarUrl: s(u.avatarUrl, 400),
        age: typeof u.age === 'number' ? u.age : null,
        gender: s((u as any).gender, 20),
        userArea: s(u.area, 40),
        botFollowed: (u as any).botFollowed === true,
        // プロフィール登録済み（年齢入力済み）か。診断のみ→未登録の見極めに使う。
        registered: typeof u.age === 'number' && u.age > 0,
        acquisitionSource: s((u as any).acquisitionSource, 40),
      };
    }
  } catch { /* プロフィール取得失敗でも紐付けは保存する */ }

  const entry = {
    lineUserId,
    visitorId: s(body.visitorId, 60),
    resultType: s(body.resultType, 60),
    areas: arr(body.areas),
    days: arr(body.days),
    pickup: s(body.pickup, 40),
    pickupPlaces: arr(body.pickupPlaces),
    ...profile,
    source: 'golmoti-lp',
    ts: Date.now(),
  };

  if (isDemoMode) {
    return NextResponse.json({ ok: true, demo: true, linked: lineUserId.slice(0, 6) });
  }

  const db = getAdminDb() as any;
  if (db) {
    try {
      // 同一 LINEユーザー＋訪問者は最新で上書き、無ければ追加（履歴は別途 add でも可）。
      const docId = `${lineUserId}__${entry.visitorId || 'novid'}`;
      await db.collection('_lpSignal').doc(docId).set(entry, { merge: true });
    } catch (e) {
      console.error('[lp/link-line] write failed', e);
      return NextResponse.json({ ok: false, error: 'write failed' }, { status: 500 });
    }
  }
  console.log('[lpSignal]', JSON.stringify(entry));
  return NextResponse.json({ ok: true });
}
