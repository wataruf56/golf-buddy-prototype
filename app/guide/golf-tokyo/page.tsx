import type { Metadata } from 'next';
import { AreaGuide, areaMetadata, type AreaCopy } from '@/components/site/AreaGuide';

// 「ゴルフ 東京 20代」「ゴルフ 東京 30代」の受け皿。
// 東京は会員が最も多いが、ラウンドの行き先は千葉。この非対称が東京固有の話になる。
export const dynamic = 'force-dynamic';

const COPY: AreaCopy = {
  area: '東京都', slug: 'tokyo', short: '東京',
  title: '東京の20代・30代がゴルフ仲間を見つけるには｜車なしでも行ける',
  desc: '東京に住む20代・30代がゴルフを一緒に回る人を見つける方法。都内には練習場は多いのにコースが無く、実際の行き先は千葉に集中しています。車がなくても行ける送迎の使い方と、実際の会員数を公開します。',
  intro: '東京は練習場がどこにでもある一方で、コースが都内にほとんどありません。'
    + '打ちっぱなしには通えるのに、コースに出る段になると急にハードルが上がります。'
    + '「誰と行くか」と「どうやって行くか」が同時に問題になるのが、東京の20代・30代の特徴です。',
  destination: '都内から日帰りで行けるのは、千葉の房総エリア、埼玉、山梨のあたりです。'
    + 'アクアラインを渡る房総が最も多く、朝の早い時間なら都内から1時間半ほどで着きます。'
    + '土日の朝は道が混むので、早朝スタートを取ると移動が楽になります。',
  access: '東京は車を持っていない人がとくに多い地域です。持っていても、'
    + '都内で維持するのが負担で手放した、という人も珍しくありません。'
    + '現実的な手段は「誰かの車に乗せてもらう」で、'
    + '募集の段階で拾ってもらえる駅が決まっているものを選ぶのが確実です。',
};

export const metadata: Metadata = areaMetadata(COPY) as Metadata;
export default function Page() { return <AreaGuide copy={COPY} />; }
