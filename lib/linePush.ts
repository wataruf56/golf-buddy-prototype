import 'server-only';

// LINE Messaging API push helpers.
// Requires: LINE_CHANNEL_ACCESS_TOKEN env var, and the user must have added
// the bot as a friend (otherwise push returns 403).

const PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push';
const MULTICAST_ENDPOINT = 'https://api.line.me/v2/bot/message/multicast';

export type LineMessage = { type: 'text'; text: string } | { type: 'flex'; altText: string; contents: any };

const liffBase = () => process.env.NEXT_PUBLIC_LIFF_ID
  ? `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}`
  : '';

export function liffUrl(path: string): string {
  const base = liffBase();
  if (!base) return '';
  // LIFF accepts ?to=/round/xxx via our /liff entry router.
  return `${base}?to=${encodeURIComponent(path)}`;
}

async function callLine(endpoint: string, body: unknown): Promise<{ ok: boolean; status: number; detail?: string }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  if (!token) return { ok: false, status: 0, detail: 'no token' };
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, status: res.status, detail };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, detail: (e as Error).message };
  }
}

// 送信結果をユーザーに刻む（best-effort）。
// 友だち追加していない相手に push すると LINE は 400/403 を返す。これを記録しておくと
// 「アプリは使っているがLINEが届かない人」を管理画面で実測できる（liff.getFriendship() は
// ログインチャネルにOAが連携されていないと取れないため、送信結果が唯一の確実な手がかり）。
async function markPushResult(userId: string, ok: boolean, status?: number): Promise<void> {
  if (!userId) return;
  try {
    const { getAdminDb } = await import('./firebase');
    const db = getAdminDb() as any;
    if (!db) return;
    await db.collection('users').doc(userId).set(
      ok
        ? { pushOkAt: Date.now(), pushFailedAt: null, pushFailStatus: null }
        : { pushFailedAt: Date.now(), pushFailStatus: status || 0 },
      { merge: true },
    );
  } catch { /* noop */ }
}

// LINE送信の集計ログ（best-effort）。kind=種別（lib/lineStats の LINE_KIND_LABEL）。
async function logSend(kind: string | undefined, recipients: number): Promise<void> {
  if (recipients <= 0) return;
  try { const { logLineSend } = await import('./lineStats'); await logLineSend(kind || 'other', recipients); } catch { /* noop */ }
}

// 最後の引数 kind は送信種別（管理画面の集計用）。未指定は 'other'。
// LINE の userId（U＋32桁の16進）だけを宛先にする。
// 管理人（admin_manager）・システム・テスト垢の id を渡すと、1件ずつの push は 400 で落ち、
// まとめ送信（multicast）は**宛先に1つでも混ざると丸ごと失敗して誰にも届かない**。
// 運営主催のチャット（運営枠・行ける日の部屋）で「@全員」が届かなかった原因（2026-10-05）。
export const isLineUserId = (id: string | undefined | null): id is string => !!id && /^U[0-9a-f]{32}$/.test(id);

export async function pushTo(userId: string, text: string, link?: string, kind?: string): Promise<void> {
  if (!isLineUserId(userId) || !text) return;
  // テスト隔離：テスト垢の操作／テスト垢の募集の通知は、テスト垢と管理者以外に送らない（2026-10-08）
  const { isolateRecipients } = await import('./testIsolation');
  if (!(await isolateRecipients([userId], link, 'pushTo')).length) return;
  const body = link ? `${text}\n${link}` : text;
  const messages: LineMessage[] = [{ type: 'text', text: body.slice(0, 4900) }];
  const r = await callLine(PUSH_ENDPOINT, { to: userId, messages });
  if (!r.ok) {
    console.warn('[linePush] push failed', { userId, status: r.status, detail: r.detail?.slice(0, 200) });
    await markPushResult(userId, false, r.status);
    return;
  }
  await markPushResult(userId, true);
  await logSend(kind, 1);
}

export async function pushToMany(userIds: string[], text: string, link?: string, kind?: string): Promise<void> {
  // 重複を除き、LINE の userId だけに絞る（上のコメント参照）
  const { isolateRecipients } = await import('./testIsolation');
  const ids = await isolateRecipients(Array.from(new Set(userIds.filter(isLineUserId))), link, 'pushToMany');
  if (!ids.length || !text) return;
  const body = link ? `${text}\n${link}` : text;
  const messages: LineMessage[] = [{ type: 'text', text: body.slice(0, 4900) }];
  let sent = 0;
  // Multicast supports up to 500 ids per call.
  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500);
    const r = await callLine(MULTICAST_ENDPOINT, { to: slice, messages });
    if (r.ok) { sent += slice.length; continue; }
    console.warn('[linePush] multicast failed', { count: slice.length, status: r.status, detail: r.detail?.slice(0, 200) });
    // まとめ送信が落ちたら1件ずつ送り直す（1人の不正な宛先で全員が届かない、を二重に防ぐ）
    if (r.status === 400) {
      for (const id of slice) {
        const one = await callLine(PUSH_ENDPOINT, { to: id, messages });
        if (one.ok) sent += 1;
        else console.warn('[linePush] push fallback failed', { id, status: one.status });
      }
    }
  }
  await logSend(kind, sent);
}
