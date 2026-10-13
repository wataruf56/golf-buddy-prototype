import type { Round, RoundHold } from './types';
import { isRoundHost } from './roundHost';

// 参加申請の「保留」（2026-10-13）。
//
// 主催者（共同管理者も）が、申請中の人に「◯日◯時までお返事を待ってください」と伝える。
//   ・保留は 1人1回だけ。期日を延ばす操作はどこにも無い（サーバーでも弾く）。
//   ・申請した人は「⏳ 待つ／待てない」を選ぶ。待てない＝申請の取り消し（主催者にはアプリ内のお知らせだけ）。
//   ・期日が来たら主催者に閉じられないポップアップ（components/HoldDueGate・枠 holdDue）＋LINE（housekeeping cron）。
//     承認か見送りのどちらかを選ぶまで消えない。
// データ：round.holds[userId]（types.RoundHold）・round.holdUsedIds（1回使った人）。
// API：POST /api/rounds/[id]/hold・POST /api/rounds/[id]/hold-answer・GET /api/me/hold-due。
//
// ※ 絵文字は String.fromCodePoint で実行時に作る（ビルドの SWC が定数文字列をまとめるとき、
//   サロゲートペアが「\uD83D…」の文字のまま届いたことがある・2026-10-12）。

const PRAY = String.fromCodePoint(0x1f64f);      // 🙏
const GOLF = String.fromCodePoint(0x26f3);       // ⛳
const PAUSE = String.fromCodePoint(0x23f8, 0xfe0f); // ⏸️
const ALARM = String.fromCodePoint(0x23f0);      // ⏰
const ENVELOPE = String.fromCodePoint(0x1f4e8);  // 📨

/** 文の中で期日に置き換わる印 */
export const HOLD_DATE_TOKEN = '{日時}';
/** ひとことの最大文字数 */
export const HOLD_MESSAGE_MAX = 300;
/** 期日は「いまから30分後」より先 */
export const HOLD_MIN_LEAD_MS = 30 * 60 * 1000;
/** 開催日が決まっていない募集は、60日先まで */
export const HOLD_MAX_DAYS_NO_DATE = 60;

const TAIL = `${HOLD_DATE_TOKEN}までにお返事しますので、少々お待ちください${PRAY}`;
/** ①自動の文（いちばん上・最初から選ばれている） */
export const HOLD_AUTO_TEMPLATE = `今、別の方を誘っていて返事待ちです。${TAIL}`;
/** ②ほかの文（プルダウン）。あとで管理画面から足し引きできるよう、ここに集めておく */
export const HOLD_OTHER_TEMPLATES: string[] = [
  `メンバーの最終確認中です。${TAIL}`,
  `ゴルフ場の予約枠を確認しています。${TAIL}`,
  `男女の人数のバランスを調整中です。${TAIL}`,
  `同じ組になる方と相談しています。${TAIL}`,
];

// ── JST の日時 ──
const JST_OFFSET = 9 * 3600 * 1000;
const WD = ['日', '月', '火', '水', '木', '金', '土'];
export function jstParts(ms: number) {
  const d = new Date(ms + JST_OFFSET);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes(), wd: d.getUTCDay() };
}
/** JST の年月日時分 → ms（日の繰り上がり・繰り下がりは Date.UTC に任せる） */
export function jstToMs(y: number, m: number, d: number, h: number, min: number): number {
  return Date.UTC(y, m - 1, d, h, min) - JST_OFFSET;
}
/** 10/14（水）18:00 */
export function fmtHoldDeadline(ms: number): string {
  if (!Number.isFinite(ms)) return '';
  const p = jstParts(ms);
  return `${p.m}/${p.d}（${WD[p.wd]}）${p.h}:${String(p.min).padStart(2, '0')}`;
}
/** 12/19（土） */
export function fmtHoldDay(ms: number): string {
  const p = jstParts(ms);
  return `${p.m}/${p.d}（${WD[p.wd]}）`;
}
/** <input type="date"> 用の YYYY-MM-DD（JST） */
export function jstDateInput(ms: number): string {
  const p = jstParts(ms);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}
