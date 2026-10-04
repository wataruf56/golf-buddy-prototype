'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// 全画面のオーバーレイ（モーダル・ボトムシート）を body 直下に描くための入れ物。
//
// 【なぜ必要か】会員画面の中身（.screen）は -webkit-overflow-scrolling: touch が効いていて、
// iOS（LINE内ブラウザ）ではその中の position: fixed が画面ではなく中身に閉じ込められる。
// 下寄せのシートがタブバーの裏に入り、最後の1人や「次へ」が押せなくなった（2026-10-04）。
// body に出せばタブバーより手前・画面基準で描かれる。
//
// 使い方：<Portal><div className="fixed inset-0 ...">…</div></Portal>
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
