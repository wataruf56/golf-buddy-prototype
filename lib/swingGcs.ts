import 'server-only';

// GCS helpers for swing videos.
// Bucket: gs://golf-ai-line-videos (cross-project: golf-ai-line-app)
// SA key from env GCS_SA_KEY_JSON (raw JSON string).

let _storage: any = null;
function getStorage(): any {
  if (_storage) return _storage;
  // Lazy import so the dep is only loaded server-side at runtime.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Storage } = require('@google-cloud/storage');
  const projectId = process.env.GCS_PROJECT_ID || 'golf-ai-line-app';
  const keyJson = process.env.GCS_SA_KEY_JSON || '';
  if (!keyJson) throw new Error('GCS_SA_KEY_JSON not set');
  let credentials: any;
  try { credentials = JSON.parse(keyJson); }
  catch (e) { throw new Error('GCS_SA_KEY_JSON is not valid JSON'); }
  _storage = new Storage({ projectId, credentials });
  return _storage;
}

export function getBucketName(): string {
  return process.env.GCS_BUCKET || 'golf-ai-line-videos';
}

export function buildObjectName(userId: string, swingId: string, suffix = ''): string {
  const tag = suffix ? `-${suffix}` : '';
  return `liff/${userId}/${swingId}${tag}.mp4`;
}

export function gcsUriFor(objectName: string): string {
  return `gs://${getBucketName()}/${objectName}`;
}

export async function generateUploadUrl(objectName: string): Promise<string> {
  const [url] = await getStorage()
    .bucket(getBucketName())
    .file(objectName)
    .getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 10 * 60 * 1000,
      contentType: 'video/mp4',
    });
  return url as string;
}

export async function deleteByGcsUri(gcsUri: string): Promise<void> {
  if (!gcsUri || !gcsUri.startsWith('gs://')) return;
  const stripped = gcsUri.replace(/^gs:\/\//, '');
  const idx = stripped.indexOf('/');
  if (idx < 0) return;
  const bucket = stripped.slice(0, idx);
  const objectName = stripped.slice(idx + 1);
  if (bucket !== getBucketName()) return; // Only delete from our bucket
  try {
    await getStorage().bucket(bucket).file(objectName).delete();
  } catch (e) {
    // 404 (already deleted) is fine; log others
    const msg = (e as Error).message || '';
    if (!/(404|No such object)/.test(msg)) {
      console.warn('[swingGcs] delete failed', objectName, msg);
    }
  }
}
