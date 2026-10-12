'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { RoundPromoCard, type PromoTexts } from '@/components/RoundPromoCard';
import { track } from '@/lib/telemetry';
import { usePopupSlot, usePopupBusy, lastPopupClosedAt, POPUP_PRIORITY, popupEvent } from '@/lib/popupSlot';

// イチオシ募集のポップアップ（lib/promoPopup）（2026-10-12）。1人1回だけ。
// ほかのポップアップが出ているあいだは出さない。何か出ていた人には、それが閉じてから1時間後に出す
// （画面に全画面の暗い幕＝ほかのポップアップがあるかを見て、最後に見えた時刻を覚えておく）。
type Promo = {
  promoId: string; roundId: string; headline?: string; title: string; date: string; startTime: string;
  area: string; courseName: string; price: string; levelCondition: string; maxSpots: number; joined: number;
  host: any | null; texts?: PromoTexts;
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

  const close = () => { setShow(false); setPromo(null); try { localStorage.setItem(LAST_OVERLAY_KEY, String(Date.now())); } catch { /* noop */ } };

  return (
    <div ref={selfRef} className="absolute inset-0 z-[160] bg-black/65 backdrop-blur-sm flex items-center justify-center p-5" data-promo>
      <RoundPromoCard r={promo} texts={promo.texts}
        onGo={() => { popupEvent('promo', 'go', { promoId: promo.promoId }); track('promo_popup_go', { promoId: promo.promoId }); fetch('/api/me/promo-popup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ promoId: promo.promoId, action: 'go' }), cache: 'no-store', credentials: 'include' }).catch(() => {}); close(); router.push(`/round/${promo.roundId}`); }}
        onClose={() => { popupEvent('promo', 'close', { promoId: promo.promoId }); track('promo_popup_close', { promoId: promo.promoId }); close(); }} />
    </div>
  );
}
