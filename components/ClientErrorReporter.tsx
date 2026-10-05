'use client';

import { useEffect } from 'react';
import { CURRENT_BUILD } from '@/lib/appUpdate';

// 画面側の例外をサーバーに送る（/api/client-error）。
// これまで「Application error: a client-side exception has occurred」が出ても中身がどこにも残らず、
// 実機でしか原因を追えなかった（2026-10-06・シェアURLを iPhone の Safari で開いて発生）。
// - window の error / unhandledrejection を拾う（イベントハンドラや非同期の例外もここで拾える）
// - 同じ文面は1回だけ、1ページあたり最大5件
// - 未ログインでも送れる（API 側でログイン不要にしてある）

const sent = new Set<string>();
let count = 0;

function describe(err: unknown): { message: string; stack: string } {
  if (err instanceof Error) return { message: `${err.name}: ${err.message}`, stack: err.stack || '' };
  if (typeof err === 'string') return { message: err, stack: '' };
  try { return { message: JSON.stringify(err).slice(0, 300), stack: '' }; } catch { return { message: String(err), stack: '' }; }
}

/** 配信直後に、古い画面が新しい部品（チャンク）を読みに行って失敗したときの文面。
 *  Chrome: "ChunkLoadError" / "Failed to fetch dynamically imported module"
 *  Safari: "Importing a module script failed." / "Load failed" */
export function isStaleBundleError(err: unknown): boolean {
  const { message } = describe(err);
  return /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed|Load failed|css chunk/i.test(message);
}

export function reportClientError(kind: 'error' | 'unhandledrejection' | 'boundary', err: unknown, extra?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const { message, stack } = describe(err);
  if (!message || /ResizeObserver loop/.test(message)) return;      // ブラウザ由来の雑音は捨てる
  const key = `${kind}:${message.slice(0, 120)}`;
  if (sent.has(key) || count >= 5) return;
  sent.add(key); count += 1;
  const body = JSON.stringify({ kind, message, stack, url: location.href, build: CURRENT_BUILD || '', ...(extra || {}) });
  try {
    fetch('/api/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* noop */ }
}

export function ClientErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      // 拡張機能や他ドメインのスクリプトの "Script error." は中身がないので捨てる
      if (!e.error && /^Script error\.?$/.test(e.message || '')) return;
      reportClientError('error', e.error || e.message, { line: `${e.filename || ''}:${e.lineno || 0}:${e.colno || 0}` });
    };
    const onRejection = (e: PromiseRejectionEvent) => { reportClientError('unhandledrejection', e.reason); };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
