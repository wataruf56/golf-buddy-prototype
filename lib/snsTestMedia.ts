import 'server-only';
import crypto from 'crypto';

// インスタ風テスト版の動画置き場（2026-11-01 本人指定「ストーリーや投稿に動画も」・運営だけ）。
//   ・Firestore には1件1MBまでしか入らないので、動画だけ非公開バケット gs://goltomo-sns-test-media に置く（公開設定の golf-ai-line-videos は使わない）。
//   ・Cloud Run は32MBより大きい本文を受けられないので、端末から署名URLで直接アップロードする。見るときも時間制限つきの署名URL。
//   ・p/ は投稿、s/ はストーリー。s/ はバケットの設定で2日後に自動で消える。
const BUCKET = process.env.SNS_TEST_BUCKET || 'goltomo-sns-test-media';
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const TYPES: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'm4v' };
const SIZE_RANGE = `0,${MAX_VIDEO_BYTES}`;

export type VideoKind = 'p' | 's';

let _bucket: any = null;
function bucket(): any {
  if (_bucket) return _bucket;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Storage } = require('@google-cloud/storage');
  _bucket = new Storage({ projectId: process.env.GCS_PROJECT_ID || 'golf-ai-line-app', credentials: JSON.parse(process.env.GCS_SA_KEY_JSON || '{}') }).bucket(BUCKET);
  return _bucket;
}

/** アップロード先（10分だけ有効）。PUT のとき headers をそのまま付ける */
export async function videoUploadUrl(meId: string, kind: VideoKind, contentType: string, size: number) {
  const ext = TYPES[contentType];
  if (!ext) throw new Error('bad_type');
  if (!(size > 0) || size > MAX_VIDEO_BYTES) throw new Error('too_large');
  const object = `${kind}/${meId}/${crypto.randomBytes(12).toString('hex')}.${ext}`;
  const [url] = await bucket().file(object).getSignedUrl({
    version: 'v4', action: 'write', expires: Date.now() + 10 * 60 * 1000, contentType,
    extensionHeaders: { 'x-goog-content-length-range': SIZE_RANGE },
  });
  return { url, object, headers: { 'Content-Type': contentType, 'x-goog-content-length-range': SIZE_RANGE } };
}

/** 自分が上げた動画で、ちゃんと置かれているかを確かめる（ほかの人の動画を付けられないように） */
export async function assertMyVideo(meId: string, kind: VideoKind, object: string): Promise<void> {
  if (!object.startsWith(`${kind}/${meId}/`) || !/^[a-f0-9]+\.[a-z0-9]+$/.test(object.slice(`${kind}/${meId}/`.length))) throw new Error('bad_video');
  const [meta] = await bucket().file(object).getMetadata().catch(() => [null]);
  if (!meta || !String(meta.contentType || '').startsWith('video/') || Number(meta.size) > MAX_VIDEO_BYTES) throw new Error('bad_video');
}

/** 見るための署名URL（12時間） */
export async function videoPlayUrl(object: string): Promise<string> {
  const [url] = await bucket().file(object).getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 12 * 3600 * 1000 });
  return url;
}

export async function deleteVideo(object: string): Promise<void> {
  if (object) await bucket().file(object).delete().catch(() => {});
}
