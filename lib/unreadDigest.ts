import 'server-only';
import { db } from '@/lib/db';
import { getAdminDb } from '@/lib/firebase';
import { pushTo, liffUrl } from '@/lib/linePush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';

// 未読メッセージのまとめ通知の実処理。DM着信ごとのLINE通知（＝LINE配信上限をすぐ使い切る）の
// 代替として、1日3回（JST 9/15/21時）だけ実行し、未読DMがあるユーザーへ1通だけ送る。
// NOTE: route.ts は GET/POST 以外を export すると next build が失敗するため、実処理はここに置く。
const SLOT_HOURS = [9, 15, 21]; // JST
const CHATS_LIMIT = 3000;
const MAX_PER_RUN = 500;

export async function runUnreadDigest(): Promise<{ ok: boolean; ran: boolean; slot?: string; recipients?: number; sent?: number }> {
  const now = Date.now();
  const jst = new Date(now + 9 * 3600 * 1000);
  const hour = jst.getUTCHours();
  if (!SLOT_HOURS.includes(hour)) return { ok: true, ran: false };
  const slot = `${jst.toISOString().slice(0, 10)}-${String(hour).padStart(2, '0')}`; // 'YYYY-MM-DD-HH'

  const adb = getAdminDb() as any;
  // 同じ時間帯(スロット)で二重に走らないよう、_config/unreadDigest に最後に実行したスロットを記録。
  if (adb) {
    try {
      const ref = adb.collection('_config').doc('unreadDigest');
      const snap = await ref.get();
      if (snap.exists && snap.data()?.lastSlot === slot) return { ok: true, ran: false, slot };
      await ref.set({ lastSlot: slot, updatedAt: now }, { merge: true });
    } catch { /* 判定不能でもそのまま進む（多重送信は極稀） */ }
  }

  // 直近チャットを走査し、未読(unreadCount>0)を持つユーザーを集める。
  const chats = await db.listRecentChats(CHATS_LIMIT);
  const unreadUsers = new Set<string>();
  for (const c of chats) {
    const uc = (c as any).unreadCount || {};
    for (const uid of Object.keys(uc)) {
      if ((uc[uid] || 0) > 0) unreadUsers.add(uid);
    }
  }

  const ids = Array.from(unreadUsers).slice(0, MAX_PER_RUN);
  let sent = 0;
  const link = '/buddies';
  for (const uid of ids) {
    const u = await db.getUser(uid);
    // 全体OFF /「未読メッセージのお知らせ」OFF の人には送らない。
    if (!isNotifyEnabled(u as any, 'unread')) continue;
    try {
      await pushTo(uid, '📩 未読のメッセージがあります。', liffUrl(link));
      sent++;
    } catch { /* best-effort */ }
  }

  return { ok: true, ran: true, slot, recipients: ids.length, sent };
}
