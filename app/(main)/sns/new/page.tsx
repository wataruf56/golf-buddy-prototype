'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SnsTestBadge } from '@/components/sns/SnsParts';
import { toast } from '@/components/Toast';

// ひとことを書く（テスト版・運営だけ・2026-11-01・lib/snsTestTalk）。
// 文字（80字まで）＋背景の色＋日付（任意）＋見た人が選べる答え（0〜4つ。全部消すと文字だけのひとこと）＋見られる人。24時間で消える。
const BG = ['#2A8C82', '#E8643C', '#6B5BB5', '#1E2B27', '#C2477A'];
const DEFAULT_CHOICES = ['行きたい', 'ピックアップしてくれるなら', '気になる'];

function dateLabel(v: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  const [y, m, d] = v.split('-').map(Number);
  return `${m}/${d}（${'日月火水木金土'[new Date(y, m - 1, d).getDay()]}）`;
}

export default function SnsNewStoryPage() {
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);
  const [text, setText] = useState('');
  const [bg, setBg] = useState(BG[0]);
  const [date, setDate] = useState('');
  const [choices, setChoices] = useState<string[]>(DEFAULT_CHOICES);
  const [scope, setScope] = useState<'followers' | 'all'>('followers');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // テスト版を見られる人か（運営だけ）。見られない人には何も出さない
  useEffect(() => {
    fetch('/api/sns/user/me', { cache: 'no-store', credentials: 'include' }).then((r) => setOk(r.ok)).catch(() => setOk(false));
  }, []);
  if (ok === false) return <div className="text-center text-[13px] text-muted py-20">ページが見つかりません</div>;
  if (ok === null) return <div className="text-center text-[12px] text-muted py-20">読み込み中...</div>;

  async function post() {
    if (busy) return;
    if (!text.trim()) { setErr('ひとことを入力してください'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/sns/story', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ text, bg, date, choices, scope }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'うまくいきませんでした');
      toast('ひとことを載せました');
      router.replace('/sns');
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <div className="pb-10 bg-card min-h-screen">
      <div className="sticky top-0 z-20 bg-card border-b border-hair flex items-center px-3 h-12">
        <button type="button" onClick={() => router.back()} aria-label="閉じる" className="w-8 h-8 text-[22px] leading-none">×</button>
        <span className="text-[16px] font-black">ひとこと</span><SnsTestBadge />
        <button type="button" onClick={post} disabled={busy} className="ml-auto px-4 py-1.5 rounded-full bg-orange text-white text-[13px] font-black disabled:opacity-50">{busy ? '…' : '載せる'}</button>
      </div>

      <div className="mx-3 mt-3 rounded-[20px] px-4 py-5 min-h-[210px] flex flex-col justify-center gap-2 text-white" style={{ background: bg }}>
        {dateLabel(date) && <span className="self-center px-3.5 py-1 rounded-full text-[14px] font-black" style={{ background: 'rgba(255,255,255,0.22)' }}>📅 {dateLabel(date)}</span>}
        <textarea value={text} onChange={(e) => { setText(e.target.value); setErr(''); }} maxLength={80} rows={4}
          placeholder="例：この日行きたいと思ってるんだけど、誰か行きたい人いる？"
          className="w-full bg-transparent text-center text-[20px] font-black leading-relaxed resize-none outline-none placeholder:text-white/70" />
        <div className="text-right text-[10.5px] text-white/75">{text.length}/80</div>
      </div>
      {err && <div className="px-4 pt-2 text-[12px] font-black text-red">{err}</div>}

      <div className="flex gap-2.5 px-4 pt-3">
        {BG.map((c) => (
          <button key={c} type="button" onClick={() => setBg(c)} aria-label="背景の色" className="w-8 h-8 rounded-full border-[3px] border-card"
            style={{ background: c, boxShadow: c === bg ? '0 0 0 2.5px #1E2B27' : '0 0 0 1.5px #D6CFC0' }} />
        ))}
      </div>

      <div className="px-4 pt-4">
        <div className="text-[13px] font-black mb-1.5">日付をつける（なくてもOK）</div>
        <div className="flex gap-2 items-center">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1 px-3 py-2 rounded-xl border-2 border-border bg-card text-[13.5px]" />
          {date && <button type="button" onClick={() => setDate('')} className="px-3 py-2 rounded-xl bg-bg text-[12px] font-bold">外す</button>}
        </div>
      </div>

      <div className="px-4 pt-4">
        <div className="text-[13px] font-black mb-1.5">見た人が選べる答え（4つまで）</div>
        {choices.map((c, k) => (
          <div key={k} className="flex gap-1.5 mb-1.5">
            <input value={c} maxLength={16} onChange={(e) => setChoices(choices.map((x, j) => (j === k ? e.target.value : x)))} placeholder={`答え ${k + 1}`}
              className="flex-1 px-3 py-2 rounded-xl border-2 border-border bg-card text-[13.5px]" />
            <button type="button" onClick={() => setChoices(choices.filter((_, j) => j !== k))} aria-label="この答えを消す" className="w-10 rounded-xl bg-bg text-[16px]">×</button>
          </div>
        ))}
        {choices.length < 4 && <button type="button" onClick={() => setChoices([...choices, ''])} className="w-full py-2 rounded-xl border-2 border-dashed border-border text-[12.5px] font-black text-sub">＋ 答えを追加</button>}
        <div className="text-[11px] text-sub mt-1.5">{choices.filter((c) => c.trim()).length === 0 ? '答えなし＝文字だけのひとことになります。' : '答えを全部消すと、文字だけのひとことになります。'}</div>
      </div>

      <div className="px-4 pt-4">
        <div className="text-[13px] font-black mb-1.5">見られる人</div>
        <div className="flex gap-1.5">
          {([['followers', 'フォロワーだけ'], ['all', 'みんな（同じ地域の20〜30代）']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setScope(k)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-black border-[1.5px] ${scope === k ? 'bg-green-light text-green border-green' : 'bg-bg text-sub border-transparent'}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="mx-4 mt-4 px-3 py-2.5 rounded-xl bg-[#FFF6D9] text-[#7A5B00] text-[11.5px] font-bold leading-relaxed">
        24時間で消えます。見た人と、どの答えを押したかは、あなたにだけ見えます。答えを押してくれた人には、フォローしていなくてもDMを送れます。<br />
        テスト版：あなたにしか見えません。見た人・答えた人は、ひとことの「反応」から「テスト用の人」で試せます。
      </div>
    </div>
  );
}
