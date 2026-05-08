'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ReviewChunks } from '@/components/swing/ReviewChunks';
import { StatusBadge } from '@/components/swing/StatusBadge';
import type { SwingDoc } from '@/types/swing';

const MODE_LABEL: Record<string, string> = {
  self: '🏌️ 自分のスイング解析',
  compare: '🆚 プロ比較',
  past: '📈 過去比較',
  question: '❓ 質問モード',
};

export default function SwingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [swing, setSwing] = useState<SwingDoc | null>(null);
  const [err, setErr] = useState('');
  const stoppedRef = useRef(false);

  async function load() {
    try {
      const r = await fetch(`/api/swing/${params.id}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json();
      setSwing(d.swing);
      if (d.swing?.status === 'done' || d.swing?.status === 'failed') {
        stoppedRef.current = true;
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(() => { if (!stoppedRef.current) load(); }, 5000);
    return () => clearInterval(t);
  }, [params.id]);

  if (!swing && !err) {
    return <div className="px-5 py-10 text-sm text-muted text-center">読み込み中...</div>;
  }
  if (err && !swing) {
    return <div className="px-5 py-10 text-sm text-red-600 text-center">エラー: {err}</div>;
  }
  if (!swing) return null;

  return (
    <div className="px-5 py-3">
      <button onClick={() => router.push('/swing')} className="text-sm text-blue font-semibold mb-3">← 履歴に戻る</button>

      <div className="bg-card rounded-card p-4 shadow-card mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-base font-black">{MODE_LABEL[swing.mode] || swing.mode}</div>
          <StatusBadge status={swing.status} />
        </div>
        <div className="text-[11px] text-muted">
          {new Date(swing.createdAt).toLocaleString('ja-JP')}
        </div>
        {swing.userMessage && (
          <div className="mt-3 p-3 bg-bg rounded-lg text-[12px] text-sub whitespace-pre-wrap">
            {swing.userMessage}
          </div>
        )}
      </div>

      {(swing.status === 'queued' || swing.status === 'analyzing') && (
        <div className="bg-card rounded-card p-8 text-center shadow-card">
          <div className="text-3xl mb-3 animate-pulse">⛳</div>
          <div className="text-sm font-bold mb-1">
            {swing.status === 'queued' ? '解析待機中...' : 'AIが解析中...'}
          </div>
          <div className="text-[11px] text-sub">通常1〜2分で完了します。完了するとLINE通知が届きます</div>
        </div>
      )}

      {swing.status === 'failed' && (
        <div className="bg-red-50 border border-red-200 rounded-card p-4 text-center">
          <div className="text-sm font-bold text-red-600 mb-1">⚠️ 解析に失敗しました</div>
          {swing.errorMessage && (
            <div className="text-[11px] text-red-500 mb-3 break-words">{swing.errorMessage}</div>
          )}
          <button
            onClick={() => router.push('/swing/new')}
            className="px-4 py-2 bg-green text-white rounded-full text-xs font-bold"
          >もう一度試す</button>
        </div>
      )}

      {swing.status === 'done' && swing.reviewTextChunks && (
        <ReviewChunks chunks={swing.reviewTextChunks} />
      )}

      <div className="h-5" />
    </div>
  );
}
