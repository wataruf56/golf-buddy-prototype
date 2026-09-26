// 参加を取りやめるときに選ぶ理由。画面（LeaveDialog）とAPI（leave）とで同じ一覧を使う。
// 「その他」だけ自由入力を求める。主催者には理由がそのまま伝わる（本人にもそう明記する）。
export const LEAVE_REASONS = [
  { key: 'schedule', label: '予定が合わなくなった' },
  { key: 'health',   label: '体調不良' },
  { key: 'work',     label: '仕事の都合' },
  { key: 'family',   label: '家庭の事情' },
  { key: 'weather',  label: '天候が心配' },
  { key: 'cost',     label: '費用の都合' },
  { key: 'other',    label: 'その他（理由を入力）' },
] as const;

export type LeaveReasonKey = (typeof LEAVE_REASONS)[number]['key'];

export const isLeaveReason = (k: string): k is LeaveReasonKey =>
  LEAVE_REASONS.some((r) => r.key === k);

/** 主催者向けの表示。申請中の取り下げは理由を聞かないので 'withdraw'。 */
export function leaveReasonLabel(k: string | undefined): string {
  if (!k) return '';
  if (k === 'withdraw') return '申請を取り下げ';
  return LEAVE_REASONS.find((r) => r.key === k)?.label.replace('（理由を入力）', '') || k;
}
