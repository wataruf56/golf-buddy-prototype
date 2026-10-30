'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import { Portal } from '@/components/Portal';
import { toast } from '@/components/Toast';

// インスタ風のテスト版（2026-10-31・運営だけ・lib/snsTest）で使う部品。既存の画面からは使わない。
export type SnsUser = { id: string; name: string; avatar: string; avatarUrl?: string; avatarMode?: string; color: string; golmotiType?: string; gender?: string; age?: number; area?: string; car?: string };
export type Story =
  | { kind: 'avail'; user: SnsUser; dates: { date: string; label: string; count: number }[] }
  | { kind: 'recent'; user: SnsUser; roundId: string; place: string; when: string; photos: string[]; with: SnsUser[] };

export const testOnly = (what = 'テスト版のため保存されません') => toast(what);

/** 輪っか付きのアイコン。ring: 'orange'=行ける日 / 'green'=最近ラウンド / なし */
export function RingAvatar({ user, size = 58, ring }: { user: SnsUser | undefined; size?: number; ring?: 'orange' | 'green' | null }) {
  const color = ring === 'orange' ? '#E8643C' : ring === 'green' ? '#2A8C82' : 'transparent';
  return (
    <span className="inline-flex rounded-full p-[2px] flex-shrink-0" style={{ border: `2.5px solid ${color}` }}>
      <span className="inline-flex rounded-full bg-card p-[1.5px]"><Avatar user={user as any} size={size - 9} /></span>
    </span>
  );
}

export function SnsTestBadge() {
  return <span className="ml-1.5 px-2 py-0.5 rounded-full bg-[#FFF6D9] border border-[#E9CF7A] text-[10px] font-black text-[#7A5B00] align-middle">テスト版・あなただけ</span>;
}

/** ストーリーを全画面で見る。左右タップで前後、5秒で次へ。写真がある「最近のラウンド」は写真ごとに進む */
export function StoryViewer({ stories, start, onClose }: { stories: Story[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const [seg, setSeg] = useState(0);
  const [t, setT] = useState(0);
  const s = stories[i];
  const segs = s?.kind === 'recent' ? Math.max(1, s.photos.length) : 1;
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const next = () => { if (seg + 1 < segs) { setSeg(seg + 1); setT(0); } else if (i + 1 < stories.length) { setI(i + 1); setSeg(0); setT(0); } else onClose(); };
  const prev = () => { if (seg > 0) { setSeg(seg - 1); setT(0); } else if (i > 0) { setI(i - 1); setSeg(0); setT(0); } else setT(0); };
  useEffect(() => {
    timer.current = setInterval(() => setT((x) => x + 50), 50);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);
  useEffect(() => { if (t >= 5000) next(); }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const prevOv = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prevOv; }; }, []);
  if (!s) return null;
  const bg = s.kind === 'avail' ? '#1F4A40' : '#24452A';
  return (
    <Portal>
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black">
        <div className="relative w-full max-w-[480px] h-full flex flex-col" style={{ background: bg }}>
          <div className="flex gap-1 px-3 pt-3">
            {Array.from({ length: segs }).map((_, k) => (
              <div key={k} className="h-[3px] flex-1 rounded-full bg-white/30 overflow-hidden">
                <div className="h-full bg-white" style={{ width: k < seg ? '100%' : k === seg ? `${Math.min(100, t / 50)}%` : '0%' }} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 relative z-10">
            <Link href={`/sns/u/${s.user.id}`} className="flex items-center gap-2 min-w-0">
              <Avatar user={s.user as any} size={32} />
              <span className="text-white text-[13px] font-black truncate">{s.user.name}</span>
            </Link>
            <span className="text-white/70 text-[11px] font-bold">{s.kind === 'avail' ? '行ける日' : `${s.when} のラウンド`}</span>
            <button type="button" onClick={onClose} aria-label="閉じる" className="ml-auto w-9 h-9 text-white text-[22px] leading-none">×</button>
          </div>

          <div className="flex-1 relative">
            {/* 左右タップ */}
            <button type="button" aria-label="前へ" onClick={prev} className="absolute left-0 top-0 bottom-0 w-1/3 z-[1]" />
            <button type="button" aria-label="次へ" onClick={next} className="absolute right-0 top-0 bottom-0 w-2/3 z-[1]" />
            {s.kind === 'avail' ? (
              <div className="h-full flex flex-col items-center justify-center px-6 text-center text-white">
                <div className="text-[40px]">📅</div>
                <div className="text-[13px] font-bold text-white/80 mt-1">{s.user.name}さんが行ける日</div>
                <div className="mt-4 w-full max-w-[300px] space-y-2">
                  {s.dates.map((d) => (
                    <div key={d.date} className="flex items-center justify-between bg-white/12 rounded-xl px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.12)' }}>
                      <span className="text-[20px] font-black">{d.label}</span>
                      <span className="text-[11px] font-bold text-white/80">この日 {d.count}人</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 mt-4 flex-wrap justify-center">
                  {s.user.area && <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: 'rgba(255,255,255,0.15)' }}>{s.user.area}</span>}
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: 'rgba(255,255,255,0.15)' }}>{s.user.car === 'have' ? '車あり' : '車なし'}</span>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col justify-center">
                {s.photos.length ? (
                  <img src={s.photos[Math.min(seg, s.photos.length - 1)]} alt="" className="w-full max-h-[62vh] object-contain" />
                ) : (
                  <div className="mx-6 rounded-2xl py-14 text-center text-white" style={{ background: 'rgba(255,255,255,0.10)' }}>
                    <div className="text-[44px]">⛳</div>
                    <div className="text-[16px] font-black mt-2">{s.place}</div>
                    <div className="text-[12px] font-bold text-white/80 mt-1">{s.when}</div>
                  </div>
                )}
                <div className="px-5 mt-3 text-white">
                  <div className="text-[13px] font-black">{s.place}</div>
                  {s.with.length > 0 && <div className="text-[11.5px] font-bold text-white/80 mt-0.5">一緒に回った：{s.with.slice(0, 5).map((u) => `@${u.name}`).join(' ')}{s.with.length > 5 ? ` ほか${s.with.length - 5}人` : ''}</div>}
                </div>
              </div>
            )}
          </div>

          <div className="px-4 pb-6 pt-2 relative z-10">
            {s.kind === 'avail' ? (
              <>
                <Link href="/availability" className="block w-full py-3 rounded-full bg-orange text-white text-center text-[14px] font-black">私も行ける（行ける日を開く）</Link>
                <div className="text-center text-[10.5px] text-white/60 mt-1.5">左右をタップで前後の人へ</div>
              </>
            ) : (
              <>
                <div className="flex justify-center gap-2 mb-2">
                  {['⛳ ナイスショット', '🙌 また回ろう', '👏'].map((r) => (
                    <button key={r} type="button" onClick={() => testOnly('テスト版のため送られません')} className="px-3 py-1.5 rounded-full text-white text-[12px] font-bold" style={{ background: 'rgba(255,255,255,0.18)' }}>{r}</button>
                  ))}
                </div>
                <button type="button" onClick={() => testOnly('相互フォローの人にはここからDMを送れる想定です（テスト版では送りません）')} className="w-full text-left px-4 py-2.5 rounded-full border border-white/50 text-white/70 text-[12.5px]">メッセージを送る（相互フォローのみ）</button>
              </>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
