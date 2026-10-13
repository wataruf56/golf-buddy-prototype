'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import { LP_TRACK_SCRIPT } from '@/lib/lpTrackScript';

// Instagram 経由（/links）から来た未ログインの人向けの、公開ラウンド募集一覧。
// /api/rounds/open（公開・最小情報）を取得して並べ、各カードから /round/[id]（公開閲覧可）へ。
// 2026-10-13：アプリの募集カードと同じ見た目に（✓ゴルトモ公式・🏆コンペのバッジ、参加費、人数のバー）。
// 下に「LINEで友だち追加して参加」を固定で出す。満員は下にまとめて薄く。
type OpenRound = {
  id: string; title: string; eventType: 'golf' | 'drink';
  dateType?: string; date?: string; dateRange?: string; startTime?: string;
  area?: string; courseName?: string; venue?: string;
  maxSpots: number; currentCount: number; isOfficial: boolean; isCompetition?: boolean; price?: string; beginnerOnly?: boolean;
  host: { displayName: string; avatarUrl?: string; avatar?: string; color?: string } | null;
};

const CREAM = '#FBF7EC';
const INK = '#1E3A30';
const SUB = '#5A7A6D';
const CORAL = '#E8643C';
const GREEN = '#2A8C82';
const LINE_GREEN = '#06C755';
const LINE_ADD_URL = 'https://line.me/R/ti/p/@711xiyrs';

