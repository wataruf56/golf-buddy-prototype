import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { db } from '@/lib/db';
import { getSession, membersOfPair, overlapDates, recordRematchEvent, listSessionsForUser, rematchDayMs, lastTogetherIn, playedSinceNotify } from '@/lib/rematch';
import { getAdminDb } from '@/lib/firebase';
import { getRematchConfig } from '@/lib/rematchConfig';

// GET /api/rematch/[pairId] — 1ペアの状態（自分視点：自分/相手の候補日・重なり・status）。
// 当事者のみ閲覧可。開いたら rematch_notify_open を計測（通知タップ率）。
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(_req: NextRequest, { params }: { params: { pairId: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const pairId = params.pairId;
  const [m1, m2] = membersOfPair(pairId);
  if (meId !== m1 && meId !== m2) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const s = await getSession(pairId);
  if (!s) return NextResponse.json({ error: 'notfound' }, { status: 404, headers: noStore });

  recordRematchEvent('rematch_notify_open', { pairId, roundId: s.roundId, cycle: s.notifyCount, userId: meId }).catch(() => {});

  const isA = s.userA === meId;
  const otherId = isA ? s.userB : s.userA;
  const mine = (isA ? s.candidatesA : s.candidatesB) || [];
  const theirs = (isA ? s.candidatesB : s.candidatesA) || [];
  const myParty = (isA ? s.partyPrefA : s.partyPrefB) || [];
  const theirParty = (isA ? s.partyPrefB : s.partyPrefA) || [];
  const myMeet = (isA ? s.meetPrefA : s.meetPrefB) || [];
  const theirMeet = (isA ? s.meetPrefB : s.meetPrefA) || [];
  const [other, cfg] = await Promise.all([db.getUser(otherId), getRematchConfig()]);

  // 過去の入力の再利用：自分が他のペアで出した候補日（今後の範囲内）をまとめて返す。
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const maxDate = new Date(Date.now() + (9 * 3600 + cfg.candidateWindowDays * 86400) * 1000).toISOString().slice(0, 10);
  const pastSet = new Set<string>();
  try {
    const allSessions = await listSessionsForUser(meId);
    for (const os of allSessions) {
      if (os.pairId === pairId) continue;
      const cand = os.userA === meId ? os.candidatesA : os.candidatesB;
      (cand || []).forEach((d) => { if (d >= today && d <= maxDate) pastSet.add(d); });
    }
  } catch { /* best-effort */ }
  const myPastCandidates = Array.from(pastSet).sort();

  // 次の再会通知が送られる予定時刻（ms）。該当しなければ null（今後の通知なし）。
  //
  // 通知バッチ（cron/rematch-notifier）と**同じ判定**で出す。以前は
  // 「前回通知＋intervalDays」だけで出していたが、バッチは「最後に一緒に回った日」も
  // 見るようになったので、画面に出る日付と実際に届く日がずれていた。
  let nextNotifyAt: number | null = null;
  let lastAt = 0;
  try {
    // 自分が入っているラウンドだけ引けば、2人が一緒のものは全部入っている。
    const adb = getAdminDb() as any;
    if (adb) {
      const [asApp, asHost] = await Promise.all([
        adb.collection('rounds').where('applicantIds', 'array-contains', meId).limit(500).get(),
        adb.collection('rounds').where('hostId', '==', meId).limit(500).get(),
      ]);
      const mineRounds = [...asApp.docs, ...asHost.docs].map((d: any) => ({ id: d.id, ...(d.data() || {}) }));
      lastAt = lastTogetherIn(mineRounds, meId, otherId).at;
    }
  } catch { /* 引けなければ前回通知だけで出す */ }

  const interval = cfg.intervalDays * rematchDayMs;
  const playedSince = playedSinceNotify(lastAt, s.lastNotifyAt);
  const count = playedSince ? 0 : (s.notifyCount || 0);
  const concluded = !playedSince && (s.status === 'agreed' || s.status === 'posted');
  if (cfg.enabled && !concluded && (s.optedOutBy || []).length === 0 && count < cfg.maxCycles
      && (lastAt || s.lastNotifyAt)) {
    let t = lastAt ? lastAt + interval : 0;
    // 同じ周回の2回目以降は、前回の通知からも intervalDays 空ける。
    if (count >= 1 && s.lastNotifyAt) t = Math.max(t, s.lastNotifyAt + interval);
    nextNotifyAt = t || null;
  }

  return NextResponse.json({
    pairId,
    status: s.status,
    nextNotifyAt,
    candidateWindowDays: cfg.candidateWindowDays,
    myPastCandidates,
    courseName: s.courseName || '',
    roundDate: s.roundDate || '',
    matchKind: s.matchKind,
    myCandidates: mine,
    theirCandidates: theirs,
    myParty,
    theirParty,
    myMeet,
    theirMeet,
    overlap: overlapDates(mine, theirs),
    agreedDate: s.agreedDate || null,
    postedRoundId: s.postedRoundId || null,
    optedOut: (s.optedOutBy || []).includes(meId),
    other: other
      ? { id: otherId, displayName: other.displayName || 'メンバー', avatar: other.avatar || '⛳', avatarUrl: (other as any).avatarUrl || '', age: other.age || 0 }
      : { id: otherId, displayName: 'メンバー', avatar: '⛳' },
  }, { headers: noStore });
}
