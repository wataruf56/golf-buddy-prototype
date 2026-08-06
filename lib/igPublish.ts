import 'server-only';

// Instagram への投稿（Instagram API with Instagram Login）。
//
// 公開は必ず2段階：
//   1) コンテナ作成  POST /me/media           （image_url + caption）
//   2) 完了待ち      GET  /{container-id}     （status_code=FINISHED まで）
//   3) 公開          POST /me/media_publish   （creation_id）
//
// コンテナは24時間で失効する。予約投稿はコンテナを寝かせるのではなく、
// 「公開する時刻にこの一連の流れをまとめて実行する」方式にしている。
//
// トークンは env IG_ACCESS_TOKEN（Cloud Run に Secret Manager から注入）。
// 長期トークンは約60日で失効するので /api/cron/ig-token-refresh で更新すること。

const GRAPH = 'https://graph.instagram.com/v23.0';
const REFRESH_URL = 'https://graph.instagram.com/refresh_access_token';

export const IG_CAPTION_LIMIT = 2200;

export function igToken(): string {
  return (process.env.IG_ACCESS_TOKEN || '').trim();
}

export function igConfigured(): boolean {
  return !!igToken();
}

async function call(url: string, init?: RequestInit): Promise<any> {
  const r = await fetch(url, { ...init, cache: 'no-store' });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* noop */ }
  if (!r.ok) {
    const msg = json?.error?.message || text.slice(0, 300) || `HTTP ${r.status}`;
    throw new Error(`Instagram API: ${msg}`);
  }
  return json;
}

export async function igWhoAmI(): Promise<{ id: string; username: string; account_type?: string }> {
  const token = igToken();
  if (!token) throw new Error('IG_ACCESS_TOKEN が未設定です');
  const q = new URLSearchParams({ fields: 'id,username,account_type', access_token: token });
  return call(`${GRAPH}/me?${q}`);
}

/** 画像1枚のフィード投稿を公開する。成功すると投稿の media id を返す。 */
export async function igPublishImage(imageUrl: string, caption: string): Promise<string> {
  const token = igToken();
  if (!token) throw new Error('IG_ACCESS_TOKEN が未設定です');
  if (!/^https:\/\//i.test(imageUrl)) throw new Error('画像URLは https の公開URLである必要があります');
  const cap = (caption || '').slice(0, IG_CAPTION_LIMIT);

  // 1) コンテナ作成
  const created = await call(`${GRAPH}/me/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ image_url: imageUrl, caption: cap, access_token: token }),
  });
  const containerId: string = created?.id;
  if (!containerId) throw new Error('コンテナIDが取得できませんでした');

  // 2) 完了待ち（最大約2分）
  let last = '';
  for (let i = 0; i < 30; i++) {
    const q = new URLSearchParams({ fields: 'status_code,status', access_token: token });
    const st = await call(`${GRAPH}/${containerId}?${q}`);
    last = String(st?.status_code || '');
    if (last === 'FINISHED') break;
    if (last === 'ERROR') throw new Error(`コンテナの処理に失敗: ${st?.status || 'ERROR'}`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  if (last !== 'FINISHED') throw new Error(`コンテナがFINISHEDになりませんでした（最後の状態: ${last || '不明'}）`);

  // 3) 公開
  const pub = await call(`${GRAPH}/me/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: containerId, access_token: token }),
  });
  const mediaId: string = pub?.id;
  if (!mediaId) throw new Error('公開後のmedia idが取得できませんでした');
  return mediaId;
}

/** 長期トークンを更新する。新しいトークンと残り日数を返す（保存は呼び出し側）。 */
export async function igRefreshToken(): Promise<{ token: string; expiresInDays: number }> {
  const token = igToken();
  if (!token) throw new Error('IG_ACCESS_TOKEN が未設定です');
  const q = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token });
  const res = await call(`${REFRESH_URL}?${q}`);
  const next = res?.access_token;
  if (!next) throw new Error(`更新に失敗: ${JSON.stringify(res).slice(0, 200)}`);
  return { token: next, expiresInDays: Math.floor(Number(res?.expires_in || 0) / 86400) };
}
