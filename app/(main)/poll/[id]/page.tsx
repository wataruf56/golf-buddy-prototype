'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getMe, store, useStore } from '@/lib/store';
import { toast } from '@/components/Toast';
import { Avatar } from '@/components/Avatar';
import { track } from '@/lib/telemetry';
import { formatDate } from '@/lib/utils';
import { readApiError } from '@/lib/apiError';
import type { SchedulePoll, User, ScheduleAnswer } from '@/lib/types';

// プロフィール保存済みの近似判定（年齢が入っていれば保存済み）。募集参加と同じ基準。
function isProfileComplete(age?: number): boolean {
  return typeof age === 'number' && age > 0;
}

const ANSWER_META: Record<ScheduleAnswer, { mark: string; label: string; cls: string; btn: string }> = {
  ok: { mark: '◯', label: '参加できる', cls: 'text-green', btn: 'bg-green text-white border-green' },
  maybe: { mark: '△', label: '調整できる', cls: 'text-orange', btn: 'bg-orange text-white border-orange' },
  no: { mark: '✕', label: '不可', cls: 'text-muted', btn: 'bg-sub text-white border-sub' },
};
const ANSWER_ORDER: ScheduleAnswer[] = ['ok', 'maybe', 'no'];

export default function PollPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meId = useStore((s) => s.meId);
  const hydrated = useStore((s) => s.hydrated);
  const me = useStore(getMe);
  const profileReady = isProfileComplete(me?.age);

  const [poll, setPoll] = useState<SchedulePoll | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const [busy, setBusy] = useState(false);

  // 候補日の複数選択（カレンダーでまとめて選ぶ）。
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [myAnswers, setMyAnswers] = useState<Record<string, ScheduleAnswer>>({});
  const [myComment, setMyComment] = useState('');

  const pollPath = `/poll/${params.id}`;

  async function load() {
    try {
      const r = await fetch(`/api/polls/${encodeURIComponent(params.id)}`, { cache: 'no-store' });
      if (r.status === 404) { setState('notfound'); return; }
      if (!r.ok) { setState('error'); return; }
      const j = await r.json();
      setPoll(j.poll || null);
      setUsers(Array.isArray(j.users) ? j.users : []);
      setState('ready');
    } catch {
      setState('error');
    }
  }

  useEffect(() => {
    if (!params.id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const isOwner = !!poll && poll.ownerId === meId;

  useEffect(() => {
    if (!poll || !meId) return;
    const mine = (poll.responses || []).find((x) => x.userId === meId);
    setMyAnswers(mine?.answers || {});
    setMyComment(mine?.comment || '');
  }, [poll, meId]);

  const userMap = useMemo(() => {
    const m: Record<string, User> = {};
    for (const u of users) m[u.id] = u;
    return m;
  }, [users]);

  const tallies = useMemo(() => {
    const t: Record<string, { ok: number; maybe: number; no: number }> = {};
    for (const o of poll?.options || []) t[o.id] = { ok: 0, maybe: 0, no: 0 };
    for (const r of poll?.responses || []) {
      for (const [optId, a] of Object.entries(r.answers || {})) {
        if (t[optId]) t[optId][a]++;
      }
    }
    return t;
  }, [poll]);

  const bestOptionId = useMemo(() => {
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const o of poll?.options || []) {
      const t = tallies[o.id];
      if (!t) continue;
      const score = t.ok * 2 + t.maybe - t.no * 2;
      if (t.ok + t.maybe > 0 && score > bestScore) { bestScore = score; best = o.id; }
    }
    return best;
  }, [poll, tallies]);

  function ensureReady(): boolean {
    if (!meId) {
      router.push(`/liff?to=${encodeURIComponent(pollPath)}`);
      return false;
    }
    if (!profileReady) {
      toast('回答にはプロフィール登録が必要です');
      router.push(`/mypage/edit?returnTo=${encodeURIComponent(pollPath)}`);
      return false;
    }
    return true;
  }

  async function callApi(bodyObj: Record<string, unknown>): Promise<SchedulePoll | null> {
    setBusy(true);
    try {
      const res = await fetch(`/api/polls/${encodeURIComponent(params.id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj), cache: 'no-store',
      });
      if (!res.ok) { toast(await readApiError(res), 'error'); return null; }
      const j = await res.json();
      if (j.poll) setPoll(j.poll);
      return j.poll || null;
    } catch (e) {
      toast((e as Error).message, 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }

  function toggleDate(d: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  }

  async function addSelectedDates() {
    if (!ensureReady()) return;
    const dates = Array.from(selectedDates).sort();
    if (dates.length === 0) { toast('日付を選んでください', 'error'); return; }
    const p = await callApi({ action: 'add-options', dates });
    if (p) { setSelectedDates(new Set()); track('poll_add_options', { pollId: params.id, count: dates.length }); }
  }

  async function removeOption(optionId: string) {
    if (!confirm('この候補日を削除しますか？')) return;
    await callApi({ action: 'remove-option', optionId });
  }

  // 未ログインで回答しようとしたら、その場で登録（ログイン）画面へ。
  function onTapAnswer(optionId: string, a: ScheduleAnswer) {
    if (!ensureReady()) return;
    setMyAnswers((prev) => {
      const next = { ...prev };
      if (next[optionId] === a) delete next[optionId];
      else next[optionId] = a;
      return next;
    });
  }

  async function saveMyAnswer() {
    if (!ensureReady()) return;
    const p = await callApi({ action: 'answer', answers: myAnswers, comment: myComment.trim() || undefined });
    if (p) { toast('回答を保存しました'); track('poll_answer', { pollId: params.id, count: Object.keys(myAnswers).length }); }
  }

  // オーナー：この候補日で決定 → 作成画面へ日時を引き継ぐ。
  async function decideAndCreate(optionId: string, date: string, startTime?: string) {
    if (!ensureReady()) return;
    const p = await callApi({ action: 'decide', optionId });
    if (!p) return;
    track('poll_decide_create', { pollId: params.id });
    const q = new URLSearchParams({ pollId: String(params.id), date });
    if (startTime) q.set('startTime', startTime);
    router.push(`/create?${q.toString()}`);
  }

  async function shareUrl() {
    const url = `https://app.goltomo.com${pollPath}`;
    const text = `⛳ ゴルフの日程調整です。参加できる日を教えてください！`;
    track('poll_share', { pollId: params.id });
    const w = window as any;
    if (w.navigator?.share) {
      try { await w.navigator.share({ title: 'ゴルトモ 日程調整', text, url }); return; } catch { /* fall through */ }
    }
    try { await navigator.clipboard.writeText(url); toast('リンクをコピーしました'); }
    catch { window.prompt('このリンクをコピーして共有してください', url); }
  }

  if (state === 'loading') return <div className="p-5 text-center text-sub">読み込み中...</div>;
  if (state === 'notfound') return <div className="p-5 text-center text-sub">日程調整が見つかりません</div>;
  if (state === 'error' || !poll) return <div className="p-5 text-center text-sub">読み込みに失敗しました</div>;

  // 候補日は日付の昇順（古い→新しい）で表示。'YYYY-MM-DD' の文字列比較で並ぶ。
  const options = [...(poll.options || [])].sort((a, b) => a.date.localeCompare(b.date));
  const responses = poll.responses || [];
  const decidedOption = options.find((o) => o.id === poll.decidedOptionId);
  const fmt = (date: string) => formatDate(date);

  return (
    <div className="px-5 py-3">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.push('/home')} className="text-sm text-blue font-semibold">← ホーム</button>
        <button onClick={shareUrl} className="px-3 py-1.5 bg-bg border-[1.5px] border-border rounded-full text-xs font-bold flex items-center gap-1">
          <span>🔗</span><span>シェア</span>
        </button>
      </div>

      <div className="text-2xl font-black tracking-tight mb-1">📅 日程調整</div>
      <div className="text-[13px] text-sub mb-4">{poll.title || 'みんなで日程を決めましょう'}</div>

      {/* 使い方（オーナー向け） */}
      {isOwner && !poll.roundId && (
        <div className="mb-4 bg-blue-light border-[1.5px] border-blue rounded-card p-4">
          <div className="text-[12px] text-text leading-relaxed">
            候補日を出して<b>🔗シェア</b>でみんなに送りましょう。回答が集まったら、決めたい日の
            <b>「この日で募集をつくる」</b>を押すと、その日程でラウンド募集に進めます。
          </div>
        </div>
      )}

      {/* 未ログイン案内 */}
      {hydrated && !meId && (
        <div className="mb-4 bg-orange-light border-[1.5px] border-orange rounded-card p-4">
          <div className="text-[13px] font-black text-orange mb-1">🔒 回答にはログインが必要です</div>
          <div className="text-[12px] text-sub leading-relaxed mb-3">
            みんなの回答は今すぐ見られます。あなたが回答（◯△✕）する時だけ、かんたんな登録をお願いします。
          </div>
          <a href={`/liff?to=${encodeURIComponent(pollPath)}`} className="block w-full py-3 bg-green text-white rounded-xl text-sm font-black text-center">
            登録して回答する →
          </a>
        </div>
      )}

      {/* 決定済みバナー */}
      {decidedOption && (
        <div className="mb-4 bg-green-light border-[1.5px] border-green rounded-card p-4">
          <div className="text-[13px] font-black text-green mb-1">✅ この日に決定</div>
          <div className="text-lg font-black text-text">
            {fmt(decidedOption.date)}{decidedOption.startTime ? ` ${decidedOption.startTime}` : ''}
          </div>
          {poll.roundId ? (
            <button onClick={() => router.push(`/round/${poll.roundId}`)} className="inline-block mt-3 px-4 py-2 bg-green text-white rounded-xl text-xs font-black">
              この日程の募集を見る →
            </button>
          ) : isOwner ? (
            <button
              onClick={() => decideAndCreate(decidedOption.id, decidedOption.date, decidedOption.startTime)}
              disabled={busy}
              className="inline-block mt-3 px-4 py-2 bg-green text-white rounded-xl text-xs font-black disabled:opacity-50"
            >
              この日程で募集をつくる →
            </button>
          ) : null}
        </div>
      )}

      {/* みんなの回答マトリクス */}
      <div className="bg-card rounded-card p-4 shadow-card mb-4">
        <div className="text-base font-black mb-3">みんなの回答（{responses.length}人）</div>
        {options.length === 0 ? (
          <div className="text-center text-sub text-sm py-6">まだ候補日がありません。下から追加してください。</div>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="border-collapse text-center">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-card text-left text-[11px] font-bold text-sub px-2 py-1.5 min-w-[92px]">候補日</th>
                  <th className="text-[10px] font-bold text-sub px-2 py-1.5 whitespace-nowrap">集計</th>
                  {responses.map((r) => {
                    const u = userMap[r.userId];
                    return (
                      <th key={r.userId} className="px-1.5 py-1.5">
                        <div className="flex flex-col items-center gap-0.5 w-12">
                          {u ? <Avatar user={u} size={28} /> : <div className="w-7 h-7 rounded-full bg-bg" />}
                          <span className="text-[9px] text-sub truncate w-12">{u?.displayName || '?'}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {options.map((o) => {
                  const t = tallies[o.id] || { ok: 0, maybe: 0, no: 0 };
                  const isBest = o.id === bestOptionId;
                  const isDecided = o.id === poll.decidedOptionId;
                  return (
                    <tr key={o.id} className={'border-t border-border ' + (isDecided ? 'bg-green-light' : isBest ? 'bg-yellow-light/50' : '')}>
                      <td className="sticky left-0 z-10 bg-inherit text-left px-2 py-2">
                        <div className="text-[12px] font-bold text-text whitespace-nowrap">
                          {fmt(o.date)}
                          {isBest && !isDecided && <span className="ml-1 text-[9px] text-orange font-black">◎</span>}
                        </div>
                        {o.startTime && <div className="text-[10px] text-sub">{o.startTime}</div>}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <span className="text-[11px] font-bold text-green">◯{t.ok}</span>
                        <span className="text-[11px] font-bold text-orange ml-1">△{t.maybe}</span>
                        <span className="text-[11px] font-bold text-muted ml-1">✕{t.no}</span>
                      </td>
                      {responses.map((r) => {
                        const a = r.answers?.[o.id];
                        return (
                          <td key={r.userId} className="px-1.5 py-2">
                            <span className={'text-base font-black ' + (a ? ANSWER_META[a].cls : 'text-border')}>
                              {a ? ANSWER_META[a].mark : '·'}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {responses.some((r) => r.comment) && (
          <div className="mt-3 pt-3 border-t border-border space-y-1.5">
            {responses.filter((r) => r.comment).map((r) => (
              <div key={r.userId} className="text-[11px] text-sub">
                <span className="font-bold text-text">{userMap[r.userId]?.displayName || '?'}</span>：{r.comment}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* あなたの回答 */}
      <div className="bg-card rounded-card p-4 shadow-card mb-4">
        <div className="text-base font-black mb-1">あなたの回答</div>
        <div className="text-[11px] text-sub mb-3">各候補日に◯（参加できる）△（調整できる）✕（不可）で答えてください。</div>
        {options.length === 0 ? (
          <div className="text-center text-sub text-sm py-4">候補日が追加されると回答できます。</div>
        ) : (
          <div className="space-y-2 mb-3">
            {options.map((o) => (
              <div key={o.id} className="flex items-center gap-2 p-2.5 bg-bg rounded-[10px]">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-text">{fmt(o.date)}{o.startTime ? ` ${o.startTime}` : ''}</div>
                </div>
                <div className="flex gap-1">
                  {ANSWER_ORDER.map((a) => {
                    const on = myAnswers[o.id] === a;
                    return (
                      <button
                        key={a}
                        onClick={() => onTapAnswer(o.id, a)}
                        className={'w-9 h-9 rounded-lg text-base font-black border-[1.5px] ' + (on ? ANSWER_META[a].btn : 'bg-card border-border text-sub')}
                        aria-label={ANSWER_META[a].label}
                      >
                        {ANSWER_META[a].mark}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <textarea
          value={myComment}
          onChange={(e) => setMyComment(e.target.value.slice(0, 200))}
          placeholder="ひとこと（任意）例: 午後からなら参加できます"
          className="w-full h-14 p-2.5 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none resize-none mb-2"
        />
        <button onClick={saveMyAnswer} disabled={busy || options.length === 0} className="w-full py-3 bg-green text-white rounded-xl text-sm font-black disabled:opacity-50">
          {meId ? '回答を保存' : '登録して回答する'}
        </button>
      </div>

      {/* 候補日を追加（誰でも）— カレンダーでまとめて選択 → 一括追加 */}
      <div className="bg-card rounded-card p-4 shadow-card mb-4">
        <div className="text-base font-black mb-1">候補日を追加</div>
        <div className="text-[11px] text-sub mb-3">カレンダーで日付を<b>タップして複数選べます</b>。まとめて一括で追加できます（誰でも追加OK）。</div>
        <MultiDatePicker selected={selectedDates} onToggle={toggleDate} />
        <button
          onClick={addSelectedDates}
          disabled={busy || selectedDates.size === 0}
          className="w-full py-2.5 mt-3 bg-green text-white rounded-xl text-sm font-black disabled:opacity-50"
        >
          ＋ 選択した{selectedDates.size > 0 ? `${selectedDates.size}日` : '日'}を候補に追加
        </button>
      </div>

      {/* オーナー：候補日ごとに「この日で募集をつくる」＋削除 */}
      {isOwner && options.length > 0 && !poll.roundId && (
        <div className="bg-card rounded-card p-4 shadow-card mb-4">
          <div className="text-base font-black mb-1">日程を決めて募集する</div>
          <div className="text-[11px] text-sub mb-3">決めたい候補日を選ぶと、その日程でラウンド募集の作成に進みます（コース予約済み／未定はそこで選べます）。</div>
          <div className="space-y-2">
            {options.map((o) => {
              const t = tallies[o.id] || { ok: 0, maybe: 0, no: 0 };
              return (
                <div key={o.id} className="flex items-center gap-2 p-2.5 bg-bg rounded-[10px]">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-text">{fmt(o.date)}{o.startTime ? ` ${o.startTime}` : ''}</div>
                    <div className="text-[10px] text-sub">◯{t.ok} ・ △{t.maybe} ・ ✕{t.no}</div>
                  </div>
                  <button onClick={() => decideAndCreate(o.id, o.date, o.startTime)} disabled={busy} className="px-3 py-1.5 bg-blue text-white rounded-lg text-xs font-black flex-shrink-0 disabled:opacity-50">この日で募集をつくる</button>
                  <button onClick={() => removeOption(o.id)} className="px-2.5 py-1.5 bg-card text-red border border-red rounded-lg text-xs font-bold flex-shrink-0">削除</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="h-8" />
    </div>
  );
}

// カレンダー（複数選択）。日付をタップでトグル。過去日は選べない。
function MultiDatePicker({ selected, onToggle }: { selected: Set<string>; onToggle: (d: string) => void }) {
  const today = new Date();
  const todayKey = ymd(today.getFullYear(), today.getMonth(), today.getDate());
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });

  const first = new Date(view.y, view.m, 1);
  const startWeekday = first.getDay(); // 0=日
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weekdayLabels = ['日', '月', '火', '水', '木', '金', '土'];
  // 過去の月へは戻らせない（当月まで）。
  const canPrev = view.y > today.getFullYear() || (view.y === today.getFullYear() && view.m > today.getMonth());

  function shift(delta: number) {
    setView((v) => {
      const nm = v.m + delta;
      return { y: v.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 };
    });
  }

  return (
    <div className="border-[1.5px] border-border rounded-[12px] p-2.5 bg-bg">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => shift(-1)} disabled={!canPrev} className="w-8 h-8 rounded-lg bg-card border border-border text-sm font-black disabled:opacity-30">‹</button>
        <div className="text-sm font-black">{view.y}年 {view.m + 1}月</div>
        <button onClick={() => shift(1)} className="w-8 h-8 rounded-lg bg-card border border-border text-sm font-black">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdayLabels.map((w, i) => (
          <div key={w} className={'text-center text-[10px] font-bold py-0.5 ' + (i === 0 ? 'text-red' : i === 6 ? 'text-blue' : 'text-muted')}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const key = ymd(view.y, view.m, d);
          const isPast = key < todayKey;
          const on = selected.has(key);
          const dow = new Date(view.y, view.m, d).getDay();
          return (
            <button
              key={i}
              onClick={() => !isPast && onToggle(key)}
              disabled={isPast}
              className={
                'aspect-square rounded-lg text-[13px] font-bold flex items-center justify-center ' +
                (on ? 'bg-green text-white' : isPast ? 'text-border' : 'bg-card border border-border ' + (dow === 0 ? 'text-red' : dow === 6 ? 'text-blue' : 'text-text'))
              }
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
