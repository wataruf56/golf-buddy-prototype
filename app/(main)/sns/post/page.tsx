'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { SnsTestBadge, type SnsUser } from '@/components/sns/SnsParts';
import { toast } from '@/components/Toast';
import { resizeImage } from '@/lib/resizeImage';

// 写真を投稿する（テスト版・運営だけ・lib/snsTestPosts・2026-11-01）。
// プロフィールの写真タブとホームに並ぶ。本物のアルバム・タイムラインには入らず、通知も出ない。
// ?round=… で開くと、そのラウンドを選んだ状態で始まる（プロフィールの写真の無いマスから来たとき）。
// 写真は10枚まで。文章の中で「@」を打つか「＠ メンション」を押すと、人を選んで入れられる（テスト版なので相手に通知は届かない）。
const MAX = 10;

export default function SnsPostPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const router = useRouter();
  const search = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const [rounds, setRounds] = useState<{ id: string; place: string; when: string }[] | null | 'none'>(null);
  const [people, setPeople] = useState<SnsUser[]>([]);
  const [cursor, setCursor] = useState(0);
  const [photos, setPhotos] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [roundId, setRoundId] = useState(search?.get('round') || '');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch('/api/sns/post', { cache: 'no-store', credentials: 'include' }).then((r) => (r.ok ? r.json() : 'none'))
      .then((j) => { setRounds(j === 'none' ? 'none' : j.rounds); if (j !== 'none') setPeople(j.people || []); }).catch(() => setRounds('none'));
  }, []);
  if (rounds === 'none') return <div className="text-center text-[13px] text-muted py-20">ページが見つかりません</div>;
  if (rounds === null) return <div className="text-center text-[12px] text-muted py-20">読み込み中...</div>;

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setLoading(true); setErr('');
    const room = MAX - photos.length;
    if (files.length > room) toast(`写真は${MAX}枚までです`);
    const added: string[] = [];
    for (const f of Array.from(files).slice(0, room)) {
      try {
        let img = await resizeImage(f, 1280, 0.8);
        if (img.length > 850_000) img = await resizeImage(f, 960, 0.7);
        if (img.length > 850_000) img = await resizeImage(f, 720, 0.6);
        added.push(img);
      } catch { toast('写真を読み込めませんでした', 'error'); }
    }
    setPhotos((cur) => [...cur, ...added]);
    setLoading(false);
  }

  // カーソルの直前が「@…」なら候補を出す。名前に空白がある人もいるので、空白までを打ちかけとして見る
  const typing = /(?:^|\s)@([^\s@]*)$/.exec(caption.slice(0, cursor));
  const kw = typing ? typing[1].toLowerCase() : '';
  const candidates = typing ? people.filter((u) => u.name.toLowerCase().includes(kw)).slice(0, 30) : [];
  function moveCursor(pos: number) {
    setCursor(pos);
    setTimeout(() => { captionRef.current?.focus(); captionRef.current?.setSelectionRange(pos, pos); }, 0);
  }
  function startMention() {
    const before = caption.slice(0, cursor);
    const head = before && !/\s$/.test(before) ? `${before} @` : `${before}@`;
    setCaption(head + caption.slice(cursor));
    moveCursor(head.length);
  }
  function chooseMention(u: SnsUser) {
    const before = caption.slice(0, cursor).replace(/@[^\s@]*$/, '');
    const head = `${before}@${u.name} `;
    setCaption((head + caption.slice(cursor)).slice(0, 500));
    moveCursor(Math.min(head.length, 500));
  }

  async function post() {
    if (busy) return;
    if (!photos.length) { setErr('写真を選んでください'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/sns/post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ photos, caption, roundId, mentions: people.filter((u) => caption.includes(`@${u.name}`)).map((u) => u.id) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'うまくいきませんでした');
      toast('写真を投稿しました');
      router.replace('/sns/u/me');
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <div className="pb-10 bg-card min-h-screen">
      <div className="sticky top-0 z-20 bg-card border-b border-hair flex items-center px-3 h-12">
        <button type="button" onClick={() => router.back()} aria-label="閉じる" className="w-8 h-8 text-[22px] leading-none">×</button>
        <span className="text-[16px] font-black">写真を投稿</span><SnsTestBadge />
        <button type="button" onClick={post} disabled={busy || loading} className="ml-auto px-4 py-1.5 rounded-full bg-orange text-white text-[13px] font-black disabled:opacity-50">{busy ? '…' : '投稿'}</button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
      {photos.length === 0 ? (
        <button type="button" onClick={() => fileRef.current?.click()} className="block mx-3 mt-3 w-[calc(100%-24px)] py-20 rounded-2xl border-2 border-dashed border-orange text-orange text-[15px] font-black">
          {loading ? '読み込み中…' : `📷 写真をえらぶ（${MAX}枚まで）`}
        </button>
      ) : (
        <div className="flex gap-2 overflow-x-auto px-3 pt-3" style={{ scrollbarWidth: 'none' }}>
          {photos.map((src, k) => (
            <div key={k} className="relative flex-shrink-0 w-[70%] aspect-square rounded-2xl overflow-hidden bg-bg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== k))} aria-label="この写真を外す" className="absolute right-2 top-2 w-7 h-7 rounded-full bg-black/60 text-white text-[15px] leading-none">×</button>
            </div>
          ))}
          {photos.length < MAX && (
            <button type="button" onClick={() => fileRef.current?.click()} className="flex-shrink-0 w-[35%] rounded-2xl border-2 border-dashed border-border text-sub text-[12.5px] font-black">{loading ? '…' : '＋ 追加'}</button>
          )}
        </div>
      )}
      {err && <div className="px-4 pt-2 text-[12px] font-black text-red">{err}</div>}

      <div className="px-4 pt-4">
        <textarea ref={captionRef} value={caption} maxLength={500} rows={4} placeholder="文章を書く（なくてもOK）  @で人をメンション"
          onChange={(e) => { setCaption(e.target.value); setCursor(e.target.selectionStart); }}
          onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
          className="w-full px-3 py-2 rounded-xl border-2 border-border bg-card text-[16px] outline-none resize-none" />
        {typing && (
          <div className="mt-1 max-h-[220px] overflow-y-auto rounded-xl border-2 border-border bg-card">
            {candidates.length === 0 && <div className="px-3 py-3 text-[12px] text-muted text-center">{people.length ? '見つかりませんでした' : 'メンションできる人がいません'}</div>}
            {candidates.map((u) => (
              <button key={u.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => chooseMention(u)} className="w-full flex items-center gap-2.5 px-3 py-2 border-b border-hair last:border-0 text-left">
                <Avatar user={u as any} size={30} />
                <span className="text-[13px] font-black truncate">{u.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center mt-1.5">
          <button type="button" onClick={startMention} className="px-3 py-1.5 rounded-full border-2 border-border text-[12.5px] font-black">＠ メンション</button>
          <span className="ml-auto text-[10.5px] text-muted">{caption.length}/500</span>
        </div>
      </div>
      <div className="px-4 pt-3">
        <div className="text-[13px] font-black mb-1.5">どのラウンドの写真？</div>
        <select value={roundId} onChange={(e) => setRoundId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 border-border bg-card text-[16px]">
          <option value="">選ばない</option>
          {rounds.map((r) => <option key={r.id} value={r.id}>{r.when} {r.place}</option>)}
        </select>
      </div>
      <div className="mx-4 mt-4 px-3 py-2.5 rounded-xl bg-[#FFF6D9] text-[#7A5B00] text-[11.5px] font-bold leading-relaxed">
        テスト版：あなたにしか見えません。今のタイムラインやアルバムには入らず、メンションした人にも誰にも通知されません。
      </div>
    </div>
  );
}
