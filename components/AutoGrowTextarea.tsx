'use client';

import { forwardRef, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

// 入力に合わせて高さが伸びる textarea（既定で最大4行、それ以上は中でスクロール）。
// チャット・DM・管理人のメッセージ欄で使う（2026-10-04 本人要望：長文のとき4行まで広がる）。
// 高さは value が変わるたびに測り直す。送信で空になれば1行に戻る。
type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { maxRows?: number };

export const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, Props>(function AutoGrowTextarea(
  { maxRows = 4, value, className, style, ...rest }, ref,
) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const setRef = (el: HTMLTextAreaElement | null) => {
    inner.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
  };
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = 'auto';                       // いったん縮めて scrollHeight を正しく測る
    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 20;
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const border = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    const max = line * maxRows + pad + border;       // box-sizing: border-box の高さ
    const want = el.scrollHeight + border;
    el.style.height = `${Math.min(want, max)}px`;
    el.style.overflowY = want > max ? 'auto' : 'hidden';
  }, [value, maxRows]);
  return <textarea ref={setRef} rows={1} value={value} className={className} style={style} {...rest} />;
});
