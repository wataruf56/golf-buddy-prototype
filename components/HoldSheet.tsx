'use client';

import { useEffect, useMemo, useState } from 'react';
import { Portal } from '@/components/Portal';
import { store } from '@/lib/store';
import type { Round } from '@/lib/types';
import {
  HOLD_AUTO_TEMPLATE, HOLD_OTHER_TEMPLATES, HOLD_MESSAGE_MAX, HOLD_DATE_TOKEN,
  holdChips, holdRange, holdUntilError, fillHoldTemplate, fmtHoldDeadline,
  fromJstInputs, jstDateInput, jstTimeInput, jstParts, jstToMs,
} from '@/lib/roundHold';

// 主催者（共同管理者）が参加申請を「⏸ 保留する」シート（2026-10-13・lib/roundHold）。
//   期日：今日21:00／明日18:00／あさって18:00／3日後18:00（過ぎた時刻は出さない）＋「📅 日時を指定」
//         （いまから30分後〜開催日の前日 23:59。開催日が未定なら60日先まで）
//   ひとこと：①自動の文（最初から選択・選んだ日時がその場で入る）②ほかの文から選ぶ ③自由に書く（300文字まで）
// 保留は1回だけ・延ばせない。ユーザーが自分で開くシートなので、ポップアップの枠（lib/popupSlot）には入れない。
// body にポータルで出す（iOS でタブバーの裏に入らないように）。
type Mode = 'auto' | 'other' | 'free';

