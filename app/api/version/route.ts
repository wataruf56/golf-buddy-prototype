import { NextResponse } from 'next/server';

// Returns the build id of the CURRENTLY DEPLOYED server (the live Cloud Run
// revision). Always no-store so it reflects the latest deploy instantly, never
// a cached value. The client compares this against its own baked-in
// NEXT_PUBLIC_BUILD_ID; if they differ, a newer version has been deployed and
// the in-app update banner is shown.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { version: process.env.NEXT_PUBLIC_BUILD_ID || 'dev' },
    { headers: { 'Cache-Control': 'no-store, must-revalidate' } },
  );
}
