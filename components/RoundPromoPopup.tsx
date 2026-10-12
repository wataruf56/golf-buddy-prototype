'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { track } from '@/lib/telemetry';
import { usePopupSlot, usePopupBusy, lastPopupClosedAt, POPUP_PRIORITY, popupEvent } from '@/lib/popupSlot';

// イチオシ募集のポップアップ（lib/promoPopup）（2026-10-12）。1人1回だけ。
// ほかのポップアップが出ているあいだは出さない。何か出ていた人には、それが閉じてから1時間後に出す
// （画面に全画面の暗い幕＝ほかのポップアップがあるかを見て、最後に見えた時刻を覚えておく）。
type Promo = {
  promoId: string; roundId: string; headline?: string; title: string; date: string; startTime: string;
  area: string; courseName: string; price: string; levelCondition: string; maxSpots: number; joined: number;
  host: any | null;
};
const LAST_OVERLAY_KEY = 'gb_last_overlay_at';
const WAIT_AFTER_OTHER_MS = 60 * 60 * 1000;

// 自動のポップアップは lib/popupSlot で1つに絞っている。ここでは加えて、ユーザーが自分で開いた
// シート・確認ダイアログなど（枠の外のもの）が画面にあるかも見る（暗い幕が出ているか）。
function otherOverlayOpen(self: HTMLElement | null): boolean {
  const els = Array.from(document.querySelectorAll<HTMLElement>('.fixed.inset-0, .absolute.inset-0, [role="dialog"]'));
  return els.some((el) => (!self || !self.contains(el)) && (/bg-black|bg-text\//.test(el.className || '') || el.getAttribute('role') === 'dialog') && el.offsetParent !== null);
}

export function RoundPromoPopup({ blocked }: { blocked: boolean }) {
  const meId = useStore((s) => s.meId);
  const hydrated = useStore((s) => s.hydrated);
  const pathname = usePathname() || '';
  const router = useRouter();
  const [promo, setPromo] = useState<Promo | null>(null);
  const [show, setShow] = useState(false);   // 条件がそろった（出してよい）
  const selfRef = useRef<HTMLDivElement>(null);
  const fetched = useRef(false);
  const otherBusy = usePopupBusy('promo');
  // ポップアップは同時に1つだけ（lib/popupSlot）。いちばん低い優先度なので、ほかが出ていれば必ず待つ
  const active = usePopupSlot('promo', POPUP_PRIORITY.promo, show);

  // いま出すものを1回だけ取りに行く
  useEffect(() => {
    if (!hydrated || !meId || meId === 'me' || fetched.current) return;
    fetched.current = true;
    fetch('/api/me/promo-popup', { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.promo) setPromo(j.promo); }).catch(() => {});
  }, [hydrated, meId]);

  // ほかのポップアップを見張りながら、出してよくなったら出す
  useEffect(() => {
    if (!promo || show) return;
    const tick = () => {
      const now = Date.now();
      let last = 0;
      try { last = Math.max(Number(localStorage.getItem(LAST_OVERLAY_KEY) || 0), lastPopupClosedAt()); } catch { /* noop */ }
      if (blocked || otherBusy || otherOverlayOpen(selfRef.current)) {
        try { localStorage.setItem(LAST_OVERLAY_KEY, String(now)); } catch { /* noop */ }
        return;
      }
      if (last && now - last < WAIT_AFTER_OTHER_MS) return;
      if (pathname.startsWith(`/round/${promo.roundId}`) || pathname.startsWith('/create')) return;
      setShow(true);
    };
    // ほかのポップアップが先に出るのを待ってから見る（画面を開いた直後は少し待つ）
    const first = setTimeout(tick, 4000);
    const iv = setInterval(tick, 20000);
    return () => { clearTimeout(first); clearInterval(iv); };
  }, [promo, show, blocked, pathname, otherBusy]);

  // 実際に画面に出たときに「出した」と記録する（1回だけ）
  const marked = useRef(false);
  useEffect(() => {
    if (!active || !promo || marked.current) return;
    marked.current = true;
    track('promo_popup_show', { promoId: promo.promoId, roundId: promo.roundId });
    fetch('/api/me/promo-popup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ promoId: promo.promoId }), cache: 'no-store', credentials: 'include' }).catch(() => {});
  }, [active, promo]);

  if (!promo || !show || !active) return <div ref={selfRef} className="hidden" />;

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(promo.date || '');
  const dt = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  const md = m ? `${Number(m[2])}/${Number(m[3])}` : '';
  const wd = dt ? '日月火水木金土'[dt.getUTCDay()] : '';
  const rest = promo.maxSpots ? Math.max(0, promo.maxSpots - promo.joined) : 0;
  const close = () => { setShow(false); setPromo(null); try { localStorage.setItem(LAST_OVERLAY_KEY, String(Date.now())); } catch { /* noop */ } };

  return (
    <div ref={selfRef} className="absolute inset-0 z-[160] bg-black/65 backdrop-blur-sm flex items-center justify-center p-5" data-promo>
      <div className="relative w-full max-w-[350px] pt-[60px]">
        {/* 白クマがのぞく */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/bear-hook.png" alt="" className="absolute left-1/2 -translate-x-1/2 top-0 w-[128px] z-10 pointer-events-none select-none" />
        <div className="relative bg-card rounded-[22px] border-[3px] border-border shadow-[5px_5px_0_#1E3A30] overflow-hidden">
          {/* リボン */}
          <div className="bg-orange text-white text-center pt-[52px] pb-3 px-4 border-b-[3px] border-border">
            <div className="text-[11px] font-black tracking-wider opacity-90">✨ 運営のイチオシ ✨</div>
            <div className="text-[19px] font-black leading-tight mt-0.5">{promo.headline || 'この日の募集があります！'}</div>
          </div>

          <div className="px-4 pt-4 pb-4">
            <div className="flex items-stretch gap-3">
              {/* 日付ブロック */}
              <div className="flex-none w-[74px] rounded-2xl bg-green text-white border-[2.5px] border-border shadow-[2px_2px_0_#1E3A30] flex flex-col items-center justify-center py-2">
                <div className="text-[24px] font-black leading-none font-num">{md}</div>
                <div className="text-[12px] font-black mt-1">{wd}曜</div>
                {promo.startTime && <div className="text-[10px] font-bold opacity-90 mt-0.5">{promo.startTime}〜</div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-black leading-snug">{promo.title}</div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {promo.area && <Chip>📍 {promo.area}</Chip>}
                  {promo.price && <Chip>💰 {promo.price}</Chip>}
                  {promo.levelCondition && <Chip>🔰 {promo.levelCondition}</Chip>}
                  {promo.courseName && <Chip>⛳ {promo.courseName}</Chip>}
                </div>
              </div>
            </div>

            {/* 空き */}
            {promo.maxSpots > 0 && (
              <div className="mt-3.5 rounded-xl bg-orange-light border-2 border-orange px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-black text-orange">{rest > 0 ? `あと${rest}人 参加できます！` : '満員間近！'}</div>
                  <div className="text-[11px] font-bold text-sub">{promo.joined}/{promo.maxSpots}人</div>
                </div>
                <div className="flex gap-1 mt-1.5">
                  {Array.from({ length: promo.maxSpots }).map((_, i) => (
                    <span key={i} className={'flex-1 h-2.5 rounded-full border-[1.5px] border-border ' + (i < promo.joined ? 'bg-green' : 'bg-white')} />
                  ))}
                </div>
              </div>
            )}

            {promo.host && (
              <div className="mt-3 flex items-center gap-2 text-[12px] text-sub font-bold">
                <Avatar user={promo.host} size={26} emojiSize={14} />
                <span className="truncate">主催：<b className="text-text">{promo.host.displayName}</b>さん</span>
                <span className="ml-auto text-[10.5px] text-muted flex-none">ひとりでも参加OK</span>
              </div>
            )}

            <button type="button"
              onClick={() => { popupEvent('promo', 'go', { promoId: promo.promoId }); track('promo_popup_go', { promoId: promo.promoId }); fetch('/api/me/promo-popup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ promoId: promo.promoId, action: 'go' }), cache: 'no-store', credentials: 'include' }).catch(() => {}); close(); router.push(`/round/${promo.roundId}`); }}
              className="mt-4 w-full py-3.5 bg-orange text-white rounded-2xl text-[16px] font-black border-[2.5px] border-border shadow-[3px_3px_0_#1E3A30] active:translate-y-[2px] active:shadow-none">
              🏌️ ぜひ参加してみませんか？ →
            </button>
            <button type="button" onClick={() => { popupEvent('promo', 'close', { promoId: promo.promoId }); track('promo_popup_close', { promoId: promo.promoId }); close(); }}
              className="block w-full mt-2 py-1.5 text-[12px] text-sub font-bold">今回は見送る</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center text-[10.5px] font-bold bg-bg border border-border rounded-full px-2 py-0.5 max-w-full truncate">{children}</span>;
}
