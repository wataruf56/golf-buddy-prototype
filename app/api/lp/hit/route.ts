import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

// インスタの link-in-bio ページ（/links）の計測。
//   POST（公開・認証不要）: { t:'open'|'line', v:訪問者ID } を受けてカウント。
//     - 回数（opened/clickLine）と、訪問者IDベースの人数（u_opened/u_clickLine）の両方を刻む。
//       同じ人が何度開いても人数は増えない（ユニーク計測が主指標）。
//     - 日別（JST）も同様に 回数＋新規人数 を刻む。
//     - v（訪問者ID）は /links クライアントが localStorage で発行する匿名ID。
//   POST { action:'reset', token:ADMIN_LOG_TOKEN }: カウンタを全リセット（管理用）。
//   GET ?token=ADMIN_LOG_TOKEN: 現在のカウンタを返す（管理画面用）。
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const DOC = 'linksHub';
const KEY: Record<string, string> = { open: 'opened', line: 'clickLine', mbti: 'clickMbti', rounds: 'clickRounds' };

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* body無しでも可 */ }
  const adb = getAdminDb() as any;

  // 管理用リセット（テストで汚れたカウンタのクリア）。トークン必須。
  if (body.action === 'reset') {
    const expected = process.env.ADMIN_LOG_TOKEN || '';
    if (!expected || body.token !== expected) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
    if (adb) {
      try {
        const ref = adb.collection('_config').doc(DOC);
        // 訪問者フラグも消してユニークを最初から数え直す。
        const vs = await ref.collection('visitors').limit(500).get();
        const batch = adb.batch();
        vs.docs.forEach((d: any) => batch.delete(d.ref));
        await batch.commit();
        await ref.set({ resetAt: Date.now() }); // merge無し＝カウンタ全消去
      } catch (e) {
        return NextResponse.json({ ok: false, error: (e as Error).message }, { headers: noStore });
      }
    }
    return NextResponse.json({ ok: true, reset: true }, { headers: noStore });
  }

  const t = String(body.t || '');
  const key = KEY[t];
  if (!key) return NextResponse.json({ ok: false }, { headers: noStore });
  const vid = String(body.v || '').slice(0, 60).replace(/[^a-zA-Z0-9_-]/g, '');
  if (adb) {
    try {
      const ref = adb.collection('_config').doc(DOC);
      const vref = vid ? ref.collection('visitors').doc(vid) : null;
      const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      await adb.runTransaction(async (tx: any) => {
        const s = await tx.get(ref);
        const vs = vref ? await tx.get(vref) : null; // 読みは書きの前に（Firestore規約）
        const d = (s.exists ? s.data() : {}) || {};
        const vd = (vs && vs.exists ? vs.data() : null) || null;
        const dayCur = (d.daily && d.daily[day]) || {};
        const firstForKey = !!vref && !(vd && vd[key]); // この人がこの種別で初めてか
        const updates: any = {
          [key]: (d[key] || 0) + 1,
          daily: { [day]: { ...dayCur, [key]: (dayCur[key] || 0) + 1 } },
          updatedAt: Date.now(),
        };
        if (firstForKey) {
          updates[`u_${key}`] = (d[`u_${key}`] || 0) + 1;
          updates.daily[day][`u_${key}`] = (dayCur[`u_${key}`] || 0) + 1;
          tx.set(vref, { [key]: Date.now() }, { merge: true });
        }
        tx.set(ref, updates, { merge: true });
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
  const openedU = d.u_opened || 0;
  const clickLineU = d.u_clickLine || 0;
  // 日別（直近14日・新しい順）。回数＋新規人数。
  const daily = Object.keys(d.daily || {}).sort().slice(-14).reverse()
    .map((k) => ({
      date: k,
      opened: d.daily[k]?.opened || 0,
      clickLine: d.daily[k]?.clickLine || 0,
      openedU: d.daily[k]?.u_opened || 0,
      clickLineU: d.daily[k]?.u_clickLine || 0,
    }));
  return NextResponse.json({
    opened, clickLine, openedU, clickLineU, daily,
    clickMbti: d.clickMbti || 0, clickRounds: d.clickRounds || 0,
    // タップ率は人数ベース（開封した人のうちLINE追加を押した人の割合）。
    ctr: openedU > 0 ? Math.round((clickLineU / openedU) * 1000) / 10 : 0,
  }, { headers: noStore });
}
