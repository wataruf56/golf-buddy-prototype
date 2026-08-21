'use client';

import { useState } from 'react';

// LP・記事の共通ヘッダー。右上のハンバーガーから各ページへ飛べるようにする。
//
// 目的は2つ。
//  ① 読み手が「ゴルトモとは何か」「一人で行けるのか」を自分で辿れるようにする
//  ② 検索エンジンに、サイト内のページ同士のつながり（内部リンク）を示す
//     ── LP1枚だけでは拾えるキーワードが限られるため、記事へ確実にリンクを通す
export const NAV_LINKS: Array<{ href: string; label: string; note?: string }> = [
  { href: '/about', label: 'ゴルトモとは', note: 'サービスの概要' },
  { href: '/guide/find-golf-friends', label: 'ゴルフ友達の探し方', note: '7つの方法を比較' },
  { href: '/guide/solo-round', label: '一人でゴルフに行くには', note: '一人参加の実際' },
  { href: '/guide/round-debut', label: 'ラウンドデビューの進め方', note: '初めての人へ' },
  { href: '/guide/golf-without-car', label: '車がなくてもゴルフに行く', note: '送迎・相乗り' },
  { href: '/golmoti.html', label: 'ゴルフ版MBTI診断', note: '16タイプ・無料' },
  { href: '/type', label: '16タイプ一覧', note: 'タイプ別の解説' },
];

export function SiteNav({ current }: { current?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="メニューを開く"
        className="snbtn"
        data-lp="nav_open"
      >
        <span /><span /><span />
      </button>

      {open && (
        <div className="snov" onClick={() => setOpen(false)}>
          <nav className="snpanel" onClick={(e) => e.stopPropagation()} aria-label="サイト内のページ">
            <div className="snhead">
              <span className="sntitle">メニュー</span>
              <button onClick={() => setOpen(false)} aria-label="閉じる" className="snclose">✕</button>
            </div>
            <ul>
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} data-lp={`nav_${l.href}`} aria-current={current === l.href ? 'page' : undefined}>
                    <span className="l">{l.label}</span>
                    {l.note && <span className="n">{l.note}</span>}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </>
  );
}
