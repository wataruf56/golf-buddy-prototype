'use client';

export function BlockerPopup({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="absolute bottom-[82px] left-3 right-3 bg-card rounded-2xl px-5 py-4 shadow-lg z-50 flex items-center gap-3 border-2 border-orange animate-slideUp">
      <div className="text-2xl">⚠️</div>
      <div className="flex-1">
        <div className="text-[13px] font-bold text-orange">未完了のレビューがあります</div>
        <div className="text-[11px] text-sub mt-0.5">レビューを完了するまで他の機能は使えません</div>
      </div>
      <button
        onClick={onOpen}
        className="px-3.5 py-2 bg-orange text-white rounded-lg text-xs font-bold flex-shrink-0"
      >
        レビューする
      </button>
    </div>
  );
}
