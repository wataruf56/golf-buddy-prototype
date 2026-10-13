import 'server-only';
import { db } from './db';
import { activeHoldOf, holdDueText, roundStillActive, jstParts } from './roundHold';

// 保留の期日が来たら、主催者・共同管理者に LINE＋アプリ内のお知らせを1回だけ（2026-10-13・housekeeping cron＝15分ごと）。
// 画面のポップアップ（components/HoldDueGate）は時刻どおりに出るので、ここは「アプリを開いていない主催者」向け。
//   ・送ったら holds[userId].dueNotifiedAt を打つ（先に打ってから送る＝二重送信しない）
//   ・同じ募集で同時に期日が来た人は1通にまとめる
//   ・夜中（JST 23:00〜7:59）は送らず、朝8時以降の回にまとめて送る（ポップアップはその間も出る）（2026-10-13 7時→8時）
//   ・募集が完了・中止、申請者が取り下げた／承認・見送り済みなら送らない
// 宛先の絞り込み（テスト垢）は pushTo / addNotificationMany の中の lib/testIsolation が、リンク /round/<id> から判定する。
export async function sendDueHoldLines(now = Date.now()): Promise<{ rounds: number; holds: number; skippedNight?: boolean }> {
  const h = jstParts(now).h;
  if (h >= 23 || h < 8) return { rounds: 0, holds: 0, skippedNight: true };
  const all = await db.listRounds();
  let rounds = 0; let holds = 0;
  for (const r of all) {
    if (!r?.holds || !roundStillActive(r as any)) continue;
    const due = (r.pendingApplicantIds || []).filter((uid) => {
      const hd = activeHoldOf(r, uid);
      return !!hd && hd.until <= now && !hd.dueNotifiedAt;
    });
    if (!due.length) continue;
    // 先に印を付ける（失敗した人の分は送らない）
    const marked: string[] = [];
    for (const uid of due) {
      try { if (await db.patchApplicantHold(r.id, uid, { dueNotifiedAt: now })) marked.push(uid); } catch { /* 次の回でまた試す */ }
    }
    if (!marked.length) continue;
    try {
      const users = await db.listUsers(marked);
      const names = marked.map((uid) => users.find((u) => u?.id === uid)?.displayName || 'メンバー');
      const until = Math.min(...marked.map((uid) => activeHoldOf(r, uid)!.until));
      const text = holdDueText(r as any, names, until);
      const link = `/round/${r.id}`;
      const targets = Array.from(new Set([r.hostId, ...(r.coHostIds || [])].filter(Boolean)));
      const { addNotificationMany } = await import('./notifications');
      await addNotificationMany(targets, 'applyReceived', text, link).catch(() => {});
      const { pushTo, liffUrl } = await import('./linePush');
      const { isNotifyEnabled } = await import('./notifyPrefs');
      const hosts = await db.listUsers(targets);
      await Promise.all(targets.map(async (uid) => {
        const hu = hosts.find((x) => x?.id === uid);
        // 申請まわりの通知（「🆕 参加申請が届いた」）を切っている人には LINE は送らない（お知らせとポップアップは出る）
        if (isNotifyEnabled(hu as any, 'applyReceived')) await pushTo(uid, text, liffUrl(link), 'holdDue').catch(() => {});
      }));
      rounds++; holds += marked.length;
    } catch (e) { console.warn('[holdDue] notify failed', r.id, (e as Error).message); }
  }
  return { rounds, holds };
}
