import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { generateUploadUrl, buildObjectName, gcsUriFor } from '@/lib/swingGcs';
import type { SwingUploadRole } from '@/types/swing';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// POST /api/swing/upload-url
// Body: { swingId: string, role: 'video' | 'pro' | 'prev' }
// Returns: { uploadUrl, gcsUri, objectName }
export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }

  const swingId = String(body?.swingId || '').trim();
  const role: SwingUploadRole = (body?.role as SwingUploadRole) || 'video';
  if (!swingId) return NextResponse.json({ error: 'swingId required' }, { status: 400, headers: noStore });
  if (!/^[a-zA-Z0-9_-]{6,40}$/.test(swingId)) {
    return NextResponse.json({ error: 'invalid swingId format' }, { status: 400, headers: noStore });
  }

  const suffix = role === 'video' ? '' : role; // e.g. liff/{u}/{id}-pro.mp4
  const objectName = buildObjectName(meId, swingId, suffix);

  try {
    const uploadUrl = await generateUploadUrl(objectName);
    return NextResponse.json(
      { uploadUrl, gcsUri: gcsUriFor(objectName), objectName },
      { headers: noStore },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
