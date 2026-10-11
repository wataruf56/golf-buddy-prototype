'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Round, User } from '@/lib/types';
import { store } from '@/lib/store';
import { toast } from '@/components/Toast';
import { Avatar } from '@/components/Avatar';
import { Linkify } from '@/components/Linkify';
import { NumberInput } from '@/components/NumberInput';
import { confirmDialog } from '@/components/ConfirmDialog';

// 入金期日は JST の日付＋時刻で入力し、ミリ秒で保存する（2026-10-11）
function msToJstParts(ms?: number): { date: string; time: string } {
  if (!ms) return { date: '', time: '23:59' };
  const iso = new Date(ms + 9 * 3600 * 1000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}
function jstPartsToMs(date: string, time: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 0;
  const t = /^\d{2}:\d{2}$/.test(time) ? time : '23:59';
  const ms = Date.parse(`${date}T${t}:00+09:00`);
  return Number.isFinite(ms) ? ms : 0;
}
function fmtJst(ms: number): string {
  const d = new Date(ms + 9 * 3600 * 1000);
  const w = '日月火水木金土'[d.getUTCDay()];
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${w}) ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
const REMIND_COOLDOWN_MS = 24 * 3600 * 1000;

// 入金管理（主催者が事前にお金を集めてまとめて払うケース用の簡易チェック機能）。
//   主催者・共同管理者 … 各メンバーの「入金済み」をタップでON/OFF＋案内文の編集
//   参加者             … 一覧を閲覧（誰が払ったか・自分が未払いかが分かる）
// 対象メンバー = 主催者 + 共同管理者 + 承認済み参加者 + 名前付きゲスト。
type Member = { id: string; name: string; user?: User; role: string };

export function PaymentTracker({
  round, isHost, meId, users,
}: { round: Round; isHost: boolean; meId: string; users: User[] }) {
  const [note, setNote] = useState(round.paymentNote || '');
  const [savingNote, setSavingNote] = useState(false);
  // 金額・振込先・入金期日（2026-10-11）
  const info = ((round as any).paymentInfo || {}) as { amount?: number; account?: string; deadline?: number; accountHidden?: boolean };
  const [amount, setAmount] = useState<number | null>(info.amount ?? null);
  const [account, setAccount] = useState(info.account || '');
  const initParts = msToJstParts(info.deadline);
  const [dDate, setDDate] = useState(initParts.date);
  const [dTime, setDTime] = useState(initParts.time);
  const newDeadline = jstPartsToMs(dDate, dTime);
  const settingsDirty = note !== (round.paymentNote || '') || (amount ?? 0) !== (info.amount ?? 0)
    || account.trim() !== (info.account || '') || newDeadline !== (info.deadline || 0);
  // 入金チェックは下書き →「確定して保存」で反映（2026-10-11）
  const [draft, setDraft] = useState<Set<string>>(new Set(round.paidIds || []));
  const [savingPaid, setSavingPaid] = useState(false);
  const [reminding, setReminding] = useState(false);
  useEffect(() => { setDraft(new Set(round.paidIds || [])); }, [(round.paidIds || []).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  // 主催者だけ：参加者の漢字フルネーム（participant-names は主催者限定）
  const [realNames, setRealNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!isHost || !round.id) return;
    fetch(`/api/rounds/${round.id}/participant-names`, { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.names) setRealNames(j.names); }).catch(() => {});
  }, [isHost, round.id, (round.applicantIds || []).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  // ゲスト（ゴルトモ未登録の同伴者）の名前編集。人数の増減は「募集人数」タブ側で行う。
  const [guestBusy, setGuestBusy] = useState(false);
  const [editingGuest, setEditingGuest] = useState('');
  const [editName, setEditName] = useState('');

  async function guestApi(payload: Record<string, unknown>) {
    if (guestBusy) return;
    setGuestBusy(true);
    try {
      const res = await fetch(`/api/rounds/${round.id}/guests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), cache: 'no-store', credentials: 'include',
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast(d?.message || '更新に失敗しました', 'error'); return; }
      await store.refreshRounds();
      setEditingGuest(''); setEditName('');
    } catch { toast('更新に失敗しました', 'error'); }
    finally { setGuestBusy(false); }
  }

  const paid = new Set(round.paidIds || []);
  const coHostIds = round.coHostIds || [];
  const userOf = (id: string) => users.find((u) => u.id === id);

  // 表示順：主催者 → 共同管理者 → 参加者 → ゲスト
  const members: Member[] = [
    { id: round.hostId, name: userOf(round.hostId)?.displayName || '主催者', user: userOf(round.hostId), role: '主催者' },
    ...coHostIds.map((id) => ({ id, name: userOf(id)?.displayName || 'メンバー', user: userOf(id), role: '共同管理者' })),
    ...(round.applicantIds || []).filter((id) => !coHostIds.includes(id))
      .map((id) => ({ id, name: userOf(id)?.displayName || 'メンバー', user: userOf(id), role: '参加者' })),
    ...(round.guests || []).map((g) => ({ id: g.id, name: g.name, user: undefined, role: 'ゲスト' })),
  ];

  const paidCount = members.filter((m) => paid.has(m.id)).length;
  // ゴルトモ公式コンペ（運営が主催・参加費は運営が受け取ってゴルフ場へまとめて支払う）（2026-10-11）
  const isOfficialComp = !!(round as any).isOfficial && !!round.isCompetition && !(round as any).availDate;
  const paidDirty = members.some((m) => draft.has(m.id) !== paid.has(m.id));
  const deadline = info.deadline || 0;
  const pastDeadline = !!deadline && Date.now() >= deadline;
  // 催促の対象＝承認済みの参加者のうち未入金の人（主催者・共同管理者・ゲストは除く）
  const unpaidTargets = (round.applicantIds || []).filter((id) => id !== round.hostId && !coHostIds.includes(id) && !paid.has(id));
  const lastRemind = Number((round as any).paymentReminderSentAt) || 0;
  const nextRemindAt = lastRemind ? lastRemind + REMIND_COOLDOWN_MS : 0;
  const inCooldown = !!nextRemindAt && Date.now() < nextRemindAt;

  async function postPayments(payload: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/rounds/${round.id}/payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), cache: 'no-store', credentials: 'include',
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast(d?.message || '保存に失敗しました', 'error'); return false; }
    await store.refreshRounds();
    return true;
  }

  async function saveSettings() {
    if (dDate && !newDeadline) { toast('入金期日の日付・時刻を確認してください', 'error'); return; }
    setSavingNote(true);
    try {
      if (await postPayments({ paymentNote: note, paymentInfo: { amount: amount || 0, account: account.trim(), deadline: newDeadline } })) toast('入金の設定を保存しました');
    } catch { toast('保存に失敗しました', 'error'); }
    finally { setSavingNote(false); }
  }

  async function savePaid() {
    setSavingPaid(true);
    try {
      if (await postPayments({ paidIds: members.filter((m) => draft.has(m.id)).map((m) => m.id) })) toast('入金状況を保存しました');
    } catch { toast('保存に失敗しました', 'error'); }
    finally { setSavingPaid(false); }
  }

  async function sendReminder() {
    if (!(await confirmDialog(`未入金の ${unpaidTargets.length} 人に、ゴルトモ運営から入金の催促メッセージを送ります（LINE にも届きます）。送ったあと24時間は再送できません。送りますか？`))) return;
    setReminding(true);
    try {
      const res = await fetch(`/api/rounds/${round.id}/payment-reminder`, { method: 'POST', cache: 'no-store', credentials: 'include' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast(d?.message || '送信に失敗しました', 'error'); return; }
      await store.refreshRounds();
      toast(`${d.sent ?? unpaidTargets.length} 人に催促メッセージを送りました`);
    } catch { toast('送信に失敗しました', 'error'); }
    finally { setReminding(false); }
  }

  return (
    <div className="mb-4">
      {/* 集計 */}
      <div className="bg-card rounded-card p-4 shadow-card mb-2.5">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[13px] font-black">💰 入金状況</div>
          <div className="text-[13px] font-black text-green">{paidCount}<span className="text-[11px] text-sub font-bold"> / {members.length}人</span></div>
        </div>
        <div className="h-2 bg-bg rounded-full overflow-hidden">
          <div className="h-full bg-green rounded-full transition-all" style={{ width: `${members.length ? (paidCount / members.length) * 100 : 0}%` }} />
        </div>
        <div className="text-[10px] text-muted mt-1.5">
          {isHost ? '入金を確認した人にチェックを入れて「確定して保存」を押してください。参加者にもこの一覧（ニックネームと入金済みかどうか）が見えます。本名は主催者だけに表示されます。' : '主催者が入金を確認するとチェックが付きます。'}
        </div>
      </div>

      {/* 入金の設定（主催者は編集・参加者は閲覧） */}
      {isHost ? (
        <div className="bg-card rounded-card p-4 shadow-card mb-2.5">
          <div className="text-[12px] font-black mb-2">📝 入金の設定（参加者に表示）</div>
          <label className="block text-[11px] font-bold text-sub mb-1">金額（1人あたり）</label>
          <div className="flex items-center gap-2 mb-3">
            <NumberInput value={amount} onChange={setAmount} min={0} max={1000000} placeholder="12000" ariaLabel="金額"
              className="flex-1 min-w-0 text-[14px] border-[1.5px] border-border rounded-xl px-3 py-2.5 bg-bg outline-none" />
            <span className="text-[13px] font-bold">円</span>
          </div>
          <label className="block text-[11px] font-bold text-sub mb-1">振込先の口座</label>
          <textarea value={account} onChange={(e) => setAccount(e.target.value)} rows={2} maxLength={300}
            placeholder="例）◯◯銀行 △△支店 普通 1234567 ゴルトモ タロウ"
            className="w-full text-[13px] border-[1.5px] border-border rounded-xl px-3 py-2.5 bg-bg outline-none leading-relaxed resize-y mb-3" />
          <label className="block text-[11px] font-bold text-sub mb-1">入金期日（日付と時刻）</label>
          <div className="flex items-center gap-2 mb-1">
            <input type="date" value={dDate} onChange={(e) => setDDate(e.target.value)}
              className="flex-1 min-w-0 text-[14px] border-[1.5px] border-border rounded-xl px-3 py-2.5 bg-bg outline-none" />
            <input type="time" value={dTime} onChange={(e) => setDTime(e.target.value)}
              className="w-[110px] text-[14px] border-[1.5px] border-border rounded-xl px-3 py-2.5 bg-bg outline-none" />
          </div>
          {dDate && <button type="button" onClick={() => { setDDate(''); setDTime('23:59'); }} className="text-[11px] text-sub font-bold mb-2">期日をなしにする</button>}
          <label className="block text-[11px] font-bold text-sub mb-1 mt-2">補足（任意）</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500}
            placeholder="例）振込名義の頭に「ゴルトモ」を付けてください"
            className="w-full text-[13px] border-[1.5px] border-border rounded-xl px-3 py-2.5 bg-bg outline-none leading-relaxed resize-y" />
          {settingsDirty && (
            <button onClick={saveSettings} disabled={savingNote}
              className="mt-2 w-full py-2.5 bg-green text-white rounded-xl text-[13px] font-bold disabled:opacity-50">
              {savingNote ? '保存中...' : '入金の設定を保存する'}
            </button>
          )}
        </div>
      ) : (info.amount || info.account || info.deadline || round.paymentNote) ? (
        <div className="bg-card rounded-card p-4 shadow-card mb-2.5">
          <div className="text-[12px] font-black mb-2">📝 入金のご案内</div>
          {!!info.amount && <Row label="金額">{info.amount.toLocaleString('ja-JP')}円</Row>}
          {!!info.account && <Row label="振込先"><span className="whitespace-pre-wrap">{info.account}</span></Row>}
          {!!deadline && (
            <Row label="入金期日">
              <span className={pastDeadline && !paid.has(meId) ? 'text-red-600 font-black' : ''}>{fmtJst(deadline)}</span>
              {pastDeadline && !paid.has(meId) && <span className="block text-[11px] text-red-600 font-bold">期日を過ぎています。お早めにお振り込みください。</span>}
            </Row>
          )}
          {round.paymentNote && <div className="text-[13px] leading-relaxed whitespace-pre-wrap mt-1"><Linkify text={round.paymentNote || ''} /></div>}
          <div className="text-[11px] text-sub mt-2">{paid.has(meId) ? '✓ 主催者があなたの入金を確認しました' : '入金すると、主催者が確認したあとにチェックが付きます。'}</div>
        </div>
      ) : null}

      {/* 未入金者への催促（主催者だけ・期日を過ぎたら） */}
      {isHost && !!deadline && unpaidTargets.length > 0 && (
        <div className="bg-card rounded-card p-4 shadow-card mb-2.5">
          {pastDeadline ? (
            <>
              <div className="text-[12px] font-black mb-1 text-red-600">⏰ 入金期日を過ぎた未入金の人が {unpaidTargets.length} 人います</div>
              <button onClick={sendReminder} disabled={reminding || inCooldown || paidDirty}
                className="mt-1 w-full py-3 bg-orange text-white rounded-xl text-[13px] font-bold disabled:opacity-50 leading-snug">
                {reminding ? '送信中...' : '運営を経由して入金の催促メッセージを送りますか？'}
              </button>
              <div className="text-[10px] text-muted mt-1.5 leading-relaxed">
                {inCooldown ? `送信済みです。次に送れるのは ${fmtJst(nextRemindAt)} 以降です。`
                  : paidDirty ? '先に下の入金状況を保存してください。'
                  : 'ゴルトモ運営（管理人）から、未入金の人だけに振込先つきのメッセージが届きます。LINE にも通知されます。一度送ると24時間は再送できません。'}
              </div>
            </>
          ) : (
            <div className="text-[11px] text-sub leading-relaxed">入金期日（{fmtJst(deadline)}）を過ぎても未入金の人がいたら、ここから運営経由で催促メッセージを送れます。</div>
          )}
        </div>
      )}

      {/* メンバー一覧＋チェック */}
      <div className="bg-card rounded-card p-3 shadow-card">
        {members.map((m) => {
          const isPaid = isHost ? draft.has(m.id) : paid.has(m.id);
          const isMe = m.id === meId;
          const isGuest = m.id.startsWith('gst_');

          // 名前の編集中（ゲストのみ・主催者のみ）
          if (isHost && isGuest && editingGuest === m.id) {
            return (
              <div key={m.id} className="flex items-center gap-2 p-2.5 rounded-[10px] mb-1.5 last:mb-0 bg-bg">
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={30}
                  placeholder="ゲストの名前"
                  className="flex-1 min-w-0 text-[13px] border-[1.5px] border-border rounded-lg px-2.5 py-1.5 bg-card outline-none"
                />
                <button onClick={() => guestApi({ action: 'rename', id: m.id, name: editName })} disabled={guestBusy || !editName.trim()}
                  className="px-3 py-1.5 bg-green text-white rounded-lg text-[11px] font-bold disabled:opacity-50 flex-shrink-0">保存</button>
                <button onClick={() => { setEditingGuest(''); setEditName(''); }}
                  className="px-2 py-1.5 text-[11px] font-bold text-sub flex-shrink-0">やめる</button>
              </div>
            );
          }

          const row = (
            <>
              {m.user ? <Avatar user={m.user} size={36} />
                : <div className="w-9 h-9 rounded-full bg-bg flex items-center justify-center text-base flex-shrink-0 border border-border">👤</div>}
              <div className="flex-1 min-w-0 text-left">
                <div className="text-[13px] font-semibold truncate">
                  {m.name}
                  {isMe && <span className="ml-1 text-[10px] text-green font-bold">あなた</span>}
                </div>
                {isHost && realNames[m.id] && <div className="text-[12px] text-text">📋 {realNames[m.id]}</div>}
                <div className="text-[10px] text-muted">
                  {m.role}
                  {m.user?.gender && <> ・ {m.user.gender === 'female' ? '女性' : '男性'}</>}
                  {!!m.user?.age && <> ・ {m.user.age}歳</>}
                </div>
              </div>
              {isHost ? (
                <div className={'w-7 h-7 rounded-lg border-2 flex items-center justify-center text-[15px] font-black flex-shrink-0 ' +
                  (isPaid ? 'bg-green border-green text-white' : 'bg-card border-border text-transparent')} aria-hidden>✓</div>
              ) : (
                <div className={'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black flex-shrink-0 ' +
                  (isPaid ? 'bg-green-light text-green' : 'bg-bg text-muted border border-border')}>
                  <span>{isPaid ? '✓' : '○'}</span>
                  <span>{isPaid ? '入金済み' : '未入金'}</span>
                </div>
              )}
            </>
          );

          return (
            <div key={m.id} className={'flex items-stretch gap-1 mb-1.5 last:mb-0 rounded-[10px] ' + (isPaid ? 'bg-green-light/50' : 'bg-bg')}>
              {isHost ? (
                <button type="button" role="checkbox" aria-checked={isPaid} disabled={savingPaid}
                  onClick={() => setDraft((prev) => { const n = new Set(prev); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })}
                  className="flex-1 min-w-0 flex items-center gap-2.5 p-2.5 disabled:opacity-60">{row}</button>
              ) : (
                <div className="flex-1 min-w-0 flex items-center gap-2.5 p-2.5">{row}</div>
              )}
              {isHost && isGuest && (
                <div className="flex items-center pr-1.5 flex-shrink-0">
                  <button onClick={() => { setEditingGuest(m.id); setEditName(m.name); }} disabled={guestBusy}
                    aria-label="名前を変更" className="w-8 h-8 rounded-lg text-[13px] text-sub disabled:opacity-50">✏️</button>
                </div>
              )}
            </div>
          );
        })}

        {isHost && (
          <button onClick={savePaid} disabled={!paidDirty || savingPaid}
            className="mt-2 w-full py-3 bg-green text-white rounded-xl text-[13px] font-bold disabled:opacity-40">
            {savingPaid ? '保存中...' : paidDirty ? '入金状況を確定して保存する' : '入金状況は保存済みです'}
          </button>
        )}

        {/* ゲストの増減は「募集人数」タブの知り合い人数で行う（ここでは名前の修正のみ） */}
        {isHost && (
          <div className="mt-2 pt-2.5 border-t border-border text-[10px] text-muted">
            ゲスト（ゴルトモ未登録の同伴者）の人数は、募集の編集 →「募集人数」タブの<b className="text-sub">「主催者の知り合い」</b>で増減できます。名前はそこでも、この一覧の ✏️ からでも変更できます。
          </div>
        )}
      </div>

      <div className="text-[10px] text-muted mt-2 leading-relaxed px-1">
        {isOfficialComp
          ? 'ゴルトモ公式コンペの参加費はゴルトモ運営が受け取り、コンペ当日にゴルフ場へプレーフィーをまとめて支払います。食事・飲み物などそのほかの費用は、各自でゴルフ場にお支払いください。'
          : 'お金のやり取りは主催者と参加者のあいだで行うもので、ゴルトモ運営は入金の受け取り・立て替え・返金・キャンセル料の請求には関与しません。'}
        <Link href="/legal/money" className="text-blue font-bold ml-1">お金のやり取りに関するルール →</Link>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-[13px] mb-1.5">
      <div className="w-[64px] flex-shrink-0 text-[11px] font-bold text-sub pt-0.5">{label}</div>
      <div className="flex-1 min-w-0 leading-relaxed">{children}</div>
    </div>
  );
}
