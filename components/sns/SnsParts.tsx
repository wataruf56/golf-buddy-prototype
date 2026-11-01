'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import { Portal } from '@/components/Portal';
import { toast } from '@/components/Toast';

// インスタ風のテスト版（2026-10-31・運営だけ・lib/snsTest）で使う部品。既存の画面からは使わない。
export type SnsUser = { id: string; name: string; avatar: string; avatarUrl?: string; avatarMode?: string; color: string; golmotiType?: string; gender?: string; age?: number; area?: string; car?: string };
export type TextStory = {
  kind: 'text'; id: string; user: SnsUser; text: string; bg: string; date: string; dateLabel: string; choices: string[];
  counts: number[]; myAnswer: number | null; mine: boolean; views: number; answers: number; at: number; scope: 'followers' | 'mutual' | 'all'; persona: boolean;
  photo: string;   // 背景の写真（無ければ ''）。動画のときはその表紙
  video?: string;  // 背景の動画（署名URL）
};
export type Story =
  | { kind: 'avail'; user: SnsUser; dates: { date: string; label: string; count: number }[] }
  | { kind: 'recent'; user: SnsUser; roundId: string; place: string; when: string; photos: string[]; with: SnsUser[] }
  | TextStory;   // ひとこと（2026-11-01・lib/snsTestTalk）

