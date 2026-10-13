import type { Metadata } from 'next';
import { HubLinks } from '@/components/HubLinks';
import { LP_TRACK_SCRIPT } from '@/lib/lpTrackScript';

// Instagram の link-in-bio 用ページ（app.goltomo.com/links・未ログインで閲覧可・アプリ枠なし）。
// インスタのプロフィールには line.me のURLを直接貼れない（ドメインブロック）ため、
// このページを経由して公式LINEの友だち追加へ誘導する（2026-08-10〜）。
// 2026-10-13 作り直し：アプリの今の機能（行ける日・募集・グループチャット・レビュー→ゴル友・公式コンペ）と
// 見た目（クリーム×深緑の太枠カード）に合わせる。画面の写真は使い方ページと同じ見本データ（実在の会員は写らない）。
export const metadata: Metadata = {
  title: 'ゴルトモ | 20〜30代限定 ゴルフ仲間コミュニティ',
  description: '同世代とゴルフに行くアプリ。行ける日を押すだけ・募集に参加するだけ。登録も参加もLINEで完結。',
};

const INK = '#1E3A30';
const SUB = '#5A7A6D';
const CREAM = '#FBF7EC';
const ORANGE = '#E8643C';
const GREEN = '#2A8C82';

const FEATURES: Array<{ img: string; no: string; title: string; text: string }> = [
  { img: '/guide-shots/v2/home_top.webp', no: '1', title: '行ける日を押すだけ', text: '同じ日に3人そろうと、その日のチャットが始まります' },
  { img: '/guide-shots/v2/search_round.webp', no: '2', title: '募集に参加する', text: '公式コンペや、同世代が立てたラウンドにひとりでも' },
  { img: '/guide-shots/v2/room_chat.webp', no: '3', title: 'グループチャットで相談', text: '集合・送迎（ピックアップ）・入金もアプリの中で' },
  { img: '/guide-shots/v2/review_top.webp', no: '4', title: 'また行きたい人とゴル友に', text: 'お互い「行きたい」を選んだ相手だけがつながります' },
];

