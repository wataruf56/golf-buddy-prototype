'use client';

import { Avatar } from '@/components/Avatar';

// 募集のイチオシのポップアップの「見た目」だけ（2026-10-12）。
// 会員に出す本物（components/RoundPromoPopup）と、管理画面のプレビュー（/admin/promo）で同じものを使う＝見た目がずれない。
// 文言はすべて管理画面から変えられる（空なら既定の文言）。
export type PromoTexts = {
  badge?: string;      // リボン上の小さい文字
  headline?: string;   // いちばん大きい文字
  message?: string;    // 見出しの下のひとこと（任意）
  ctaLabel?: string;   // オレンジのボタン
  closeLabel?: string; // 下の小さいボタン
  sideNote?: string;   // 主催者の横の小さい文字
};
export const PROMO_DEFAULTS: Required<PromoTexts> = {
  badge: '✨ 運営のイチオシ ✨',
  headline: 'この日の募集があります！',
  message: '',
  ctaLabel: '🏌️ ぜひ参加してみませんか？ →',
  closeLabel: '今回は見送る',
  sideNote: 'ひとりでも参加OK',
};
export type PromoRoundView = {
  title: string; date: string; startTime?: string; area?: string; courseName?: string; price?: string;
  levelCondition?: string; maxSpots: number; joined: number; host?: any | null;
};

export function RoundPromoCard({ r, texts, onGo, onClose }: { r: PromoRoundView; texts?: PromoTexts; onGo?: () => void; onClose?: () => void }) {
  const t = { ...PROMO_DEFAULTS, ...Object.fromEntries(Object.entries(texts || {}).filter(([, v]) => typeof v === 'string' && v.trim() !== '')) } as Required<PromoTexts>;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r.date || '');
  const dt = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  const md = m ? `${Number(m[2])}/${Number(m[3])}` : '';
  const wd = dt ? '日月火水木金土'[dt.getUTCDay()] : '';
  const rest = r.maxSpots ? Math.max(0, r.maxSpots - r.joined) : 0;
  return (
    <div className="relative w-full max-w-[350px] pt-[60px]">
      {/* 白クマがのぞく */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/bear-hook.png" alt="" className="absolute left-1/2 -translate-x-1/2 top-0 w-[128px] z-10 pointer-events-none select-none" />
      <div className="relative bg-card rounded-[22px] border-[3px] border-border shadow-[5px_5px_0_#1E3A30] overflow-hidden text-text">
        {/* リボン */}
        <div className="bg-orange text-white text-center pt-[52px] pb-3 px-4 border-b-[3px] border-border">
          <div className="text-[11px] font-black tracking-wider opacity-90">{t.badge}</div>
          <div className="text-[19px] font-black leading-tight mt-0.5 whitespace-pre-wrap">{t.headline}</div>
          {t.message && <div className="text-[12px] font-bold leading-snug mt-1.5 opacity-95 whitespace-pre-wrap">{t.message}</div>}
        </div>

        <div className="px-4 pt-4 pb-4">
          <div className="flex items-stretch gap-3">
            {/* 日付ブロック */}
            <div className="flex-none w-[74px] rounded-2xl bg-green text-white border-[2.5px] border-border shadow-[2px_2px_0_#1E3A30] flex flex-col items-center justify-center py-2">
              <div className="text-[24px] font-black leading-none font-num">{md || '未定'}</div>
              {wd && <div className="text-[12px] font-black mt-1">{wd}曜</div>}
              {r.startTime && <div className="text-[10px] font-bold opacity-90 mt-0.5">{r.startTime}〜</div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-black leading-snug">{r.title}</div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {r.area && <Chip>📍 {r.area}</Chip>}
                {r.price && <Chip>💰 {r.price}</Chip>}
                {r.levelCondition && <Chip>🔰 {r.levelCondition}</Chip>}
                {r.courseName && <Chip>⛳ {r.courseName}</Chip>}
              </div>
            </div>
          </div>

          {/* 空き */}
          {r.maxSpots > 0 && (
            <div className="mt-3.5 rounded-xl bg-orange-light border-2 border-orange px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-black text-orange">{rest > 0 ? `あと${rest}人 参加できます！` : '満員間近！'}</div>
                <div className="text-[11px] font-bold text-sub">{r.joined}/{r.maxSpots}人</div>
              </div>
              <div className="flex gap-1 mt-1.5">
                {Array.from({ length: r.maxSpots }).map((_, i) => (
                  <span key={i} className={'flex-1 h-2.5 rounded-full border-[1.5px] border-border ' + (i < r.joined ? 'bg-green' : 'bg-white')} />
                ))}
              </div>
            </div>
          )}

          {r.host && (
            <div className="mt-3 flex items-center gap-2 text-[12px] text-sub font-bold">
              <Avatar user={r.host} size={26} emojiSize={14} />
              <span className="truncate">主催：<b className="text-text">{r.host.displayName}</b>さん</span>
              {t.sideNote && <span className="ml-auto text-[10.5px] text-muted flex-none">{t.sideNote}</span>}
            </div>
          )}

          <button type="button" onClick={onGo}
            className="mt-4 w-full py-3.5 bg-orange text-white rounded-2xl text-[16px] font-black border-[2.5px] border-border shadow-[3px_3px_0_#1E3A30] active:translate-y-[2px] active:shadow-none">
            {t.ctaLabel}
          </button>
          <button type="button" onClick={onClose} className="block w-full mt-2 py-1.5 text-[12px] text-sub font-bold">{t.closeLabel}</button>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center text-[10.5px] font-bold bg-bg border border-border rounded-full px-2 py-0.5 max-w-full truncate">{children}</span>;
}
