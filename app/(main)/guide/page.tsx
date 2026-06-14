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
    desc: 'ゴルトモは、同世代のゴルフ仲間を見つけて一緒にラウンドに行けるアプリです。下のタブで各機能を切り替えます。',
    steps: [
      'まず「マイ」でプロフィールを設定しましょう（GOLMOTI診断のタイプも選べます）。',
      '「さがす」でラウンド募集を探すか、「募集」で自分のラウンドを立ててみましょう。',
      '一緒に回った人は「ゴル友」に追加され、メッセージでつながれます。',
      '「スイング」ではAIがあなたのフォームを解析してくれます。',
    ],
    tips: 'このガイドはいつでも左下の「使い方」タブから開けます。',
    shot: false,
  },
  {
    key: 'home', tab: 'ホーム', emoji: '🏠',
    title: 'ホーム',
    desc: 'アプリの入口。新着のラウンド募集と、自分の募集への参加申請が一目で分かります。',
    steps: [
      '新着のラウンド募集が新しい順に並びます。気になる募集をタップして詳細へ。',
      '自分が立てた募集に申請が来ると上部に表示されます。「承認 / 却下」で参加者を決めましょう。',
      '「すべて見る」から、ほかの募集もまとめて確認できます。',
    ],
    shot: true,
  },
  {
    key: 'search', tab: 'さがす', emoji: '🔍',
    title: 'さがす',
    desc: 'エリアやコースから、参加したいラウンド募集を探します。',
    steps: [
      '上部のエリアで、行ける地域をしぼり込みます。',
      '条件に合う募集が一覧で表示されます。',
      '募集をタップ → 内容を確認して「参加する」で申請します。',
    ],
    tips: '参加状況バー（オレンジ）で「今何人参加しているか」が一目で分かります。',
    shot: true,
  },
  {
    key: 'swing', tab: 'スイング', emoji: '🏌️',
    title: 'スイング分析',
    desc: 'スイング動画をアップすると、AIがフォームを解析してアドバイスします。',
    steps: [
      'スイングを撮影、または動画を選んでアップロードします。',
      'AIが解析します（数分）。完了すると結果が表示されます。',
      '解析プラン（利用回数）を確認。無制限プランなら何回でも解析できます。',
    ],
    shot: true,
  },
  {
    key: 'create', tab: '募集', emoji: '➕',
    title: 'ラウンドを募集する',
    desc: 'ラウンド仲間を募集します。コースが確定していても、未定でもOKです。',
    steps: [
      '「ラウンドを募集する」から作成を開始します。',
      '日程と場所（コース確定 or エリアのみ）を入力します。',
      '募集人数と性別の内訳、参加条件（レベルなど）を設定します。',
      '他アプリ等で集めた「主催者の知り合い」も人数に含められます。',
      '投稿すると「さがす」「ホーム」に掲載され、申請が届きます。',
    ],
    shot: true,
  },
  {
    key: 'buddies', tab: 'ゴル友', emoji: '👥',
    title: 'ゴル友',
    desc: 'ラウンドで知り合った仲間とつながり、メッセージでやりとりできます。',
    steps: [
      '一緒にラウンドした人が「ゴル友」に追加されます。',
      '一覧から相手をタップしてプロフィールを確認できます。',
      'メッセージで、次のラウンドの相談もできます。',
    ],
    shot: true,
  },
  {
    key: 'mypage', tab: 'マイ', emoji: '👤',
    title: 'マイページ',
    desc: 'プロフィール編集や、これまでのラウンド・レビューの確認ができます。',
    steps: [
      '「✏️」からプロフィールを編集。GOLMOTI（ゴルフ性格タイプ）も設定できます。',
      '直近のスコアやラウンド履歴を確認できます。',
      '自分への匿名レビューもここでチェックできます。',
      '利用規約・プライバシーポリシーも確認できます。',
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
