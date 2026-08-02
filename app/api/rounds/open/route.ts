import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/rounds/open  ★公開（認証不要）★
// 現在募集中（open）のラウンド投稿の「公開してよい最小情報」だけを返す。Instagram の
// link-in-bio（/links/rounds）で未ログインの人にも一覧を見せるための専用エンドポイント。
// ※ 生の round（applicantIds / viewedBy / groupPrefs 等）は返さない。
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const MAX = 100;

export async function GET(_req: NextRequest) {
  try {
    // 開催中 ＋ 公式ラウンドをマージ（重複排除）。
    const [open, official] = await Promise.all([
      db.listRounds({ status: 'open' }),
      db.listOfficialRounds().catch(() => []),
    ]);
    const seen = new Set<string>();
    let rounds = [...open, ...official].filter((r) => {
      if (!r || seen.has(r.id)) return false;
      seen.add(r.id);
      return r.status === 'open';
    });

    // テストアカウント／赤バンの主催者は除外（一般公開なので実データのみ）。
    try {
      const { getTestAccountConfig } = await import('@/lib/testAccounts');
      const tcfg = await getTestAccountConfig();
      const tset = new Set(tcfg.accounts.map((a: any) => a.id));
      const isTestId = (id: string) => !!id && (id.startsWith('test_') || tset.has(id));
      rounds = rounds.filter((r) => !isTestId(r.hostId));
    } catch { /* 判定不能時はそのまま */ }
    try {
      const { getBannedIdSet } = await import('@/lib/banAccess');
      const bset = await getBannedIdSet();
      if (bset.size) rounds = rounds.filter((r) => !bset.has(r.hostId));
    } catch { /* noop */ }

    // 開催日の昇順（日程未定は末尾）。
    rounds.sort((a, b) => {
      const am = a.date ? new Date(a.date).getTime() : Infinity;
      const bm = b.date ? new Date(b.date).getTime() : Infinity;
      return am - bm;
    });
    rounds = rounds.slice(0, MAX);

    // 主催者の公開プロフィール（表示名・アバター）をまとめて取得。
    const hostIds = Array.from(new Set(rounds.map((r) => r.hostId).filter(Boolean)));
    const hosts = await db.listUsers(hostIds);
    const hostById = new Map(hosts.map((u) => [u.id, u]));

    const items = rounds.map((r) => {
      const h = hostById.get(r.hostId);
      return {
        id: r.id,
        title: r.title,
        eventType: r.eventType || 'golf',
        dateType: r.dateType,
        date: r.date || '',
        dateRange: r.dateRange || '',
        startTime: r.startTime || '',
        area: r.area || '',
        courseName: r.courseName || '',
        venue: r.venue || '',
        maxSpots: r.maxSpots,
        currentCount: r.currentCount,
        isOfficial: !!r.isOfficial,
        host: r.isOfficial ? null : (h ? {
          displayName: h.displayName || 'ゴルファー',
          avatar: h.avatar, avatarUrl: h.avatarUrl, avatarMode: (h as any).avatarMode,
          golmotiType: (h as any).golmotiType, color: h.color,
        } : null),
      };
    });

    return NextResponse.json({ rounds: items }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ rounds: [], error: (e as Error).message }, { headers: noStore });
  }
}
