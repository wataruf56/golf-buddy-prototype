'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';

// Instagram 経由（/links）から来た未ログインの人向けの、公開ラウンド募集一覧。
// /api/rounds/open（公開・最小情報）を取得して並べ、各カードから /round/[id]（公開閲覧可）へ。
type OpenRound = {
  id: string; title: string; eventType: 'golf' | 'drink';
  dateType?: string; date?: string; dateRange?: string; startTime?: string;
  area?: string; courseName?: string; venue?: string;
  maxSpots: number; currentCount: number; isOfficial: boolean;
  host: { displayName: string; avatarUrl?: string; avatar?: string; color?: string } | null;
};

const CREAM = '#FBF7EC';
const INK = '#1E3A30';
const CORAL = '#E8643C';

export default function PublicRoundsPage() {
  const [rounds, setRounds] = useState<OpenRound[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/rounds/open', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setRounds(Array.isArray(d?.rounds) ? d.rounds : []); })
      .catch(() => { if (!cancelled) setRounds([]); });
    return () => { cancelled = true; };
  }, []);

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: `radial-gradient(#D3E4DA 1.5px, transparent 1.6px) 0 0 / 22px 22px, #E7F2EC`,
        fontFamily: "'Zen Maru Gothic','Noto Sans JP',sans-serif",
      }}
      className="px-5 py-6"
    >
      <div className="w-full max-w-[480px] mx-auto">
        <Link href="/links" className="text-[13px] font-bold" style={{ color: '#5A7A6D' }}>‹ もどる</Link>
        <h1 className="font-black tracking-tight mt-2 mb-1" style={{ color: INK, fontSize: '30px' }}>⛳ 募集中のラウンド</h1>
        <p className="text-[13px] font-bold mb-5" style={{ color: '#5A7A6D' }}>
          気になるラウンドをタップすると詳細が見られます。参加はLINEログインでかんたん。
        </p>

        {rounds == null ? (
          <div className="text-center py-16 text-sm font-bold" style={{ color: '#8AA79A' }}>読み込み中...</div>
        ) : rounds.length === 0 ? (
          <div className="rounded-[22px] p-8 text-center" style={{ background: CREAM, boxShadow: '5px 6px 0 rgba(30,58,48,0.12)' }}>
            <div className="text-3xl mb-2">⛳</div>
            <div className="text-sm font-black" style={{ color: INK }}>いま募集中のラウンドはありません</div>
            <div className="text-[12px] font-bold mt-1" style={{ color: '#8AA79A' }}>また見に来てください🙏</div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {rounds.map((r) => {
              const isDrink = r.eventType === 'drink';
              const dateLabel = r.dateType === 'range' ? (r.dateRange || '日程調整中') : (formatDate(r.date) || '日程未定');
              const place = isDrink
                ? (r.venue || r.area || '場所未定')
                : (r.courseName || r.area || 'エリア未定');
              const remaining = Math.max(0, r.maxSpots - r.currentCount);
              return (
                <a
                  key={r.id}
                  href={`/round/${r.id}`}
                  className="block rounded-[22px] p-4 active:scale-[0.99] transition-transform"
                  style={{ background: CREAM, boxShadow: '5px 6px 0 rgba(30,58,48,0.15)' }}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-[30px] leading-none mt-0.5">{isDrink ? '🍻' : '⛳'}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {r.isOfficial && (
                          <span className="text-[10px] font-black px-1.5 py-px rounded-full" style={{ background: '#2A8C82', color: CREAM }}>公式</span>
                        )}
                        <span className="text-[15px] font-black truncate" style={{ color: INK }}>{r.title}</span>
                      </div>
                      <div className="text-[12px] font-bold mt-1" style={{ color: '#5A7A6D' }}>
                        📅 {dateLabel}{r.startTime ? ` ${r.startTime}` : ''}
                      </div>
                      <div className="text-[12px] font-bold" style={{ color: '#5A7A6D' }}>📍 {place}</div>
                      <div className="mt-1.5 flex items-center gap-2">
                        {!r.isOfficial && r.host && (
                          <span className="text-[11px] font-bold" style={{ color: '#8AA79A' }}>主催: {r.host.displayName}</span>
                        )}
                        {!isDrink && (
                          <span className="text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: remaining > 0 ? '#E7F2EC' : '#eee', color: remaining > 0 ? '#2A8C82' : '#999' }}>
                            {remaining > 0 ? `残り${remaining}枠` : '満員'}
                          </span>
                        )}
                        {isDrink && (
                          <span className="text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: '#FDE8E1', color: CORAL }}>定員なし</span>
                        )}
                      </div>
                    </div>
                    <div className="text-[20px] self-center" style={{ color: '#8AA79A' }}>›</div>
                  </div>
                </a>
              );
            })}
          </div>
        )}

        <div className="mt-8 text-center text-[11px] font-bold" style={{ color: '#8AA79A' }}>© ゴルトモ</div>
      </div>
    </main>
  );
}
