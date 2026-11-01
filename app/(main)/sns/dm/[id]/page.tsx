'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { SnsTestBadge, type SnsUser } from '@/components/sns/SnsParts';
import { toast } from '@/components/Toast';

// テスト版だけのDM（2026-11-01・lib/snsTestTalk）。ひとことから始まったときは、上にそのひとことと答えを出す。
// 送ると、テスト用の人が少しあとに返事をする。既存のDM・通知・LINEには何も送らない。
type Msg = { f: string; t: string; at: number };
type Thread = { me: SnsUser; other: SnsUser; msgs: Msg[]; quote: { poster: string; text: string; dateLabel: string; bg: string; answer: string } | null };

export default function SnsDmThreadPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const search = useSearchParams();
  const story = search?.get('story') || '';
  const [t, setT] = useState<Thread | null | 'none'>(null);
  const [shown, setShown] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fetch(`/api/sns/dm/${encodeURIComponent(params.id)}`, { cache: 'no-store', credentials: 'include' }).then((r) => (r.ok ? r.json() : 'none'))
      .then((j) => { setT(j); if (j !== 'none') setShown(j.msgs.length); }).catch(() => setT('none'));
  }, [params.id]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [shown]);
  if (t === 'none') return <div className="text-center text-[13px] text-muted py-20">ページが見つかりません</div>;
  if (!t) return <div className="text-center text-[12px] text-muted py-20">読み込み中...</div>;

  async function send() {
    const v = text.trim();
    if (!v || busy || !t || t === 'none') return;
    setBusy(true);
    try {
      const r = await fetch(`/api/sns/dm/${encodeURIComponent(params.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ text: v, story }) });
      const j = await r.json();
      if (!r.ok) throw new Error();
      setText('');
      setT(j);
      setShown(j.msgs.length - 1);                       // 自分の分だけ先に出す
      setTimeout(() => setShown(j.msgs.length), 1400);   // 少しあとに返事
    } catch { toast('うまくいきませんでした', 'error'); }
    setBusy(false);
  }

  return (
    <div className="bg-bg min-h-screen flex flex-col">
      <div className="sticky top-0 z-20 bg-card border-b border-hair flex items-center gap-2 px-3 h-12">
        <button type="button" onClick={() => router.back()} aria-label="戻る" className="w-8 h-8 text-[20px]">‹</button>
        <Avatar user={t.other as any} size={30} />
        <span className="text-[15px] font-black truncate">{t.other.name}</span><SnsTestBadge />
      </div>
      {t.quote && (
        <div className="mx-3 mt-3 bg-card px-3 py-2.5" style={{ borderLeft: `4px solid ${t.quote.bg}` }}>
          <div className="text-[11px] text-sub">{t.quote.poster}のひとこと</div>
          <div className="text-[13.5px] font-black leading-relaxed whitespace-pre-wrap">{t.quote.dateLabel ? `${t.quote.dateLabel} ` : ''}{t.quote.text}</div>
          {t.quote.answer && <div className="text-[11.5px] font-black text-green mt-1">{t.quote.answer}</div>}
        </div>
      )}
      <div className="flex-1 flex flex-col gap-1.5 px-3 py-3">
        {t.msgs.length === 0 && <div className="text-center text-[12px] text-muted py-10">最初のメッセージを送ってみましょう</div>}
        {t.msgs.slice(0, shown).map((m, k) => (
          <div key={k} className={`max-w-[78%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap break-words ${m.f === t.other.id ? 'self-start bg-card border border-hair rounded-bl-md' : 'self-end bg-green text-white rounded-br-md'}`}>{m.t}</div>
        ))}
        <div ref={bottom} />
      </div>
      <form className="sticky bottom-0 flex gap-2 px-3 py-2 bg-card border-t border-hair" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="メッセージを入力" maxLength={500}
          className="flex-1 min-w-0 px-3.5 py-2.5 rounded-full border-2 border-border bg-card text-[13.5px]" />
        <button type="submit" disabled={busy || !text.trim()} className="px-4 rounded-full bg-green text-white text-[13px] font-black disabled:opacity-50">送る</button>
      </form>
    </div>
  );
}
