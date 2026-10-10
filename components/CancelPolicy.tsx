'use client';

import Link from 'next/link';
import { NumberInput } from '@/components/NumberInput';
import { CANCEL_CONDITION_TEMPLATES, formatCancelDeadline, isPastCancelDeadline, type CancelPolicy } from '@/lib/cancelPolicy';

// キャンセル規定（2026-10-10）。lib/cancelPolicy 参照。

export type CancelPolicyDraft = { on: boolean; date: string; time: string; fee: number | null; account: string; condition: string };
export const emptyCancelDraft: CancelPolicyDraft = { on: false, date: '', time: '18:00', fee: null, account: '', condition: '' };

/** 募集作成・編集で使う入力欄 */
export function CancelPolicyEditor({ value, onChange, roundDate }: { value: CancelPolicyDraft; onChange: (v: CancelPolicyDraft) => void; roundDate?: string }) {
  const set = (p: Partial<CancelPolicyDraft>) => onChange({ ...value, ...p });
  const isTemplate = CANCEL_CONDITION_TEMPLATES.includes(value.condition);
  const sel = !value.condition ? '' : isTemplate ? value.condition : '__free__';
  const cls = 'w-full p-3 border-[1.5px] border-border rounded-xl text-sm bg-bg';
  return (
    <div className="mt-1">
      <button type="button" onClick={() => set({ on: !value.on })}
        className={'w-full flex items-center gap-3 p-3 rounded-[10px] border-[1.5px] text-left ' + (value.on ? 'border-green bg-green-light' : 'border-border bg-bg')}>
        <span className={'w-6 h-6 rounded-md flex items-center justify-center text-[14px] font-black flex-shrink-0 border-2 ' + (value.on ? 'bg-green border-green text-white' : 'bg-card border-border text-transparent')}>✓</span>
        <span className="flex-1 min-w-0">
          <span className={'block text-sm font-bold ' + (value.on ? 'text-green' : 'text-sub')}>⏰ キャンセル締切を決める</span>
          <span className="block text-[10px] text-muted font-medium mt-0.5">締切を過ぎた参加者はアプリからキャンセルできず、主催者へのDMで連絡する形になります</span>
        </span>
      </button>
      {value.on && (
        <div className="mt-2 p-3 rounded-xl border-[1.5px] border-border bg-card flex flex-col gap-3">
          <div>
            <label className="block text-[11px] font-bold text-sub mb-1">キャンセル締切 <span className="text-red">*</span></label>
            <div className="flex gap-2">
              <input type="date" value={value.date} max={roundDate || undefined} onChange={(e) => set({ date: e.target.value })} className={cls + ' flex-[3] min-w-0'} />
              <input type="time" value={value.time} onChange={(e) => set({ time: e.target.value })} className={cls + ' flex-[2] min-w-0'} />
            </div>
            <div className="text-[10px] text-muted mt-1">この日時を過ぎると、参加確定の人は「参加を取りやめる」が押せなくなります。</div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-sub mb-1">キャンセル料（円）</label>
            <div className="flex items-center gap-2">
              <NumberInput value={value.fee} onChange={(n) => set({ fee: n })} min={0} max={1000000} placeholder="例: 5000" className={cls} ariaLabel="キャンセル料（円）" />
              <span className="text-sm font-bold text-sub flex-shrink-0">円</span>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-sub mb-1">キャンセル料が発生する条件</label>
            <select value={sel} onChange={(e) => set({ condition: e.target.value === '__free__' ? (isTemplate ? '' : value.condition) || ' ' : e.target.value })} className={cls}>
              <option value="">選んでください</option>
              {CANCEL_CONDITION_TEMPLATES.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value="__free__">自由に書く</option>
            </select>
            {sel === '__free__' && (
              <textarea value={value.condition.trimStart()} onChange={(e) => set({ condition: e.target.value })} rows={3} maxLength={300}
                placeholder="例）前日18時以降のキャンセルは、ゴルフ場のキャンセル料（プレー代の50%）を負担してください。" className={cls + ' mt-1.5'} />
            )}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-sub mb-1">キャンセル料の振込先</label>
            <textarea value={value.account} onChange={(e) => set({ account: e.target.value })} rows={2} maxLength={300}
              placeholder="例）〇〇銀行 〇〇支店 普通 1234567 ヤマダタロウ ／ PayPay ID: xxxx" className={cls} />
            <div className="text-[10px] text-muted mt-1">振込先は、参加している人（参加確定・申請中）にだけ表示されます。</div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 入力欄 → API に送る値（オフなら null） */
export function draftToPayload(d: CancelPolicyDraft, jstToMs: (date: string, time: string) => number): Record<string, unknown> | null {
  if (!d.on) return null;
  return { deadline: jstToMs(d.date, d.time), fee: d.fee || 0, account: d.account.trim(), condition: d.condition.trim() };
}

/** 募集ページに出すキャンセル規定 */
export function CancelPolicyCard({ round }: { round: { cancelPolicy?: CancelPolicy | null } }) {
  const cp = round.cancelPolicy;
  if (!cp?.deadline) return null;
  const past = isPastCancelDeadline(round);
  return (
    <div className={'mb-4 rounded-xl border-[1.5px] px-3 py-2.5 ' + (past ? 'border-red-300 bg-red-50' : 'border-border bg-card')}>
      <div className="text-[11px] font-black text-text">⏰ キャンセル締切：{formatCancelDeadline(cp.deadline)}まで{past && <span className="ml-1.5 text-red-600">（締切を過ぎました）</span>}</div>
      {!!cp.fee && <div className="text-[12px] mt-1"><b>締切後のキャンセル料：{cp.fee.toLocaleString('ja-JP')}円</b></div>}
      {cp.condition && <div className="text-[11.5px] text-sub mt-1 leading-relaxed whitespace-pre-wrap">{cp.condition}</div>}
      {cp.account
        ? <div className="text-[11.5px] mt-1.5 leading-relaxed whitespace-pre-wrap"><span className="text-sub font-bold">振込先：</span>{cp.account}</div>
        : (cp as any).accountHidden ? <div className="text-[10.5px] text-muted mt-1.5">振込先は参加すると表示されます。</div> : null}
    </div>
  );
}

/** 締切後、参加確定の人に「参加を取りやめる」の代わりに出す */
export function CancelClosedBox({ round, dmHref }: { round: { cancelPolicy?: CancelPolicy | null }; dmHref: string }) {
  const cp = round.cancelPolicy;
  return (
    <div className="rounded-xl border-[1.5px] border-red-300 bg-red-50 p-3">
      <div className="text-[12.5px] font-black text-red-700">⏰ キャンセル締切（{cp?.deadline ? formatCancelDeadline(cp.deadline) : ''}）を過ぎたため、アプリからはキャンセルできません</div>
      <div className="text-[11px] text-sub mt-1 leading-relaxed">
        どうしても参加できなくなった場合は、主催者に直接連絡してください。{cp?.fee ? `キャンセル料（${cp.fee.toLocaleString('ja-JP')}円）がかかる場合があります。` : ''}
      </div>
      <Link href={dmHref} className="block w-full mt-2 py-2.5 rounded-xl bg-blue text-white text-center text-[13px] font-black">💬 主催者にDMで連絡する</Link>
    </div>
  );
}
