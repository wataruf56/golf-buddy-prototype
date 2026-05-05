'use client';

import { useEffect, useState } from 'react';

type Toast = { id: number; text: string; kind: 'success' | 'error' };

let _push: ((t: Omit<Toast, 'id'>) => void) | null = null;
let _id = 0;

export function toast(text: string, kind: 'success' | 'error' = 'success') {
  _push?.({ text, kind });
}

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    _push = (t) => {
      const id = ++_id;
      setItems((prev) => [...prev, { ...t, id }]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 3000);
    };
    return () => { _push = null; };
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-16 z-[200] flex flex-col gap-2 pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={
            'pointer-events-auto px-4 py-3 rounded-xl shadow-lg max-w-[320px] text-sm font-bold animate-slideUp ' +
            (t.kind === 'error'
              ? 'bg-red text-white'
              : 'bg-green text-white')
          }
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
