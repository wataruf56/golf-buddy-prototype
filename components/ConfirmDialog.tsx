'use client';

import { useEffect, useState } from 'react';

// ネイティブの confirm()/alert() は「app.goltomo.com」等のURLが出て見栄えが悪いため、
// アプリ内の見た目に合わせた確認/通知モーダルに置き換える。Toast と同じ命令的API。
type Opts = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;   // 確認ボタンを赤に（削除・停止など）
  alert?: boolean;    // trueならOKのみ（キャンセルなし）
};
type Pending = Opts & { id: number; resolve: (v: boolean) => void };

let _open: ((o: Opts) => Promise<boolean>) | null = null;
let _id = 0;

// 確認ダイアログ。OKで true、キャンセルで false を返す。
export function confirmDialog(opts: Opts | string): Promise<boolean> {
  const o: Opts = typeof opts === 'string' ? { message: opts } : opts;
  if (!_open) return Promise.resolve(typeof window !== 'undefined' ? window.confirm(o.message) : false);
  return _open(o);
}

// 通知ダイアログ（OKのみ）。閉じたら解決。
export function alertDialog(message: string, title?: string): Promise<boolean> {
  return confirmDialog({ message, title, alert: true, confirmText: 'OK' });
}

export function ConfirmHost() {
  const [item, setItem] = useState<Pending | null>(null);
  useEffect(() => {
    _open = (o) => new Promise<boolean>((resolve) => setItem({ ...o, id: ++_id, resolve }));
    return () => { _open = null; };
  }, []);

  if (!item) return null;
  const close = (v: boolean) => { item.resolve(v); setItem(null); };

  return (
    <div
      className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-6 backdrop-blur-sm"
      onClick={() => close(false)}
    >
      <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-card w-full max-w-[320px] shadow-lg overflow-hidden">
        <div className="px-5 py-5 text-center">
          {item.title && <div className="text-base font-black mb-1.5">{item.title}</div>}
          <div className="text-[13px] text-sub leading-relaxed whitespace-pre-wrap">{item.message}</div>
        </div>
        <div className="flex border-t border-border">
          {!item.alert && (
            <button onClick={() => close(false)} className="flex-1 py-3.5 text-sm font-bold text-sub border-r border-border">
              {item.cancelText || 'キャンセル'}
            </button>
          )}
          <button
            onClick={() => close(true)}
            className={'flex-1 py-3.5 text-sm font-black text-white ' + (item.danger ? 'bg-red' : 'bg-green')}
          >
            {item.confirmText || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
