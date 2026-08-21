import type { Metadata } from 'next';
import { ArticleShell } from '@/components/site/ArticleShell';

// 準備中の受け皿。メニューからのリンク切れを防ぐために先に置いておく。
// 中身を書くまでは検索結果に出さない（noindex）。
const SITE = 'https://goltomo.com';
const PAGE_URL = `${SITE}/guide/round-debut`;

export const metadata: Metadata = {
  title: 'ラウンドデビューの進め方｜初めてコースに出る人へ',
  description: '初めてのラウンドに向けて、必要な準備・持ち物・当日の流れをまとめます。スコアが出なくても大丈夫な理由も解説します。',
  alternates: { canonical: PAGE_URL },
  robots: { index: false, follow: true },
};

export default function Page() {
  return (
    <ArticleShell current="/guide/round-debut">
      <h1>ラウンドデビューの進め方</h1>
      <p className="lead">初めてのラウンドに向けて、必要な準備・持ち物・当日の流れをまとめます。スコアが出なくても大丈夫な理由も解説します。</p>
      <div className="callout">
        この記事は準備中です。先に読める記事はこちらです。
      </div>
      <div className="rel">
        <div className="t">先に公開している記事</div>
        <a href="/guide/find-golf-friends">
          <span className="l">ゴルフ友達の探し方7つ</span>
          <span className="n">一人でもラウンドに行ける方法を実データで比較</span>
        </a>
        <a href="/golmoti.html">
          <span className="l">ゴルフ版MBTI・16タイプ診断</span>
          <span className="n">自分がどんなゴルファーか知る（無料）</span>
        </a>
      </div>
      <div className="cta">
        <h2>一緒に回る人を探す</h2>
        <p>20〜30代限定。一人で参加して、また回りたい人を見つけられます。</p>
        <a className="btn" href="https://app.goltomo.com/links/rounds?ref=guide_round_debut" data-lp="guide_rounds">
          ⛳ いまの募集を見てみる
        </a>
        <span className="sub">登録なしで中身を見られます</span>
      </div>
    </ArticleShell>
  );
}
