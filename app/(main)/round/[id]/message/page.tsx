'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { isRoundHost } from '@/lib/roundHost';
import { HostNote } from '@/components/HostNote';
import type { Round } from '@/lib/types';

// 主催者からのメッセージを読む／書くページ（2026-10-08）。募集ページのカードから来る。
export default function RoundMessagePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meId = useStore((s) => s.meId);
  const storeRound = useStore((s) => s.rounds.find((r) => r.id === params.id));
  const [fetched, setFetched] = useState<Round | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'notfound'>('loading');

  useEffect(() => {
    if (storeRound) { setState('ok'); return; }
    fetch(`/api/rounds/${params.id}`, { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.round) { setFetched(j.round); setState('ok'); } else setState('notfound'); })
      .catch(() => setState('notfound'));
  }, [params.id, storeRound]);

  const round = storeRound || fetched;
  return (
    <div className="p-4 pb-10">
      <button onClick={() => router.back()} className="text-sm text-blue font-semibold mb-3">← 戻る</button>
      {state === 'loading' && <div className="text-center text-sub text-[13px] py-10">読み込み中...</div>}
      {state === 'notfound' && <div className="text-center text-sub text-[13px] py-10">募集が見つかりません</div>}
      {round && (
        <>
          <div className="text-[11px] font-black text-orange">📣 主催者からのメッセージ</div>
          <div className="text-[15px] font-black mt-0.5 mb-3 leading-snug">{round.title}</div>
          <HostNote round={round} isHost={isRoundHost(round, meId)} />
        </>
      )}
    </div>
  );
}
