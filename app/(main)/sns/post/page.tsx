'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { SnsTestBadge, type SnsUser } from '@/components/sns/SnsParts';
import { toast } from '@/components/Toast';
import { resizeImage } from '@/lib/resizeImage';
import { MAX_VIDEO_MB, MAX_VIDEO_SEC, isVideoFile, readVideo, uploadVideo } from '@/lib/snsVideoClient';

// 写真を投稿する（テスト版・運営だけ・lib/snsTestPosts・2026-11-01）。
// プロフィールの写真タブとホームに並ぶ。本物のアルバム・タイムラインには入らず、通知も出ない。
// ?round=… で開くと、そのラウンドを選んだ状態で始まる（プロフィールの写真の無いマスから来たとき）。
// 写真と動画は合わせて10個まで。文章の中で「@」を打つか「＠ メンション」を押すと、人を選んで入れられる（相手に通知は届かない）。
// 動画は1本60秒・200MBまで。投稿のときに端末からバケットへ直接送る（lib/snsVideoClient）。
// ?edit=投稿ID で開くと編集（2026-11-02 本人指定）。文章・タグ・ラウンドを直せる。写真と動画は変えない。
const MAX = 10;
type Item = { src: string; file?: File; object?: string; video?: boolean };   // 動画は src が表紙、file が本体、object が送り終えた置き場所