export function HoldSheet({ round, userId, name, onClose, onDone }: {
  round: Round; userId: string; name: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  // 開いたまま時間がたっても、過ぎた時刻の候補を出さない
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const chips = useMemo(() => holdChips(round, now), [round, now]);
  const range = useMemo(() => holdRange(round, now), [round, now]);
  const [chipKey, setChipKey] = useState<string>(() => {
    const c = holdChips(round, Date.now());
    return (c.find((x) => x.key === 'tomorrow18') || c[0])?.key || 'custom';
  });
  // 「日時を指定」の初期値：明日の20:00（範囲外なら選べるいちばん早い時刻）
  const [customDate, setCustomDate] = useState(() => {
    const t = jstParts(Date.now());
    const r = holdRange(round, Date.now());
    let at = jstToMs(t.y, t.m, t.d + 1, 20, 0);
    if (at > r.max) at = r.max; if (at < r.min) at = r.min;
    return jstDateInput(at);
  });
  const [customTime, setCustomTime] = useState(() => {
    const t = jstParts(Date.now());
    const r = holdRange(round, Date.now());
    let at = jstToMs(t.y, t.m, t.d + 1, 20, 0);
    if (at > r.max) at = r.max; if (at < r.min) at = r.min;
    return jstTimeInput(at);
  });
  const [mode, setMode] = useState<Mode>('auto');
  const [otherIdx, setOtherIdx] = useState(0);
  const [freeText, setFreeText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // 選んでいた候補が時間切れで消えたら「日時を指定」に切り替える
  useEffect(() => {
    if (chipKey !== 'custom' && !chips.find((c) => c.key === chipKey)) setChipKey(chips[0]?.key || 'custom');
  }, [chips, chipKey]);

  const until = chipKey === 'custom' ? fromJstInputs(customDate, customTime) : (chips.find((c) => c.key === chipKey)?.at ?? NaN);
  const untilErr = holdUntilError(round, until, now);
  const message = mode === 'auto'
    ? fillHoldTemplate(HOLD_AUTO_TEMPLATE, untilErr ? null : until)
    : mode === 'other'
      ? fillHoldTemplate(HOLD_OTHER_TEMPLATES[otherIdx] || HOLD_OTHER_TEMPLATES[0], untilErr ? null : until)
      : freeText.trim();
  const canSubmit = !busy && range.ok && !untilErr && !!message;

  async function submit() {
    if (!canSubmit) return;
    // 押した時点でもう一度確かめる（開いたまま30分以上たった場合など）
    const e2 = holdUntilError(round, until, Date.now());
    if (e2) { setErr(e2); setNow(Date.now()); return; }
    setBusy(true); setErr('');
    try {
      await store.holdApplicant(round.id, userId, until, message);
      onDone();
    } catch (e) {
      setErr((e as Error).message || '保留にできませんでした。もう一度お試しください');
      // すでに保留済み・申請中でない などは画面の情報が古い。最新に合わせる
      store.refreshRounds().catch(() => {});
    } finally { setBusy(false); }
  }

  // 自動の文・ほかの文の中で、日時のところに下線を引いて見せる
  const withDate = (tpl: string) => {
    const label = untilErr ? '（日時）' : fmtHoldDeadline(until);
    const parts = tpl.split(HOLD_DATE_TOKEN);
    return parts.map((p, i) => (
      <span key={i}>{p}{i < parts.length - 1 && <u className="font-black">{label}</u>}</span>
    ));
  };

  const opt = (m: Mode) => `flex gap-2 items-start rounded-[11px] border-2 px-2.5 py-2 mb-1.5 text-left w-full ${mode === m ? 'border-green bg-green-light' : 'border-hair bg-white'}`;
  const dot = (m: Mode) => (
    <span className={`w-[15px] h-[15px] rounded-full flex-none mt-[1px] box-border ${mode === m ? 'border-[4px] border-green' : 'border-2 border-muted'}`} />
  );

  return (
    <Portal>
      <div className="fixed inset-0 z-[300] bg-black/50 flex items-end justify-center" onClick={() => { if (!busy) onClose(); }}>
        <div onClick={(e) => e.stopPropagation()}
          className="bg-card w-full max-w-[430px] rounded-t-[22px] border-t-[3px] border-border shadow-lg flex flex-col"
          style={{ maxHeight: '86dvh' }}>
          <div className="px-4 pt-3.5 pb-2 flex-none">
            <div className="text-[15px] font-black">⏸ {name}さんの申請を保留する</div>
            <div className="text-[11px] text-sub mt-0.5">保留は1回だけ。期日を延ばすことはできません</div>
          </div>
          <div className="px-4 overflow-y-auto flex-1 pb-2">
            {!range.ok ? (
              <div className="text-[12.5px] text-orange font-bold bg-orange-light rounded-xl p-3 my-2 leading-relaxed">
                開催日が近いため、保留にはできません。承認するか、今回は見送ってください。
              </div>
            ) : (
              <>
                <div className="text-[12px] font-black text-sub mt-2 mb-1.5">いつまでにお返事しますか？</div>
                <div className="flex flex-wrap gap-1.5">
                  {chips.map((c) => (
                    <button key={c.key} type="button" onClick={() => setChipKey(c.key)}
                      className={`px-3 py-1.5 rounded-full text-[12px] border-[1.5px] ${chipKey === c.key ? 'bg-green border-green text-white font-black' : 'bg-white border-hair text-sub font-bold'}`}>
                      {c.label}
                    </button>
                  ))}
                  <button type="button" onClick={() => setChipKey('custom')}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-black border-[1.5px] ${chipKey === 'custom' ? 'bg-green border-green text-white' : 'bg-white border-dashed border-green text-green'}`}>
                    📅 日時を指定
                  </button>
                </div>
                {chipKey === 'custom' && (
                  <div className="mt-2">
                    <div className="flex gap-1.5">
                      <input type="date" value={customDate} min={jstDateInput(range.min)} max={jstDateInput(range.max)}
                        onChange={(e) => setCustomDate(e.target.value)}
                        className="flex-[3] min-w-0 bg-white border-[1.5px] border-border rounded-[10px] px-2.5 py-2 text-[13px]" />
                      <input type="time" value={customTime} step={300}
                        onChange={(e) => setCustomTime(e.target.value)}
                        className="flex-[2] min-w-0 bg-white border-[1.5px] border-border rounded-[10px] px-2.5 py-2 text-[13px]" />
                    </div>
                    <div className="text-[10.5px] text-sub mt-1">{range.hint}</div>
                  </div>
                )}
                {untilErr && (chipKey === 'custom' || !chips.length) && (
                  <div className="text-[11.5px] text-orange font-bold mt-1.5">⚠️ {untilErr}</div>
                )}

                <div className="text-[12px] font-black text-sub mt-3 mb-1.5">{name}さんに伝えるひとこと</div>
                <button type="button" className={opt('auto')} onClick={() => setMode('auto')}>
                  {dot('auto')}
                  <span className="flex-1 min-w-0">
                    <b className="block text-[12px]">自動の文（選んだ日時が入ります）</b>
                    {mode === 'auto' && <span className="block text-[12px] leading-relaxed mt-0.5">{withDate(HOLD_AUTO_TEMPLATE)}</span>}
                  </span>
                </button>
                <div className={opt('other')} role="button" tabIndex={0} onClick={() => setMode('other')}>
                  {dot('other')}
                  <span className="flex-1 min-w-0">
                    <b className="block text-[12px]">ほかの文から選ぶ{mode === 'other' ? '' : ' ▾'}</b>
                    {mode === 'other' && (
                      <>
                        <select value={otherIdx} onChange={(e) => setOtherIdx(Number(e.target.value) || 0)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 w-full bg-white border-[1.5px] border-border rounded-[10px] px-2 py-1.5 text-[12px]">
                          {HOLD_OTHER_TEMPLATES.map((t, i) => (
                            <option key={i} value={i}>{t.split('。')[0]}…</option>
                          ))}
                        </select>
                        <span className="block text-[12px] leading-relaxed mt-1">{withDate(HOLD_OTHER_TEMPLATES[otherIdx] || HOLD_OTHER_TEMPLATES[0])}</span>
                      </>
                    )}
                  </span>
                </div>
                <div className={opt('free')} role="button" tabIndex={0} onClick={() => setMode('free')}>
                  {dot('free')}
                  <span className="flex-1 min-w-0">
                    <b className="block text-[12px]">自由に書く</b>
                    {mode === 'free' && (
                      <>
                        <textarea value={freeText} maxLength={HOLD_MESSAGE_MAX} rows={3}
                          onChange={(e) => setFreeText(e.target.value.slice(0, HOLD_MESSAGE_MAX))}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="例）友人のシフトが10/28に出るので、それまでお待ちいただけますか？決まり次第すぐご連絡します"
                          className="mt-1 w-full bg-white border-[1.5px] border-border rounded-[10px] px-2.5 py-2 text-[12.5px] leading-relaxed" />
                        <span className="block text-[10px] text-muted text-right">{freeText.length}/{HOLD_MESSAGE_MAX}</span>
                      </>
                    )}
                  </span>
                </div>
              </>
            )}
            {err && <div className="text-[12px] text-red font-bold mt-1.5 leading-relaxed">⚠️ {err}</div>}
          </div>
          <div className="px-4 pt-2 pb-4 flex-none border-t border-hair" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            <button type="button" onClick={submit} disabled={!canSubmit}
              className="w-full py-3.5 bg-green text-white rounded-xl text-[15px] font-black disabled:opacity-40">
              {busy ? '送信中…' : '保留にして伝える'}
            </button>
            <button type="button" onClick={onClose} disabled={busy} className="w-full mt-1.5 py-2 text-[12.5px] font-bold text-sub">やめる</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
