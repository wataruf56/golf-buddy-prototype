'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SnsTestBadge } from '@/components/sns/SnsParts';
import { toast } from '@/components/Toast';
import { resizeImage } from '@/lib/resizeImage';
import { regionOf } from '@/lib/snsRegions';
import { MAX_VIDEO_MB, MAX_VIDEO_SEC, isVideoFile, readVideo, uploadVideo } from '@/lib/snsVideoClient';

// ひとことを書く（テスト版・運営だけ・lib/snsTestTalk）。24時間で消える。
// 2026-11-01 本人指定：基本は文字だけ。「🗳 選択肢を追加」を押したときだけ答えを置ける。
//   「📷 写真・動画」で背景にでき、文字と選択肢はその上に出る。背景なしの文字だけ／文字なしの写真や動画だけでも載せられる（動画は60秒・200MBまで）。
const BG = ['#2A8C82', '#E8643C', '#6B5BB5', '#1E2B27', '#C2477A'];
const DEFAULT_CHOICES = ['行きたい', 'ピックアップしてくれるなら', '気になる'];

function dateLabel(v: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  const [y, m, d] = v.split('-').map(Number);
  return `${m}/${d}（${'日月火水木金土'[new Date(y, m - 1, d).getDay()]}）`;
}

export default function SnsNewStoryPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [ok, setOk] = useState<boolean | null>(null);
  const [text, setText] = useState('');
  const [bg, setBg] = useState(BG[0]);
  const [photo, setPhoto] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState('');
  const [progress, setProgress] = useState('');
  const uploaded = useRef('');   // 送り終えた動画の置き場所（やり直しのときは送らない）
  const [date, setDate] = useState('');
  const [showDate, setShowDate] = useState(false);
  const [poll, setPoll] = useState(false);
  const [choices, setChoices] = useState<string[]>(DEFAULT_CHOICES);
  const [scope, setScope] = useState<'all' | 'followers' | 'mutual'>('all');   // 基本は同じ地域（2026-11-02 本人指定）
  const [region, setRegion] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // テスト版を見られる人か（運営だけ）。見られない人には何も出さない
  useEffect(() => {
    fetch('/api/sns/user/me', { cache: 'no-store', credentials: 'include' }).then(async (r) => {
      if (r.ok) {
        const reg = regionOf((await r.json())?.user?.area);
        setRegion(reg);
        if (!reg) setScope('followers');   // エリアが「その他」や未設定の人は、同じ地域を選べない
      }
      setOk(r.ok);
    }).catch(() => setOk(false));
  }, []);
  if (ok === false) return <div className="text-center text-[13px] text-muted py-20">ページが見つかりません</div>;
  if (ok === null) return <div className="text-center text-[12px] text-muted py-20">読み込み中...</div>;

  function clearVideo() {
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoFile(null); setVideoPreview(''); uploaded.current = '';
  }
  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    clearVideo();
    if (isVideoFile(file)) {
      if (file.size > MAX_VIDEO_MB * 1024 * 1024) { toast(`動画は${MAX_VIDEO_MB}MBまでです`, 'error'); return; }
      const { poster, sec } = await readVideo(file);
      if (sec > MAX_VIDEO_SEC + 0.5) { toast(`動画は${MAX_VIDEO_SEC}秒までです`, 'error'); return; }
      setPhoto(poster); setVideoFile(file); setVideoPreview(URL.createObjectURL(file)); setErr('');
      return;
    }
    try {
      let img = await resizeImage(file, 1280, 0.8);
      if (img.length > 850_000) img = await resizeImage(file, 960, 0.7);
      if (img.length > 850_000) img = await resizeImage(file, 720, 0.6);
      setPhoto(img); setErr('');
    } catch { toast('写真を読み込めませんでした', 'error'); }
  }

  async function post() {
    if (busy) return;
    const cs = poll ? choices.map((c) => c.trim()).filter(Boolean) : [];
    if (!text.trim() && !photo) { setErr('ひとことを書くか、写真・動画を選んでください'); return; }
    if (poll && cs.length < 2) { setErr('選択肢は2つ以上入れてください（いらなければ「選択肢をやめる」）'); return; }
    setBusy(true); setErr('');
    try {
      if (videoFile && !uploaded.current) uploaded.current = await uploadVideo(videoFile, 's', (pct) => setProgress(`動画を送っています ${pct}%`));
      setProgress('');
      const r = await fetch('/api/sns/story', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ text, bg, date, choices: cs, scope, photo, video: uploaded.current }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'うまくいきませんでした');
      toast('ひとことを載せました');
      router.replace('/sns');
    } catch (e) { setErr((e as Error).message); setProgress(''); setBusy(false); }
  }

  const shownChoices = choices.map((c) => c.trim()).filter(Boolean);
  return (
    <div className="pb-10 bg-card min-h-screen">
      <div className="sticky top-0 z-20 bg-card border-b border-hair flex items-center px-3 h-12">
        <button type="button" onClick={() => router.back()} aria-label="閉じる" className="w-8 h-8 text-[22px] leading-none">×</button>
        <span className="text-[16px] font-black">ひとこと</span><SnsTestBadge />
        <button type="button" onClick={post} disabled={busy} className="ml-auto px-4 py-1.5 rounded-full bg-orange text-white text-[13px] font-black disabled:opacity-50">{busy ? '…' : '載せる'}</button>
      </div>

      {/* 仕上がり（ストーリーで見える形） */}
      <div className="relative mx-3 mt-3 rounded-[20px] overflow-hidden text-white" style={{ background: photo ? '#000' : bg, minHeight: photo ? 440 : 260 }}>
        {photo && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
            {videoPreview && <video src={videoPreview} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(rgba(0,0,0,0.15), rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.45))' }} />
          </>
        )}
        <div className="relative flex flex-col justify-center gap-2 px-4 py-5" style={{ minHeight: photo ? 440 : 260 }}>
          {dateLabel(date) && <span className="self-center px-3.5 py-1 rounded-full text-[14px] font-black" style={{ background: photo ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.22)' }}>📅 {dateLabel(date)}</span>}
          <textarea value={text} onChange={(e) => { setText(e.target.value); setErr(''); }} maxLength={80} rows={photo ? 3 : 4}
            placeholder={photo ? 'ひとことを書く（なくてもOK）' : '例：この日行きたいと思ってるんだけど、誰か行きたい人いる？'}
            className="w-full bg-transparent text-center text-[20px] font-black leading-relaxed resize-none outline-none placeholder:text-white/75"
            style={{ textShadow: photo ? '0 1px 6px rgba(0,0,0,0.6)' : undefined }} />
          {poll && (
            <div className="bg-white/95 rounded-2xl p-2 flex flex-col gap-1 text-text">
              {(shownChoices.length ? shownChoices : ['選択肢']).map((c, k) => (
                <div key={k} className="rounded-xl border-2 border-[#EAE4D8] px-3 py-2 text-[13px] font-black">{c}</div>
              ))}
            </div>
          )}
          <div className="text-right text-[10.5px] text-white/80">{text.length}/80</div>
        </div>
      </div>
      {progress && <div className="px-4 pt-2 text-[12px] font-black text-green">{progress}</div>}
      {err && <div className="px-4 pt-2 text-[12px] font-black text-red">{err}</div>}

      {/* 道具：写真・選択肢・日付 */}
      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="flex gap-2 px-3 pt-3 flex-wrap">
        <button type="button" onClick={() => fileRef.current?.click()} className="px-3.5 py-2 rounded-full border-2 border-border text-[12.5px] font-black">📷 {photo ? (videoFile ? '動画を変える' : '写真を変える') : '写真・動画'}</button>
        {photo && <button type="button" onClick={() => { setPhoto(''); clearVideo(); }} className="px-3.5 py-2 rounded-full bg-bg text-[12.5px] font-black text-sub">{videoFile ? '動画を外す' : '写真を外す'}</button>}
        <button type="button" onClick={() => { setPoll(!poll); setErr(''); }}
          className={`px-3.5 py-2 rounded-full border-2 text-[12.5px] font-black ${poll ? 'border-green bg-green-light text-green' : 'border-border'}`}>🗳 {poll ? '選択肢をやめる' : '選択肢を追加'}</button>
        <button type="button" onClick={() => { if (showDate) setDate(''); setShowDate(!showDate); }}
          className={`px-3.5 py-2 rounded-full border-2 text-[12.5px] font-black ${showDate ? 'border-green bg-green-light text-green' : 'border-border'}`}>📅 {showDate ? '日付を外す' : '日付'}</button>
      </div>

      {!photo && (
        <div className="flex gap-2.5 px-4 pt-3 items-center">
          <span className="text-[11.5px] font-bold text-sub">背景の色</span>
          {BG.map((c) => (
            <button key={c} type="button" onClick={() => setBg(c)} aria-label="背景の色" className="w-7 h-7 rounded-full border-[3px] border-card"
              style={{ background: c, boxShadow: c === bg ? '0 0 0 2.5px #1E2B27' : '0 0 0 1.5px #D6CFC0' }} />
          ))}
        </div>
      )}

      {showDate && (
        <div className="px-4 pt-3">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border-2 border-border bg-card text-[13.5px]" />
        </div>
      )}

      {poll && (
        <div className="px-4 pt-4">
          <div className="text-[13px] font-black mb-1.5">見た人が選べる答え（2〜4つ）</div>
          {choices.map((c, k) => (
            <div key={k} className="flex gap-1.5 mb-1.5">
              <input value={c} maxLength={16} onChange={(e) => setChoices(choices.map((x, j) => (j === k ? e.target.value : x)))} placeholder={`答え ${k + 1}`}
                className="flex-1 px-3 py-2 rounded-xl border-2 border-border bg-card text-[13.5px]" />
              {choices.length > 2 && <button type="button" onClick={() => setChoices(choices.filter((_, j) => j !== k))} aria-label="この答えを消す" className="w-10 rounded-xl bg-bg text-[16px]">×</button>}
            </div>
          ))}
          {choices.length < 4 && <button type="button" onClick={() => setChoices([...choices, ''])} className="w-full py-2 rounded-xl border-2 border-dashed border-border text-[12.5px] font-black text-sub">＋ 答えを追加</button>}
        </div>
      )}

      <div className="px-4 pt-4">
        <div className="text-[13px] font-black mb-1.5">見られる人</div>
        <div className="flex gap-1.5 flex-wrap">
          {([['all', region ? `同じ地域（${region}）の20〜30代` : '同じ地域（プロフィールのエリアを選ぶと使えます）'], ['followers', 'フォロワーだけ'], ['mutual', '相互フォローだけ']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setScope(k)} disabled={k === 'all' && !region}
              className={`disabled:opacity-50 px-3 py-1.5 rounded-full text-[12px] font-black border-[1.5px] ${scope === k ? 'bg-green-light text-green border-green' : 'bg-bg text-sub border-transparent'}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="mx-4 mt-4 px-3 py-2.5 rounded-xl bg-[#FFF6D9] text-[#7A5B00] text-[11.5px] font-bold leading-relaxed">
        24時間で消えます。動画は{MAX_VIDEO_SEC}秒・{MAX_VIDEO_MB}MBまでです。見た人と、どの答えを押したかは、あなたにだけ見えます。答えを押してくれた人には、フォローしていなくてもDMを送れます。<br />
        テスト版：あなたにしか見えません。見た人・答えた人は、ひとことの「反応」から「テスト用の人」で試せます。
      </div>
    </div>
  );
}