export default function LinksHubPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        background: `radial-gradient(#D3E4DA 1.5px, transparent 1.6px) 0 0 / 22px 22px, #E7F2EC`,
        fontFamily: "'Zen Maru Gothic','Noto Sans JP',sans-serif",
      }}
      className="flex flex-col items-center px-5 pt-8 pb-12"
    >
      {/* LP計測（到達→スクロール→クリック→LINE遷移） */}
      <script dangerouslySetInnerHTML={{ __html: `window.__lpPage="links";` + LP_TRACK_SCRIPT }} />
      <div className="w-full max-w-[440px] flex flex-col items-center">
        {/* ブランド */}
        <div className="flex items-center gap-2 mb-5">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-black"
            style={{ background: CREAM, color: INK, border: `2px solid ${INK}`, boxShadow: `3px 3px 0 ${INK}` }}>⛳ ゴルトモ</span>
          <span className="inline-flex items-center rounded-full px-3 py-1.5 text-[12px] font-black text-white" style={{ background: GREEN }}>🎯 20〜30代限定</span>
        </div>

        <h1 className="text-center font-black leading-[1.25] tracking-tight" style={{ color: INK, fontSize: '30px' }}>
          同世代と<br />ゴルフに行くアプリ
        </h1>
        <p className="text-center mt-3 text-[14px] font-bold leading-relaxed" style={{ color: SUB }}>
          <b style={{ color: INK }}>行ける日を押す</b>か、<b style={{ color: INK }}>募集に参加する</b>だけ。<br />ひとりでも、初心者でも大丈夫。
        </p>

        {/* CTA（いま募集中・LINE友だち追加）＋計測 */}
        <HubLinks />

        {/* できること（実際の画面・見本データ） */}
        <section className="w-full mt-10">
          <div className="flex items-end justify-between mb-3 px-1">
            <h2 className="text-[19px] font-black" style={{ color: INK }}>ゴルトモでできること</h2>
            <span className="text-[11px] font-bold" style={{ color: SUB }}>横にスワイプ →</span>
          </div>
          <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-5 px-5 pb-2" style={{ scrollbarWidth: 'none' }}>
            {FEATURES.map((f) => (
              <figure key={f.no} className="flex-none w-[62%] snap-center">
                <div className="rounded-[20px] overflow-hidden bg-white" style={{ border: `2.5px solid ${INK}`, boxShadow: `4px 4px 0 ${INK}` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.img} alt={f.title} className="block w-full h-auto" loading="lazy" />
                </div>
                <figcaption className="mt-2.5 flex gap-2">
                  <span className="w-6 h-6 rounded-full text-white text-[12px] font-black grid place-items-center flex-none" style={{ background: ORANGE }}>{f.no}</span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-black leading-snug" style={{ color: INK }}>{f.title}</span>
                    <span className="block text-[11.5px] font-bold leading-snug mt-0.5" style={{ color: SUB }}>{f.text}</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="text-[10px] font-bold mt-1 px-1" style={{ color: '#8AA79A' }}>※ 画面の名前・募集は見本です</div>
        </section>

        {/* はじめ方 3ステップ */}
        <section className="w-full mt-9 rounded-[24px] p-5" style={{ background: CREAM, border: `2.5px solid ${INK}`, boxShadow: `5px 5px 0 ${INK}` }}>
          <h2 className="text-[18px] font-black mb-3" style={{ color: INK }}>はじめ方（3ステップ）</h2>
          {[
            ['💬', 'LINEで友だち追加', 'ゴルトモの公式LINEを追加'],
            ['✏️', 'プロフィールを登録', '年代・エリア・スコアの目安など。1分ほど'],
            ['⛳', '行ける日を押す／募集に参加', 'あとはグループチャットで当日まで'],
          ].map(([icon, title, text], i) => (
            <div key={title} className="flex items-start gap-3 py-2.5" style={{ borderTop: i ? '1.5px dashed #CFE0D6' : 'none' }}>
              <span className="w-9 h-9 rounded-full grid place-items-center text-[18px] flex-none" style={{ background: '#E7F2EC', border: `2px solid ${INK}` }}>{icon}</span>
              <span className="min-w-0">
                <span className="block text-[14.5px] font-black" style={{ color: INK }}>{i + 1}. {title}</span>
                <span className="block text-[12px] font-bold mt-0.5" style={{ color: SUB }}>{text}</span>
              </span>
            </div>
          ))}
        </section>

        {/* 友だち追加のあと：リッチメニュー（2026-10-08 の v11） */}
        <section className="w-full mt-6 rounded-[24px] p-5 bg-white" style={{ border: `2.5px solid ${INK}`, boxShadow: `5px 5px 0 ${INK}` }}>
          <div className="text-[14.5px] font-black leading-relaxed" style={{ color: INK }}>
            友だち追加のあとは、トーク画面の下のメニュー<span style={{ color: ORANGE }}>右上「現在募集中」</span>から、いつでも募集中のラウンドが見られます👇
          </div>
          <div className="relative mt-3 rounded-2xl overflow-hidden" style={{ border: '2px solid #E7F2EC' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/richmenu-guide-v11.webp" alt="LINEのメニュー：右上の「現在募集中」" className="block w-full h-auto" />
            <div className="absolute pointer-events-none rounded-2xl"
              style={{ top: '1.2%', left: '66.6%', width: '32.4%', height: '48.5%', border: `4px solid ${ORANGE}`, boxShadow: '0 0 0 3px rgba(232,100,60,0.35)' }} />
            <div className="absolute pointer-events-none px-2.5 py-1 rounded-full text-[12px] font-black text-white whitespace-nowrap"
              style={{ top: '51%', right: '2%', background: ORANGE, boxShadow: '2px 2px 0 rgba(30,58,48,0.35)' }}>👆 ここをタップ！</div>
          </div>
          <div className="text-[11.5px] font-bold mt-2.5 leading-relaxed" style={{ color: SUB }}>
            「参加予定」で自分のラウンド、「タイムライン」でみんなの動きも見られます。
          </div>
        </section>

        <div className="mt-10 text-[11px] font-bold" style={{ color: '#8AA79A' }}>© ゴルトモ</div>
      </div>
    </main>
  );
}
