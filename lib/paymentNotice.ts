// 事前入金（入金設定）の案内・確認まわりの共通処理（2026-10-11）。クライアントとサーバーの両方で使う。
//   ・入金設定がある＝入金管理が ON で、金額・入金期日・振込先のどれかが入っている
//   ・確認の「印」（sig）＝金額と入金期日。主催者があとから金額や期日を変えたら、参加者にもう一度確認する
import type { Round } from './types';

export type PaymentInfoView = { amount?: number; account?: string; deadline?: number; accountHidden?: boolean };

export function paymentInfoOf(round: Pick<Round, 'paymentEnabled'> & Record<string, any>): PaymentInfoView | null {
  if (!round?.paymentEnabled) return null;
  const pi = (round as any).paymentInfo as PaymentInfoView | undefined;
  if (!pi || !(pi.amount || pi.deadline || pi.account || pi.accountHidden)) return null;
  return pi;
}

export function paymentSig(round: Record<string, any>): string {
  const pi = paymentInfoOf(round as any);
  return pi ? `${pi.amount || 0}|${pi.deadline || 0}` : '';
}

/** 10月11日(土) 18:00 */
export function fmtJstDateTime(ms: number): string {
  const d = new Date(ms + 9 * 3600 * 1000);
  const w = '日月火水木金土'[d.getUTCDay()];
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${w}) ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function mdOf(ymd?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  return m ? `${Number(m[2])}月${Number(m[3])}日` : '';
}

/** 現地で各自が払うもの（案内文に入れる） */
export const ON_SITE_NOTE = '昼食代・ゴルフ場利用税・ロッカー代などは別途、当日ご本人で現地精算になります。';
