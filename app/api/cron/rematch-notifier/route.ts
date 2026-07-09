import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pushTo, liffUrl } from '@/lib/linePush';
import { webPushText } from '@/lib/webPush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';
import { getRematchConfig } from '@/lib/rematchConfig';
import { getTestAccountIdSet } from '@/lib/testAccounts';
import { getSession, saveSession, pairIdOf, mutualPairsInRound, rematchDayMs } from '@/lib/rematch';

// ①再会通知バッチ。完了ラウンドの相互マッチ済みペアへ「そろそろまた行きませんか？」
// を送る。intervalDays=0 なら完了後すぐ発火（テスト用）。housekeeping から毎tick呼ばれる。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
const MAX_PER_TICK = 50;

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

function mdLabel(d?: string): string {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${Number(m[2])}/${Number(m[3])}` : d;
}

async function notifyOne(recipientId: string, recipient: any, otherName: string, course: string, date: string, link: string) {
  const when = mdLabel(date);
  const msg = `🔁 ${when ? when + 'に' : ''}${course}で一緒に回った${otherName}さん。そろそろまた行きませんか？お互いの行ける日を出し合ってみましょう👇`;
  const { addNotification } = await import('@/lib/notifications');
  addNotification(recipientId, 'rematch', msg, link).catch(() => {});
  if (isNotifyEnabled(recipient as any, 'rematch')) {
    pushTo(recipientId, msg, liffUrl(link)).catch(() => {});
    webPushText(recipientId, '再会のお知らせ', msg, link, `rematch-${link}`).catch(() => {});
  }
}

// 再会通知の実処理。管理画面の「今すぐ実行」からも呼べるよう関数化。
export async function runRematchNotifier(limit = MAX_PER_TICK): Promise<{ ok: boolean; sent: number; pairs: number; enabled: boolean }> {
  const cfg = await getRematchConfig();
  if (!cfg.enabled) return { ok: true, sent: 0, pairs: 0, enabled: false };
  const now = Date.now();
  const threshold = now - cfg.intervalDays * rematchDayMs;

  // 完了ラウンドを新しい順に。同一ペアは直近ラウンドを文脈として1回だけ扱う。
  const rounds = (await db.listRounds({ status: 'completed' }))
    .filter((r) => (r.completedAt || 0) > 0 && (r.completedAt || 0) <= threshold)
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  // テスト扱いユーザーの集合（管理画面「🧪 テストアカウント管理」で一元管理）。
  // testMode 中の安全弁に使う。test_ 始まりは常にテスト扱い。
  const testIds = await getTestAccountIdSet();
  const isTest = (id: string) => !!id && (id.startsWith('test_') || testIds.has(id));

  const seen = new Set<string>();
  let sent = 0;

  for (const r of rounds) {
    if (sent >= limit) break;
    const members = [r.hostId, ...(r.applicantIds || [])];
    const pairs = await mutualPairsInRound(members);
    for (const { a, b, kind } of pairs) {
      if (sent >= limit) break;
      // 安全弁：テストモード中はテスト扱いユーザー同士のペアにしか通知しない
      // （test_ 始まり or 「🧪 テストアカウント管理」で登録したLINE ID）。
      if (cfg.testMode && !(isTest(a) && isTest(b))) continue;
      const pairId = pairIdOf(a, b);
      if (seen.has(pairId)) continue;
      seen.add(pairId);

      const s = await getSession(pairId);
      if (s && (s.status === 'agreed' || s.status === 'posted')) continue;
      if (s && (s.optedOutBy || []).length > 0) continue;
      const notifyCount = s?.notifyCount || 0;
      if (notifyCount >= cfg.maxCycles) continue;
      // 2回目以降は intervalDays 経過後のみ
      if (notifyCount >= 1 && s?.lastNotifyAt && (now - s.lastNotifyAt) < cfg.intervalDays * rematchDayMs) continue;

      const [ua, ub] = await Promise.all([db.getUser(a), db.getUser(b)]);
      const course = r.courseName || r.title || 'ゴルフ';
      const link = `/rematch/${pairId}`;
      await notifyOne(a, ua, ub?.displayName || 'あの人', course, r.date || '', link);
      await notifyOne(b, ub, ua?.displayName || 'あの人', course, r.date || '', link);

      const [lo, hi] = a < b ? [a, b] : [b, a];
      await saveSession(pairId, {
        pairId, userA: lo, userB: hi, roundId: r.id,
        courseName: course, roundDate: r.date || '', matchKind: kind,
        notifyCount: notifyCount + 1,
        firstNotifyAt: s?.firstNotifyAt || now,
        lastNotifyAt: now,
        candidatesA: s?.candidatesA || [],
        candidatesB: s?.candidatesB || [],
        agreedDate: s?.agreedDate || null,
        agreedAt: s?.agreedAt || null,
        postedRoundId: s?.postedRoundId || null,
        optedOutBy: s?.optedOutBy || [],
        status: 'notified',
      });
      sent++;
    }
  }
  return { ok: true, sent, pairs: seen.size, enabled: true };
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }
  try {
    const res = await runRematchNotifier();
    return NextResponse.json(res, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
