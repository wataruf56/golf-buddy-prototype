'use client';

import Link from 'next/link';
import { NumberInput } from '@/components/NumberInput';
import { cancelConditionTemplates, upgradeCondition, swapConditionForPayment, formatCancelDeadline, isPastCancelDeadline, msToJst, type CancelPolicy } from '@/lib/cancelPolicy';

// キャンセル規定（2026-10-10）。lib/cancelPolicy 参照。

export type CancelPolicyDraft = { on: boolean; date: string; time: string; fee: number | null; account: string; condition: string };
export const emptyCancelDraft: CancelPolicyDraft = { on: false, date: '', time: '18:00', fee: null, account: '', condition: '' };

/** 募集作成・編集で使う入力欄。
 *  prepaid＝事前集金ON（条件テンプレートが切り替わる）、paymentDeadline＝入金期日（「合わせる」ボタン用）（2026-10-12） */
export function CancelPolicyEditor({ value, onChange, roundDate, prepaid = false, paymentDeadline = 0 }: {
  value: CancelPolicyDraft; onChange: (v: CancelPolicyDraft) => void; roundDate?: string; prepaid?: boolean; paymentDeadline?: number;
}) {
  const set = (p: Partial<CancelPolicyDraft>) => onChange({ ...value, ...p });
  const templates = cancelConditionTemplates(prepaid);
  // 古い文例・事前集金の有無と食い違う文例も、同じ記号（A/B）の今の文例として扱う
  const normCond = swapConditionForPayment(upgradeCondition(value.condition), prepaid);
  const isTemplate = templates.includes(normCond);
  const payJ = prepaid && paymentDeadline ? msToJst(paymentDeadline) : null;
  const sameAsPay = !!payJ && payJ.date === value.date && payJ.time === value.time;
  const sel = !value.condition ? '' : isTemplate ? normCond : '__free__';
  const pick = (v: string) => set({ condition: v === '__free__' ? (isTemplate ? '' : value.condition) || ' ' : v });
  const card = (on: boolean) => 'w-full flex items-start gap-2.5 p-2.5 rounded-xl border-[1.5px] text-left ' + (on ? 'border-green bg-green-light' : 'border-border bg-bg');
  const dot = (on: boolean) => 'mt-0.5 w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 grid place-items-center ' + (on ? 'border-green' : 'border-border');
  const cls = 'w-full p-3 border-[1.5px] border-border rounded-xl text-sm bg-bg';
  return (
    <div className="mt-1">
      <button type="button" onClick={() => set({ on: !value.on })}
        className={'w-full flex items-center gap-3 p-3 rounded-[10px] border-[1.5px] text-left ' + (value.on ? 'border-green bg-green-light' : 'border-border bg-bg')}>
        <span className={'w-6 h-6 rounded-md flex items-center justify-center text-[14px] font-black flex-shrink-0 border-2 ' + (value.on ? 'bg-green border-green text-white' : 'bg-card border-border text-transparent')}>✓</span>
        <span className="flex-1 min-w-0">
          <span className={'block text-sm font-bold ' + (value.on ? 'text-green' : 'text-sub')}>⏰ キャンセル日を決める</span>
          <span className="block text-[10px] text-muted font-medium mt-0.5">オンにすると、締切日時・キャンセル料・条件・振込先を入れられます。締切を過ぎた参加者はアプリからキャンセルできず、主催者へのDMで連絡します</span>
        </span>
      </button>
      {value.on && (
        <div className="mt-2 p-3 rounded-xl border-[1.5px] border-border bg-card flex flex-col gap-3">
          <div>
            <label className="block text-[11px] font-bold text-sub mb-1">キャンセル締切（この日時まではアプリからキャンセルできます） <span className="text-red">*</span></label>
            <div className="flex gap-2">
              <input type="date" value={value.date} max={roundDate || undefined} onChange={(e) => set({ date: e.target.value })} className={cls + ' flex-[3] min-w-0'} />
              <input type="time" value={value.time} onChange={(e) => set({ time: e.target.value })} className={cls + ' flex-[2] min-w-0'} />
            </div>
            <div className="text-[10px] text-muted mt-1">この日時を過ぎると、参加確定の人は「参加を取りやめる」が押せなくなります。</div>
            {payJ && (sameAsPay
              ? <div className="mt-1.5 text-[11px] font-bold text-green">✓ 入金期日（{formatCancelDeadline(paymentDeadline)}）と同じ日時です</div>
              : (
                <button type="button" onClick={() => set({ date: payJ.date, time: payJ.time })}
                  className="mt-1.5 w-full px-3 py-2 rounded-lg bg-green-light border border-green text-left text-[11.5px] font-bold text-green">
                  キャンセル期日を入金期日（{formatCancelDeadline(paymentDeadline)}）と合わせますか？ <span className="underline">→ 合わせる</span>
                </button>
              ))}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-sub mb-1">キャンセル料の目安（1枠あたり・任意）</label>
            <div className="flex items-center gap-2">
              <NumberInput value={value.fee} onChange={(n) => set({ fee: n })} min={0} max={1000000} placeholder="例: 3000" className={cls} ariaLabel="キャンセル料の目安（1枠あたり）" />
              <span className="text-sm font-bold text-sub flex-shrink-0">円</span>
            </div>
            <div className="text-[10px] text-muted mt-1">割増料金やゴルフ場のキャンセル料が1枠あたりいくらくらいになるかの目安です。わからなければ空欄でOK。</div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-sub mb-1">キャンセル料の条件<span className="text-muted font-medium">（{prepaid ? '事前集金ありの文例' : '事前集金なしの文例'}）</span></label>
            {/* 選択肢はカードで並べる（文例が箇条書きの複数行なので、プルダウンだと読めない）（2026-10-12） */}
            <div className="flex flex-col gap-1.5">
              {templates.map((t, i) => {
                const on = sel === t;
                return (
                  <button key={t} type="button" onClick={() => pick(t)} className={card(on)} aria-pressed={on}>
                    <span className={dot(on)}>{on && <span className="w-2 h-2 rounded-full bg-green" />}</span>
                    <span className="flex-1 min-w-0">
                      <span className={'inline-block text-[10.5px] font-black px-1.5 py-px rounded mb-1 ' + (on ? 'bg-green text-white' : 'bg-card border border-border text-sub')}>
                        {String.fromCharCode(65 + i)}　{i === 0 ? '割増料金だけ' : '割増料金か、ゴルフ場のキャンセル料（どちらか一方）'}
                      </span>
                      <span className="block text-[11.5px] leading-relaxed whitespace-pre-wrap text-text">{t}</span>
                    </span>
                  </button>
                );
              })}
              <button type="button" onClick={() => pick('__free__')} className={card(sel === '__free__')} aria-pressed={sel === '__free__'}>
                <span className={dot(sel === '__free__')}>{sel === '__free__' && <span className="w-2 h-2 rounded-full bg-green" />}</span>
                <span className="flex-1 text-[12px] font-bold text-text">自由に書く</span>
              </button>
            </div>
            {sel === '__free__' && (
              <textarea value={value.condition.trimStart()} onChange={(e) => set({ condition: e.target.value })} rows={4} maxLength={400}
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
      {!!cp.fee && <div className="text-[12px] mt-1"><b>締切後のキャンセル料（目安）：{cp.fee.toLocaleString('ja-JP')}円</b></div>}
      {cp.condition && <div className="text-[11.5px] text-sub mt-1 leading-relaxed whitespace-pre-wrap">{upgradeCondition(cp.condition)}</div>}
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
