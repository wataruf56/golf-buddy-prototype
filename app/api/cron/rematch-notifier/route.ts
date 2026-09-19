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

async function notifyOne(
  recipientId: string, recipient: any, otherName: string, course: string, date: string, link: string,
  ctx?: { partnerId: string; kind: string; round: string; nth: number },
) {
  const when = mdLabel(date);
  const { renderNotif } = await import('@/lib/notificationTemplateStore');
  const n = await renderNotif('rematchInvite', { 'いつに': when ? when + 'に' : '', 'コース': course, '相手の名前': otherName });
  const { addNotification } = await import('@/lib/notifications');
  if (n.inApp) addNotification(recipientId, 'rematch', n.inApp, link).catch(() => {});
  const lineSent = isNotifyEnabled(recipient as any, 'rematch');
  if (lineSent) {
    pushTo(recipientId, n.line, liffUrl(link), 'rematch').catch(() => {});
    webPushText(recipientId, n.webTitle, n.webBody, link, `rematch-${link}`).catch(() => {});
  }

  // 誰に・誰との件で・何回目を送ったのかを操作ログに残す。
  // ここは人が押していない自動送信なので、残さないと後から一切たどれない。
  try {
    const { audit, systemActor, AUDIT_ACTION } = await import('@/lib/auditLog');
    await audit({
      ...systemActor('rematch'),
      action: AUDIT_ACTION.rematchNotify,
      targetKind: 'user', targetId: recipientId, targetName: recipient?.displayName || '',
      summary: `「${recipient?.displayName || recipientId}」さんに、${otherName}さんとの再会の誘い`
        + `（${ctx?.nth || 1}回目）を送った`,
      detail: {
        partnerId: ctx?.partnerId, partnerName: otherName, matchKind: ctx?.kind,
        前回のラウンド: `${course}${date ? ` / ${date}` : ''}`, roundId: ctx?.round,
        line: lineSent ? '送信' : 'LINEはOFF（アプリ内のみ）', link,
      },
    });
  } catch { /* ログは落ちても通知は止めない */ }
}

