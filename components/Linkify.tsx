'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

// 本文中の URL を、タップで開けるリンクにする（チャット・DM・主催者からの連絡・募集の説明文など）。
// これまで URL は素の文字のままで、長押しコピーして開くしかなかった（2026-10-06 本人報告）。
//
// - http(s):// と www. で始まるものを拾う。末尾の句読点・閉じかっこ（。、）」』 など）はリンクに含めない
// - 自分のアプリ（app.goltomo.com・同じオリジン）の URL は同じ画面内で開く（セッションを保ったまま）
// - それ以外は別タブ（LIFF の中では LINE 内ブラウザ／外部ブラウザ）で開く
// - 吹き出しの中でも押せるよう、クリックは親に伝えない

// URL に使える文字（RFC 3986 の範囲）だけを拾う。全角の句読点・かっこ・日本語が続いても
// そこで止まる（「https://… 。集合は7:30」の「。」以降を URL に含めてしまっていた 2026-10-06）。
// 引用符とかっこは除外（「（https://…）」のように囲まれることが多い）。
const URL_CHARS = "A-Za-z0-9\\-._~:/?#\\[\\]@!$&*+,;=%";
const URL_RE = new RegExp(`(https?:\\/\\/[${URL_CHARS}]+|www\\.[${URL_CHARS}]+)`, 'g');
const TRAIL_RE = /[.,;:!?\]]+$/;
const OWN_HOSTS = ['app.goltomo.com', 'goltomo.com', 'www.goltomo.com'];

function ownPath(href: string): string | null {
  try {
    const u = new URL(href);
    const here = typeof window !== 'undefined' ? window.location.host : 'app.goltomo.com';
    // app.goltomo.com の中だけ同じ画面で開く（goltomo.com の LP は別ホストなので別タブ）
    if (u.host === here && OWN_HOSTS.includes(u.host)) return u.pathname + u.search + u.hash;
  } catch { /* 壊れた URL は普通のリンクとして扱う */ }
  return null;
}

export type LinkifyOptions = {
  /** 自分の吹き出し（緑地に白文字）か。色を変えずに下線だけにする */
  mine?: boolean;
  /** URL 以外の部分を描く関数（メンションの色付けなどを重ねたいとき） */
  plain?: (text: string, key: string) => ReactNode;
  keyPrefix?: string;
};

export function linkifyNodes(text: string, opts: LinkifyOptions = {}): ReactNode[] {
  const out: ReactNode[] = [];
  if (!text) return out;
  const plain = opts.plain || ((s: string, key: string) => <span key={key}>{s}</span>);
  const cls = (opts.mine ? 'underline font-bold break-all' : 'text-blue underline font-bold break-all');
  const kp = opts.keyPrefix || 'lk';
  let last = 0; let i = 0; let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    let raw = m[0];
    const tail = (raw.match(TRAIL_RE) || [''])[0];
    if (tail) raw = raw.slice(0, raw.length - tail.length);
    if (!raw) continue;
    if (m.index > last) out.push(plain(text.slice(last, m.index), `${kp}-p${i}`));
    const href = raw.startsWith('www.') ? `https://${raw}` : raw;
    const own = ownPath(href);
    const stop = (e: React.MouseEvent) => { e.stopPropagation(); };
    out.push(own
      ? <Link key={`${kp}-a${i}`} href={own} className={cls} onClick={stop}>{raw}</Link>
      : <a key={`${kp}-a${i}`} href={href} target="_blank" rel="noopener noreferrer" className={cls} onClick={stop}>{raw}</a>);
    if (tail) out.push(plain(tail, `${kp}-t${i}`));
    last = m.index + m[0].length; i += 1;
  }
  if (last < text.length) out.push(plain(text.slice(last), `${kp}-p${i}`));
  return out;
}

/** テキストをそのまま出す代わりに置く。改行は親の whitespace-pre-wrap に任せる */
export function Linkify({ text, mine, className }: { text: string; mine?: boolean; className?: string }) {
  if (!text) return null;
  return <span className={className}>{linkifyNodes(text, { mine })}</span>;
}
