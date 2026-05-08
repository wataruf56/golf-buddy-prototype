import type { SwingStatus } from '@/types/swing';

const LABELS: Record<SwingStatus, { text: string; cls: string }> = {
  queued: { text: '待機中', cls: 'bg-bg text-sub' },
  analyzing: { text: '解析中', cls: 'bg-orange-light text-orange' },
  done: { text: '完了', cls: 'bg-green-light text-green' },
  failed: { text: '失敗', cls: 'bg-red-50 text-red-600' },
};

export function StatusBadge({ status }: { status: SwingStatus }) {
  const l = LABELS[status] || { text: status, cls: 'bg-bg text-sub' };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${l.cls}`}>{l.text}</span>
  );
}