// 再会通知の実処理。管理画面の「今すぐ実行」からも呼べるよう関数化。
export async function runRematchNotifier(limit = MAX_PER_TICK): Promise<{ ok: boolean; sent: number; pairs: number; enabled: boolean }> {
  const cfg = await getRematchConfig();
  if (!cfg.enabled) return { ok: true, sent: 0, pairs: 0, enabled: false };
  const now = Date.now();
  const threshold = now - cfg.intervalDays * rematchDayMs;

  // 完了ラウンドを新しい順に。同一ペアは直近ラウンドを文脈として1回だけ扱う。
  const rounds = (await db.listRounds({ status: 'completed' }))
    // 飲み会（eventType='drink'）は相互レビュー/再会エンジンの対象外。
    .filter((r) => r.eventType !== 'drink')
    .filter((r) => (r.completedAt || 0) > 0 && (r.completedAt || 0) <= threshold)
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  // ── ペアごとの「最後に一緒に回った日」──────────────────────
  //
  // 【直したこと（2026-09-19）】
  // 上の rounds は「intervalDays 以上前に終わったラウンド」だけで、ここから
  // 通知する相手と文面の日付を決めていた。すると、**再会エンジンを通さずに
  // 最近また一緒に回った2人**は、その最近のラウンドが検索範囲に入らないので
  // エンジンが知らない。実際、7/25に回って9/19にまた回った2人に、9/19当日
  // 「7/25に回った◯◯さんとそろそろ…」が届いた。
  //
  // そこで、**全ラウンド**から2人が最後に一緒だった時点を引き、
  //   ・これから一緒に回る予定がある → 送らない
  //   ・最後に一緒に回ってから intervalDays 経っていない → まだ送らない
  //   ・前回の通知より後に一緒に回っている → 新しい周回として数え直す
  // とする。文面の日付とコースも、その最後のラウンドのものを使う。
  const everyRound = (await db.listRounds()).filter((r) => r.eventType !== 'drink');
  const roundsOf = new Map<string, typeof everyRound>();
  for (const r of everyRound) {
    const noShow = new Set(r.noShowIds || []);   // 当日来なかった人は「一緒に回った」に数えない
    for (const u of [r.hostId, ...(r.applicantIds || [])]) {
      if (!u || noShow.has(u)) continue;
      if (!roundsOf.has(u)) roundsOf.set(u, []);
      roundsOf.get(u)!.push(r);
    }
  }
  // そのラウンドで2人が一緒になった（なる）時点。
  //   日付がある → その日（まだ完了を押していない当日のラウンドも拾える）
  //   日付が無く完了済み → 完了した時刻
  //   日付が無く進行中（日程調整中・運営枠の募集中）→ 一緒に入った時点＝作成時刻。
  //     「いま一緒に予定を立てている」ので、その間は誘わない。
  const togetherAt = (r: (typeof everyRound)[number]): number => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(r.date || '');
    if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+09:00`).getTime();
    if (r.status === 'completed') return r.completedAt || r.createdAt || 0;
    return r.createdAt || 0;
  };
  const lastTogether = (a: string, b: string) => {
    const mine = new Set((roundsOf.get(a) || []).map((r) => r.id));
    let best: (typeof everyRound)[number] | null = null;
    let at = 0;
    for (const r of roundsOf.get(b) || []) {
      if (!mine.has(r.id)) continue;
      const t = togetherAt(r);
      if (t > at) { at = t; best = r; }
    }
    return { at, round: best };
  };

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

      const last = lastTogether(a, b);
      // これから一緒に回る予定がある（日付が先）。誘う必要がない。
      if (last.at > now) continue;
      // 最後に一緒に回ってから、まだ intervalDays 経っていない。
      if (last.at > threshold) continue;

      const s = await getSession(pairId);
      // 前回の通知より後に一緒に回っていれば、新しい周回。
      // 回数の上限も、再会が成立済み（agreed/posted）の止めも、ここで外れる。
      const playedSince = !!s && last.at > (s.lastNotifyAt || 0);
      if (s && !playedSince && (s.status === 'agreed' || s.status === 'posted')) continue;
      // 「もう通知しない」を押した人の意思は、周回が変わっても尊重する。
      if (s && (s.optedOutBy || []).length > 0) continue;
      const notifyCount = playedSince ? 0 : (s?.notifyCount || 0);
      if (notifyCount >= cfg.maxCycles) continue;
      // 2回目以降は intervalDays 経過後のみ
      if (notifyCount >= 1 && s?.lastNotifyAt && (now - s.lastNotifyAt) < cfg.intervalDays * rematchDayMs) continue;

      const [ua, ub] = await Promise.all([db.getUser(a), db.getUser(b)]);
      // 文面の「◯/◯に回った」は、いちばん最近一緒に回ったラウンドにする。
      const ctxRound = last.round || r;
      const course = ctxRound.courseName || ctxRound.title || 'ゴルフ';
      const link = `/rematch/${pairId}`;
      const nth = notifyCount + 1;
      await notifyOne(a, ua, ub?.displayName || 'あの人', course, ctxRound.date || '', link,
        { partnerId: b, kind, round: ctxRound.id, nth });
      await notifyOne(b, ub, ua?.displayName || 'あの人', course, ctxRound.date || '', link,
        { partnerId: a, kind, round: ctxRound.id, nth });

      const [lo, hi] = a < b ? [a, b] : [b, a];
      // 新しい周回なら、前の周回の候補日や成立の記録は持ち越さない。
      const carry = s && !playedSince;
      await saveSession(pairId, {
        pairId, userA: lo, userB: hi, roundId: ctxRound.id,
        courseName: course, roundDate: ctxRound.date || '', matchKind: kind,
        notifyCount: notifyCount + 1,
        firstNotifyAt: carry ? (s!.firstNotifyAt || now) : now,
        lastNotifyAt: now,
        candidatesA: carry ? (s!.candidatesA || []) : [],
        candidatesB: carry ? (s!.candidatesB || []) : [],
        agreedDate: carry ? (s!.agreedDate || null) : null,
        agreedAt: carry ? (s!.agreedAt || null) : null,
        postedRoundId: carry ? (s!.postedRoundId || null) : null,
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
