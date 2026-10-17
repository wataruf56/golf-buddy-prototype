import 'server-only';
import { getAdminDb } from './firebase';
import { getCohort } from './ageGate';

// 「💘 異性として気になる」をもらった人へのお知らせ（2026-10-17 本人判断）。
//   ・まだマッチしていない（相手から一方的に 💘 を付けられている）人に、月1回くらい
//     「あなたを異性として気になっている人がいるようです」とお知らせ（＋LINE：「💘 マッチ成立」の設定がONの人）。
//     **誰からかは伏せる**（人数・募集名も出さない）。お互いに 💘 なら、もともとマッチの通知が届く。
//   ・お知らせを送ったら、タイムラインに「💘 …気になっている人がいるようです」を1行（だれ→だれかは伏せる・lib/timeline）。
// 送る条件：前回のお知らせより後に、新しい 💘 が届いている ＆ 前回から30日たっている（初回はすぐ）。
// 毎日20時台に1回だけ見る（housekeeping の cron・_config/crushNotice.lastRunDay）。
// テスト：テスト垢から付いた 💘 は数えない（本番の会員にテストの通知を出さない）。テスト垢あての分はテスト垢の中だけ。
const JST = 9 * 3600 * 1000;
const INTERVAL = 30 * 24 * 3600 * 1000;
const STATE = '_crushNotices';

export async function sendCrushNotices(now = Date.now(), opts: { force?: boolean; onlyUserIds?: string[] } = {}): Promise<Record<string, unknown>> {
  const adb = getAdminDb() as any;
  if (!adb) return { skipped: 'no_db' };
  const jst = new Date(now + JST);
  const day = jst.toISOString().slice(0, 10);
  if (!opts.force) {
    if (jst.getUTCHours() !== 20) return { skipped: 'not_20h' };
    const cfg = adb.collection('_config').doc('crushNotice');
    const cur = await cfg.get();
    if ((cur.data() || {}).lastRunDay === day) return { skipped: 'done_today' };
    await cfg.set({ lastRunDay: day, at: now }, { merge: true });
  }

  const { getTestAccountConfig } = await import('./testAccounts');
  const tcfg = await getTestAccountConfig().catch(() => null);
  const tset = new Set<string>((tcfg?.accounts || []).map((a: any) => a.id));
  const isTest = (id: string) => !!id && (id.startsWith('test_') || tset.has(id));

  // 💘 を全部読み、受け取った人ごとに「一方的な 💘 の、いちばん新しい時刻」を出す
  const snap = await adb.collection('_matchLikes').where('kind', '==', 'romantic').limit(5000).get();
  const likes = snap.docs.map((d: any) => d.data() || {}).filter((x: any) => x.from && x.to && x.from !== x.to);
  const has = new Set<string>(likes.map((x: any) => `${x.from}>${x.to}`));
  const newest: Record<string, number> = {};
  for (const x of likes) {
    if (has.has(`${x.to}>${x.from}`)) continue;                     // お互いに 💘＝マッチ済み（マッチの通知が届いている）
    if (isTest(x.from) && !isTest(x.to)) continue;                    // テスト垢から本番の会員へは数えない
    if (opts.onlyUserIds && !opts.onlyUserIds.includes(x.to)) continue;
    const at = Number(x.ts || x.at || 0) || 1;
    newest[x.to] = Math.max(newest[x.to] || 0, at);
  }
  const targets = Object.keys(newest);
  if (!targets.length) return { ok: true, sent: 0 };

  let banned = new Set<string>();
  try { const { getBannedIdSet } = await import('./banAccess'); banned = await getBannedIdSet(); } catch { /* noop */ }
  const { addNotification } = await import('./notifications');
  const { isNotifyEnabled } = await import('./notifyPrefs');
  const { pushTo, liffUrl } = await import('./linePush');
  const link = '/home';
  const inApp = '💘 あなたを異性として気になっている人がいるようです。だれかは秘密です。ラウンドのあとのレビューで、あなたも気になった人に「💘 異性として気になる」を選ぶと、お互いだったときだけマッチします。';
  const line = '💘【ゴルトモ】あなたを異性として気になっている人がいるようです。\nだれかは秘密です。ラウンドのあとのレビューで、あなたも気になった人に「💘 異性として気になる」を選ぶと、お互いだったときだけマッチします。';

  let sent = 0;
  const skipped: Record<string, number> = {};
  const skip = (k: string) => { skipped[k] = (skipped[k] || 0) + 1; };
  for (const uid of targets) {
    try {
      if (banned.has(uid)) { skip('banned'); continue; }
      const ref = adb.collection(STATE).doc(uid);
      const st = (await ref.get()).data() || {};
      if (Number(st.lastLikeAt || 0) >= newest[uid]) { skip('no_new'); continue; }          // 前回のあと新しい 💘 が無い
      if (st.lastAt && now - Number(st.lastAt) < INTERVAL) { skip('within_30d'); continue; }  // 月1回まで
      const us = await adb.collection('users').doc(uid).get();
      if (!us.exists) { skip('no_user'); continue; }
      const u = { id: uid, ...(us.data() || {}) } as any;
      if (u.banned || u.isSystem) { skip('banned'); continue; }
      await ref.set({ lastAt: now, lastLikeAt: newest[uid], count: Number(st.count || 0) + 1 }, { merge: true });
      await addNotification(uid, 'match', inApp, link);
      if (isNotifyEnabled(u, 'match')) await pushTo(uid, line, liffUrl(link), 'crush_notice');
      // タイムライン（だれ→だれかは伏せる。同じ人は月に1行まで）
      await adb.collection('_timelineEvents').doc(`crush_${uid}_${day.slice(0, 7)}`).set({
        kind: 'crush', at: now, cohort: getCohort(u.age) || 'a', test: isTest(uid), uid,
      }, { merge: true });
      sent++;
    } catch (e) {
      console.warn('[crushNotice] failed', uid, (e as Error).message);
      skip('error');
    }
  }
  return { ok: true, candidates: targets.length, sent, skipped };
}
