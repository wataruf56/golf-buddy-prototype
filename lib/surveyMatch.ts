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
export async function notifyMatchingSignals(round: Round): Promise<void> {
  try {
    const rawArea = (round.area || '').trim();
    if (!rawArea || !round.id) return;
    const adb = getAdminDb() as any;
    if (!adb) return;

    // ラウンドの県は「東京都/神奈川県…」だが、LPアンケートは「東京/神奈川…」と
    // 接尾辞なしで保存されている。都/道/府/県 を除いて照合する（例: 東京都→東京）。
    const area = rawArea.replace(/[都道府県]$/, '');

    // 希望エリアにこの県を含むアンケート回答者を取得。
    const snap = await adb.collection('_lpSignal').where('areas', 'array-contains', area).limit(1000).get();
    if (snap.empty) return;

    // 同一ユーザーが複数 visitorId で登録している場合に備えて lineUserId で重複排除。
    const userIds = new Set<string>();
    snap.docs.forEach((d: any) => {
      const uid = String(d.data()?.lineUserId || '').trim();
      if (uid && uid !== round.hostId) userIds.add(uid);
    });
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
          pushTo(uid, n.line, liffUrl(link)).catch(() => {});
          webPushText(uid, n.webTitle, n.webBody, link, `surveymatch-${round.id}`).catch(() => {});
        }
      } catch { /* 個別失敗は無視 */ }
    }));
  } catch (e) {
    console.warn('[surveyMatch] notify failed', (e as Error).message);
  }
}
