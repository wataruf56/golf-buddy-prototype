'use client';

import { useEffect, useState } from 'react';
import { rememberLpOrigin } from '@/lib/lpOrigin';

// /links（インスタのlink-in-bio）のCTA。表示（open）とクリック（line）を /api/lp/hit に
// 計測する。beaconなのでナビゲーションを妨げない。
// インスタのプロフィールにはLINEのURLを直接貼れない（ドメインブロック）ため、
// 友だち追加ボタンはこのページ経由で提供する（2026-08-10）。
// 2026-10-13：LINE友だち追加を一番上に。「いま募集中のラウンド」には件数と直近の2件を出す（/api/rounds/open・公開の最小情報）。
const INK = '#1E3A30';
const LINE_GREEN = '#06C755';
// LINE公式アカウント「ゴルトモ」の友だち追加URL（ベーシックID @711xiyrs）。
const LINE_ADD_URL = 'https://line.me/R/ti/p/@711xiyrs';

// 匿名の訪問者ID（localStorage永続）。同じ人が何度開いても「1人」と数えるためのユニーク計測用。
function visitorId(): string {
  try {
    let v = localStorage.getItem('gb_links_vid');
    if (!v) {
      v = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('gb_links_vid', v);
    }
    return v;
  } catch { return ''; }
}

// 流入経路タグ（?ref=）を localStorage に記録する。/links は app.goltomo.com＝アプリ本体と
// 同一オリジンなので、ここで書いておけば、後日リッチメニュー等からアプリを開いたときに
// /liff がこれを読み、新規登録時の acquisitionSource として保存できる。
// （LINEの友だち追加URLにはパラメータを載せられないため、この方法でしか経路を運べない）
function rememberRef() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const raw = sp.get('ref') || sp.get('utm_source') || sp.get('source') || 'ig_bio';
    const ref = String(raw).trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 40) || 'ig_bio';
    if (!localStorage.getItem('gb_ref')) {
      localStorage.setItem('gb_ref', ref);
      localStorage.setItem('gb_ref_at', String(Date.now()));
    }
    if (document.referrer && !localStorage.getItem('gb_referrer')) {
      localStorage.setItem('gb_referrer', document.referrer.slice(0, 200));
    }
  } catch { /* noop */ }
}

function hit(t: 'open' | 'line' | 'rounds') {
  try {
    const body = JSON.stringify({ t, v: visitorId() });
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      navigator.sendBeacon('/api/lp/hit', new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch('/api/lp/hit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* noop */ }
}

type Mini = { id: string; title: string; date?: string; isOfficial?: boolean; isCompetition?: boolean; maxSpots: number; currentCount: number; eventType?: string };
const WD = '日月火水木金土';
const md = (d?: string) => { if (!d) return '日程調整中'; const t = new Date(d + 'T00:00:00+09:00'); return isNaN(t.getTime()) ? d : `${t.getMonth() + 1}/${t.getDate()}（${WD[t.getDay()]}）`; };

export function HubLinks() {
  const [rounds, setRounds] = useState<Mini[] | null>(null);
  useEffect(() => {
    rememberRef();
    // LINEの友だち追加URLにはパラメータを載せられないため、「リンクハブから来た」
    // ことを同一オリジンの localStorage に残す。あとで /liff が読んで、
    // 「LINEアプリに移った」から先の段につなげる。
    rememberLpOrigin('links');
    hit('open');
    fetch('/api/rounds/open', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
      .then((d) => setRounds(Array.isArray(d?.rounds) ? d.rounds : [])).catch(() => setRounds([]));
  }, []);
  const golf = (rounds || []).filter((r) => r.eventType !== 'drink');
  const open = golf.filter((r) => (r.maxSpots || 0) - (r.currentCount || 0) > 0);
  return (
    <div className="w-full mt-7 flex flex-col gap-4">
      <a
        href={LINE_ADD_URL}
        onClick={() => hit('line')}
        data-lp="cta_line_hub" data-lp-goal="1"
        className="block rounded-[24px] p-5 active:translate-y-[2px] transition-transform"
        style={{ background: LINE_GREEN, border: '2.5px solid ' + INK, boxShadow: '5px 6px 0 ' + INK }}
      >
        <div className="flex items-center gap-4">
          <div className="text-[40px] leading-none">💬</div>
          <div className="min-w-0 flex-1">
            <div className="text-[21px] font-black" style={{ color: '#FFFFFF' }}>LINEで友だち追加</div>
            <div className="text-[12.5px] font-bold mt-0.5" style={{ color: '#E8FBEF' }}>無料・登録もラウンド参加もLINEで完結</div>
          </div>
          <div className="text-[22px] font-black" style={{ color: '#FFFFFF' }}>›</div>
        </div>
      </a>

      {/* 友だち追加をためらう人の受け皿。中身を見てから決めてもらう（一覧も詳細もログインなしで読める） */}
      <a
        href="/links/rounds"
        onClick={() => hit('rounds')}
        data-lp="rounds_hub"
        className="block rounded-[24px] p-5 bg-white active:translate-y-[2px] transition-transform"
        style={{ border: '2.5px solid ' + INK, boxShadow: '5px 6px 0 ' + INK }}
      >
        <div className="flex items-center gap-4">
          <div className="text-[40px] leading-none">⛳</div>
          <div className="min-w-0 flex-1">
            <div className="text-[19px] font-black flex items-center gap-2 flex-wrap" style={{ color: INK }}>
              いま募集中のラウンド
              {open.length > 0 && <span className="text-[12px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: '#E8643C' }}>{open.length}件</span>}
            </div>
            <div className="text-[12.5px] font-bold mt-0.5" style={{ color: '#5A7A6D' }}>登録しなくても中身を見られます</div>
          </div>
          <div className="text-[22px] font-black" style={{ color: INK }}>›</div>
        </div>
        {open.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            {open.slice(0, 2).map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#F2F7F4' }}>
                <span className="text-[12px] font-black flex-none" style={{ color: '#3478F6' }}>{md(r.date)}</span>
                <span className="text-[12.5px] font-bold truncate flex-1" style={{ color: INK }}>{r.isOfficial ? '✓ ' : ''}{r.title}</span>
                <span className="text-[11px] font-black flex-none" style={{ color: '#2A8C82' }}>残り{Math.max(0, r.maxSpots - r.currentCount)}枠</span>
              </div>
            ))}
          </div>
        )}
      </a>
    </div>
  );
}
