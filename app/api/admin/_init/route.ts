import { NextResponse } from 'next/server';

// Returns the admin log token so the admin UI can populate it transparently
// without a manual prompt. The token still gates /api/admin/* server-side;
// this endpoint is intentionally open because the host (admin.goltomo.com)
// is restricted and the user accepted "no password for now".
export const dynamic = 'force-dynamic';

export async function GET() {
  const token = process.env.ADMIN_LOG_TOKEN || '';
  return NextResponse.json({ token });
}
