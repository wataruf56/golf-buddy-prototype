'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import { SnsTestBadge, agoLabel, type SnsUser } from '@/components/sns/SnsParts';

// テスト版だけのDMの一覧（2026-11-01・lib/snsTestTalk）。相手はテスト用の人だけ。既存のDM（/chat）とは別。
type Row = { other: SnsUser; last: { f: string; t: string; at: number }; unread: boolean; origin: string };

export default function SnsDmListPage() {
  const [rows, setRows] = useState<Row[] | null | 'none'>(null);
  useEffect(() => {
    fetch('/api/sns/dm', { cache: 'no-store', credentials: 'include' }).then((r) => (r.ok ? r.json() : 'none'))
      .then((j) => setRows(j === 'none' ? 'none' : j.threads || [])).catch(() => setRows('none'));
  }, []);
  if (rows === 'none') return <div className="text-center text-[13px] text-muted py-20">ページが見つかりません</div>;
  return (
    <div className="pb-8 bg-card min-h-screen">
      <div className="sticky top-0 z-20 bg-card border-b border-hair flex items-center px-4 h-12">
        <span className="text-[16px] font-black">メッセージ</span><SnsTestBadge />
      </div>
      {!rows ? <div className="text-center text-[12px] text-muted py-16">読み込み中...</div>
        : rows.length === 0 ? <div className="text-center text-[12px] text-muted py-16 px-8 leading-relaxed">まだありません。<br />テスト用の人のひとことに答えるか、自分のひとことに答えてくれた人へDMを送ると、ここに並びます。</div>
        : rows.map((r) => (
          <Link key={r.other.id} href={`/sns/dm/${r.other.id}`} className="flex items-center gap-3 px-4 py-2.5 border-b border-hair">
            <Avatar user={r.other as any} size={46} />
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-black truncate">{r.other.name}{r.origin === 'story' && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-green-light text-green text-[10px] font-black align-middle">ひとことから</span>}</div>
              <div className={`text-[12px] truncate ${r.unread ? 'text-text font-bold' : 'text-sub'}`}>{r.last.f === r.other.id ? '' : 'あなた：'}{r.last.t}</div>
            </div>
            <div className="flex flex-col items-end gap-1"><span className="text-[10.5px] text-muted">{agoLabel(r.last.at)}</span>{r.unread && <span className="w-2.5 h-2.5 rounded-full bg-orange" />}</div>
          </Link>
        ))}
      <div className="mx-4 mt-5 px-3 py-2.5 rounded-xl bg-[#FFF6D9] text-[#7A5B00] text-[11.5px] font-bold leading-relaxed">
        テスト版のDMです。相手は「テスト用の人」（実在しない）で、送ると自動で返事が来ます。今のゴルトモのDMや通知・LINEには何も届きません。
      </div>
    </div>
  );
}
