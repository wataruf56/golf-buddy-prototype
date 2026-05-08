import { NextRequest, NextResponse } from 'next/server';

// GET /api/admin/swing-test?token=XXX
// Verifies all swing-related env vars + tries generating a Signed URL.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const env = {
    SWING_ANALYZER_URL: !!process.env.SWING_ANALYZER_URL,
    SWING_ANALYZER_SHARED_SECRET: !!process.env.SWING_ANALYZER_SHARED_SECRET,
    GCS_PROJECT_ID: process.env.GCS_PROJECT_ID || null,
    GCS_BUCKET: process.env.GCS_BUCKET || null,
    GCS_SA_KEY_JSON_present: !!process.env.GCS_SA_KEY_JSON,
    GCS_SA_KEY_JSON_length: (process.env.GCS_SA_KEY_JSON || '').length,
    CRON_SECRET: !!process.env.CRON_SECRET,
  };

  // Try parsing JSON
  let keyParsed: any = null;
  let parseErr: string | null = null;
  try {
    if (process.env.GCS_SA_KEY_JSON) {
      const k = JSON.parse(process.env.GCS_SA_KEY_JSON);
      keyParsed = {
        type: k.type,
        project_id: k.project_id,
        client_email: k.client_email,
        private_key_starts: (k.private_key || '').slice(0, 30),
        private_key_has_newlines: (k.private_key || '').includes('\n'),
        private_key_length: (k.private_key || '').length,
      };
    }
  } catch (e) {
    parseErr = (e as Error).message;
  }

  // Try generating a signed URL
  let signedUrlOk = false;
  let signedUrlErr: string | null = null;
  if (keyParsed) {
    try {
      const { generateUploadUrl, buildObjectName } = await import('@/lib/swingGcs');
      await generateUploadUrl(buildObjectName('Utest', 'diag123'));
      signedUrlOk = true;
    } catch (e) {
      signedUrlErr = (e as Error).message;
    }
  }

  return NextResponse.json({ env, keyParsed, parseErr, signedUrlOk, signedUrlErr });
}
