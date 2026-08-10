import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminDb } from '@/lib/firebase';
import { pushTo, liffUrl } from '@/lib/linePush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';
import { addNotification } from '@/lib/notifications';
import type { Round } from '@/lib/types';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
const DAY = 24 * 60 * 60 * 1000;

// 「参加者ゼロのまま開催が近づいた募集」の掘り起こし通知。housekeeping cron から呼ばれる。
//
// 背景：募集は投稿時に希望条件が合う人へ通知している（lib/surveyMatch）が、そこで反応が
// 無かった募集はそのまま埋もれて開催日を迎えてしまう（実際に参加者0のまま数日前という
// 募集が発生していた）。人力で気づいて声かけするのではなく、仕組みで拾い直す。
//
// ルール：
//   対象 = status:'open' かつ 参加者0人（共同管理者も除く）かつ 開催まで 2〜10日
//   1つの募集につき 1回だけ 送る（round.emptyBoostSentAt で冪等化）
//   宛先 = 直近30日にアプリを開いた人（＝生きているユーザー）から、主催者本人と
//          既にこの募集に関わっている人を除いた最大80人
//   ※エリア一致は条件にしない。母数が小さいうちは「近い日に空いている募集がある」ことを
//     広く知らせるほうが埋まりやすいため。母数が増えたらエリア絞りを足す。
const MIN_DAYS = 2;      // 直前すぎると予定を組めないので2日前まで
const MAX_DAYS = 10;     // 早すぎても動かないので10日前から
const ACTIVE_WINDOW = 30 * DAY;
const MAX_RECIPIENTS = 80;

function authorizeCron(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const expected = process.env.CRON_SECRET || '';
  if (expected && auth === `Bearer ${expected}`) return true;
  const ua = req.headers.get('user-agent') || '';
  if (ua.includes('vercel-cron')) return true;
  const url = new URL(req.url);
  if (expected && url.searchParams.get('secret') === expected) return true;
  return false;
}

// JSTでの「あと何日」（カレンダー日数）。
function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const t = new Date(`${dateStr}T00:00:00+09:00`).getTime();
  if (!t) return null;
  const todayJst = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const t0 = new Date(`${todayJst}T00:00:00+09:00`).getTime();
  return Math.round((t - t0) / DAY);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry') === '1';
  if (!authorizeCron(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ ok: true, skipped: 'no_db' }, { headers: noStore });

  try {
    const snap = await adb.collection('rounds').where('status', '==', 'open').limit(300).get();
    const rounds: Round[] = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) }));

    const targets = rounds.filter((r) => {
      if ((r as any).emptyBoostSentAt) return false;            // 1募集1回だけ
      const joined = (r.applicantIds || []).length + (r.coHostIds || []).length;
      if (joined > 0) return false;                              // 誰か入っていれば対象外
      const d = daysUntil(r.date);
      return d !== null && d >= MIN_DAYS && d <= MAX_DAYS;
    });

    if (!targets.length) return NextResponse.json({ ok: true, targets: 0 }, { headers: noStore });

    // 生きているユーザー（直近30日にアプリを開いた人）を宛先候補にする。
    const since = Date.now() - ACTIVE_WINDOW;
    let candidates: string[] = [];
    try {
      const us = await adb.collection('users').where('lastActiveAt', '>=', since).limit(500).get();
      candidates = us.docs.map((d: any) => d.id);
    } catch { /* 索引が無い等 */ }

    const results: any[] = [];
    for (const r of targets) {
      const exclude = new Set<string>([r.hostId, ...(r.coHostIds || []), ...(r.applicantIds || []), ...(r.pendingApplicantIds || []), ...(r.invitedIds || [])]);
      const to = candidates.filter((id) => !exclude.has(id)).slice(0, MAX_RECIPIENTS);
      const d = daysUntil(r.date);
      const title = r.title || 'ラウンド募集';
      const where = r.courseName || r.area || '';
      const text = `⛳ あと${d}日！「${title}」${where ? `（${where}）` : ''}がまだ空いています。ご都合が合えばぜひ！`;
      const link = `/round/${r.id}`;

      if (!dryRun) {
        await Promise.all(to.map(async (uid) => {
          try {
            const user = await db.getUser(uid);
            addNotification(uid, 'surveyMatch', text, link).catch(() => {});
            if (isNotifyEnabled(user as any, 'surveyMatch')) {
              pushTo(uid, text, liffUrl(link), 'survey').catch(() => {});
            }
          } catch { /* 個別失敗は無視 */ }
        }));
        await db.updateRound(r.id, { emptyBoostSentAt: Date.now() } as any);
      }
      results.push({ id: r.id, title, daysLeft: d, recipients: to.length });
    }

    return NextResponse.json({ ok: true, dryRun, targets: targets.length, results }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
