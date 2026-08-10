'use client';

import { useState } from 'react';
import type { Round, User } from '@/lib/types';
import { store } from '@/lib/store';
import { toast } from '@/components/Toast';
import { Avatar } from '@/components/Avatar';

// 入金管理（主催者が事前にお金を集めてまとめて払うケース用の簡易チェック機能）。
//   主催者・共同管理者 … 各メンバーの「入金済み」をタップでON/OFF＋案内文の編集
//   参加者             … 一覧を閲覧（誰が払ったか・自分が未払いかが分かる）
// 対象メンバー = 主催者 + 共同管理者 + 承認済み参加者 + 名前付きゲスト。
type Member = { id: string; name: string; user?: User; role: string };

export function PaymentTracker({
  round, isHost, meId, users,
}: { round: Round; isHost: boolean; meId: string; users: User[] }) {
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(round.paymentNote || '');
  const [savingNote, setSavingNote] = useState(false);
  const noteDirty = note !== (round.paymentNote || '');

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

  async function toggle(userId: string, next: boolean) {
    if (!isHost || busy) return;
    setBusy(userId);
    try {
      const res = await fetch(`/api/rounds/${round.id}/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, paid: next }), cache: 'no-store', credentials: 'include',
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast(d?.message || '更新に失敗しました', 'error'); return; }
      await store.refreshRounds();
    } catch (e) {
      toast('更新に失敗しました', 'error');
    } finally { setBusy(''); }
  }

  async function saveNote() {
    setSavingNote(true);
    try {
      const res = await fetch(`/api/rounds/${round.id}/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentNote: note }), cache: 'no-store', credentials: 'include',
      });
      if (!res.ok) throw new Error(String(res.status));
      await store.refreshRounds();
      toast('保存しました');
    } catch { toast('保存に失敗しました', 'error'); }
    finally { setSavingNote(false); }
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
          {isHost ? '各メンバーの行をタップして「入金済み」を切り替えられます。参加者にもこの一覧が見えます。' : '主催者が入金を確認するとチェックが付きます。'}
        </div>
      </div>

      {/* 入金案内（主催者は編集・参加者は閲覧） */}
      {isHost ? (
        <div className="bg-card rounded-card p-4 shadow-card mb-2.5">
          <div className="text-[12px] font-black mb-1">📝 入金の案内（参加者に表示）</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="例）参加費 12,000円。当日までに ◯◯銀行 △△支店 普通1234567 ゴルトモタロウ までお願いします。"
            className="w-full text-[13px] border-[1.5px] border-border rounded-xl px-3 py-2.5 bg-bg outline-none leading-relaxed resize-y"
          />
          {noteDirty && (
            <button onClick={saveNote} disabled={savingNote}
              className="mt-2 w-full py-2.5 bg-green text-white rounded-xl text-[13px] font-bold disabled:opacity-50">
              {savingNote ? '保存中...' : '案内を保存する'}
            </button>
          )}
        </div>
      ) : round.paymentNote ? (
        <div className="bg-card rounded-card p-4 shadow-card mb-2.5">
          <div className="text-[12px] font-black mb-1">📝 入金の案内</div>
          <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{round.paymentNote}</div>
        </div>
      ) : null}

      {/* メンバー一覧＋チェック */}
      <div className="bg-card rounded-card p-3 shadow-card">
        {members.map((m) => {
          const isPaid = paid.has(m.id);
          const isMe = m.id === meId;
          const row = (
            <>
              {m.user ? <Avatar user={m.user} size={36} />
                : <div className="w-9 h-9 rounded-full bg-bg flex items-center justify-center text-base flex-shrink-0 border border-border">👤</div>}
              <div className="flex-1 min-w-0 text-left">
                <div className="text-[13px] font-semibold truncate">
                  {m.name}
                  {isMe && <span className="ml-1 text-[10px] text-green font-bold">あなた</span>}
                </div>
                <div className="text-[10px] text-muted">{m.role}</div>
              </div>
              <div className={'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black flex-shrink-0 ' +
                (isPaid ? 'bg-green-light text-green' : 'bg-bg text-muted border border-border')}>
                <span>{isPaid ? '✓' : '○'}</span>
                <span>{isPaid ? '入金済み' : '未入金'}</span>
              </div>
            </>
          );
          return isHost ? (
            <button
              key={m.id}
              onClick={() => toggle(m.id, !isPaid)}
              disabled={!!busy}
              className={'w-full flex items-center gap-2.5 p-2.5 rounded-[10px] mb-1.5 last:mb-0 disabled:opacity-60 ' + (isPaid ? 'bg-green-light/50' : 'bg-bg')}
            >{row}</button>
          ) : (
            <div key={m.id} className={'flex items-center gap-2.5 p-2.5 rounded-[10px] mb-1.5 last:mb-0 ' + (isPaid ? 'bg-green-light/50' : 'bg-bg')}>{row}</div>
          );
        })}
      </div>
    </div>
  );
}