/** <input type="time"> 用の HH:MM（JST） */
export function jstTimeInput(ms: number): string {
  const p = jstParts(ms);
  return `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`;
}
/** 日付・時刻の入力（JST）→ ms。読めなければ NaN */
export function fromJstInputs(date: string, time: string): number {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  const tm = /^(\d{1,2}):(\d{2})/.exec(time || '');
  if (!dm || !tm) return NaN;
  return jstToMs(+dm[1], +dm[2], +dm[3], +tm[1], +tm[2]);
}

/** 文の {日時} を期日に置き換える */
export function fillHoldTemplate(tpl: string, until: number | null | undefined): string {
  const label = until && Number.isFinite(until) ? fmtHoldDeadline(until) : '（日時）';
  return String(tpl || '').split(HOLD_DATE_TOKEN).join(label);
}

/** 開催日（固定日）を YYYY-MM-DD で。範囲・未定なら null */
function fixedDateOf(round: Pick<Round, 'date' | 'dateType'>): { y: number; m: number; d: number } | null {
  if (round.dateType === 'range') return null;
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(round.date || '');
  if (!dm) return null;
  return { y: +dm[1], m: +dm[2], d: +dm[3] };
}

/**
 * 選べる期日の範囲。最短＝いまから30分後、最長＝開催日の前日 23:59（JST）。
 * 開催日が決まっていない（範囲・未定）ときは60日先まで。
 */
export function holdRange(round: Pick<Round, 'date' | 'dateType'>, now: number): { min: number; max: number; ok: boolean; hint: string } {
  const min = now + HOLD_MIN_LEAD_MS;
  const fd = fixedDateOf(round);
  let max: number; let hint: string;
  if (fd) {
    max = jstToMs(fd.y, fd.m, fd.d - 1, 23, 59);
    const day = jstParts(max);
    hint = `開催日の前日（${day.m}/${day.d}）まで選べます`;
  } else {
    max = now + HOLD_MAX_DAYS_NO_DATE * 24 * 3600 * 1000;
    hint = `${HOLD_MAX_DAYS_NO_DATE}日先（${fmtHoldDay(max)}）まで選べます`;
  }
  return { min, max, ok: max >= min, hint };
}

export type HoldChip = { key: string; label: string; at: number };
/** 「今日 21:00／明日 18:00／あさって 18:00／3日後 18:00」のうち、いま選べるものだけ（過ぎた時刻・範囲外は出さない） */
export function holdChips(round: Pick<Round, 'date' | 'dateType'>, now: number): HoldChip[] {
  const r = holdRange(round, now);
  const t = jstParts(now);
  const cands: HoldChip[] = [
    { key: 'today21', label: '今日 21:00', at: jstToMs(t.y, t.m, t.d, 21, 0) },
    { key: 'tomorrow18', label: '明日 18:00', at: jstToMs(t.y, t.m, t.d + 1, 18, 0) },
    { key: 'day2_18', label: 'あさって 18:00', at: jstToMs(t.y, t.m, t.d + 2, 18, 0) },
    { key: 'day3_18', label: '3日後 18:00', at: jstToMs(t.y, t.m, t.d + 3, 18, 0) },
  ];
  return cands.filter((c) => c.at >= r.min && c.at <= r.max);
}

/** 期日のチェック。だめなら理由（画面にそのまま出す）・良ければ null。graceMs はサーバーで送信の遅れぶんを見込む余裕 */
export function holdUntilError(round: Pick<Round, 'date' | 'dateType'>, until: number, now: number, graceMs = 0): string | null {
  if (!Number.isFinite(until) || until <= 0) return '期日を選んでください';
  const r = holdRange(round, now);
  if (!r.ok) return '開催日が近いため、保留にはできません。承認するか、今回は見送ってください';
  if (until < r.min - graceMs) return '期日は、いまから30分より先にしてください';
  if (until > r.max) return r.hint.replace('選べます', 'にしてください');
  return null;
}

