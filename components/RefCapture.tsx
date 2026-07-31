'use client';

import { useEffect } from 'react';

// 流入経路キャプチャ。着地URLの ?ref= / ?utm_source= / ?source= を「初回のみ」
// localStorage に記憶する（LINEログインの往復や画面遷移で消えないように）。
// 登録時に /api/auth/liff へ渡してユーザーに保存する。
export function normalizeRef(raw: string): string {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 40);
}

export function RefCapture() {
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const raw = sp.get('ref') || sp.get('utm_source') || sp.get('source') || '';
      const ref = normalizeRef(raw);
      // 初回タッチ優先（既に記録済みなら上書きしない）。
      if (ref && !localStorage.getItem('gb_ref')) {
        localStorage.setItem('gb_ref', ref);
        localStorage.setItem('gb_ref_at', String(Date.now()));
      }
      if (typeof document !== 'undefined' && document.referrer && !localStorage.getItem('gb_referrer')) {
        localStorage.setItem('gb_referrer', document.referrer.slice(0, 200));
      }
    } catch { /* noop */ }
  }, []);
  return null;
}
