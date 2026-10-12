// キャンセル規定（2026-10-10）。募集を立てるときに主催者が任意で決める。画面・サーバー共通（client-safe）。
//   deadline  … キャンセル締切（ミリ秒）。これを過ぎた参加確定者はアプリからキャンセルできず、主催者にDMで連絡する
//   fee       … 締切後のキャンセル料（円）。2026-10-12から「1枠あたりの目安」として案内
//   account   … キャンセル料の振込先（自由記入。参加者＝主催者・参加確定・申請中にだけ見せる）
//   condition … キャンセル料が発生する条件（テンプレートから選ぶ or 自由記入）

export type CancelPolicy = { deadline: number; fee?: number; account?: string; condition?: string };

// 条件のテンプレートは事前集金（paymentEnabled）の有無で切り替える（2026-10-12）。
//   a＝割増料金だけ／b＝割増料金＋ゴルフ場のキャンセル料。既存の募集の条件文はそのまま残す（移行しない）。
export const CANCEL_CONDITION_TEMPLATES_PREPAID: string[] = [
  'キャンセルになった場合は、お預かりした参加費から、スリーサム・ツーサムの割増料金を差し引いて返金します。',
  'キャンセルになった場合は、お預かりした参加費から、スリーサム・ツーサムの割増料金と、予約枠が減ったことでゴルフ場から請求されるキャンセル料（1枠ごと）を差し引いて返金します。',
];
export const CANCEL_CONDITION_TEMPLATES_POSTPAY: string[] = [
  '枠が減ってスリーサム・ツーサムの割増料金が発生した場合は、その分のみ、後日主催者にPayPayまたは銀行振込でお支払いいただきます。',
  '枠が減ってスリーサム・ツーサムの割増料金が発生した場合や、ゴルフ場からキャンセル料を請求された場合は、その分を後日主催者にPayPayまたは銀行振込でお支払いいただきます。',
];
export function cancelConditionTemplates(prepaid: boolean): string[] {
  return prepaid ? CANCEL_CONDITION_TEMPLATES_PREPAID : CANCEL_CONDITION_TEMPLATES_POSTPAY;
}
/** 事前集金の ON/OFF が変わったとき、反対側のテンプレートなら同じ記号（a/b）に差し替える。自由記入はそのまま（2026-10-12） */
export function swapConditionForPayment(condition: string, prepaid: boolean): string {
  const from = cancelConditionTemplates(!prepaid);
  const i = from.indexOf(condition);
  return i >= 0 ? cancelConditionTemplates(prepaid)[i] : condition;
}

export function hasCancelPolicy(r: { cancelPolicy?: CancelPolicy | null } | null | undefined): boolean {
  return !!r?.cancelPolicy && Number(r.cancelPolicy.deadline) > 0;
}

/** キャンセル締切を過ぎたか */
export function isPastCancelDeadline(r: { cancelPolicy?: CancelPolicy | null } | null | undefined, now = Date.now()): boolean {
  return hasCancelPolicy(r) && now >= Number(r!.cancelPolicy!.deadline);
}

const WD = ['日', '月', '火', '水', '木', '金', '土'];
/** 10/20（月）18:00 （日本時間で表示） */
export function formatCancelDeadline(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms + 9 * 3600 * 1000);   // JST
  const hh = String(d.getUTCHours()).padStart(2, '0'); const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WD[d.getUTCDay()]}）${hh}:${mm}`;
}

/** 入力欄の「YYYY-MM-DD」「HH:MM」（日本時間）→ ミリ秒 */
export function jstToMs(date: string, time: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 0;
  const t = /^\d{2}:\d{2}$/.test(time) ? time : '23:59';
  const ms = Date.parse(`${date}T${t}:00+09:00`);
  return Number.isFinite(ms) ? ms : 0;
}
/** ミリ秒 → 入力欄の「YYYY-MM-DD」「HH:MM」（日本時間） */
export function msToJst(ms?: number): { date: string; time: string } {
  if (!ms) return { date: '', time: '' };
  const d = new Date(ms + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`, time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` };
}

/** サーバー側の整形。deadline が無ければ null（＝キャンセル規定なし） */
export function sanitizeCancelPolicy(raw: any): CancelPolicy | null {
  if (!raw || typeof raw !== 'object') return null;
  const deadline = Math.floor(Number(raw.deadline) || 0);
  if (!deadline || deadline < 1_600_000_000_000) return null;
  const fee = Math.floor(Number(raw.fee) || 0);
  const out: CancelPolicy = { deadline };
  if (fee > 0) out.fee = Math.min(fee, 1_000_000);
  const account = String(raw.account || '').trim().slice(0, 300);
  if (account) out.account = account;
  const condition = String(raw.condition || '').trim().slice(0, 300);
  if (condition) out.condition = condition;
  return out;
}

/** 振込先は参加者（主催者・参加確定・申請中）にだけ。それ以外の閲覧者には伏せる */
export function stripCancelAccountForViewer<T extends { cancelPolicy?: CancelPolicy | null; hostId: string; coHostIds?: string[]; applicantIds?: string[]; pendingApplicantIds?: string[] }>(round: T, viewerId: string | null): T {
  const cp = round.cancelPolicy;
  if (!cp?.account) return round;
  const inIt = !!viewerId && (round.hostId === viewerId || (round.coHostIds || []).includes(viewerId)
    || (round.applicantIds || []).includes(viewerId) || (round.pendingApplicantIds || []).includes(viewerId));
  if (inIt) return round;
  const { account, ...rest } = cp;
  return { ...round, cancelPolicy: { ...rest, accountHidden: true } as any };
}
