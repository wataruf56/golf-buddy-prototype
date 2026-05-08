import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { generateUploadUrl, buildObjectName, gcsUriFor } from '@/lib/swingGcs';
import { isSwingAllowed } from '@/lib/swingAccess';
import type { SwingUploadRole } from '@/types/swing';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// POST /api/swing/upload-url
// Body: { swingId: string, role: 'video' | 'pro' | 'prev' }
// Returns: { uploadUrl, gcsUri, objectName }
export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!isSwingAllowed(meId)) return NextResponse.json({ error: 'beta_only' }, { status: 403, headers: noStore });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }

  const swingId = String(body?.swingId || '').trim();
  const role: SwingUploadRole = (body?.role as SwingUploadRole) || 'video';
  // Accept the actual file's mime type so iOS .mov works (Gemini handles both).
  const rawContentType = String(body?.contentType || 'video/mp4').trim();
  const contentType = /^video\/[a-zA-Z0-9.+-]+$/.test(rawContentType) ? rawContentType : 'video/mp4';
  // Map mime → extension so the GCS object has a sane suffix.
  const ext = contentType === 'video/quicktime' ? 'mov'
    : contentType === 'video/mp4' ? 'mp4'
    : contentType.split('/')[1] || 'mp4';

  if (!swingId) return NextResponse.json({ error: 'swingId required' }, { status: 400, headers: noStore });
  if (!/^[a-zA-Z0-9_-]{6,40}$/.test(swingId)) {
    return NextResponse.json({ error: 'invalid swingId format' }, { status: 400, headers: noStore });
  }

  const suffix = role === 'video' ? '' : role;
  const objectName = buildObjectName(meId, swingId, suffix, ext);

  try {
    const uploadUrl = await generateUploadUrl(objectName, contentType);
    return NextResponse.json(
      { uploadUrl, gcsUri: gcsUriFor(objectName), objectName, contentType },
      { headers: noStore },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
