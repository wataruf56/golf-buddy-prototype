import type { Metadata } from 'next';
import { AreaGuide, areaMetadata, type AreaCopy } from '@/components/site/AreaGuide';

// 「ゴルフ 千葉 20代」「ゴルフ 千葉 30代」の受け皿。
// 千葉は「行き先」側。県内にコースが集まっていて、県外から人が来る構図。
export const dynamic = 'force-dynamic';

const COPY: AreaCopy = {
  area: '千葉県', slug: 'chiba', short: '千葉',
  title: '千葉の20代・30代がゴルフ仲間を見つけるには｜コースは近い',
  desc: '千葉に住む20代・30代がゴルフを一緒に回る人を見つける方法。房総エリアにコースが集まっていて、移動の負担がいちばん軽い地域です。実際に使われているコースと会員数を公開します。',
  intro: '千葉はコースが近いのが最大の利点です。'
    + '房総エリアに数が集まっていて、県内に住んでいれば移動が1時間前後で済むことも珍しくありません。'
    + '他の地域が「行き方」で悩むところを飛ばせるので、'
    + '残る問題は「誰と行くか」だけになります。',
  destination: '房総エリアが中心です。長南・市原・木更津・鴨川のあたりに数が集まっています。'
    + '県外から来る人はアクアラインを渡ってくるので、'
    + '土日は午前中の上り下りが混みます。早朝スタートなら影響を受けにくくなります。',
  access: '県内に住んでいれば、車があれば移動はいちばん楽な地域です。'
    + '車がない場合も、船橋・西船橋・千葉・海浜幕張などの駅から拾ってもらう募集があります。'
    + '県外から来る人と現地で合流する形も取りやすいので、'
    + '「自分は近いので現地集合」という参加の仕方もできます。',
};

export const metadata: Metadata = areaMetadata(COPY) as Metadata;
export default function Page() { return <AreaGuide copy={COPY} />; }
