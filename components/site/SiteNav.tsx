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
  { href: '/guides', label: 'ゴルフの始め方ガイド', note: '記事の一覧' },
  { href: '/guide/find-golf-friends', label: 'ゴルフ友達探し', note: '7つの方法を比較' },
  { href: '/guide/golf-matching', label: 'ゴルフマッチングとは', note: 'アプリの選び方' },
  { href: '/guide/round-recruit', label: 'ゴルフのラウンド募集', note: '書き方と選び方' },
  { href: '/guide/golf-20s', label: '20代のゴルフの始め方', note: '費用・道具・仲間' },
  { href: '/guide/golf-30s', label: '30代からのゴルフ', note: '仕事の付き合いと時間' },
  { href: '/guide/solo-round', label: '一人でゴルフに行くには', note: '一人参加の実際' },
  { href: '/guide/round-debut', label: 'ラウンドデビューの進め方', note: '初めての人へ' },
  { href: '/guide/golf-without-car', label: 'ゴルフに車がない人へ', note: '送迎・相乗り' },
  { href: '/guide/golf-tokyo', label: '東京の20代・30代', note: 'ゴルフ仲間の見つけ方' },
  { href: '/guide/golf-kanagawa', label: '神奈川の20代・30代', note: 'ゴルフ仲間の見つけ方' },
  { href: '/guide/golf-chiba', label: '千葉の20代・30代', note: 'ゴルフ仲間の見つけ方' },
  { href: '/data', label: '実データを見る', note: '満員率・年齢・男女比' },
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

      {/* 閉じているときも DOM に残し、CSS で隠すだけにする。
          {open && …} の条件描画だと、クロール時のHTMLにこのリンクが1本も
          含まれず、内部リンクとして機能しなかった（クローラーはハンバーガーを
          押さないため）。表示・動作は従来どおり。 */}
      <div
        className={open ? 'snov' : 'snov snhide'}
        onClick={() => setOpen(false)}
        aria-hidden={open ? undefined : true}
      >
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
    </>
  );
}