// ── 状態の判定（サーバー・画面の両方で使う） ──
export function holdOf(round: Pick<Round, 'holds'> | null | undefined, uid: string | null | undefined): RoundHold | undefined {
  if (!round || !uid) return undefined;
  const h = (round.holds || {})[uid];
  return h && typeof h === 'object' && Number.isFinite(h.until) ? h : undefined;
}
/** 申請中で、いま保留になっている */
export function activeHoldOf(round: Pick<Round, 'holds' | 'pendingApplicantIds'> | null | undefined, uid: string | null | undefined): RoundHold | undefined {
  if (!round || !uid || !(round.pendingApplicantIds || []).includes(uid)) return undefined;
  return holdOf(round, uid);
}
/** この申請者はもう保留を使った（1人1回だけ） */
export function holdAlreadyUsed(round: Pick<Round, 'holds' | 'holdUsedIds'>, uid: string): boolean {
  return (round.holdUsedIds || []).includes(uid) || !!holdOf(round, uid);
}
/** 募集が終わっていない（完了・中止でない） */
export function roundStillActive(round: Pick<Round, 'status'> & { heldCancelledAt?: number }): boolean {
  return round.status !== 'completed' && !round.heldCancelledAt;
}
/** 期日が来た保留（主催者に承認か見送りを選んでもらう） */
export function isHoldDue(round: Round, uid: string, now: number): boolean {
  const h = activeHoldOf(round, uid);
  return !!h && h.until <= now && roundStillActive(round);
}
/** 主催者（共同管理者）から見た、期日が来た保留の一覧 */
export function dueHoldsForHost(rounds: Round[], meId: string, now: number): Array<{ round: Round; userId: string; hold: RoundHold }> {
  const out: Array<{ round: Round; userId: string; hold: RoundHold }> = [];
  for (const r of rounds) {
    if (!isRoundHost(r, meId) || !roundStillActive(r)) continue;
    for (const uid of r.pendingApplicantIds || []) {
      const h = holdOf(r, uid);
      if (h && h.until <= now) out.push({ round: r, userId: uid, hold: h });
    }
  }
  return out.sort((a, b) => a.hold.until - b.hold.until);
}
/** 主催者から見た、まだ期日が来ていない保留のうち、いちばん早い期日（無ければ null） */
export function nextHoldDueAt(rounds: Round[], meId: string, now: number): number | null {
  let best: number | null = null;
  for (const r of rounds) {
    if (!isRoundHost(r, meId) || !roundStillActive(r)) continue;
    for (const uid of r.pendingApplicantIds || []) {
      const h = holdOf(r, uid);
      if (h && h.until > now && (best == null || h.until < best)) best = h.until;
    }
  }
  return best;
}

// ── 文面 ──
/** 「12/20 見本カントリークラブ」（日付・コースが無ければタイトル） */
export function holdRoundLabel(round: Pick<Round, 'date' | 'dateType' | 'courseName' | 'title'> & { venue?: string }): string {
  const fd = fixedDateOf(round);
  const place = round.courseName || round.venue || '';
  if (fd && place) return `${fd.m}/${fd.d} ${place}`;
  if (fd) return `${fd.m}/${fd.d} ${round.title || ''}`.trim();
  return round.title || place || 'ラウンド';
}
/** 申請した人へ（LINE・アプリ内のお知らせ） */
export function holdNoticeText(round: Parameters<typeof holdRoundLabel>[0], until: number): string {
  return `${PAUSE}【ゴルトモ】「${holdRoundLabel(round)}」の主催者から、参加申請のお返事を${fmtHoldDeadline(until)}まで待ってほしいと連絡がありました。待つかどうか、アプリで選んでください。`;
}
/** 保留のあとに見送ったとき、申請した人へ */
export function holdDeclinedText(title: string): string {
  return `${ENVELOPE}【ゴルトモ】「${title}」は、お待たせしましたが今回はご一緒できませんでした。待っていただきありがとうございました${PRAY} ほかの募集もぜひのぞいてみてください${GOLF}`;
}
/** 「待てない」を選んだとき、主催者へ（アプリ内のお知らせだけ） */
export function holdCantHostText(name: string, title: string): string {
  return `「${title}」：${name}さんは「待てない」を選んだため、申請を取り消しました`;
}
/** 期日になったとき、主催者へ（LINE・アプリ内のお知らせ） */
export function holdDueText(round: Parameters<typeof holdRoundLabel>[0], names: string[], until: number): string {
  const who = names.length ? names.map((n) => `${n}さん`).join('・') : '申請者';
  return `${ALARM}【ゴルトモ】「${holdRoundLabel(round)}」で保留にしていた${who}の参加申請が、お返事の期日（${fmtHoldDeadline(until)}）になりました。アプリで「承認する」か「今回は見送る」を選んでください。`;
}
