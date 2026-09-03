import type { Metadata } from 'next';
import { AreaGuide, areaMetadata, type AreaCopy } from '@/components/site/AreaGuide';

// 「ゴルフ 神奈川 20代」「ゴルフ 神奈川 30代」の受け皿。
// 神奈川は県内にコースがある（西湘・箱根方面）のが東京・千葉と違うところ。
export const dynamic = 'force-dynamic';

const COPY: AreaCopy = {
  area: '神奈川県', slug: 'kanagawa', short: '神奈川',
  title: '神奈川の20代・30代がゴルフ仲間を見つけるには｜車なしでも行ける',
  desc: '神奈川に住む20代・30代がゴルフを一緒に回る人を見つける方法。県内の西湘・箱根方面にコースがあり、千葉へ渡る手もあります。車がなくても行ける送迎の使い方と、実際の会員数を公開します。',
  intro: '神奈川は、県内にコースがあるのが東京や千葉と違うところです。'
    + '西湘や箱根の方面へ出れば、県をまたがずにラウンドできます。'
    + 'そのぶん「行き方」より「誰と行くか」が先に問題になりやすい地域です。',
  destination: '県内なら西湘・箱根・厚木のあたり。小田原方面は電車でも近づけます。'
    + '房総へ渡る場合はアクアラインを使いますが、川崎から入れるので都内を抜けるより早いことがあります。'
    + '静岡側へ足を伸ばす選択肢もあります。',
  access: '横浜・川崎から都心へ通っている人は、車を持っていないことが多い地域です。'
    + '一方で県内のコースは駅から遠く、バスの本数も少ないので、'
    + '結局は誰かの車に乗せてもらうのが現実的です。'
    + '募集を選ぶときに、拾ってもらえる駅が自分の路線にあるかを見てください。',
};

export const metadata: Metadata = areaMetadata(COPY) as Metadata;
export default function Page() { return <AreaGuide copy={COPY} />; }
