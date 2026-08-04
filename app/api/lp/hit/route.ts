import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

// インスタの link-in-bio ハブ（/links）の計測。
//   POST（公開・認証不要）: { t:'open'|'mbti'|'rounds' } を受けてカウンタを+1。
//     open  = ハブが開かれた回数
//     mbti  = 「ゴルフMBTI 診断」ボタンのクリック
//     rounds= 「ラウンド募集」ボタンのクリック
//   GET ?token=ADMIN_LOG_TOKEN: 現在のカウンタを返す（管理画面用）。
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const DOC = 'linksHub';
const KEY: Record<string, string> = { open: 'opened', mbti: 'clickMbti', rounds: 'clickRounds' };

export async function POST(req: NextRequest) {
  let t = '';
  try { t = String(((await req.json()) || {}).t || ''); } catch { /* body無しでも可 */ }
  const key = KEY[t];
  if (!key) return NextResponse.json({ ok: false }, { headers: noStore });
  const adb = getAdminDb() as any;
  if (adb) {
    try {
      const ref = adb.collection('_config').doc(DOC);
      await adb.runTransaction(async (tx: any) => {
        const s = await tx.get(ref);
        const d = (s.exists ? s.data() : {}) || {};
        tx.set(ref, { [key]: (d[key] || 0) + 1, updatedAt: Date.now() }, { merge: true });
      });
    } catch { /* best-effort（計測失敗はユーザー体験に影響させない） */ }
  }
  return NextResponse.json({ ok: true }, { headers: noStore });
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  if (!expected || token !== expected) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const adb = getAdminDb() as any;
  let d: any = {};
  if (adb) {
    try { const s = await adb.collection('_config').doc(DOC).get(); d = (s.exists ? s.data() : {}) || {}; } catch { /* noop */ }
  }
  const opened = d.opened || 0;
  const clickMbti = d.clickMbti || 0;
  const clickRounds = d.clickRounds || 0;
  const clicks = clickMbti + clickRounds;
  return NextResponse.json({
    opened, clickMbti, clickRounds,
    // クリック率（開封のうち何%が何かを押したか）。
    ctr: opened > 0 ? Math.round((clicks / opened) * 1000) / 10 : 0,
  }, { headers: noStore });
}
