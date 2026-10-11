'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getMe, useStore } from '@/lib/store';
import { formatDate } from '@/lib/utils';

// 「参加予定ラウンド」= 自分が主催 or 参加/申請中で、まだ完了していないラウンド
// （募集中open＋締切closed の両方。参加後に締め切られても残る）。開催日の昇順
// （日程未定は末尾）。リッチメニュー「参加予定」から直接開く一覧ページ。
export default function UpcomingRoundsPage() {
  const router = useRouter();
  const me = useStore(getMe);
  const meId = useStore((s) => s.meId);
  // 参加予定＝主催 or 参加確定（申請中・見送りは下の「申請の状況」に分けて出す。2026-10-11）
  const myRounds = useStore((s) =>
    s.rounds.filter((r) => r.hostId === s.meId || r.applicantIds.includes(s.meId))
  );
  const allRounds = useStore((s) => s.rounds);
  const pendingRounds = allRounds.filter((r) => (r.pendingApplicantIds || []).includes(meId) && r.status !== 'completed');
  const DECLINE_SHOW_MS = 30 * 24 * 60 * 60 * 1000;   // 見送りは30日だけ出す
  const declinedRounds = allRounds
    .map((r) => ({ r, e: ((r as any).rejectedApplicants || []).find((x: any) => x?.userId === meId) as { at: number } | undefined }))
    .filter((x) => x.e && Date.now() - x.e.at < DECLINE_SHOW_MS && !(x.r.pendingApplicantIds || []).includes(meId) && !x.r.applicantIds.includes(meId))
    .sort((a, b) => (b.e!.at - a.e!.at));
  // 運営が代理で立てた枠は日付がまだない。日程未定として末尾に落とすと
  // 「決めること」に戻れなくなるので、調整中のものだけ先頭に上げる。
  const stageOf = (r: { official?: { stage?: string } }) => r.official?.stage;
  const upcomingRounds = myRounds
    .filter((r) => r.status !== 'completed')
    .slice()
    .sort((a, b) => {
      const rank = (r: typeof a) => (stageOf(r) === 'deciding' ? 0 : stageOf(r) === 'recruiting' ? 1 : 2);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      const am = a.date ? new Date(a.date).getTime() : Infinity;
      const bm = b.date ? new Date(b.date).getTime() : Infinity;
      return am - bm;
    });

  return (
    <>
      <div className="px-5 pt-2 pb-3 flex items-center justify-between">
        <div className="text-2xl font-black tracking-tight">📅 参加予定のラウンド</div>
      </div>

      <div className="px-5">
        {/* 申請の状況（申請中／見送り）。参加予定とは分けて上に出す（2026-10-11） */}
        {(pendingRounds.length > 0 || declinedRounds.length > 0) && (
          <div className="mb-4">
            <div className="text-[13px] font-black mb-1.5">📨 申請の状況</div>
            <div className="flex flex-col gap-1.5">
              {pendingRounds.map((r) => (
                <Link href={`/round/${r.id}`} key={`p_${r.id}`} className="flex justify-between items-center p-3.5 rounded-card shadow-card bg-card border-[1.5px] border-[#E6D3A0]">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold truncate">{r.title}</div>
                    <div className="text-[11px] text-muted mt-0.5">{formatDate(r.date) || r.dateRange || '日程未定'} ・ 主催者の承認を待っています</div>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full ml-2 flex-shrink-0" style={{ background: '#FFF1C9', color: '#8A5A00', border: '1px solid #C9A24A' }}>⏳ 申請中です</span>
                </Link>
              ))}
              {declinedRounds.map(({ r, e }) => (
                <Link href={`/round/${r.id}`} key={`d_${r.id}`} className="flex justify-between items-center p-3.5 rounded-card shadow-card bg-bg border-[1.5px] border-border opacity-80">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold truncate text-sub">{r.title}</div>
                    <div className="text-[11px] text-muted mt-0.5">{formatDate(r.date) || r.dateRange || '日程未定'} ・ {new Date(e!.at).getMonth() + 1}/{new Date(e!.at).getDate()} に見送り</div>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full ml-2 flex-shrink-0 bg-card text-sub border border-border">今回は見送り</span>
                </Link>
              ))}
            </div>
            {declinedRounds.length > 0 && (
              <div className="text-[10.5px] text-muted mt-1.5 leading-relaxed">「今回は見送り」は、主催者がこの募集では参加をお断りしたものです（人数や男女のバランスなどの都合が多いです）。ほかの募集にはそのまま申し込めます。</div>
            )}
          </div>
        )}

        <div className="text-[13px] font-black mb-1.5">✅ 参加予定</div>
        {upcomingRounds.length === 0 ? (
          <div className="bg-card rounded-card shadow-card p-8 text-center">
            <div className="text-3xl mb-2">⛳</div>
            <div className="text-sm font-bold mb-1">参加予定のラウンドはありません</div>
            <div className="text-xs text-muted mb-4">気になるラウンドを探して参加してみましょう。</div>
            <div className="flex gap-2 justify-center">
              <Link href="/search" className="px-4 py-2 bg-green text-white rounded-full text-xs font-bold">🔍 さがす</Link>
              <Link href="/create" className="px-4 py-2 bg-bg border-[1.5px] border-border rounded-full text-xs font-bold">✏️ 募集する</Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {upcomingRounds.map((r) => {
              const stage = stageOf(r);
              const role = stage === 'deciding'
                ? '日程・コースを決めています'
                : stage === 'recruiting'
                  ? '仲間を待っています'
                  : r.hostId === me.id
                    ? '主催'
                    : r.applicantIds.includes(me.id) ? '参加確定'
                    : '参加';
              const href = stage === 'deciding' ? `/round/${r.id}/decide` : `/round/${r.id}`;
              return (
                <Link href={href} key={r.id} className={'flex justify-between items-center p-3.5 rounded-card shadow-card ' + (stage === 'deciding' ? 'bg-orange-light border-2 border-orange' : 'bg-card')}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold truncate">{r.title}</div>
                    <div className="text-[11px] text-muted mt-0.5">
                      {stage ? role : `${formatDate(r.date) || r.dateRange || '日程未定'} ・ ${role}`}
                    </div>
                  </div>
                  {stage === 'deciding' ? (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full ml-2 flex-shrink-0 bg-orange text-white">📝 決めること</span>
                  ) : (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${r.status === 'open' ? 'bg-green-light text-green' : r.status === 'completed' ? 'bg-blue-light text-blue' : 'bg-bg text-sub'}`}>
                      {r.status === 'open' ? '募集中' : r.status === 'completed' ? '完了' : '締切'}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        <button onClick={() => router.push('/home')} className="w-full mt-4 px-5 py-2.5 bg-bg border-[1.5px] border-border rounded-xl text-sm font-bold">
          ホームに戻る
        </button>
      </div>
      <div className="h-5" />
    </>
  );
}
