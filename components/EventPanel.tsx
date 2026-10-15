'use client';

// イベント（飲み会・シミュゴル・練習会・観戦など／lib/eventRound）の出欠と集計（2026-10-14・モック②-3,4）。
//   参加する人 … 参加する／未定／行けない ＋（候補日から決めるときは）来られる日の ◯△✕ ＋ 主催者が作った質問に答える
//                POST /api/rounds/[id]/rsvp。何度でも答え直せる。「参加する」は承認なしで参加確定
//   主催者・共同管理者 … 出欠の集計・日程を決める（どの候補でも選べる）・質問ごとの集計・名前ごとの一覧（コピー）・未回答へのリマインド
// 色はイベントの紫（ラウンドの緑とひと目で区別する）。
import { useEffect, useMemo, useState } from 'react';
import type { Round, User, EventAnswer, EventRsvp, EventDateOption } from '@/lib/types';
import { tallyEvent } from '@/lib/eventRound';
import { formatDate } from '@/lib/utils';
import { toast } from '@/components/Toast';
import { confirmDialog } from '@/components/ConfirmDialog';
import { LoginButtons } from '@/components/LoginButtons';
import { readApiError } from '@/lib/apiError';
import { track } from '@/lib/telemetry';

const P = '#7B5CD6';
const PL = '#EFEAFF';
const todayJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const fmtAt = (ms: number) => new Date(ms).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export const eventDateLabel = (o: Pick<EventDateOption, 'date' | 'startTime'>) => `${formatDate(o.date)}${o.startTime ? ` ${o.startTime}` : ''}`;
const RSVP_LABEL: Record<EventRsvp, string> = { yes: '参加する', maybe: '未定', no: '行けない' };
const DATE_MARK: Record<'ok' | 'maybe' | 'no', string> = { ok: '◯', maybe: '△', no: '✕' };
const ansText = (v: string[] | string | undefined) => (Array.isArray(v) ? v.join('・') : (v || '').trim());

export function EventPanel({ round, meId, isHost, users, onRoundChange }: {
  round: Round;
  meId: string;
  isHost: boolean;
  users: User[];
  onRoundChange: (r: Round) => void;
}) {
  return (
    <div id="event-panel" className="mb-4 rounded-card p-3.5" style={{ background: '#FBFAFF', border: `2px solid ${P}` }}>
      {/* 主催者・共同主催者も、候補日の◯△✕と質問に自分で答えられる（集計に入る・2026-10-15）。出欠は「参加」のまま */}
      {isHost && ((round.eventDatePending && (round.eventDateOptions || []).length > 0) || (round.eventQuestions || []).length > 0) && (
        <div className="mb-3.5 pb-3.5" style={{ borderBottom: '1.5px dashed #DDD5F5' }}>
          <AnswerForm round={round} meId={meId} onRoundChange={onRoundChange} asHost />
        </div>
      )}
      {isHost
        ? <HostBoard round={round} users={users} onRoundChange={onRoundChange} />
        : <AnswerForm round={round} meId={meId} onRoundChange={onRoundChange} />}
    </div>
  );
}

