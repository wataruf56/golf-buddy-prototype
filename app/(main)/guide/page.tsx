'use client';

import { useState } from 'react';

// 使い方ガイド。下タブの各ページごとに「サブタブ」で切り替えて、
// 手順とスクリーンショットを見られる。スクショは /guide-shots/{key}.png に
// 置く（無い間は準備中プレースホルダを表示）。動画は今後 {key}.mp4 で対応予定。

type Section = {
  key: string;
  tab: string;       // サブタブのラベル
  emoji: string;
  title: string;
  desc: string;
  steps: string[];
  tips?: string;
  shot?: boolean;    // スクショ枠を出すか（overview は出さない）
};

const SECTIONS: Section[] = [
  {
    key: 'overview', tab: 'はじめに', emoji: '⛳',
    title: 'ゴルトモへようこそ',
    desc: '同世代のゴルフ仲間を見つけて、一緒にラウンドに行けるアプリです。使い方は3ステップだけ。',
    steps: [
      '「マイ」でプロフィールを登録する',
      '「さがす」で募集を探す or「募集」で自分で立てる',
      '一緒に回った人と「ゴル友」になってつながる',
    ],
    tips: 'このガイドは、いつでも左下の「使い方」タブから開けます。',
    shot: false,
  },
  {
    key: 'home', tab: 'ホーム', emoji: '🏠',
    title: 'ホーム',
    desc: '新着の募集と、自分の募集への申請が見られる入口です。',
    steps: [
      '気になる募集をタップして詳細を見る',
      '自分の募集に来た申請を「承認 / 却下」する',
    ],
    shot: true,
  },
  {
    key: 'search', tab: 'さがす', emoji: '🔍',
    title: 'さがす',
    desc: '参加したいラウンド募集を探すページです。',
    steps: [
      '検索やフィルタでエリア・条件を絞る',
      'オレンジのバーで「今何人参加中か」が分かる',
      'タップ →「参加する」で申し込む',
    ],
    shot: true,
  },
  {
    key: 'swing', tab: 'スイング', emoji: '🏌️',
    title: 'スイング分析',
    desc: 'スイング動画をアップすると、AIコーチがフォームを解析します。',
    steps: [
      'スイング動画を撮ってアップロード',
      '数分でAIの解析・アドバイスが届く',
    ],
    shot: true,
  },
  {
    key: 'create', tab: '募集', emoji: '➕',
    title: 'ラウンドを募集する',
    desc: '自分のラウンド仲間を募集します。コースは確定でも未定でもOK。',
    steps: [
      '「コース予約済み」か「コース未定」を選ぶ',
      '日程・人数・条件を入力して投稿する',
      '「主催者の知り合い」も人数に含められる',
    ],
    shot: true,
  },
  {
    key: 'buddies', tab: 'ゴル友', emoji: '👥',
    title: 'ゴル友',
    desc: '一緒に回ってレビューし合った仲間とつながれます。',
    steps: [
      'ラウンド後の相互レビューでゴル友になる',
      'プロフィール確認やメッセージができる',
    ],
    shot: true,
  },
  {
    key: 'mypage', tab: 'マイ', emoji: '👤',
    title: 'マイページ',
    desc: 'プロフィール編集や、実績・レビューの確認ができます。',
    steps: [
      '「✏️」でプロフィール編集（GOLMOTIタイプも設定可）',
      'スコア・ラウンド履歴・自分へのレビューを確認',
    ],
    shot: true,
  },
];

export default function GuidePage() {
  const [active, setActive] = useState(0);
  const s = SECTIONS[active];

  return (
    <div className="h-full overflow-y-auto bg-bg">
      {/* ヘッダー */}
      <div className="px-4 pt-4 pb-2 bg-card border-b border-border sticky top-0 z-10">
        <div className="text-xl font-black mb-2">📖 使い方ガイド</div>
        {/* サブタブ（横スクロール） */}
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1 no-scrollbar">
          {SECTIONS.map((sec, i) => (
            <button
              key={sec.key}
              onClick={() => setActive(i)}
              className={
                'flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ' +
                (i === active ? 'bg-green text-white' : 'bg-bg text-sub')
              }
            >
              {sec.emoji} {sec.tab}
            </button>
          ))}
        </div>
      </div>

      {/* 本文 */}
      <div className="p-4 pb-20">
        <div className="text-lg font-black mb-1">{s.emoji} {s.title}</div>
        <p className="text-[13px] text-sub leading-relaxed mb-4">{s.desc}</p>

        {s.shot && <Shot sectionKey={s.key} title={s.title} />}

        <div className="bg-card rounded-xl shadow-card p-4 mb-4">
          <div className="text-sm font-black mb-3">使い方の手順</div>
          <ol className="flex flex-col gap-3">
            {s.steps.map((step, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green text-white text-[12px] font-black flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="text-[13px] leading-relaxed flex-1">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {s.tips && (
          <div className="bg-green-light text-green rounded-xl p-3.5 text-[12.5px] font-semibold flex gap-2">
            <span>💡</span>
            <span className="flex-1 leading-relaxed">{s.tips}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// スクリーンショット枠。/guide-shots/{key}.png を読み込み、無ければ準備中表示。
function Shot({ sectionKey, title }: { sectionKey: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="mb-4 rounded-xl border-2 border-dashed border-border bg-card/60 h-56 flex flex-col items-center justify-center text-center gap-1.5">
        <span className="text-3xl">📷</span>
        <span className="text-[12px] text-muted font-semibold">「{title}」の画面イメージは準備中です</span>
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-xl overflow-hidden border border-border bg-card shadow-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/guide-shots/${sectionKey}.png`}
        alt={`${title}の画面`}
        className="w-full block"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
