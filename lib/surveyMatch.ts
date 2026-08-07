import 'server-only';
import { getAdminDb } from './firebase';
import { db } from './db';
import { isNotifyEnabled } from './notifyPrefs';
import type { Round } from './types';

// LP診断アンケート（_lpSignal）で希望エリアを登録したユーザーへ、その県の
// ラウンドが新規投稿されたときに「条件に一致する募集が投稿されました」と通知する。
//
// _lpSignal: { lineUserId, areas[], days[], pickup, pickupPlaces[], ... }
// マッチ条件＝ round.area が signal.areas に含まれること（県の一致）。
// 主催者自身・通知OFFの人は除外。失敗しても投稿処理は止めない（best-effort）。
// ラウンドの開催日を「平日」「土日」に分類。日付が無い/不正なら ''（曜日で絞らない）。
function weekdayCategory(date?: string): '' | '平日' | '土日' {
  if (!date) return '';
  const dt = new Date(date);
  if (isNaN(dt.getTime())) return '';
  const d = dt.getDay(); // 0=日,6=土
  return (d === 0 || d === 6) ? '土日' : '平日';
}

export async function notifyMatchingSignals(round: Round): Promise<void> {
  try {
    const rawArea = (round.area || '').trim();
    if (!rawArea || !round.id) return;
    const adb = getAdminDb() as any;
    if (!adb) return;

    // ラウンドの県は「東京都/神奈川県…」だが、LPアンケートは「東京/神奈川…」と
    // 接尾辞なしで保存されている。都/道/府/県 を除いて照合する（例: 東京都→東京）。
    const area = rawArea.replace(/[都道府県]$/, '');

    const userIds = new Set<string>();

    // (1) LP診断アンケート（_lpSignal）：希望エリアにこの県(接尾辞なし)を含む回答者。
    try {
      const snap = await adb.collection('_lpSignal').where('areas', 'array-contains', area).limit(1000).get();
      snap.docs.forEach((d: any) => {
        const uid = String(d.data()?.lineUserId || '').trim();
        if (uid && uid !== round.hostId) userIds.add(uid);
      });
    } catch { /* noop */ }

    // (2) プロフィール登録の希望条件（notifyMatch）：県(フルネーム)一致＋曜日・送迎で絞り込み。
    try {
      const roundDay = weekdayCategory(round.date); // '平日'|'土日'|''（日程未定）
      const usnap = await adb.collection('users').where('notifyMatch.areas', 'array-contains', rawArea).limit(3000).get();
      usnap.docs.forEach((d: any) => {
        const u = d.data() || {};
        const nm = u.notifyMatch;
        if (!nm || !nm.enabled) return;
        if (d.id === round.hostId) return;
        // 曜日フィルタ：設定があり、ラウンドに日付があるときだけ判定。
        if (Array.isArray(nm.days) && nm.days.length && roundDay && !nm.days.includes(roundDay)) return;
        // 送迎フィルタ：'pickup'(送迎ありだけ希望)のときのみ、送迎ありの募集に絞る。
        // 'any'(こだわらない)・'car'(自分で行ける)は絞らない。旧データ pickup:true も 'pickup' 扱い。
        const wantsPickupOnly = nm.pickupPref === 'pickup' || (nm.pickupPref == null && nm.pickup === true);
        if (wantsPickupOnly && round.pickupOffered !== true) return;
        userIds.add(String(d.id));
      });
    } catch { /* noop */ }

    // すでにこのラウンドに関わっている人（参加/申請中）は通知対象から外す。
    for (const uid of [round.hostId, ...(round.applicantIds || []), ...(round.pendingApplicantIds || [])]) userIds.delete(uid);
    if (userIds.size === 0) return;

    const { addNotification } = await import('./notifications');
    const { pushTo, liffUrl } = await import('./linePush');
    const { webPushText } = await import('./webPush');

    const link = `/round/${round.id}`;
    const title = round.title || 'ラウンド募集';
    const { renderNotif } = await import('./notificationTemplateStore');
    const n = await renderNotif('surveyMatch', { '募集タイトル': title, 'エリア': rawArea });

    await Promise.all(Array.from(userIds).map(async (uid) => {
      try {
        const user = await db.getUser(uid);
        // 退会・存在しないユーザーはスキップ。アプリ内通知は記録、LINE/Webは設定ON時のみ。
        if (n.inApp) addNotification(uid, 'surveyMatch', n.inApp, link).catch(() => {});
        if (isNotifyEnabled(user as any, 'surveyMatch')) {
          pushTo(uid, n.line, liffUrl(link), 'survey').catch(() => {});
          webPushText(uid, n.webTitle, n.webBody, link, `surveymatch-${round.id}`).catch(() => {});
        }
      } catch { /* 個別失敗は無視 */ }
    }));
  } catch (e) {
    console.warn('[surveyMatch] notify failed', (e as Error).message);
  }
}
