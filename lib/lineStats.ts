import 'server-only';
import { getAdminDb } from './firebase';

// LINE送信の集計ログ。来月からのLINE有料化に備え、「どの種別のLINEを何通、全体に
// 送っているか」を月ごとに把握できるようにする。_lineStats/{YYYY-MM(JST)} に集約。
//   total: { pushes, recipients }   … pushes=送信呼び出し回数 / recipients=延べ宛先数(≒課金対象通数)
//   byKind: { [kind]: { pushes, recipients } }
//   daily:  { 'YYYY-MM-DD': recipients }
// recipients が LINE の従量課金に効く「通数」の目安。

// 種別の日本語ラベル（管理画面表示用）。
export const LINE_KIND_LABEL: Record<string, string> = {
  reviewReminder: 'レビュー依頼',
  unread: '未読メッセージのお知らせ',
  roundReminder: '開催前リマインド',
  upcomingReminder: '直近の開催リマインド',
  rematch: '再会エンジン',
  interest: '気になる・締切間近',
  invited: '招待',
  joined: '参加申請（主催者へ）',
  approved: '参加承認',
  chat: 'ラウンドチャット',
  mention: 'チャットの@メンション',
  dm: 'DM・管理人チャット',
  match: 'マッチ成立',
  pickup: '送迎（ピックアップ）',
  friend: 'QR友達追加',
  survey: 'アンケート一致のお知らせ',
  swing: 'スイング解析',
  report: '通報（運営へ）',
  signup: '新規登録（運営へ）',
  adminTest: 'テスト送信（運営）',
  adminOps: '運営オペレーション',
  other: 'その他',
};
export const lineKindLabel = (k: string) => LINE_KIND_LABEL[k] || k;

function jstParts(ts = Date.now()) {
  const d = new Date(ts + 9 * 3600 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return { month: `${y}-${m}`, date: `${y}-${m}-${day}` };
}

// 送信のたびに呼ぶ（best-effort・失敗しても送信自体は妨げない）。
export async function logLineSend(kind: string, recipients: number): Promise<void> {
  const db = getAdminDb() as any;
  if (!db || !recipients || recipients <= 0) return;
  const k = (kind || 'other').slice(0, 40);
  const { month, date } = jstParts();
  const ref = db.collection('_lineStats').doc(month);
  try {
    const snap = await ref.get();
    const data = (snap.exists ? snap.data() : {}) || {};
    const byKind = { ...(data.byKind || {}) };
    const cur = byKind[k] || { pushes: 0, recipients: 0 };
    byKind[k] = { pushes: (cur.pushes || 0) + 1, recipients: (cur.recipients || 0) + recipients };
    const total = data.total || { pushes: 0, recipients: 0 };
    const daily = { ...(data.daily || {}) };
    daily[date] = (daily[date] || 0) + recipients;
    await ref.set({
      month,
      byKind,
      total: { pushes: (total.pushes || 0) + 1, recipients: (total.recipients || 0) + recipients },
      daily,
      updatedAt: Date.now(),
    }, { merge: true });
  } catch { /* best-effort */ }
}

export async function getLineStats(month?: string): Promise<any> {
  const db = getAdminDb() as any;
  const { month: cur } = jstParts();
  const m = month || cur;
  if (!db) return { month: m, byKind: {}, total: { pushes: 0, recipients: 0 }, daily: {} };
  try {
    const snap = await db.collection('_lineStats').doc(m).get();
    return snap.exists ? { month: m, ...snap.data() } : { month: m, byKind: {}, total: { pushes: 0, recipients: 0 }, daily: {} };
  } catch {
    return { month: m, byKind: {}, total: { pushes: 0, recipients: 0 }, daily: {} };
  }
}

// 直近数ヶ月の月別合計（推移把握用）。
export async function listLineStatsMonths(limit = 6): Promise<Array<{ month: string; recipients: number; pushes: number }>> {
  const db = getAdminDb() as any;
  if (!db) return [];
  try {
    const snap = await db.collection('_lineStats').limit(24).get();
    return snap.docs
      .map((d: any) => ({ month: d.id, recipients: d.data()?.total?.recipients || 0, pushes: d.data()?.total?.pushes || 0 }))
      .sort((a: any, b: any) => (a.month < b.month ? 1 : -1))
      .slice(0, limit);
  } catch { return []; }
}