export default function SnsPostPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const router = useRouter();
  const search = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const editId = search?.get('edit') || '';
  const [rounds, setRounds] = useState<{ id: string; place: string; when: string }[] | null | 'none'>(null);
  const [people, setPeople] = useState<SnsUser[]>([]);
  const [cursor, setCursor] = useState(0);
  const [photos, setPhotos] = useState<Item[]>([]);
  const [progress, setProgress] = useState('');
  const [caption, setCaption] = useState('');
  const [roundId, setRoundId] = useState(search?.get('round') || '');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    const opts = fetch('/api/sns/post', { cache: 'no-store', credentials: 'include' }).then((r) => (r.ok ? r.json() : 'none'));
    const own = editId ? fetch(`/api/sns/post/${encodeURIComponent(editId)}`, { cache: 'no-store', credentials: 'include' }).then((r) => (r.ok ? r.json() : 'none')) : Promise.resolve(null);
    Promise.all([opts, own]).then(([j, e]) => {
      if (j === 'none' || e === 'none') { setRounds('none'); return; }
      setRounds(j.rounds);
      const list: SnsUser[] = j.people || [];
      setPeople([...list, ...(e?.mentions || []).filter((u: SnsUser) => !list.some((x) => x.id === u.id))]);
      if (e) {
        setPhotos(e.photos.map((src: string, k: number) => ({ src, video: !!e.videos?.[k] })));
        setCaption(e.caption); setCursor(e.caption.length); setRoundId(e.roundId);
      }
    }).catch(() => setRounds('none'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (rounds === 'none') return <div className="text-center text-[13px] text-muted py-20">ページが見つかりません</div>;
  if (rounds === null) return <div className="text-center text-[12px] text-muted py-20">読み込み中...</div>;

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setLoading(true); setErr('');
    const room = MAX - photos.length;
    if (files.length > room) toast(`写真と動画は合わせて${MAX}個までです`);
    const added: Item[] = [];
    for (const f of Array.from(files).slice(0, room)) {
      if (isVideoFile(f)) {
        if (f.size > MAX_VIDEO_MB * 1024 * 1024) { toast(`動画は${MAX_VIDEO_MB}MBまでです`, 'error'); continue; }
        const { poster, sec } = await readVideo(f);
        if (sec > MAX_VIDEO_SEC + 0.5) { toast(`動画は${MAX_VIDEO_SEC}秒までです`, 'error'); continue; }
        added.push({ src: poster, file: f });
        continue;
      }
      try {
        let img = await resizeImage(f, 1280, 0.8);
        if (img.length > 850_000) img = await resizeImage(f, 960, 0.7);
        if (img.length > 850_000) img = await resizeImage(f, 720, 0.6);
        added.push({ src: img });
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

  async function saveEdit() {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch(`/api/sns/post/${encodeURIComponent(editId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'edit', caption, roundId, mentions: people.filter((u) => caption.includes(`@${u.name}`)).map((u) => u.id) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'うまくいきませんでした');
      toast('保存しました');
      router.replace('/sns/u/me');
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  async function post() {
    if (busy) return;
    if (!photos.length) { setErr('写真か動画を選んでください'); return; }
    setBusy(true); setErr('');
    try {
      // 動画を先に送る（送り終えた分は覚えておき、やり直しのときは送らない）
      const videoItems = photos.filter((x) => x.file);
      for (const [k, item] of videoItems.entries()) {
        if (item.object) continue;
        item.object = await uploadVideo(item.file!, 'p', (pct) => setProgress(`動画を送っています ${videoItems.length > 1 ? `${k + 1}/${videoItems.length} ` : ''}${pct}%`));
      }
      setProgress('');
      const r = await fetch('/api/sns/post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ photos: photos.map((x) => x.src), videos: photos.map((x) => x.object || ''), caption, roundId, mentions: people.filter((u) => caption.includes(`@${u.name}`)).map((u) => u.id) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'うまくいきませんでした');
      toast('投稿しました');
      router.replace('/sns/u/me');
    } catch (e) { setErr((e as Error).message); setProgress(''); setBusy(false); }
  }

  return (
    <div className="pb-10 bg-card min-h-screen">
      <div className="sticky top-0 z-20 bg-card border-b border-hair flex items-center px-3 h-12">
        <button type="button" onClick={() => router.back()} aria-label="閉じる" className="w-8 h-8 text-[22px] leading-none">×</button>
        <span className="text-[16px] font-black">{editId ? '投稿を編集' : '投稿'}</span><SnsTestBadge />
        <button type="button" onClick={editId ? saveEdit : post} disabled={busy || loading} className="ml-auto px-4 py-1.5 rounded-full bg-orange text-white text-[13px] font-black disabled:opacity-50">{busy ? '…' : editId ? '保存' : '投稿'}</button>
      </div>

      <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
      {photos.length === 0 ? (
        <button type="button" onClick={() => fileRef.current?.click()} className="block mx-3 mt-3 w-[calc(100%-24px)] py-20 rounded-2xl border-2 border-dashed border-orange text-orange text-[15px] font-black">
          {loading ? '読み込み中…' : `📷 写真・動画をえらぶ（${MAX}個まで）`}
        </button>
      ) : (
        <div className="flex gap-2 overflow-x-auto px-3 pt-3" style={{ scrollbarWidth: 'none' }}>
          {photos.map((item, k) => (
            <div key={k} className="relative flex-shrink-0 w-[70%] aspect-square rounded-2xl overflow-hidden bg-bg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.src} alt="" className="w-full h-full object-cover" />
              {(item.file || item.video) && <span className="absolute left-2 top-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px] font-black">▶ 動画</span>}
              {!editId && <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== k))} aria-label="これを外す" className="absolute right-2 top-2 w-7 h-7 rounded-full bg-black/60 text-white text-[15px] leading-none">×</button>}
            </div>
          ))}
          {!editId && photos.length < MAX && (
            <button type="button" onClick={() => fileRef.current?.click()} className="flex-shrink-0 w-[35%] rounded-2xl border-2 border-dashed border-border text-sub text-[12.5px] font-black">{loading ? '…' : '＋ 追加'}</button>
          )}
        </div>
      )}
      {progress && <div className="px-4 pt-2 text-[12px] font-black text-green">{progress}</div>}
      {err && <div className="px-4 pt-2 text-[12px] font-black text-red">{err}</div>}
      <div className="px-4 pt-1.5 text-[10.5px] text-muted">{editId ? '写真と動画は変えられません（文章・タグ・ラウンドを直せます）' : `動画は1本${MAX_VIDEO_SEC}秒・${MAX_VIDEO_MB}MBまで`}</div>

      <div className="px-4 pt-3">
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
        <div className="text-[13px] font-black mb-1.5">どのラウンドの投稿？</div>
        <select value={roundId} onChange={(e) => setRoundId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 border-border bg-card text-[16px]">
          <option value="">選ばない</option>
          {rounds.map((r) => <option key={r.id} value={r.id}>{r.when} {r.place}</option>)}
        </select>
      </div>
      <div className="mx-4 mt-4 px-3 py-2.5 rounded-xl bg-[#FFF6D9] text-[#7A5B00] text-[11.5px] font-bold leading-relaxed">
        テスト版：あなたにしか見えません。今のタイムラインやアルバムには入らず、メンションした人にも誰にも通知されません。<br />
        メンションした人のプロフィールには、その人が許可したときだけ出ます。
      </div>
    </div>
  );
}
