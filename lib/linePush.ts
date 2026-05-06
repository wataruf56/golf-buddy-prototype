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

export async function pushTo(userId: string, text: string, link?: string): Promise<void> {
  if (!userId || !text) return;
  const body = link ? `${text}\n${link}` : text;
  const messages: LineMessage[] = [{ type: 'text', text: body.slice(0, 4900) }];
  const r = await callLine(PUSH_ENDPOINT, { to: userId, messages });
  if (!r.ok) console.warn('[linePush] push failed', { userId, status: r.status, detail: r.detail?.slice(0, 200) });
}

export async function pushToMany(userIds: string[], text: string, link?: string): Promise<void> {
  const ids = userIds.filter(Boolean);
  if (!ids.length || !text) return;
  const body = link ? `${text}\n${link}` : text;
  const messages: LineMessage[] = [{ type: 'text', text: body.slice(0, 4900) }];
  // Multicast supports up to 500 ids per call.
  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500);
    const r = await callLine(MULTICAST_ENDPOINT, { to: slice, messages });
    if (!r.ok) console.warn('[linePush] multicast failed', { count: slice.length, status: r.status, detail: r.detail?.slice(0, 200) });
  }
}