export const agoLabel = (at: number) => {
  const m = Math.floor((Date.now() - at) / 60000);
  if (m < 1) return 'たった今';
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}時間前` : `${Math.floor(h / 24)}日前`;
};
const isTestPerson = (id: string) => id.startsWith('snsp_');
/** 名前を押したときの行き先。テスト用の人にはプロフィールが無いので押せない */
export const snsUserHref = (id: string) => (isTestPerson(id) ? '' : `/sns/u/${id}`);

export const testOnly = (what = 'テスト版のため保存されません') => toast(what);

/** 投稿の文章。メンションされた人の「@名前」をプロフィールへのリンクにする（名前に空白があっても切れない・長い名前を先に見る） */
export function CaptionText({ text, mentions }: { text: string; mentions?: SnsUser[] }) {
  const list = (mentions || []).filter((u) => u.name).sort((a, b) => b.name.length - a.name.length);
  if (!list.length) return <>{text}</>;
  const re = new RegExp(`(${list.map((u) => `@${u.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).join('|')})`, 'g');
  return (
    <>
      {text.split(re).map((part, k) => {
        const u = list.find((x) => `@${x.name}` === part);
        return u ? <Link key={k} href={`/sns/u/${u.id}`} className="text-green font-bold">{part}</Link> : <span key={k}>{part}</span>;
      })}
    </>
  );
}

/** 投稿の1枚分。video があれば動画（src はその表紙）、無ければ写真 */
export function PostMedia({ src, video, className, style, onClick, onDoubleClick }: { src: string; video?: string; className?: string; style?: CSSProperties; onClick?: () => void; onDoubleClick?: () => void }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (!video) return <img src={src} alt="" loading="lazy" onClick={onClick} onDoubleClick={onDoubleClick} className={className} style={style} />;
  return <video src={video} poster={src} controls playsInline preload="metadata" className={`${className || ''} bg-black`} style={style} />;
}

/** 輪っか付きのアイコン。ring: 'orange'=行ける日 / 'green'=最近ラウンド / なし */
export function RingAvatar({ user, size = 58, ring }: { user: SnsUser | undefined; size?: number; ring?: 'orange' | 'green' | null }) {
  const color = ring === 'orange' ? '#E8643C' : ring === 'green' ? '#2A8C82' : 'transparent';
  return (
    <span className="inline-flex rounded-full p-[2px] flex-shrink-0" style={{ border: `2.5px solid ${color}` }}>
      <span className="inline-flex rounded-full bg-card p-[1.5px]"><Avatar user={user as any} size={size - 9} /></span>
    </span>
  );
}

export function SnsTestBadge() {
  return <span className="ml-1.5 px-2 py-0.5 rounded-full bg-[#FFF6D9] border border-[#E9CF7A] text-[10px] font-black text-[#7A5B00] align-middle">テスト版・あなただけ</span>;
}

/** ストーリーを全画面で見る。左右タップで前後、5秒で次へ。写真がある「最近のラウンド」は写真ごとに進む */
export function StoryViewer({ stories, start, onClose, onChanged }: { stories: Story[]; start: number; onClose: () => void; onChanged?: () => void }) {
  const [i, setI] = useState(start);
  const [seg, setSeg] = useState(0);
  const [t, setT] = useState(0);
  // ひとことに答えた結果（その場で反映）と、反応のシート
  const [local, setLocal] = useState<Record<string, { counts: number[]; myAnswer: number }>>({});
  const [statsFor, setStatsFor] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [muted, setMuted] = useState(true);   // 自動再生は音なしでしか始められない（iPhone）。右上のボタンで音を出す
  const videoRef = useRef<HTMLVideoElement>(null);
  // iPhone は押した瞬間に直接音を出して再生し直さないと、止まることがある
  const toggleSound = () => { const v = videoRef.current; if (v) { v.muted = !muted; v.play().catch(() => {}); } setMuted(!muted); };
  const base = stories[i];
  const s: Story | undefined = base && base.kind === 'text' && local[base.id] ? { ...base, ...local[base.id] } : base;
  const textRef = useRef(false);
  textRef.current = s?.kind === 'text' || !!statsFor;
  const segs = s?.kind === 'recent' ? Math.max(1, s.photos.length) : 1;
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const next = () => { if (seg + 1 < segs) { setSeg(seg + 1); setT(0); } else if (i + 1 < stories.length) { setI(i + 1); setSeg(0); setT(0); } else onClose(); };
  const prev = () => { if (seg > 0) { setSeg(seg - 1); setT(0); } else if (i > 0) { setI(i - 1); setSeg(0); setT(0); } else setT(0); };
  useEffect(() => {
    // ひとことは自動で進めない（答えを選ぶ・読む時間を取る）。左右のタップで進む
    timer.current = setInterval(() => { if (!textRef.current) setT((x) => x + 50); }, 50);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);
  useEffect(() => { if (t >= 5000) next(); }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const prevOv = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prevOv; }; }, []);
  // テスト用の人のひとことを開いたら「見た」を残す
  const viewedId = s && s.kind === 'text' && !s.mine ? s.id : '';
  useEffect(() => {
    if (!viewedId) return;
    fetch(`/api/sns/story/${viewedId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'view' }) }).catch(() => {});
  }, [viewedId]);
  if (!s) return null;
  const bg = s.kind === 'text' ? s.bg : s.kind === 'avail' ? '#1F4A40' : '#24452A';

  async function answer(st: TextStory, c: number) {
    if (st.mine || st.myAnswer != null) return;
    try {
      const r = await fetch(`/api/sns/story/${st.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'answer', c }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setLocal((m) => ({ ...m, [st.id]: { counts: j.counts, myAnswer: j.myAnswer } }));
      toast(`「${st.choices[c]}」で回答しました`);
      setTimeout(() => { toast(`✉️ ${st.user.name}さんからメッセージが届きました`); onChanged?.(); }, 2500);
    } catch { toast('うまくいきませんでした', 'error'); }
  }
  async function sendReply(st: TextStory) {
    const v = reply.trim();
    if (!v) return;
    try {
      const r = await fetch(`/api/sns/dm/${st.user.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ text: v, story: st.id }) });
      if (!r.ok) throw new Error();
      setReply('');
      toast('送りました（テスト版のDMに入ります）');
      onChanged?.();
    } catch { toast('うまくいきませんでした', 'error'); }
  }
  return (
    <Portal>
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black">
        <div className="relative w-full max-w-[480px] h-full flex flex-col" style={{ background: s.kind === 'text' && s.photo ? '#000' : bg }}>
          {/* ひとことの写真は全面の背景（文字と選択肢はその上） */}
          {s.kind === 'text' && s.photo && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
              {s.video && <video ref={videoRef} key={s.id} src={s.video} poster={s.photo} autoPlay loop muted={muted} playsInline className="absolute inset-0 w-full h-full object-cover" />}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.05) 60%, rgba(0,0,0,0.55))' }} />
            </>
          )}
          <div className="relative flex gap-1 px-3 pt-3">
            {Array.from({ length: segs }).map((_, k) => (
              <div key={k} className="h-[3px] flex-1 rounded-full bg-white/30 overflow-hidden">
                <div className="h-full bg-white" style={{ width: k < seg ? '100%' : k === seg ? `${Math.min(100, t / 50)}%` : '0%' }} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 relative z-10">
            {snsUserHref(s.user.id) ? (
              <Link href={snsUserHref(s.user.id)} className="flex items-center gap-2 min-w-0">
                <Avatar user={s.user as any} size={32} />
                <span className="text-white text-[13px] font-black truncate">{s.user.name}</span>
              </Link>
            ) : (
              <span className="flex items-center gap-2 min-w-0"><Avatar user={s.user as any} size={32} /><span className="text-white text-[13px] font-black truncate">{s.user.name}</span></span>
            )}
            <span className="text-white/70 text-[11px] font-bold whitespace-nowrap">{s.kind === 'text' ? `ひとこと・${agoLabel(s.at)}${s.mine ? (s.scope === 'all' ? '・同じ地域' : s.scope === 'mutual' ? '・相互フォロー' : '・フォロワー') : ''}` : s.kind === 'avail' ? '行ける日' : `${s.when} のラウンド`}</span>
            {s.kind === 'text' && s.video && <button type="button" onClick={toggleSound} aria-label={muted ? '音を出す' : '音を消す'} className="ml-auto w-9 h-9 text-[18px] leading-none flex-shrink-0">{muted ? '🔇' : '🔊'}</button>}
            <button type="button" onClick={onClose} aria-label="閉じる" className={`${s.kind === 'text' && s.video ? '' : 'ml-auto '}w-9 h-9 text-white text-[22px] leading-none`}>×</button>
          </div>

          <div className="flex-1 relative">
            {/* 左右タップ */}
            <button type="button" aria-label="前へ" onClick={prev} className="absolute left-0 top-0 bottom-0 w-1/3 z-[1]" />
            <button type="button" aria-label="次へ" onClick={next} className="absolute right-0 top-0 bottom-0 w-2/3 z-[1]" />
            {s.kind === 'text' ? (
              <div className="h-full flex flex-col justify-center px-6 text-white">
                {s.dateLabel && <span className="self-center relative z-[2] px-3.5 py-1 rounded-full text-[14px] font-black mb-3" style={{ background: s.photo ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.22)' }}>📅 {s.dateLabel}</span>}
                {s.text && <div className="relative z-[2] text-center text-[22px] font-black leading-relaxed whitespace-pre-wrap break-words" style={{ textShadow: s.photo ? '0 1px 6px rgba(0,0,0,0.6)' : undefined }}>{s.text}</div>}
                {s.choices.length > 0 && (() => {
                  const total = s.counts.reduce((a, b) => a + b, 0);
                  const showRes = s.mine || s.myAnswer != null;
                  return (
                    <div className="relative z-[2] mt-5 bg-white rounded-2xl p-2.5 flex flex-col gap-1.5 text-text">
                      {s.choices.map((c, k) => {
                        const pct = total ? Math.round((s.counts[k] / total) * 100) : 0;
                        return (
                          <button key={k} type="button" disabled={showRes} onClick={() => answer(s, k)}
                            className={'relative overflow-hidden rounded-xl border-2 px-3 py-2.5 text-left text-[14px] font-black flex justify-between gap-2 ' + (s.myAnswer === k ? 'border-green' : 'border-[#EAE4D8]')}>
                            {showRes && <span className="absolute left-0 top-0 bottom-0 bg-green-light" style={{ width: `${pct}%` }} />}
                            <span className="relative">{s.myAnswer === k ? '✓ ' : ''}{c}</span>
                            {showRes && <span className="relative">{s.mine ? `${s.counts[k]}人` : `${pct}%`}</span>}
                          </button>
                        );
                      })}
                      <div className="text-[11px] text-sub text-center">{s.mine ? `${total}人が回答・誰が押したかはあなたにだけ見えます` : s.myAnswer != null ? `回答しました。${s.user.name}さんからDMが届くことがあります` : '押すと、投稿した人にだけ名前つきで伝わります'}</div>
                    </div>
                  );
                })()}
              </div>
            ) : s.kind === 'avail' ? (
              <div className="h-full flex flex-col items-center justify-center px-6 text-center text-white">
                <div className="text-[40px]">📅</div>
                <div className="text-[13px] font-bold text-white/80 mt-1">{s.user.name}さんが行ける日</div>
                <div className="mt-4 w-full max-w-[300px] space-y-2">
                  {s.dates.map((d) => (
                    <div key={d.date} className="flex items-center justify-between bg-white/12 rounded-xl px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.12)' }}>
                      <span className="text-[20px] font-black">{d.label}</span>
                      <span className="text-[11px] font-bold text-white/80">この日 {d.count}人</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 mt-4 flex-wrap justify-center">
                  {s.user.area && <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: 'rgba(255,255,255,0.15)' }}>{s.user.area}</span>}
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: 'rgba(255,255,255,0.15)' }}>{s.user.car === 'have' ? '車あり' : '車なし'}</span>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col justify-center">
                {s.photos.length ? (
                  <img src={s.photos[Math.min(seg, s.photos.length - 1)]} alt="" className="w-full max-h-[62vh] object-contain" />
                ) : (
                  <div className="mx-6 rounded-2xl py-14 text-center text-white" style={{ background: 'rgba(255,255,255,0.10)' }}>
                    <div className="text-[44px]">⛳</div>
                    <div className="text-[16px] font-black mt-2">{s.place}</div>
                    <div className="text-[12px] font-bold text-white/80 mt-1">{s.when}</div>
                  </div>
                )}
                <div className="px-5 mt-3 text-white">
                  <div className="text-[13px] font-black">{s.place}</div>
                  {s.with.length > 0 && <div className="text-[11.5px] font-bold text-white/80 mt-0.5">一緒に回った：{s.with.slice(0, 5).map((u) => `@${u.name}`).join(' ')}{s.with.length > 5 ? ` ほか${s.with.length - 5}人` : ''}</div>}
                </div>
              </div>
            )}
          </div>

          <div className="px-4 pb-6 pt-2 relative z-10">
            {s.kind === 'text' ? (
              s.mine ? (
                <>
                  <button type="button" onClick={() => setStatsFor(s.id)} className="w-full flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-white text-text text-[13.5px] font-black">
                    👁 見た人 {s.views}<span className="text-muted">・</span>🗳 回答 {s.answers}<span className="ml-auto text-muted">›</span>
                  </button>
                  <div className="text-center text-[10.5px] text-white/80 mt-1.5">答えてくれた人には、ここからDMを送れます</div>
                </>
              ) : (
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); sendReply(s); }}>
                  <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`${s.user.name}さんにメッセージ`}
                    className="flex-1 min-w-0 rounded-full border-[1.5px] border-white/70 bg-black/10 px-4 py-2.5 text-[13px] text-white placeholder:text-white/70" />
                  <button type="submit" className="px-4 rounded-full bg-white text-text text-[13px] font-black">送る</button>
                </form>
              )
            ) : s.kind === 'avail' ? (
              <>
                <Link href="/availability" className="block w-full py-3 rounded-full bg-orange text-white text-center text-[14px] font-black">私も行ける（行ける日を開く）</Link>
                <div className="text-center text-[10.5px] text-white/60 mt-1.5">左右をタップで前後の人へ</div>
              </>
            ) : (
              <>
                <div className="flex justify-center gap-2 mb-2">
                  {['⛳ ナイスショット', '🙌 また回ろう', '👏'].map((r) => (
                    <button key={r} type="button" onClick={() => testOnly('テスト版のため送られません')} className="px-3 py-1.5 rounded-full text-white text-[12px] font-bold" style={{ background: 'rgba(255,255,255,0.18)' }}>{r}</button>
                  ))}
                </div>
                <button type="button" onClick={() => testOnly('相互フォローの人にはここからDMを送れる想定です（テスト版では送りません）')} className="w-full text-left px-4 py-2.5 rounded-full border border-white/50 text-white/70 text-[12.5px]">メッセージを送る（相互フォローのみ）</button>
              </>
            )}
          </div>
        </div>
      </div>
      {statsFor && <StoryStatsSheet id={statsFor} onClose={() => setStatsFor(null)} onChanged={() => onChanged?.()} onDeleted={() => { setStatsFor(null); onChanged?.(); onClose(); }} />}
    </Portal>
  );
}

type StatsData = {
  story: TextStory;
  answers: { user: SnsUser; c: number; at: number; thread: boolean }[];
  views: { user: SnsUser; at: number; answer: number | null }[];
};
/** 自分のひとことの反応：答え（答えごとに誰が）／見た人。答えてくれた人にはDMを送れる */
function StoryStatsSheet({ id, onClose, onChanged, onDeleted }: { id: string; onClose: () => void; onChanged: () => void; onDeleted: () => void }) {
  const [d, setD] = useState<StatsData | null>(null);
  const [tab, setTab] = useState<'ans' | 'seen'>('ans');
  const [busy, setBusy] = useState(false);
  const [delArmed, setDelArmed] = useState(false);
  const load = () => fetch(`/api/sns/story/${id}`, { cache: 'no-store', credentials: 'include' }).then((r) => r.json()).then(setD).catch(() => {});
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const post = async (action: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/sns/story/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action }) });
      const j = await r.json();
      if (!r.ok) throw new Error();
      return j;
    } finally { setBusy(false); }
  };
  const simulate = async () => {
    try { const j = await post('simulate'); toast(j.added ? `テスト用の人 ${j.added}人の反応を入れました` : 'テスト用の人は全員見ました'); await load(); onChanged(); }
    catch { toast('うまくいきませんでした', 'error'); }
  };
  const del = async () => {
    if (!delArmed) { setDelArmed(true); return; }
    try { await post('delete'); toast('ひとことを消しました'); onDeleted(); } catch { toast('うまくいきませんでした', 'error'); }
  };
  const total = d ? d.answers.length || 1 : 1;
  return (
    <div className="fixed inset-0 z-[310] bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[480px] max-h-[84vh] bg-card rounded-t-3xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="pt-2.5 pb-2 text-center border-b border-hair">
          <div className="w-10 h-1 rounded-full bg-border/30 mx-auto mb-2" />
          <div className="text-[15px] font-black">ひとことの反応</div>
        </div>
        <div className="flex border-b border-hair">
          {([['ans', `回答 ${d?.answers.length ?? '…'}`], ['seen', `見た人 ${d?.views.length ?? '…'}`]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`flex-1 py-2.5 text-[12.5px] font-black ${tab === k ? 'border-b-2 border-text' : 'text-muted'}`}>{l}</button>
          ))}
        </div>
        <div className="overflow-y-auto pb-6">
          {!d ? <div className="text-center text-[12px] text-muted py-10">読み込み中...</div> : tab === 'ans' ? (
            <>
              <div className="mx-3.5 mt-3 px-3 py-2 rounded-xl bg-[#FFF6D9] text-[#7A5B00] text-[11.5px] font-bold leading-relaxed">答えを押してくれた人には、フォローしていなくてもDMを送れます。</div>
              {d.story.choices.length === 0 && <div className="text-center text-[12px] text-muted py-8">答えなしのひとことです（「見た人」を見てください）</div>}
              {d.story.choices.map((c, k) => {
                const list = d.answers.filter((a) => a.c === k);
                return (
                  <div key={k}>
                    <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-[13px] font-black">
                      <span>{c}</span>
                      <span className="flex-1 h-1.5 rounded-full bg-bg overflow-hidden"><span className="block h-full bg-green" style={{ width: `${Math.round((list.length / total) * 100)}%` }} /></span>
                      <span className="text-[11px] text-sub">{list.length}人</span>
                    </div>
                    {list.length === 0 ? <div className="px-4 py-1.5 text-[11px] text-muted">まだいません</div> : list.map((a) => (
                      <div key={a.user.id} className="flex items-center gap-2.5 px-4 py-2">
                        <Avatar user={a.user as any} size={36} />
                        <div className="flex-1 min-w-0"><div className="text-[13px] font-black truncate">{a.user.name}</div><div className="text-[10.5px] text-muted">{agoLabel(a.at)}</div></div>
                        <Link href={`/sns/dm/${a.user.id}?story=${id}`} className={`px-3.5 py-1.5 rounded-full text-[12px] font-black ${a.thread ? 'bg-bg' : 'bg-green text-white'}`}>{a.thread ? 'DMを開く' : 'DMを送る'}</Link>
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          ) : (
            <>
              <div className="mx-3.5 mt-3 px-3 py-2 rounded-xl bg-[#FFF6D9] text-[#7A5B00] text-[11.5px] font-bold leading-relaxed">見た人は、あなたにだけ見えます。</div>
              {d.views.length === 0 && <div className="text-center text-[12px] text-muted py-8">まだ誰も見ていません</div>}
              {d.views.map((v) => (
                <div key={v.user.id} className="flex items-center gap-2.5 px-4 py-2">
                  <Avatar user={v.user as any} size={36} />
                  <div className="flex-1 min-w-0"><div className="text-[13px] font-black truncate">{v.user.name}</div><div className="text-[10.5px] text-muted">{agoLabel(v.at)}</div></div>
                  {v.answer != null && <span className="px-2 py-0.5 rounded-full bg-green-light text-green text-[10.5px] font-black">{d.story.choices[v.answer]}</span>}
                </div>
              ))}
            </>
          )}
          <div className="px-4 pt-4 flex flex-col gap-2">
            <button type="button" disabled={busy} onClick={simulate} className="w-full py-2.5 rounded-xl border-2 border-dashed border-[#E9CF7A] bg-[#FFF6D9] text-[#7A5B00] text-[12.5px] font-black">🧪 テスト用の人の反応を入れてみる</button>
            <div className="text-[10.5px] text-muted leading-relaxed text-center">テスト版はあなたにしか見えないので、見た人・答えた人は「テスト用の人」（名前に（テスト）付き・実在しない）で試します。</div>
            <button type="button" disabled={busy} onClick={del} className={`w-full py-2 rounded-xl text-[12px] font-black ${delArmed ? 'bg-red-50 text-red-600 border-2 border-red-300' : 'text-sub'}`}>{delArmed ? 'もう一度押すと消します' : '🗑 このひとことを消す'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

