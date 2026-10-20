'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { track } from './telemetry';

// 自動で出るポップアップは「同時に1つだけ」（2026-10-12）。
//
// 【なぜ】ポップアップが2つ重なると、下に隠れた方を閉じないと操作できない・閉じるボタンが見えない、
// といった致命的な詰まりが起きる。各ポップアップが勝手に出るのをやめ、ここで1つだけに絞る。
//
// 使い方：出したい条件がそろったら usePopupSlot(id, 優先度, 出したいか) を呼び、
//         返り値が true のときだけ描く（false のあいだは待つ。前のが閉じたら自動で出る）。
//         **hook なので、早期 return より前に呼ぶこと。**
// 優先度が高いものが先。同じなら先に手を挙げた方。
// ユーザーが自分で開くもの（確認ダイアログ・下から出るシート）はここに入れない（操作の続きなので重なってよい）。
//
// 最後に何かが閉じた時刻（lastClosedAt）も持つ。イチオシ募集は「ほかのが閉じて1時間後」に使う。
//
// 【計測】画面に出たら自動で popupEvent(id, 'show')。ボタンを押したら各ポップアップが popupEvent(id, 'アクション') を呼ぶ。
// /api/log が _popupEvents にも書き、管理画面「📊 計測ハブ」のポップアップの反応で集計する（app/api/admin/popups）。
export const POPUP_PRIORITY = {
  completion: 100,   // 主催者：ラウンド完了／中止（閉じられない）
  holdDue: 98,       // 主催者：保留にしていた申請の期日（承認か見送りを選ぶまで閉じられない・その場で選べる）（2026-10-13）
  groups: 95,        // 主催者：組み分け（閉じられない）
  review: 90,        // ラウンド後のレビュー（閉じられない）
  paymentAck: 80,    // 事前入金の確認
  friendGate: 75,    // LINE の友だち追加
  birthday: 70,      // 前からの会員へ「誕生日を入力してください」（2026-10-20・マイページを開いたときだけ）
  chase: 60,         // 追いDMの確認
  official: 55,      // 運営枠の声かけ
  guideIntro: 52,    // 初めて登録した人へ「使い方を見てみませんか？」（2026-10-17・使い方は下のタブから外してマイページへ）
  availPrompt: 50,   // ラウンド後の「行ける日を入れてみませんか？」
  availMonthly: 48,  // 毎月（月末2日前〜）の「行ける日を入れませんか？」
  availIntro: 45,    // 行ける日の使い方
  swingIntro: 40,    // スイングの使い方
  hostNudge: 30,     // 「次は募集してみない？」
  promo: 20,         // 運営のイチオシ募集
} as const;

const LAST_CLOSED_KEY = 'gb_popup_last_closed_at';
type Req = { priority: number; at: number };
const reqs = new Map<string, Req>();
const listeners = new Set<() => void>();
let current: string | null = null;
let seq = 0;

function recompute() {
  let best: string | null = null; let bp = -Infinity; let bat = Infinity;
  reqs.forEach((r, id) => { if (r.priority > bp || (r.priority === bp && r.at < bat)) { best = id; bp = r.priority; bat = r.at; } });
  if (current && current !== best) {
    try { localStorage.setItem(LAST_CLOSED_KEY, String(Date.now())); } catch { /* noop */ }
  }
  current = best;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
const getCurrent = () => current;

export function usePopupSlot(id: string, priority: number, want: boolean): boolean {
  useEffect(() => {
    if (!want) return;
    reqs.set(id, { priority, at: ++seq });
    recompute();
    return () => { reqs.delete(id); recompute(); };
  }, [id, priority, want]);
  const cur = useSyncExternalStore(subscribe, getCurrent, () => null);
  const active = want && cur === id;
  // 画面に出たら1回だけ「表示」を記録（出ている間に何度も記録しない）
  const shown = useRef(false);
  useEffect(() => {
    if (active && !shown.current) { shown.current = true; popupEvent(id, 'show'); }
    if (!active) shown.current = false;
  }, [active, id]);
  return active;
}

/** ポップアップでの操作を記録する（管理画面で集計）。id は usePopupSlot と同じ・action は 'close' 'cta' など */
export function popupEvent(id: string, action: string, data?: Record<string, unknown>): void {
  const base = id.split(':')[0];   // chase:<chatId> のような個別IDは種類でまとめる
  track('popup', { id: base, action, ...(data || {}) });
}

/** いずれかの自動ポップアップが出ているか（出したい手が挙がっているか） */
export function usePopupBusy(exceptId?: string): boolean {
  const cur = useSyncExternalStore(subscribe, getCurrent, () => null);
  return !!cur && cur !== exceptId;
}

/** 最後に自動ポップアップが閉じた時刻（ms・無ければ 0） */
export function lastPopupClosedAt(): number {
  try { return Number(localStorage.getItem(LAST_CLOSED_KEY) || 0); } catch { return 0; }
}
