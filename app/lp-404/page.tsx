import { notFound } from 'next/navigation';

// LPホストで知らないパスに来たときの受け皿。
//
// middleware はここへ rewrite するだけで、ステータスは変えられない。
// このページが notFound() を呼ぶことで、はじめて **本物の404** になる
// （直前まで、でたらめなURLが全部200でLPを返していた＝ソフト404）。
//
// 表示は app/not-found.tsx が担当する。
export const dynamic = 'force-dynamic';

export default function Page() {
  notFound();
}
