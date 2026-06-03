'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { OnboardingModal } from '@/components/swing/OnboardingModal';
import { StatusBadge } from '@/components/swing/StatusBadge';
import { SwingProgress } from '@/components/swing/SwingProgress';
import { formatDate } from '@/lib/utils';
import type { SwingDoc } from '@/types/swing';

const MODE_LABEL: Record<string, string> = {
  self: '🏌️ 自分解析',
  compare: '🆚 プロ比較',
  past: '📈 過去比較',
  range_vs_round: '🏟️ 練習場vs本番',
  question: '❓ 質問',
};

type Quota = {
  allowed: boolean;
  whitelisted: boolean;
  used: number;
  limit: number;
  month: string;
  lifetime: number;
};

export default function SwingListPage() {
  const [swings, setSwings] = useState<SwingDoc[] | null>(null);
  const [err, setErr] = useState<string>('');
  const [quota, setQuota] = useState<Quota | null>(null);

  async function load() {
    try {
      const [swingsRes, quotaRes] = await Promise.all([
        fetch('/api/swing/list', { cache: 'no-store' }),
        fetch('/api/swing/quota', { cache: 'no-store' }),
      ]);
      if (!swingsRes.ok) throw new Error(`${swingsRes.status}`);
      const d = await swingsRes.json();
      setSwings(d.swings || []);
      if (quotaRes.ok) setQuota(await quotaRes.json());
    } catch (e) {
      setErr((e as Error).message);
      setSwings([]);
    }
  }
  useEffect(() => { load(); }, []);

  return (
    <>
      <OnboardingModal />
      <div className="px-5 pt-2 pb-3 flex items-center justify-between">
        <div className="text-2xl font-black tracking-tight">スイング分析</div>
        <Link href="/swing/new" className="px-3.5 py-2 bg-green text-white rounded-full text-xs font-bold">
          ＋ 新規分析
        </Link>
      </div>

      {quota && (
        <div className="px-5 pb-3">
          {quota.whitelisted ? (
            <div className="bg-green-light border-[1.5px] border-green rounded-card px-4 py-2.5 flex items-center gap-2">
              <span className="text-base">⭐</span>
              <div className="flex-1">
                <div className="text-[12px] font-black text-green">無制限プラン</div>
                <div className="text-[10px] text-sub">何回でも解析できます</div>
              </div>
            </div>
          ) : quota.allowed ? (
            <div className="bg-card rounded-card px-4 py-2.5 flex items-center gap-2 shadow-card">
              <span className="text-base">📊</span>
              <div className="flex-1">
                <div className="text-[12px] font-black">
                  今月の無料解析: <span className="text-green">{quota.used} / {quota.limit}</span> 回
                </div>
                <div className="text-[10px] text-sub">{quota.month} ・ 残り {Math.max(0, quota.limit - quota.used)} 回</div>
              </div>
            </div>
          ) : (
            <div className="bg-orange-light border-[1.5px] border-orange rounded-card px-4 py-3">
              <div className="text-[13px] font-black text-orange mb-1">
                🔒 今月の無料枠を使い切りました
              </div>
              <div className="text-[11px] text-sub leading-relaxed">
                {quota.month} の無料解析は {quota.limit} / {quota.limit} 回。
                追加で利用したい場合は管理者に依頼してください。
                来月になると自動的に枠がリセットされます。
              </div>
            </div>
          )}
        </div>
      )}

      {swings && swings.length > 0 && <SwingProgress swings={swings} />}

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