function priceLabel(p?: string) {
  const t = String(p || '').trim();
  if (!t) return '';
  return /^\d+$/.test(t) ? `${Number(t).toLocaleString('ja-JP')}円` : t;
}

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

  const left = (r: OpenRound) => Math.max(0, (r.maxSpots || 0) - (r.currentCount || 0));
  const list = rounds ? [...rounds.filter((r) => r.eventType === 'drink' || left(r) > 0), ...rounds.filter((r) => r.eventType !== 'drink' && left(r) === 0)] : null;

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: `radial-gradient(#D3E4DA 1.5px, transparent 1.6px) 0 0 / 22px 22px, #E7F2EC`,
        fontFamily: "'Zen Maru Gothic','Noto Sans JP',sans-serif",
      }}
      className="px-5 pt-6 pb-32"
    >
      <div className="w-full max-w-[480px] mx-auto">
        {/* LP計測。ここはトップLPのB案から送られてくる着地点なので、
            そこからLINE登録まで進んだかを追えるようにしておく。 */}
        <script dangerouslySetInnerHTML={{ __html: `window.__lpPage="rounds";try{if(!localStorage.getItem('gb_from_lp')){localStorage.setItem('gb_from_lp','rounds');localStorage.setItem('gb_from_lp_at',String(Date.now()))}}catch(e){}` + LP_TRACK_SCRIPT }} />
        <Link href="/links" className="text-[13px] font-bold" style={{ color: SUB }}>‹ もどる</Link>
        <div className="mt-2 flex items-center gap-2">
          <h1 className="font-black tracking-tight" style={{ color: INK, fontSize: '28px' }}>⛳ 募集中のラウンド</h1>
        </div>
        <p className="text-[13px] font-bold mt-1 mb-5 leading-relaxed" style={{ color: SUB }}>
          20〜30代限定。タップすると詳しく見られます。<br />参加はLINEで友だち追加してから、かんたんに。
        </p>

        {list == null ? (
          <div className="text-center py-16 text-sm font-bold" style={{ color: '#8AA79A' }}>読み込み中...</div>
        ) : list.length === 0 ? (
          <div className="rounded-[22px] p-8 text-center" style={{ background: CREAM, border: `2.5px solid ${INK}`, boxShadow: `4px 4px 0 ${INK}` }}>
            <div className="text-3xl mb-2">⛳</div>
            <div className="text-sm font-black" style={{ color: INK }}>いま募集中のラウンドはありません</div>
            <div className="text-[12px] font-bold mt-1" style={{ color: SUB }}>LINEで友だち追加しておくと、新しい募集が届きます</div>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {list.map((r) => {
              const isDrink = r.eventType === 'drink';
              const full = !isDrink && left(r) === 0;
              const dateLabel = r.dateType === 'range' ? (r.dateRange || '日程調整中') : (formatDate(r.date) || '日程未定');
              const place = isDrink ? (r.venue || r.area || '場所未定') : r.courseName ? `${r.courseName}${r.area ? `（${r.area}）` : ''}` : (r.area ? `${r.area}（ゴルフ場は調整中）` : 'エリア未定');
              const rate = r.maxSpots ? Math.min(1, (r.currentCount || 0) / r.maxSpots) : 0;
              const price = priceLabel(r.price);
              return (
                <a
                  key={r.id}
                  href={`/round/${r.id}`}
                  data-lp="round_card"
                  className={'block rounded-[22px] p-4 bg-white active:translate-y-[2px] transition-transform ' + (full ? 'opacity-55' : '')}
                  style={{ border: `2.5px solid ${INK}`, boxShadow: `4px 5px 0 ${INK}`, borderLeft: r.isOfficial ? `7px solid ${GREEN}` : `2.5px solid ${INK}` }}
                >
                  {(r.isOfficial || r.isCompetition || isDrink || r.beginnerOnly || full) && (
                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      {r.isOfficial && <span className="text-[10.5px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: GREEN }}>✓ ゴルトモ公式</span>}
                      {r.isCompetition && !isDrink && <span className="text-[10.5px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: CORAL }}>🏆 コンペ</span>}
                      {isDrink && <span className="text-[10.5px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: CORAL }}>🍻 飲み会</span>}
                      {r.beginnerOnly && <span className="text-[10.5px] font-black px-2 py-0.5 rounded-full" style={{ background: '#E7F2EC', color: GREEN, border: `1.5px solid ${GREEN}` }}>🔰 初心者のみ</span>}
                      {full && <span className="text-[10.5px] font-black px-2 py-0.5 rounded-full" style={{ background: '#eee', color: '#888' }}>満員</span>}
                    </div>
                  )}
                  <div className="text-[13px] font-black" style={{ color: INK }}>📅 {dateLabel}{r.startTime ? ` ${r.startTime}` : ''}</div>
                  <div className="text-[12.5px] font-bold mt-0.5 truncate" style={{ color: SUB }}>{isDrink ? '📍' : '⛳'} {place}</div>
                  <div className="text-[16px] font-black mt-1.5 leading-snug" style={{ color: INK }}>{r.title}</div>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    {price && <span className="text-[12px] font-black" style={{ color: CORAL }}>参加費 {price}</span>}
                    {!r.isOfficial && r.host && <span className="text-[11px] font-bold" style={{ color: '#8AA79A' }}>主催：{r.host.displayName}</span>}
                  </div>
                  {!isDrink && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#E7F2EC' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.round(rate * 100)}%`, background: full ? '#bbb' : CORAL }} />
                      </div>
                      <span className="text-[12px] font-black flex-none" style={{ color: full ? '#999' : CORAL }}>{r.currentCount}/{r.maxSpots}人</span>
                      {!full && <span className="text-[11px] font-black px-2 py-0.5 rounded-full flex-none" style={{ background: '#E7F2EC', color: GREEN }}>残り{left(r)}枠</span>}
                    </div>
                  )}
                </a>
              );
            })}
          </div>
        )}

        <div className="mt-8 text-center text-[11px] font-bold" style={{ color: '#8AA79A' }}>© ゴルトモ</div>
      </div>

      {/* 参加したくなったら：LINEで友だち追加（下に固定） */}
      <div className="fixed left-0 right-0 bottom-0 px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-3" style={{ background: 'linear-gradient(to top, #E7F2EC 70%, rgba(231,242,236,0))' }}>
        <a href={LINE_ADD_URL} data-lp="cta_line_rounds" data-lp-goal="1"
          className="block max-w-[480px] mx-auto rounded-[20px] py-3.5 text-center text-white text-[16px] font-black active:translate-y-[2px] transition-transform"
          style={{ background: LINE_GREEN, border: `2.5px solid ${INK}`, boxShadow: `4px 4px 0 ${INK}` }}>
          💬 LINEで友だち追加して参加する
        </a>
      </div>
    </main>
  );
}
