'use client';

import { useState } from 'react';
import Link from 'next/link';

// 各画面のスクショ（/guide-shots/{key}.png）。差し替えは同じファイル名で上書きするだけ。
const SCREENS: { key: string; label: string; desc: string }[] = [
  { key: 'home', label: 'ホーム', desc: '募集中のラウンドや公式コンペが一覧で見られます' },
  { key: 'search', label: 'さがす', desc: 'エリア・日程・費用などで募集を絞り込めます' },
  { key: 'create', label: 'ラウンド募集', desc: 'コース・日時・人数などを入力して募集を投稿' },
  { key: 'swing', label: 'スイング解析', desc: '動画を送るとAIがスイングを解析します' },
  { key: 'buddies', label: 'ゴル友', desc: '両想いになった相手とメッセージできます' },
  { key: 'mypage', label: 'マイページ', desc: 'プロフィール編集・参加予定・通知設定など' },
];

// 使い方・ヘルプ。「はじめての方へ」＋「各画面の見方」＋「規約・運営情報」。
export default function GuidePage() {
  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-bg">
      <div className="px-5 pt-6 pb-24 max-w-md mx-auto">
        {/* ヒーロー */}
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">⛳</div>
          <h1 className="text-[22px] font-black leading-tight">使い方・ヘルプ</h1>
          <p className="text-[13px] text-sub mt-1.5">同世代のゴルフ仲間と回るまで、たったの<b className="text-green">2ステップ</b>。</p>
        </div>

        {/* はじめての方へ */}
        <div className="text-[11px] font-black text-sub mb-2">はじめての方へ</div>
        <div className="flex flex-col gap-2.5 mb-7">
          <Accordion icon="📝" title="アプリの使い方（2ステップ）">
            <p><b>① プロフィールを登録</b><br />名前・年齢・スコアなどを入力。これだけで準備OK。あなたに合う仲間とつながりやすくなります。</p>
            <p className="mt-2"><b>② 気になるラウンドに参加</b><br />募集を見つけたら「参加する」を押すだけ。承認されたらグループチャットで集合場所などを相談して当日へ。</p>
            <Link href="/mypage/edit" className="inline-block mt-3 px-4 py-2 bg-green text-white rounded-xl text-[13px] font-bold">プロフィールを登録する</Link>
          </Accordion>

          <Accordion icon="🏌️" title="ラウンドを募集する流れ">
            <p>自分でラウンドを立てることもできます。</p>
            <p className="mt-2">① ゴルフ場・日付・スタート時間・都道府県・募集人数を入力して投稿<br />② 参加申請を承認<br />③ グループチャットで集合場所・送迎などを相談<br />④ 当日プレー</p>
            <Link href="/create" className="inline-block mt-3 px-4 py-2 bg-orange text-white rounded-xl text-[13px] font-bold">ラウンドを募集する</Link>
          </Accordion>

          <Accordion icon="💘" title="マッチング・レビューの仕組み（両想い）">
            <p>ラウンド後に、一緒に回った人をレビューできます。</p>
            <p className="mt-2"><b>「また一緒に回りたい」「異性として気になる」</b>は、<b className="text-green">お互いが選んだ時だけ</b>通知される“両想い”方式。片思いの間は、あなたの選択が相手に知られることは一切ありません。</p>
            <p className="mt-2">「異性として気になる」を選ぶと「また回りたい」も自動的に含まれます。両想いになった相手は「ゴル友」タブに表示されます。</p>
            <p className="mt-2 text-sub">プロフィールには「<b className="text-text">これまで何人とラウンドし、そのうち何人が『また回りたい』と答えたか</b>」が実績として表示されます。</p>
          </Accordion>

          <Accordion icon="🔔" title="LINE通知について">
            <p>公式LINEを友だち追加すると、参加申請・承認・マッチ成立・開催前リマインドなどをLINEで受け取れます。通知の種類はマイページの通知設定でON/OFFできます。</p>
          </Accordion>
        </div>

        {/* 各画面の見方（スクリーンショット） */}
        <div className="text-[11px] font-black text-sub mb-2">各画面の見方</div>
        <div className="flex flex-col gap-2.5 mb-7">
          {SCREENS.map((s) => (
            <div key={s.key} className="bg-card rounded-card shadow-card border-2 border-border overflow-hidden">
              <div className="px-4 pt-3 pb-1">
                <div className="text-[13px] font-black">{s.label}</div>
                <div className="text-[11px] text-sub mt-0.5">{s.desc}</div>
              </div>
              <div className="px-4 pb-4 pt-2">
                <Shot sectionKey={s.key} title={s.label} />
              </div>
            </div>
          ))}
        </div>

        {/* 規約・運営情報 */}
        <div className="text-[11px] font-black text-sub mb-2">規約・運営情報</div>
        <div className="bg-card rounded-card shadow-card overflow-hidden border-2 border-border">
          <LinkRow icon="📄" label="利用規約" href="/legal/terms" />
          <LinkRow icon="🔒" label="プライバシーポリシー" href="/legal/privacy" />
          <LinkRow icon="🏢" label="運営会社・特商法表記" href="/legal/terms" last />
        </div>
        <div className="text-[10px] text-muted text-center mt-3">ゴルトモ © 2026</div>
      </div>
    </div>
  );
}

// スクリーンショット枠。/guide-shots/{key}.png を読み込み、無ければ「準備中」を表示。
// 差し替えは public/guide-shots/{key}.png を同名で上書きするだけ。
function Shot({ sectionKey, title }: { sectionKey: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="rounded-xl border-2 border-dashed border-border bg-bg h-48 flex flex-col items-center justify-center text-center gap-1.5">
        <span className="text-3xl">📷</span>
        <span className="text-[12px] text-muted font-semibold">「{title}」の画面イメージは準備中です</span>
      </div>
    );
  }
  return (
    <div className="rounded-xl overflow-hidden border border-border bg-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/guide-shots/${sectionKey}.png`}
        alt={`${title}の画面`}
        className="block w-full max-w-full h-auto"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function Accordion({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <details className="bg-card rounded-card shadow-card border-2 border-border overflow-hidden group">
      <summary className="flex items-center gap-2.5 px-4 py-3.5 cursor-pointer list-none text-[14px] font-black">
        <span className="text-lg w-6 text-center">{icon}</span>
        <span className="flex-1">{title}</span>
        <span className="text-muted transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="px-4 pb-4 pt-1 text-[13px] text-text leading-relaxed border-t-2 border-hair">{children}</div>
    </details>
  );
}

function LinkRow({ icon, label, href, last }: { icon: string; label: string; href: string; last?: boolean }) {
  return (
    <Link href={href} className={'flex items-center gap-2.5 px-3.5 py-3 text-[13px] font-bold ' + (last ? '' : 'border-b-2 border-hair')}>
      <span className="text-base w-5 text-center">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="text-muted">›</span>
    </Link>
  );
}