// ───────────── 参加する人：出欠＋回答 ─────────────
// asHost＝主催者・共同主催者が自分の都合を答える（出欠は選ばない＝いつも「参加」）（2026-10-15）
function AnswerForm({ round, meId, onRoundChange, asHost = false }: { round: Round; meId: string; onRoundChange: (r: Round) => void; asHost?: boolean }) {
  const mine: EventAnswer | undefined = meId ? (round.eventAnswers || {})[meId] : undefined;
  const [editing, setEditing] = useState(!mine);
  const [status, setStatus] = useState<EventRsvp | ''>(asHost ? 'yes' : (mine?.status || ''));
  const [dates, setDates] = useState<Record<string, 'ok' | 'maybe' | 'no'>>(mine?.dates || {});
  const [answers, setAnswers] = useState<Record<string, string[] | string>>(mine?.answers || {});
  const [busy, setBusy] = useState(false);
  // 回答が届き直したら（別の端末で答えた・送った直後など）入れ直す
  useEffect(() => {
    if (!mine) return;
    setStatus(asHost ? 'yes' : mine.status); setDates(mine.dates || {}); setAnswers(mine.answers || {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.id, mine?.at]);

  if (!meId) {
    return (
      <div>
        <div className="text-[14px] font-black mb-1" style={{ color: P }}>✋ 出欠を答える</div>
        <div className="text-[12px] text-sub mb-3 leading-relaxed">出欠の回答は、LINEでの新規登録（無料）またはログインのあとにできます。</div>
        <LoginButtons to={`/round/${round.id}`} note="どちらもLINEアプリで開き、このページに戻ります（無料）" />
      </div>
    );
  }

  const closed = round.status !== 'open';
  const isIn = (round.applicantIds || []).includes(meId);
  const deadlinePassed = !!round.eventDeadline && todayJst() > round.eventDeadline;
  const hasCap = (round.maxSpots || 99) < 99;
  const full = hasCap && round.currentCount >= round.maxSpots;
  const yesBlocked = !asHost && !isIn && (deadlinePassed || full);
  const pending = !!round.eventDatePending && (round.eventDateOptions || []).length > 0;
  const questions = round.eventQuestions || [];

  // 回答のまとめ（答えたあと・編集していないとき）
  if (mine && !editing) {
    return (
      <div>
        <div className="text-[14px] font-black mb-2" style={{ color: P }}>{asHost ? '🙋 あなた（主催者）の都合' : '✋ 出欠と回答'}</div>
        <div className="rounded-xl p-3" style={{ background: PL }}>
          <div className="text-[14px] font-black">
            {asHost ? <>あなたの回答</> : <>あなたの回答：<span style={{ color: P }}>{RSVP_LABEL[mine.status]}</span></>}
            <span className="text-[11px] text-sub font-bold ml-1">（{fmtAt(mine.at)}）</span>
          </div>
          {pending && Object.keys(mine.dates || {}).length > 0 && (
            <div className="text-[12px] text-sub mt-1.5 leading-relaxed">
              📅 {(round.eventDateOptions || []).filter((o) => mine.dates?.[o.id]).map((o) => `${eventDateLabel(o)} ${DATE_MARK[mine.dates![o.id]]}`).join(' ／ ')}
            </div>
          )}
          {mine.status !== 'no' && questions.filter((q) => ansText(mine.answers?.[q.id])).map((q) => (
            <div key={q.id} className="text-[12px] text-sub mt-1 leading-relaxed">{q.text}：<b className="text-text">{ansText(mine.answers?.[q.id])}</b></div>
          ))}
          {mine.status === 'yes' && !asHost && <div className="text-[11.5px] font-bold text-green mt-1.5">✅ 参加が確定しています（グループチャットも使えます）</div>}
        </div>
        {!closed ? (
          <button onClick={() => setEditing(true)} className="w-full mt-2.5 py-2.5 rounded-xl text-[13px] font-black bg-card" style={{ color: P, border: `1.5px solid ${P}` }}>
            ✏️ 回答を直す
          </button>
        ) : (
          <div className="text-[11px] text-muted text-center mt-2">受付を終えたため、回答は直せません</div>
        )}
      </div>
    );
  }

  if (closed) {
    return <div className="text-center text-[13px] font-bold text-sub py-3">このイベントは受付を終えています</div>;
  }

  function toggleChoice(qid: string, opt: string, multi: boolean) {
    setAnswers((cur) => {
      const now = Array.isArray(cur[qid]) ? (cur[qid] as string[]) : [];
      const next = multi ? (now.includes(opt) ? now.filter((x) => x !== opt) : [...now, opt]) : (now.includes(opt) ? [] : [opt]);
      return { ...cur, [qid]: next };
    });
  }

  async function submit() {
    if (!status || busy) return;
    if (status === 'yes' && yesBlocked) { toast(deadlinePassed ? '申込の締切を過ぎています' : '定員に達しています', 'error'); return; }
    if (status !== 'no') {
      const miss = questions.find((q) => q.required && !ansText(answers[q.id]));
      if (miss) { toast(`「${miss.text}」に答えてください`, 'error'); return; }
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/rounds/${encodeURIComponent(round.id)}/rsvp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', credentials: 'include',
        body: JSON.stringify({ status, dates: pending ? dates : undefined, answers: status === 'no' ? undefined : answers }),
      });
      if (!res.ok) { toast(await readApiError(res, '回答を送れませんでした'), 'error'); return; }
      const j = await res.json().catch(() => ({}));
      if (j?.round) onRoundChange(j.round as Round);
      track('event_rsvp', { roundId: round.id, status, kind: round.eventKind || '', host: asHost });
      setEditing(false);
      toast(asHost ? 'あなたの都合を集計に入れました' : status === 'yes' ? '「参加する」で回答しました🎉' : status === 'maybe' ? '「未定」で回答しました' : '「行けない」で回答しました');
    } catch { toast('回答を送れませんでした', 'error'); }
    finally { setBusy(false); }
  }

  const segBtn = (k: EventRsvp, label: string, disabled = false) => {
    const on = status === k;
    return (
      <button key={k} onClick={() => !disabled && setStatus(k)} disabled={disabled}
        className="flex-1 py-2.5 rounded-[11px] text-[13.5px] font-black disabled:opacity-40"
        style={on ? { background: P, color: '#fff', border: `2px solid ${P}` } : { background: '#fff', color: P, border: `2px solid ${P}55` }}>
        {label}
      </button>
    );
  };

  return (
    <div>
      {asHost ? (
        <>
          <div className="text-[14px] font-black mb-0.5" style={{ color: P }}>🙋 あなた（主催者）の都合</div>
          <div className="text-[11px] text-sub mb-1 leading-relaxed">主催者・共同主催者も、みんなと同じように候補日と質問に答えられます（下の集計に入ります）。</div>
        </>
      ) : (
        <>
          <div className="text-[14px] font-black mb-0.5" style={{ color: P }}>✋ 出欠を教えてください</div>
          <div className="text-[11px] text-sub mb-2.5 leading-relaxed">「参加する」で、そのまま参加確定です（主催者の承認はいりません）。回答はあとから直せます。</div>
          <div className="flex gap-1.5">
            {segBtn('yes', '参加する', yesBlocked)}
            {segBtn('maybe', '未定')}
            {segBtn('no', '行けない')}
          </div>
        </>
      )}
      {yesBlocked && (
        <div className="text-[11px] font-bold text-orange mt-1.5">⚠️ {deadlinePassed ? '申込の締切を過ぎたため、「参加する」は選べません' : '定員に達したため、「参加する」は選べません'}</div>
      )}

      {pending && status !== 'no' && (
        <div className="mt-3.5">
          <div className="text-[13px] font-black mb-1.5">📅 来られる日は？</div>
          {(round.eventDateOptions || []).map((o) => (
            <div key={o.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: '1px dashed #DDD5F5' }}>
              <span className="flex-1 min-w-0 text-[13px] font-bold">{eventDateLabel(o)}</span>
              {(['ok', 'maybe', 'no'] as const).map((v) => {
                const on = dates[o.id] === v;
                return (
                  <button key={v} onClick={() => setDates((d) => ({ ...d, [o.id]: v }))}
                    aria-label={`${eventDateLabel(o)} ${DATE_MARK[v]}`}
                    className="w-9 h-9 rounded-full text-[15px] font-black flex-none"
                    style={on ? { background: P, color: '#fff', border: `2px solid ${P}` } : { background: '#fff', color: '#9A8FC0', border: '1.5px solid #DDD5F5' }}>
                    {DATE_MARK[v]}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="text-[10.5px] text-muted mt-1">◯ 行ける ／ △ たぶん ／ ✕ 行けない</div>
        </div>
      )}

      {status !== 'no' && questions.map((q) => (
        <div key={q.id} className="mt-3.5">
          <div className="text-[13px] font-black mb-1.5">
            {q.text}
            {q.required
              ? <span className="ml-1.5 text-[10px] font-black text-white rounded-full px-1.5 py-px" style={{ background: '#E8643C' }}>必須</span>
              : <span className="ml-1.5 text-[10.5px] text-muted font-bold">（任意）</span>}
            {q.kind === 'choice' && q.multi && <span className="ml-1.5 text-[10.5px] font-bold" style={{ color: P }}>いくつでも</span>}
          </div>
          {q.kind === 'choice' ? (
            <div className="flex flex-wrap gap-1.5">
              {(q.options || []).map((opt) => {
                const on = Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt);
                return (
                  <button key={opt} onClick={() => toggleChoice(q.id, opt, !!q.multi)}
                    className="px-3.5 py-2 rounded-[11px] text-[13px] font-black"
                    style={on ? { background: P, color: '#fff', border: `2px solid ${P}` } : { background: '#fff', color: '#4A4560', border: '1.5px solid #DDD5F5' }}>
                    {q.multi && on ? '✓ ' : ''}{opt}
                  </button>
                );
              })}
            </div>
          ) : (
            <input
              value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''}
              onChange={(e) => setAnswers((cur) => ({ ...cur, [q.id]: e.target.value.slice(0, 300) }))}
              placeholder="自由に書いてください"
              className="w-full px-3 py-2.5 rounded-[11px] text-[14px] bg-white outline-none"
              style={{ border: '1.5px solid #DDD5F5' }}
            />
          )}
        </div>
      ))}

      <button onClick={submit} disabled={!status || busy}
        className="w-full mt-4 py-3.5 rounded-xl text-[15px] font-black text-white disabled:opacity-40"
        style={{ background: P, border: '2px solid #5B3FB0', boxShadow: '0 3px 0 #5B3FB0' }}>
        {busy ? '送信中…' : 'この内容で回答する'}
      </button>
      {mine && (
        <button onClick={() => { setEditing(false); setStatus(asHost ? 'yes' : mine.status); setDates(mine.dates || {}); setAnswers(mine.answers || {}); }}
          className="w-full mt-2 py-2 text-[12px] font-bold text-muted">直すのをやめる</button>
      )}
    </div>
  );
}

// ───────────── 主催者・共同管理者：集計 ─────────────
type RowStatus = 'host' | EventRsvp | 'none';
const ROW_LABEL: Record<RowStatus, string> = { host: '主催', yes: '参加', maybe: '未定', no: '行けない', none: '未回答' };
const ROW_TONE: Record<RowStatus, { bg: string; fg: string }> = {
  host: { bg: '#FFE9DF', fg: '#C24E2C' },
  yes: { bg: '#E3F3F1', fg: '#1F7A70' },
  maybe: { bg: '#FFF4D6', fg: '#8A5A00' },
  no: { bg: '#EEEEEE', fg: '#777777' },
  none: { bg: '#F5F3FB', fg: '#9A8FC0' },
};

function HostBoard({ round, users, onRoundChange }: { round: Round; users: User[]; onRoundChange: (r: Round) => void }) {
  const [pick, setPick] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [busy, setBusy] = useState<'' | 'date' | 'remind'>('');

  const answers = round.eventAnswers || {};
  const hostIds = useMemo(() => [round.hostId, ...(round.coHostIds || [])].filter(Boolean), [round.hostId, round.coHostIds]);
  // 未回答＝招待中で、まだ出欠を答えていない人（サーバーのリマインド対象と同じ）
  const unansweredIds = (round.invitedIds || []).filter((u) => u && !answers[u] && !hostIds.includes(u));
  const t = tallyEvent(round, unansweredIds);
  const joinCount = round.currentCount || ((round.applicantIds || []).length + 1);
  const options = round.eventDateOptions || [];
  const pending = !!round.eventDatePending && options.length > 0;
  const questions = round.eventQuestions || [];
  const nameOf = (id: string) => users.find((u) => u.id === id)?.displayName || 'メンバー';

  // 初期の選択：◯がいちばん多い日（同じなら✕が少ない日）。主催者はどれでも選び直せる
  const bestId = useMemo(() => {
    let best = ''; let bo = -1; let bn = Infinity;
    for (const o of options) {
      const c = t.dates[o.id] || { ok: 0, maybe: 0, no: 0 };
      if (c.ok > bo || (c.ok === bo && c.no < bn)) { best = o.id; bo = c.ok; bn = c.no; }
    }
    return best;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(t.dates), options.length]);
  const chosenId = pick || bestId;
  const chosen = options.find((o) => o.id === chosenId);

  // 名前ごとの一覧（主催 → 参加 → 未定 → 行けない → 未回答）
  const rows = useMemo(() => {
    const out: { id: string; status: RowStatus; a?: EventAnswer }[] = [];
    const seen = new Set<string>();
    for (const id of hostIds) { if (!seen.has(id)) { seen.add(id); out.push({ id, status: 'host', a: answers[id] }); } }   // 主催者も答えていれば一覧に出す（2026-10-15）
    for (const [id, a] of Object.entries(answers)) { if (a && !seen.has(id)) { seen.add(id); out.push({ id, status: a.status, a }); } }
    for (const id of round.applicantIds || []) { if (!seen.has(id)) { seen.add(id); out.push({ id, status: 'yes' }); } }
    for (const id of unansweredIds) { if (!seen.has(id)) { seen.add(id); out.push({ id, status: 'none' }); } }
    const order: Record<RowStatus, number> = { host: 0, yes: 1, maybe: 2, no: 3, none: 4 };
    return out.sort((a, b) => order[a.status] - order[b.status]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(answers), hostIds.join(','), (round.applicantIds || []).join(','), unansweredIds.join(',')]);

  async function decideDate() {
    if (!chosen || busy) return;
    const label = eventDateLabel(chosen);
    const ok = await confirmDialog({
      title: `${label} に決めますか？`,
      message: '決めると、参加する人と「未定」の人にお知らせが届きます。行けなくなった人は、回答を「行けない」に直せます。',
      confirmText: 'この日に決める', cancelText: 'やめる',
    });
    if (!ok) return;
    setBusy('date');
    try {
      const res = await fetch(`/api/rounds/${encodeURIComponent(round.id)}/event-date`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', credentials: 'include',
        body: JSON.stringify({ optionId: chosen.id }),
      });
      if (!res.ok) { toast(await readApiError(res, '日程を決められませんでした'), 'error'); return; }
      const j = await res.json().catch(() => ({}));
      if (j?.round) onRoundChange(j.round as Round);
      track('event_date_decide', { roundId: round.id });
      toast(`📅 ${label} に決めました`);
    } catch { toast('日程を決められませんでした', 'error'); }
    finally { setBusy(''); }
  }

  async function remind() {
    if (busy || unansweredIds.length === 0) return;
    const ok = await confirmDialog({
      title: `未回答の${unansweredIds.length}人にリマインドしますか？`,
      message: 'お知らせとLINEで「出欠のお返事をください」と届きます（12時間に1回まで）。',
      confirmText: 'リマインドする', cancelText: 'やめる',
    });
    if (!ok) return;
    setBusy('remind');
    try {
      const res = await fetch(`/api/rounds/${encodeURIComponent(round.id)}/event-remind`, { method: 'POST', cache: 'no-store', credentials: 'include' });
      if (!res.ok) { toast(await readApiError(res, 'リマインドを送れませんでした'), 'error'); return; }
      const j = await res.json().catch(() => ({}));
      track('event_remind', { roundId: round.id, sent: j?.sent || 0 });
      if (j?.sent) onRoundChange({ ...round, eventRemindAt: Date.now() });
      toast(j?.sent ? `${j.sent}人にリマインドを送りました` : '未回答の人はいません');
    } catch { toast('リマインドを送れませんでした', 'error'); }
    finally { setBusy(''); }
  }

  const answerCell = (r: { a?: EventAnswer; status: RowStatus }, qid: string) => (r.status === 'no' ? '' : ansText(r.a?.answers?.[qid]));

  async function copyList() {
    const lines: string[] = [];
    lines.push(`【${round.title}】出欠（${fmtAt(Date.now())} 時点）`);
    lines.push(pending ? `📅 日程調整中（候補${options.length}日）` : `📅 ${eventDateLabel({ date: round.date || '', startTime: round.startTime })}`);
    lines.push(`参加 ${joinCount}人 ・ 未定 ${t.maybe}人 ・ 行けない ${t.no}人${t.unanswered ? ` ・ 未回答 ${t.unanswered}人` : ''}`);
    const groups: { label: string; ks: RowStatus[] }[] = [
      { label: '参加', ks: ['host', 'yes'] }, { label: '未定', ks: ['maybe'] }, { label: '行けない', ks: ['no'] }, { label: '未回答', ks: ['none'] },
    ];
    for (const g of groups) {
      const rs = rows.filter((r) => g.ks.includes(r.status));
      if (!rs.length) continue;
      lines.push('', `■ ${g.label}（${rs.length}人）`);
      for (const r of rs) {
        const extra: string[] = [];
        if (r.status === 'host') extra.push('主催');
        if (pending && r.a?.dates) {
          const d = options.filter((o) => r.a!.dates![o.id]).map((o) => `${formatDate(o.date)}${DATE_MARK[r.a!.dates![o.id]]}`).join(' ');
          if (d) extra.push(d);
        }
        for (const q of questions) { const v = answerCell(r, q.id); if (v) extra.push(`${q.text}：${v}`); }
        lines.push(`・${nameOf(r.id)}${extra.length ? `　${extra.join(' ／ ')}` : ''}`);
      }
    }
    const text = lines.join('\n');
    try { await navigator.clipboard.writeText(text); toast('一覧をコピーしました'); track('event_list_copy', { roundId: round.id }); }
    catch { window.prompt('この一覧をコピーしてください', text); }
  }

  const tile = (n: number, label: string, color: string) => (
    <div className="flex-1 bg-white rounded-xl py-2 text-center" style={{ border: '1.5px solid #DDD5F5' }}>
      <div className="text-[22px] font-black leading-none" style={{ color }}>{n}</div>
      <div className="text-[10.5px] font-bold text-sub mt-1">{label}</div>
    </div>
  );

  return (
    <div>
      <div className="text-[14px] font-black mb-2" style={{ color: P }}>📊 集計</div>
      <div className="flex gap-1.5 mb-1">
        {tile(joinCount, '参加', '#1F7A70')}
        {tile(t.maybe, '未定', '#E8643C')}
        {tile(t.no, '行けない', '#555')}
        {tile(t.unanswered, '未回答', '#9A8FC0')}
      </div>
      <div className="text-[10px] text-muted mb-3">参加は主催者を含めた人数です</div>

      {/* 日程 */}
      {pending ? (
        <div className="bg-white rounded-xl p-3 mb-3" style={{ border: '1.5px solid #DDD5F5' }}>
          <div className="text-[13px] font-black mb-2">📅 日程を決める（どの日でも選べる）</div>
          {options.map((o) => {
            const c = t.dates[o.id] || { ok: 0, maybe: 0, no: 0 };
            const on = o.id === chosenId;
            return (
              <button key={o.id} onClick={() => setPick(o.id)}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-[11px] mb-1.5 text-left"
                style={on ? { background: PL, border: `2px solid ${P}` } : { background: '#fff', border: '1.5px solid #E6E1F5' }}>
                <span className="w-4 h-4 rounded-full flex-none grid place-items-center" style={{ border: `2px solid ${on ? P : '#BDB5D8'}` }}>
                  {on && <span className="w-2 h-2 rounded-full" style={{ background: P }} />}
                </span>
                <span className="flex-1 min-w-0 text-[13px] font-black">{eventDateLabel(o)}</span>
                <span className="text-[11.5px] font-bold flex-none" style={{ color: P }}>◯{c.ok} △{c.maybe} ✕{c.no}</span>
              </button>
            );
          })}
          <div className="text-[10.5px] text-sub leading-relaxed mb-2">◯がいちばん多い日でなくてOK（お店の空き・主催者の都合で選べる）。名前ごとの答えは「回答の一覧」で見られます。</div>
          <button onClick={decideDate} disabled={!chosen || busy === 'date'}
            className="w-full py-3 rounded-xl text-[14px] font-black text-white disabled:opacity-50" style={{ background: P, border: '2px solid #5B3FB0' }}>
            {busy === 'date' ? '決定中…' : chosen ? `${eventDateLabel(chosen)} に決める` : '候補日を選んでください'}
          </button>
          <div className="text-[10.5px] text-muted mt-1.5 leading-relaxed">決めると参加者と「未定」の人に通知します。行けなくなった人は回答を直せます。</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl px-3 py-2.5 mb-3 text-[13px] font-black" style={{ border: '1.5px solid #DDD5F5' }}>
          📅 {eventDateLabel({ date: round.date || '', startTime: round.startTime }) || '日時未定'}（決定）
        </div>
      )}

      {/* 質問ごとの集計 */}
      {questions.map((q) => {
        const qt = t.questions[q.id] || { counts: {}, texts: [] };
        if (q.kind === 'choice') {
          const max = Math.max(1, ...Object.values(qt.counts));
          return (
            <div key={q.id} className="bg-white rounded-xl p-3 mb-2" style={{ border: '1.5px solid #DDD5F5' }}>
              <div className="text-[13px] font-black mb-1.5">❓ {q.text}{q.multi && <span className="text-[10px] text-muted font-bold ml-1">（いくつでも）</span>}</div>
              {(q.options || []).map((opt) => {
                const n = qt.counts[opt] || 0;
                return (
                  <div key={opt} className="flex items-center gap-2 py-0.5">
                    <span className="w-[34%] min-w-0 truncate text-[12px] text-sub font-bold">{opt}</span>
                    <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: '#F0EDF9' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.round((n / max) * 100)}%`, background: P }} />
                    </div>
                    <span className="w-6 text-right text-[12px] font-black">{n}</span>
                  </div>
                );
              })}
            </div>
          );
        }
        const grouped = new Map<string, number>();
        for (const x of qt.texts) grouped.set(x, (grouped.get(x) || 0) + 1);
        return (
          <div key={q.id} className="bg-white rounded-xl p-3 mb-2" style={{ border: '1.5px solid #DDD5F5' }}>
            <div className="text-[13px] font-black mb-1">✍️ {q.text}</div>
            <div className="text-[12.5px] text-text leading-relaxed">
              {grouped.size
                ? Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]).map(([x, n]) => `${x}（${n}人）`).join('・')
                : <span className="text-muted">まだ回答はありません</span>}
            </div>
          </div>
        );
      })}

      {/* 名前ごとの一覧 */}
      <button onClick={() => setListOpen((v) => !v)}
        className="w-full mt-1 py-2.5 rounded-xl text-[13px] font-black bg-white" style={{ color: P, border: `1.5px solid ${P}` }}>
        👥 回答の一覧を{listOpen ? '閉じる' : '見る（名前ごと）'}
      </button>
      {listOpen && (
        <div className="mt-2 bg-white rounded-xl p-2" style={{ border: '1.5px solid #DDD5F5' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px] border-collapse">
              <thead>
                <tr className="text-left text-sub">
                  <th className="py-1 pr-2 font-bold whitespace-nowrap">名前</th>
                  <th className="py-1 pr-2 font-bold whitespace-nowrap">出欠</th>
                  {pending && options.map((o) => <th key={o.id} className="py-1 pr-2 font-bold whitespace-nowrap">{formatDate(o.date)}</th>)}
                  {questions.map((q) => <th key={q.id} className="py-1 pr-2 font-bold whitespace-nowrap max-w-[120px] truncate">{q.text}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid #F0EDF9' }}>
                    <td className="py-1.5 pr-2 font-bold whitespace-nowrap">{nameOf(r.id)}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">
                      <span className="px-1.5 py-px rounded-full text-[10.5px] font-black" style={{ background: ROW_TONE[r.status].bg, color: ROW_TONE[r.status].fg }}>{ROW_LABEL[r.status]}</span>
                    </td>
                    {pending && options.map((o) => {
                      const v = r.a?.dates?.[o.id];
                      return <td key={o.id} className="py-1.5 pr-2 text-center font-black" style={{ color: P }}>{v ? DATE_MARK[v] : '—'}</td>;
                    })}
                    {questions.map((q) => <td key={q.id} className="py-1.5 pr-2 whitespace-nowrap">{answerCell(r, q.id) || <span className="text-muted">—</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={copyList} className="w-full mt-2 py-2.5 rounded-xl text-[13px] font-black text-white" style={{ background: P }}>
            📋 コピー（お店への人数連絡などに）
          </button>
        </div>
      )}

      {/* 未回答へのリマインド（主催者が押したときだけ・12時間に1回） */}
      <button onClick={remind} disabled={busy === 'remind' || unansweredIds.length === 0}
        className="w-full mt-2 py-2.5 rounded-xl text-[13px] font-black bg-white disabled:opacity-50" style={{ color: '#4A4560', border: '1.5px solid #BDB5D8' }}>
        {busy === 'remind' ? '送信中…' : unansweredIds.length ? `⏰ 未回答の${unansweredIds.length}人にリマインド` : '⏰ 未回答の人はいません'}
      </button>
      {round.eventRemindAt ? (
        <div className="text-[10.5px] text-muted text-center mt-1">最後に送ったリマインド：{fmtAt(round.eventRemindAt)}（12時間に1回まで）</div>
      ) : null}
    </div>
  );
}
