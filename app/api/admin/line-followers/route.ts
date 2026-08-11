import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

// 管理画面：LINE公式アカウントの友だち追加を「登録」とみなして計測する。
//
// LINE Messaging API の Insight を使う：
//   GET /v2/bot/insight/followers?date=YYYYMMDD
//     followers        = その日時点の友だち数（ブロック中を除く）
//     targetedReaches  = メッセージが届く人数
//     blocks           = ブロックした人の累計
//   ※ 集計はJSTのその日の23:59時点。当日ぶんは取れないので前日までを見る。
//   ※ 対象が少ない日は status:'unready' や 'out_of_service' が返る（エラーではない）。
//
// アプリ側の登録者数（users コレクション）と並べて、
//   友だち追加した人 － アプリに登録した人 ＝ まだアプリを開いていない人
// が分かるようにしている。
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
const LINE = 'https://api.line.me/v2/bot';

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

// JSTの日付を YYYYMMDD で返す（offset=1 なら前日）。
function jstDate(offsetDays = 0): string {
  const t = Date.now() + 9 * 3600 * 1000 - offsetDays * 24 * 3600 * 1000;
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  if (!accessToken) return NextResponse.json({ error: 'no LINE_CHANNEL_ACCESS_TOKEN' }, { status: 500, headers: noStore });

  const days = Math.min(60, Math.max(7, Number(new URL(req.url).searchParams.get('days') || 30)));

  try {
    // 直近 days 日ぶんを取得（当日は集計前なので1日前から）。
    const dates = Array.from({ length: days }, (_, i) => jstDate(i + 1));
    const results = await Promise.all(dates.map(async (date) => {
      try {
        const r = await fetch(`${LINE}/insight/followers?date=${date}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
        if (!r.ok) return { date, status: `http_${r.status}` as string, followers: null as number | null, targetedReaches: null as number | null, blocks: null as number | null };
        const j = await r.json();
        return {
          date,
          status: String(j.status || 'ready'),
          followers: typeof j.followers === 'number' ? j.followers : null,
          targetedReaches: typeof j.targetedReaches === 'number' ? j.targetedReaches : null,
          blocks: typeof j.blocks === 'number' ? j.blocks : null,
        };
      } catch {
        return { date, status: 'error', followers: null, targetedReaches: null, blocks: null };
      }
    }));

    // 古い順に並べ、前日差分＝その日の純増（新規追加 − ブロック）を出す。
    const series = results
      .filter((x) => x.followers != null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((x, i, arr) => ({
        ...x,
        delta: i === 0 ? null : (x.followers as number) - (arr[i - 1].followers as number),
      }));

    const latest = series.length ? series[series.length - 1] : null;
    const first = series.length ? series[0] : null;

    // アプリ側の登録者数（＝LIFFを開いてユーザードキュメントができた人）。
    let appUsers = 0;
    try {
      const db = getAdminDb() as any;
      if (db) {
        const snap = await db.collection('users').limit(3000).get();
        snap.docs.forEach((d: any) => { if (!(d.data() || {}).isSystem) appUsers++; });
      }
    } catch { /* best-effort */ }

    return NextResponse.json({
      generatedAt: Date.now(),
      // 「登録＝LINE友だち追加」とみなした主指標
      followers: latest?.followers ?? null,
      blocks: latest?.blocks ?? null,
      targetedReaches: latest?.targetedReaches ?? null,
      asOf: latest?.date || '',
      gainedInRange: first && latest ? (latest.followers as number) - (first.followers as number) : null,
      rangeFrom: first?.date || '',
      appUsers,
      notOpenedApp: latest?.followers != null ? Math.max(0, (latest.followers as number) - appUsers) : null,
      series,
      // 取得できなかった日の理由（unready / out_of_service 等）を1つだけ添える
      note: results.find((x) => x.followers == null)?.status || '',
    }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
