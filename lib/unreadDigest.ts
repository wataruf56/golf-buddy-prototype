import 'server-only';
import { db } from '@/lib/db';
import { getAdminDb } from '@/lib/firebase';
import { pushTo, liffUrl } from '@/lib/linePush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';

// 未読メッセージのまとめ通知。DM着信ごとのLINE通知（＝配信上限をすぐ使い切る）の代替。
// 巡回は housekeeping cron（15分毎）から runUnreadDigest() が呼ばれる。
//
// 【重複防止＋経過時間方式】（2026-08-01〜）
// - 一度通知した未読は、それ以降は再通知しない。
// - 再通知するのは「追いメッセージ（同じ相手の2通目）」「別の相手からの新規」が来たときだけ。
// - 「メッセージが来て delayMinutes 分以上未読なら、その後の巡回で1通」送る（本人が自分で
//   読む猶予を与える）。
// 実装：ユーザーごとに「未読チャットの最新メッセージ時刻」newestUnread を求め、前回通知した
//   時刻 notifiedAt[uid] より新しく、かつ delay を過ぎていれば1通送る。送ったら
//   notifiedAt[uid]=newestUnread に更新。newestUnread が進まない限り再通知しない。
// NOTE: route.ts は GET/POST 以外を export すると next build が失敗するため、実処理はここに置く。

const CHATS_LIMIT = 3000;
const MAX_PER_RUN = 500;
const CONFIG_DOC = 'unreadDigest';

const DEFAULTS = {
  enabled: true,
  delayMinutes: 15,
  messageText: '📩 未読のメッセージがあります。',
};

export type UnreadConfig = {
  enabled: boolean;
  delayMinutes: number;
  messageText: string;
  updatedAt?: number;
};

// 設定（enabled / delayMinutes / messageText）を読む。notifiedAt は返さない（管理画面用）。
export async function getUnreadConfig(): Promise<UnreadConfig> {
  const adb = getAdminDb() as any;
  if (!adb) return { ...DEFAULTS };
  try {
    const snap = await adb.collection('_config').doc(CONFIG_DOC).get();
    const d = (snap.exists ? snap.data() : {}) || {};
    return {
      enabled: typeof d.enabled === 'boolean' ? d.enabled : DEFAULTS.enabled,
      delayMinutes: Number.isFinite(d.delayMinutes) ? d.delayMinutes : DEFAULTS.delayMinutes,
      messageText: typeof d.messageText === 'string' && d.messageText.trim() ? d.messageText : DEFAULTS.messageText,
      updatedAt: d.updatedAt,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

// 設定を保存（管理画面から）。notifiedAt には触れない。
export async function saveUnreadConfig(patch: Partial<UnreadConfig>): Promise<UnreadConfig> {
  const adb = getAdminDb() as any;
  const cur = await getUnreadConfig();
  const next: UnreadConfig = {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : cur.enabled,
    // 0〜1440分（24h）に丸める。1分未満は1分に。
    delayMinutes: patch.delayMinutes != null
      ? Math.max(0, Math.min(1440, Math.floor(Number(patch.delayMinutes) || 0)))
      : cur.delayMinutes,
    messageText: typeof patch.messageText === 'string' && patch.messageText.trim()
      ? patch.messageText.trim().slice(0, 200)
      : cur.messageText,
    updatedAt: Date.now(),
  };
  if (adb) {
    try {
      await adb.collection('_config').doc(CONFIG_DOC).set(
        { enabled: next.enabled, delayMinutes: next.delayMinutes, messageText: next.messageText, updatedAt: next.updatedAt },
        { merge: true },
      );
    } catch { /* best-effort */ }
  }
  return next;
}

export async function runUnreadDigest(opts?: { force?: boolean }): Promise<{ ok: boolean; ran: boolean; recipients?: number; sent?: number; delayMinutes?: number }> {
  const force = !!opts?.force;
  const now = Date.now();
  const adb = getAdminDb() as any;

  const cfg = await getUnreadConfig();
  if (!cfg.enabled && !force) return { ok: true, ran: false };
  const delayMs = force ? 0 : cfg.delayMinutes * 60 * 1000;

  // 前回通知済みの時刻マップを読む。
  let notifiedAt: Record<string, number> = {};
  if (adb) {
    try {
      const snap = await adb.collection('_config').doc(CONFIG_DOC).get();
      const d = (snap.exists ? snap.data() : {}) || {};
      if (d.notifiedAt && typeof d.notifiedAt === 'object') notifiedAt = d.notifiedAt;
    } catch { /* 判定不能でも空で進む */ }
  }

  // 直近チャットを走査し、ユーザーごとに「未読チャットの最新メッセージ時刻」を求める。
  const chats = await db.listRecentChats(CHATS_LIMIT);
  const newestUnreadByUser = new Map<string, number>();
  for (const c of chats) {
    const uc = (c as any).unreadCount || {};
    const lastAt = (c as any).lastMessageAt || 0;
    for (const uid of Object.keys(uc)) {
      if ((uc[uid] || 0) <= 0) continue;
      const prev = newestUnreadByUser.get(uid) || 0;
      if (lastAt > prev) newestUnreadByUser.set(uid, lastAt);
    }
  }

  // 通知対象を選ぶ：新しい未読があり（前回通知より新しい）、かつ delay を過ぎている人。
  const candidates: Array<{ uid: string; newest: number }> = [];
  for (const [uid, newest] of newestUnreadByUser) {
    if (newest <= (notifiedAt[uid] || 0)) continue;      // 既に通知済み（放置分は再通知しない）
    if (now - newest < delayMs) continue;                // まだ猶予時間内
    candidates.push({ uid, newest });
  }
  // 新しい順に、上限まで。
  candidates.sort((a, b) => b.newest - a.newest);
  const targets = candidates.slice(0, MAX_PER_RUN);

  let sent = 0;
  const link = '/buddies';
  const nextNotified: Record<string, number> = {};
  for (const { uid, newest } of targets) {
    const u = await db.getUser(uid);
    // 全体OFF /「未読メッセージのお知らせ」OFF の人には送らない。
    if (!isNotifyEnabled(u as any, 'unread')) continue;
    try {
      await pushTo(uid, cfg.messageText, liffUrl(link), 'unread');
      nextNotified[uid] = newest; // 送れた人だけ記録を進める
      sent++;
    } catch { /* best-effort（送れなければ記録を進めない＝次回再挑戦） */ }
  }

  // notifiedAt を更新（今回送った分を反映）＋現在未読を持つ人だけに剪定してサイズを抑える。
  if (adb) {
    const pruned: Record<string, number> = {};
    for (const [uid, ts] of newestUnreadByUser) {
      pruned[uid] = nextNotified[uid] ?? (notifiedAt[uid] || 0);
    }
    try {
      await adb.collection('_config').doc(CONFIG_DOC).set(
        { notifiedAt: pruned, lastRunAt: now },
        { merge: true },
      );
    } catch { /* best-effort */ }
  }

  return { ok: true, ran: true, recipients: targets.length, sent, delayMinutes: cfg.delayMinutes };
}
