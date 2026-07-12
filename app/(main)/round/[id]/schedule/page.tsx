'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getMe, store, useStore } from '@/lib/store';
import { toast } from '@/components/Toast';
import { Avatar } from '@/components/Avatar';
import { track } from '@/lib/telemetry';
import { formatDate } from '@/lib/utils';
import { readApiError } from '@/lib/apiError';
import type { Round, User, ScheduleAnswer } from '@/lib/types';

// プロフィール保存済みの近似判定（年齢が入っていれば保存済み）。round 詳細と同じ基準。
function isProfileComplete(age?: number): boolean {
  return typeof age === 'number' && age > 0;
}

const ANSWER_META: Record<ScheduleAnswer, { mark: string; label: string; cls: string; btn: string }> = {
  ok: { mark: '◯', label: '参加できる', cls: 'text-green', btn: 'bg-green text-white border-green' },
  maybe: { mark: '△', label: '調整できる', cls: 'text-orange', btn: 'bg-orange text-white border-orange' },
  no: { mark: '✕', label: '不可', cls: 'text-muted', btn: 'bg-sub text-white border-sub' },
};
const ANSWER_ORDER: ScheduleAnswer[] = ['ok', 'maybe', 'no'];

export default function RoundSchedulePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meId = useStore((s) => s.meId);
  const hydrated = useStore((s) => s.hydrated);
  const me = useStore(getMe);
  const profileReady = isProfileComplete(me?.age);

  const [round, setRound] = useState<Round | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const [busy, setBusy] = useState(false);

  // 候補日追加フォーム。
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');

  // 自分の回答（optionId → ○△×）とコメントの下書き。
  const [myAnswers, setMyAnswers] = useState<Record<string, ScheduleAnswer>>({});
  const [myComment, setMyComment] = useState('');

  // 主催者の「この日に決定」モーダル。
  const [decideFor, setDecideFor] = useState<string | null>(null);

  const schedulePath = `/round/${params.id}/schedule`;

  async function load() {
    try {
      const r = await fetch(`/api/rounds/${encodeURIComponent(params.id)}`, { cache: 'no-store' });
      if (r.status === 404) { setState('notfound'); return; }
      if (!r.ok) { setState('error'); return; }
      const j = await r.json();
      setRound(j.round || null);
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

  const poll = round?.schedulePoll || null;
  const isHost = !!round && round.hostId === meId;

  // サーバーの自分の回答を下書きへ反映（初回・再取得時）。
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

  // 候補日ごとの集計。
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

  // おすすめ候補（◯が最多・×が最少）。
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

  // 未ログイン／プロフィール未完なら回答前に誘導。OKなら true。
  function ensureReady(): boolean {
    if (!meId) {
      router.push(`/liff?to=${encodeURIComponent(schedulePath)}`);
      return false;
    }
    if (!profileReady) {
      toast('回答にはプロフィール登録が必要です');
      router.push(`/mypage/edit?returnTo=${encodeURIComponent(schedulePath)}`);
      return false;
    }
    return true;
  }

  async function callApi(bodyObj: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(`/api/rounds/${encodeURIComponent(params.id)}/schedule`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj), cache: 'no-store',
      });
      if (!res.ok) { toast(await readApiError(res), 'error'); return false; }
      const j = await res.json();
      if (j.round) { setRound(j.round); store.refreshRounds().catch(() => {}); }
      return true;
    } catch (e) {
      toast((e as Error).message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function startPoll() {
    if (!ensureReady()) return;
    track('schedule_enable', { roundId: params.id });
    await callApi({ action: 'enable' });
  }

  async function addOption() {
    if (!ensureReady()) return;
    const date = newDate.trim();
    if (!date) { toast('日付を選んでください', 'error'); return; }
    const ok = await callApi({ action: 'add-option', date, startTime: newTime.trim() || undefined });
    if (ok) { setNewDate(''); setNewTime(''); track('schedule_add_option', { roundId: params.id }); }
  }

  async function removeOption(optionId: string) {
    if (!confirm('この候補日を削除しますか？')) return;
    await callApi({ action: 'remove-option', optionId });
  }

  function setMyAnswer(optionId: string, a: ScheduleAnswer) {
    setMyAnswers((prev) => {
      const next = { ...prev };
      if (next[optionId] === a) delete next[optionId]; // もう一度押すと取り消し
      else next[optionId] = a;
      return next;
    });
  }

  async function saveMyAnswer() {
    if (!ensureReady()) return;
    const ok = await callApi({ action: 'answer', answers: myAnswers, comment: myComment.trim() || undefined });
    if (ok) { toast('回答を保存しました'); track('schedule_answer', { roundId: params.id, count: Object.keys(myAnswers).length }); }
  }

  async function shareUrl() {
    const url = `https://app.goltomo.com${schedulePath}`;
    const text = `⛳ ${round?.title || 'ラウンド'}の日程調整です。参加できる日を教えてください！`;
    track('schedule_share', { roundId: params.id });
    const w = window as any;
    if (w.navigator?.share) {
      try { await w.navigator.share({ title: 'ゴルトモ 日程調整', text, url }); return; } catch { /* fall through */ }
    }
    try { await navigator.clipboard.writeText(url); toast('リンクをコピーしました'); }
    catch { window.prompt('このリンクをコピーして共有してください', url); }
  }

  if (state === 'loading') return <div className="p-5 text-center text-sub">読み込み中...</div>;
  if (state === 'notfound') return <div className="p-5 text-center text-sub">募集が見つかりません</div>;
  if (state === 'error' || !round) return <div className="p-5 text-center text-sub">読み込みに失敗しました</div>;

  const options = poll?.options || [];
  const responses = poll?.responses || [];
  const decidedOption = options.find((o) => o.id === poll?.decidedOptionId);
  const optionDateLabel = (date: string) => formatDate(date);

  return (
    <div className="px-5 py-3">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.push(`/round/${params.id}`)} className="text-sm text-blue font-semibold">← 募集へ戻る</button>
        <button
          onClick={shareUrl}
          className="px-3 py-1.5 bg-bg border-[1.5px] border-border rounded-full text-xs font-bold flex items-center gap-1"
        >
          <span>🔗</span><span>シェア</span>
        </button>
      </div>

      <div className="text-2xl font-black tracking-tight mb-1">📅 日程調整</div>
      <div className="text-[13px] text-sub mb-4 truncate">{round.title}</div>

      {/* 未ログイン案内 */}
      {hydrated && !meId && (
        <div className="mb-4 bg-orange-light border-[1.5px] border-orange rounded-card p-4">
          <div className="text-[13px] font-black text-orange mb-1">🔒 回答にはログインが必要です</div>
          <div className="text-[12px] text-sub leading-relaxed mb-3">
            みんなの回答は今すぐ見られます。あなたが回答（◯△✕）する時だけ、かんたんな登録をお願いします。
          </div>
          <a href={`/liff?to=${encodeURIComponent(schedulePath)}`} className="block w-full py-3 bg-green text-white rounded-xl text-sm font-black text-center">
            登録して回答する →
          </a>
        </div>
      )}

      {/* 決定済みバナー */}
      {decidedOption && (
        <div className="mb-4 bg-green-light border-[1.5px] border-green rounded-card p-4">
          <div className="text-[13px] font-black text-green mb-1">✅ この日に決定しました</div>
          <div className="text-lg font-black text-text">
            {optionDateLabel(decidedOption.date)}{decidedOption.startTime ? ` ${decidedOption.startTime}` : ''}
          </div>
          <div className="text-[12px] text-sub mt-1">
            {round.type === 'confirmed' ? `コース確定：${round.courseName || ''}` : 'コース未定（これから決める）'}
          </div>
          <Link href={`/round/${params.id}`} className="inline-block mt-3 px-4 py-2 bg-green text-white rounded-xl text-xs font-black">
            募集ページで見る →
          </Link>
        </div>
      )}

      {/* ポール未開始 */}
      {!poll ? (
        isHost ? (
          <div className="bg-card rounded-card p-5 shadow-card text-center">
            <div className="text-base font-black mb-2">日程調整をはじめる</div>
            <div className="text-[12px] text-sub leading-relaxed mb-4">
              候補日をいくつか出して、参加メンバーに◯△✕で答えてもらいましょう。<br />
              URLを送れば、ゴルトモ未登録の人も登録して回答できます。
            </div>
            <button onClick={startPoll} disabled={busy} className="w-full py-4 bg-green text-white rounded-xl text-[15px] font-black disabled:opacity-50">
              日程調整をはじめる
            </button>
          </div>
        ) : (
          <div className="bg-card rounded-card p-8 shadow-card text-center text-sub text-sm">
            主催者がまだ日程調整を開始していません。
          </div>
        )
      ) : (
        <>
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
                      const isDecided = o.id === poll?.decidedOptionId;
                      return (
                        <tr key={o.id} className={'border-t border-border ' + (isDecided ? 'bg-green-light' : isBest ? 'bg-yellow-light/50' : '')}>
                          <td className="sticky left-0 z-10 bg-inherit text-left px-2 py-2">
                            <div className="text-[12px] font-bold text-text whitespace-nowrap">
                              {optionDateLabel(o.date)}
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
            {/* コメント一覧 */}
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
                      <div className="text-[13px] font-bold text-text">{optionDateLabel(o.date)}{o.startTime ? ` ${o.startTime}` : ''}</div>
                    </div>
                    <div className="flex gap-1">
                      {ANSWER_ORDER.map((a) => {
                        const on = myAnswers[o.id] === a;
                        return (
                          <button
                            key={a}
                            onClick={() => setMyAnswer(o.id, a)}
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

          {/* 候補日を追加（誰でも） */}
          <div className="bg-card rounded-card p-4 shadow-card mb-4">
            <div className="text-base font-black mb-1">候補日を追加</div>
            <div className="text-[11px] text-sub mb-3">参加メンバーなら誰でも候補日を足せます。</div>
            <div className="flex gap-2 mb-2">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="flex-1 px-3 py-2.5 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none"
              />
              <input
                type="text"
                inputMode="text"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value.slice(0, 20))}
                placeholder="時間(任意)"
                className="w-28 px-3 py-2.5 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none"
              />
            </div>
            <button onClick={addOption} disabled={busy} className="w-full py-2.5 bg-bg border-[1.5px] border-green text-green rounded-xl text-sm font-black disabled:opacity-50">
              ＋ 候補日を追加
            </button>
          </div>

          {/* 主催者：候補日の削除＋決定 */}
          {isHost && options.length > 0 && (
            <div className="bg-card rounded-card p-4 shadow-card mb-4">
              <div className="text-base font-black mb-1">主催者メニュー</div>
              <div className="text-[11px] text-sub mb-3">日程が固まったら、決める候補日を選んでください。募集ページの日時に反映されます。</div>
              <div className="space-y-2">
                {options.map((o) => {
                  const t = tallies[o.id] || { ok: 0, maybe: 0, no: 0 };
                  return (
                    <div key={o.id} className="flex items-center gap-2 p-2.5 bg-bg rounded-[10px]">
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-bold text-text">{optionDateLabel(o.date)}{o.startTime ? ` ${o.startTime}` : ''}</div>
                        <div className="text-[10px] text-sub">◯{t.ok} ・ △{t.maybe} ・ ✕{t.no}</div>
                      </div>
                      <button onClick={() => setDecideFor(o.id)} className="px-3 py-1.5 bg-blue text-white rounded-lg text-xs font-black flex-shrink-0">この日に決定</button>
                      <button onClick={() => removeOption(o.id)} className="px-2.5 py-1.5 bg-card text-red border border-red rounded-lg text-xs font-bold flex-shrink-0">削除</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <div className="h-8" />

      {decideFor && round && (
        <DecideModal
          round={round}
          option={options.find((o) => o.id === decideFor)!}
          busy={busy}
          onClose={() => setDecideFor(null)}
          onDecide={async (courseMode, courseName, startTime) => {
            const ok = await callApi({ action: 'decide', optionId: decideFor, courseMode, courseName: courseName || undefined, startTime: startTime || undefined });
            if (ok) { setDecideFor(null); toast('日程を決定しました'); track('schedule_decide', { roundId: params.id, courseMode }); }
          }}
        />
      )}
    </div>
  );
}

function DecideModal({ round, option, busy, onClose, onDecide }: {
  round: Round;
  option: { id: string; date: string; startTime?: string };
  busy: boolean;
  onClose: () => void;
  onDecide: (courseMode: 'flexible' | 'confirmed', courseName: string, startTime: string) => void;
}) {
  const [courseMode, setCourseMode] = useState<'flexible' | 'confirmed'>(round.type === 'confirmed' ? 'confirmed' : 'flexible');
  const [courseName, setCourseName] = useState(round.courseName || '');
  const [startTime, setStartTime] = useState(option.startTime || round.startTime || '');

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-5 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-t-3xl sm:rounded-card w-full max-w-[420px] shadow-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="text-base font-black mb-1">この日に決定</div>
        <div className="text-lg font-black text-text mb-4">{formatDate(option.date)}</div>

        <label className="block text-[11px] font-bold text-sub mb-1">スタート時間（任意）</label>
        <input
          value={startTime}
          onChange={(e) => setStartTime(e.target.value.slice(0, 20))}
          placeholder="例: 8:00"
          className="w-full px-3 py-2.5 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none mb-4"
        />

        <div className="text-[11px] font-bold text-sub mb-2">コースは？</div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={() => setCourseMode('flexible')}
            className={'py-3 rounded-xl text-sm font-black border-[1.5px] ' + (courseMode === 'flexible' ? 'bg-green text-white border-green' : 'bg-bg border-border text-sub')}
          >
            コース未定
          </button>
          <button
            onClick={() => setCourseMode('confirmed')}
            className={'py-3 rounded-xl text-sm font-black border-[1.5px] ' + (courseMode === 'confirmed' ? 'bg-green text-white border-green' : 'bg-bg border-border text-sub')}
          >
            コース確定
          </button>
        </div>

        {courseMode === 'confirmed' && (
          <div className="mb-3">
            <label className="block text-[11px] font-bold text-sub mb-1">ゴルフ場名</label>
            <input
              value={courseName}
              onChange={(e) => setCourseName(e.target.value.slice(0, 80))}
              placeholder="例: ○○カントリークラブ"
              className="w-full px-3 py-2.5 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none"
            />
          </div>
        )}

        <button
          onClick={() => onDecide(courseMode, courseName.trim(), startTime.trim())}
          disabled={busy || (courseMode === 'confirmed' && !courseName.trim())}
          className="w-full py-3.5 bg-blue text-white rounded-xl text-sm font-black disabled:opacity-50 mt-1"
        >
          この日程で決定して募集に反映
        </button>
        <button onClick={onClose} className="w-full py-2.5 mt-2 text-muted text-xs font-bold">キャンセル</button>
      </div>
    </div>
  );
}
