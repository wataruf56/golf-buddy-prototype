import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await db.getUser(params.id);
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const reviews = await db.listReviewsForUser(params.id);
  return NextResponse.json({ user, reviews });
}
