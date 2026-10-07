'use client';

import { useState } from 'react';
import { store, useStore } from '@/lib/store';
import { toast } from '@/components/Toast';
import { confirmDialog } from '@/components/ConfirmDialog';
import type { Round } from '@/lib/types';
import { isWaitlisted, slotGenderIcon, slotGenderLabel, type SlotGender } from '@/lib/genderSlots';

// 自分の性別の枠が満員のとき、参加ボタンの代わりに出す「🔔 空きが出たら参加したい」（2026-10-07 本人要望）。
// 登録すると主催者に伝わり、空きが出たら LINE＋アプリ内でお知らせ → ふつうの参加申請へ（先着ではない）。
// compact=true は画面下の固定バー用（ボタンだけ）。
export function WaitlistBox({ round, gender, compact }: { round: Round; gender: SlotGender; compact?: boolean }) {
  const meId = useStore((s) => s.meId);
  const [busy, setBusy] = useState(false);
  const registered = isWaitlisted(round, meId);
  const count = round.waitlistCounts?.[gender] || 0;
  const rank = round.waitlistRank;
  const label = slotGenderLabel(gender);

  async function toggle(on: boolean) {
    if (busy) return;
    if (!on && !(await confirmDialog('空き待ちを取り消しますか？\n空きが出てもお知らせは届かなくなります。'))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rounds/${round.id}/waitlist`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on }), cache: 'no-store', credentials: 'include',
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message || `${res.status}`);
      await store.refreshRounds();
      toast(on ? '空き待ちに登録しました。空きが出たらお知らせします' : '空き待ちを取り消しました');
    } catch (e) {
      toast('失敗しました: ' + (e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return registered
      ? <button onClick={() => toggle(false)} disabled={busy} className="flex-none px-3.5 py-2.5 rounded-xl text-[12px] font-bold text-sub bg-card border-2 border-border disabled:opacity-50">取り消す</button>
      : <button onClick={() => toggle(true)} disabled={busy} className="flex-none px-4 py-3 rounded-xl text-[13.5px] font-black bg-card border-2 border-orange text-orange disabled:opacity-50">🔔 空き待ち</button>;
  }

  if (registered) {
    return (
      <div className="mb-4">
        <div className="rounded-xl border-[1.5px] border-green bg-green-light p-3">
          <div className="text-[13px] font-black text-green">✅ 空き待ちに登録しました{rank ? `（あなたは${rank}人目）` : ''}</div>
          <div className="text-[11.5px] text-sub leading-relaxed mt-1">
            主催者が{label}枠を増やす、または{label}の参加者が辞退して空きが出たら、LINEでお知らせします。そのときに参加申請できます（先着ではなく、通知を見てから申請）。
          </div>
        </div>
        <button onClick={() => toggle(false)} disabled={busy}
          className="w-full mt-2 py-2.5 rounded-xl bg-card text-sub border border-border text-[12px] font-bold disabled:opacity-50">
          空き待ちを取り消す
        </button>
        <div className="flex flex-wrap gap-1.5 justify-center mt-2">
          <span className="text-[10.5px] font-black bg-card border-[1.5px] border-hair rounded-full px-2.5 py-1 text-sub">空き待ち {count}人</span>
          <span className="text-[10.5px] font-black bg-card border-[1.5px] border-hair rounded-full px-2.5 py-1 text-sub">主催者に伝わっています</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="rounded-xl p-3" style={{ background: '#FFF1C9', border: '1.5px solid #C9A24A' }}>
        <div className="text-[13px] font-black" style={{ color: '#8A5A00' }}>{slotGenderIcon(gender)} {label}枠は満員です</div>
        <div className="text-[11.5px] leading-relaxed mt-1" style={{ color: '#6b5a2a' }}>
          いまは{label}は参加申請できません。空きが出たときに参加したい場合は、下のボタンで主催者に伝えられます。
        </div>
      </div>
      <button onClick={() => toggle(true)} disabled={busy}
        className="w-full mt-2 py-4 rounded-xl text-[16px] font-black bg-card text-orange border-2 border-orange disabled:opacity-50">
        🔔 空きが出たら参加したい
      </button>
      <div className="flex flex-wrap gap-1.5 justify-center mt-2.5">
        {['主催者に伝わります', '空いたらLINEでお知らせ', 'いつでも取り消せます'].map((t) => (
          <span key={t} className="text-[10.5px] font-black bg-card border-[1.5px] border-hair rounded-full px-2.5 py-1 text-sub">{t}</span>
        ))}
        {count > 0 && <span className="text-[10.5px] font-black bg-card border-[1.5px] border-hair rounded-full px-2.5 py-1 text-sub">空き待ち {count}人</span>}
      </div>
    </div>
  );
}
