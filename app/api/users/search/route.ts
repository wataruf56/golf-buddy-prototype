import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import { getCohort, COHORT_RANGES } from '@/lib/ageGate';

// ログイン中ユーザー向けのユーザー検索。ラウンド招待で「登録している全ユーザー」
// から性別・年齢などで絞り込むのに使う。年代(コホート)はラウンドの分離単位なので
// 自分と同じ年代のユーザーだけを返す。返すのは公開プロフィール項目のみ。
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  const url = new URL(req.url);
  const gender = url.searchParams.get('gender') || '';     // 'male' | 'female' | ''
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const minAge = parseInt(url.searchParams.get('minAge') || '', 10);
  const maxAge = parseInt(url.searchParams.get('maxAge') || '', 10);

  try {
    const meDoc = await db.collection('users').doc(meId).get();
    const myCohort = getCohort(meDoc.exists ? meDoc.data().age : 0);
    if (!myCohort) return NextResponse.json({ items: [], note: '年齢が未設定のため検索できません' }, { headers: noStore });
    const range = COHORT_RANGES[myCohort];
    const lo = Number.isFinite(minAge) ? Math.max(range.min, minAge) : range.min;
    const hi = Number.isFinite(maxAge) ? Math.min(range.max, maxAge) : range.max;

    // 赤バン（アカウント停止）ユーザーは招待候補・検索に一切出さない。
    const { getBannedIdSet } = await import('@/lib/banAccess');
    const bset = await getBannedIdSet();
    const snap = await db.collection('users').limit(2000).get();
    const items = snap.docs
      .map((d: any) => ({ id: d.id, ...d.data() }))
      .filter((u: any) => u.id !== meId)
      .filter((u: any) => typeof u.age === 'number' && u.age >= lo && u.age <= hi)
      .filter((u: any) => (gender ? u.gender === gender : true))
      .filter((u: any) => (q ? String(u.displayName || '').toLowerCase().includes(q) : true))
      .filter((u: any) => !u.banned && !bset.has(u.id))
      .map((u: any) => ({
        id: u.id,
        displayName: u.displayName || '',
        avatar: u.avatar || '⛳',
        avatarUrl: u.avatarUrl || '',
        age: u.age,
        gender: u.gender || '',
        area: u.area || '',
        scoreRange: u.scoreRange || '',
        car: u.car || '',
        reviewAvg: u.reviewAvg || 0,
        reviewCount: u.reviewCount || 0,
      }))
      .sort((a: any, b: any) => (b.reviewCount || 0) - (a.reviewCount || 0))
      .slice(0, 80);

    return NextResponse.json({ count: items.length, items }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
