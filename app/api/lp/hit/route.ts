import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

// インスタの link-in-bio ハブ（/links）の計測。
//   POST（公開・認証不要）: { t:'open'|'line'|'mbti'|'rounds' } を受けてカウンタを+1。
//     open  = ハブが開かれた回数
//     line  = 「LINEで友だち追加」ボタンのクリック
//     mbti  = 「ゴルフMBTI 診断」ボタンのクリック
//     rounds= 「ラウンド募集」ボタンのクリック
//   GET ?token=ADMIN_LOG_TOKEN: 現在のカウンタを返す（管理画面用）。
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const DOC = 'linksHub';
const KEY: Record<string, string> = { open: 'opened', line: 'clickLine', mbti: 'clickMbti', rounds: 'clickRounds' };

export async function POST(req: NextRequest) {
  let t = '';
  try { t = String(((await req.json()) || {}).t || ''); } catch { /* body無しでも可 */ }
  const key = KEY[t];
  if (!key) return NextResponse.json({ ok: false }, { headers: noStore });
  const adb = getAdminDb() as any;
  if (adb) {
    try {
      const ref = adb.collection('_config').doc(DOC);
      // 累計に加えて日別（JST）も刻む → 管理画面で「投稿後どれだけ来たか」を追える。
      const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      await adb.runTransaction(async (tx: any) => {
        const s = await tx.get(ref);
        const d = (s.exists ? s.data() : {}) || {};
        const dayCur = (d.daily && d.daily[day]) || {};
        tx.set(ref, {
          [key]: (d[key] || 0) + 1,
          daily: { [day]: { ...dayCur, [key]: (dayCur[key] || 0) + 1 } },
          updatedAt: Date.now(),
        }, { merge: true });
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
  const clickLine = d.clickLine || 0;
  const clickMbti = d.clickMbti || 0;
  const clickRounds = d.clickRounds || 0;
  const clicks = clickLine + clickMbti + clickRounds;
  // 日別（直近14日・新しい順）。
  const daily = Object.keys(d.daily || {}).sort().slice(-14).reverse()
    .map((k) => ({ date: k, opened: d.daily[k]?.opened || 0, clickLine: d.daily[k]?.clickLine || 0 }));
  return NextResponse.json({
    opened, clickLine, clickMbti, clickRounds, daily,
    // クリック率（開封のうち何%が何かを押したか）。
    ctr: opened > 0 ? Math.round((clicks / opened) * 1000) / 10 : 0,
  }, { headers: noStore });
}
