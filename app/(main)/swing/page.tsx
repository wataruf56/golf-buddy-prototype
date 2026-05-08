'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { StatusBadge } from '@/components/swing/StatusBadge';
import { formatDate } from '@/lib/utils';
import type { SwingDoc } from '@/types/swing';

const MODE_LABEL: Record<string, string> = {
  self: '🏌️ 自分解析',
  compare: '🆚 プロ比較',
  past: '📈 過去比較',
  question: '❓ 質問',
};

export default function SwingListPage() {
  const [swings, setSwings] = useState<SwingDoc[] | null>(null);
  const [err, setErr] = useState<string>('');

  async function load() {
    try {
      const r = await fetch('/api/swing/list', { cache: 'no-store' });
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json();
      setSwings(d.swings || []);
    } catch (e) {
      setErr((e as Error).message);
      setSwings([]);
    }
  }
  useEffect(() => { load(); }, []);

  return (
    <>
      <div className="px-5 pt-2 pb-3 flex items-center justify-between">
        <div className="text-2xl font-black tracking-tight">スイング分析</div>
        <Link href="/swing/new" className="px-3.5 py-2 bg-green text-white rounded-full text-xs font-bold">
          ＋ 新規分析
        </Link>
      </div>

      <div className="px-5 pb-6">
        {swings === null ? (
          <div className="text-sm text-muted py-10 text-center">読み込み中...</div>
        ) : swings.length === 0 ? (
          <div className="bg-card rounded-card p-8 text-center shadow-card">
            <div className="text-3xl mb-2">🏌️</div>
            <div className="text-sm font-bold mb-1">分析履歴がまだありません</div>
            <div className="text-[11px] text-sub mb-4">スイング動画を撮って AI コーチに見てもらいましょう</div>
            <Link href="/swing/new" className="inline-block px-4 py-2 bg-green text-white rounded-full text-xs font-bold">
              ＋ 新規分析を始める
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {swings.map((s) => (
              <Link
                key={s.swingId}
                href={`/swing/${s.swingId}`}
                className="flex items-center justify-between p-3.5 bg-card rounded-xl shadow-card"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold">{MODE_LABEL[s.mode] || s.mode}</div>
                  <div className="text-[11px] text-muted mt-0.5">
                    {formatDate(new Date(s.createdAt).toISOString().slice(0, 10))}
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </Link>
            ))}
          </div>
        )}
        {err && <div className="text-[11px] text-red-600 mt-3">{err}</div>}
      </div>
    </>
  );
}
