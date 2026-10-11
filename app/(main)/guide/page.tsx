'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Portal } from '@/components/Portal';

// 使い方・ヘルプ（2026-10-11 作り直し）。
// 文章は最小限にして、**実際の画面**を横にめくって見せる（Tour）。タップで拡大（Lightbox）。
//   ・上に固定のメニュー（チップ）→ 知りたいところへすぐ飛べる
//   ・「新しくできたこと」→ 新機能の入口
//   ・友達申請を承認すると何ができるか、を一番わかりやすく（会員からの質問が多い）
// 画面は /guide-shots/v2/{name}.webp。テスト用アカウントで撮ったもの（実在の会員は写っていない）。
// 差し替えは同じ名前で上書きするだけ。
const IMG = (n: string) => `/guide-shots/v2/${n}.webp`;

type TourItem = { src: string; title: string; text?: string };

const NAV: Array<{ id: string; label: string }> = [
  { id: 'new', label: '🆕 新機能' },
  { id: 'friends', label: '🤝 友達' },
  { id: 'avail', label: '📅 行ける日' },
  { id: 'review', label: '⭐ レビュー' },
  { id: 'past', label: '🏁 過去ラウンド' },
  { id: 'pay', label: '💴 事前入金' },
  { id: 'join', label: '🙋 参加する' },
  { id: 'host', label: '✏️ 募集する' },
  { id: 'faq', label: '❓ よくある質問' },
];

export default function GuidePage() {
  const scroller = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const go = (id: string) => {
    const el = document.getElementById(id);
    const box = scroller.current;
    if (el && box) box.scrollTo({ top: el.offsetTop - 56, behavior: 'smooth' });
  };

  return (
    <div ref={scroller} className="h-full overflow-y-auto overflow-x-hidden bg-bg relative">
      {/* 固定のメニュー */}
      <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur border-b-2 border-hair">
        <div className="flex gap-1.5 overflow-x-auto px-4 py-2.5 no-scrollbar">
          {NAV.map((n) => (
            <button key={n.id} type="button" onClick={() => go(n.id)}
              className="flex-none px-3 py-1.5 rounded-full bg-card border-[1.5px] border-border text-[11.5px] font-black whitespace-nowrap active:bg-green-light">{n.label}</button>
          ))}
        </div>
      </div>

      <div className="px-5 pt-5 pb-24 max-w-md mx-auto">
        {/* ① 何をする場所なのか */}
        <div className="text-center mb-6">
          <div className="text-3xl mb-1.5">⛳</div>
          <h1 className="text-[21px] font-black leading-tight">ゴルトモは、<br />同世代とゴルフに行くアプリ</h1>
          <p className="text-[12.5px] text-sub mt-2 leading-relaxed">
            <b className="text-text">募集に参加する</b>か、<b className="text-text">自分で募集する</b>か、<br /><b className="text-text">行ける日を押しておく</b>だけ。
          </p>
        </div>

        {/* ② 新しくできたこと */}
        <Anchor id="new" />
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[15px] font-black">🆕 新しくできたこと</div>
          <div className="text-[10.5px] text-muted">横にスクロール →</div>
        </div>
        <div className="flex gap-2.5 overflow-x-auto -mx-5 px-5 pb-2 mb-7 snap-x snap-mandatory no-scrollbar">
          {[
            { id: 'friends', img: 'buddies', t: '友達になると', d: '名前が見えて、声をかけられる' },
            { id: 'avail', img: 'room_dm', t: '行ける日', d: '人数がそろうと運営が声かけ' },
            { id: 'review', img: 'review_car', t: 'レビュー', d: '同じ車の人も・必ず選ぶ形に' },
            { id: 'past', img: 'past', t: '過去ラウンド', d: 'チャットとアルバムがすぐ開く' },
            { id: 'pay', img: 'pay_notice', t: '事前入金', d: '金額と期日がひと目でわかる' },
          ].map((c) => (
            <button key={c.id} type="button" onClick={() => go(c.id)}
              className="flex-none w-[44%] snap-start bg-card rounded-card shadow-card border-2 border-border overflow-hidden text-left">
              <div className="h-[118px] overflow-hidden bg-bg border-b-2 border-hair">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={IMG(c.img)} alt="" className="w-full object-cover object-top" loading="lazy" />
              </div>
              <div className="px-2.5 py-2">
                <div className="text-[12.5px] font-black">{c.t}</div>
                <div className="text-[10.5px] text-sub leading-snug mt-0.5">{c.d}</div>
              </div>
            </button>
          ))}
        </div>

        {/* ③ 友達 */}
        <Anchor id="friends" />
        <Head emoji="🤝" title="友達になると、できること" sub="友達申請の承認・QR・レビューでお互いに「行きたい」を選ぶと友達（ゴル友）になります" />
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Benefit n="1" icon="💬" title="メッセージ" text="いつでも直接送れる" />
          <Benefit n="2" icon="👀" title="行ける日で見える" text="名前と🤝印が出る" />
          <Benefit n="3" icon="📣" title="声をかけられる" text="自分の行ける日を送れる" />
          <Benefit n="4" icon="⭐" title="レビューがラク" text="「すでに友達」で選ばなくてOK" />
        </div>
        <Tour onZoom={setZoom} items={[
          { src: IMG('fr_send'), title: '相手のプロフィールから申請', text: 'どこで一緒だったかを選んで送る' },
          { src: IMG('fr_receive'), title: '相手が承認', text: '受け取った側は「友達の確認」に届く' },
          { src: IMG('buddies'), title: 'ゴル友に並ぶ', text: '💬メッセージ・📣声をかける' },
          { src: IMG('av_friend'), title: '行ける日で名前が見える', text: '友達には🤝。タップでプロフィール' },
          { src: IMG('nudge_sheet'), title: '行ける日で声をかける', text: '自分の行ける日を選んでまとめて送る' },
          { src: IMG('nudge_dm'), title: '相手に届く', text: 'ボタンからそのまま行ける日へ' },
        ]} />
        <Tip>「同じ組で回った」と承認した場合は、翌朝お互いにレビューが届きます。</Tip>

        {/* ④ 行ける日 */}
        <Anchor id="avail" />
        <Head emoji="📅" title="行ける日 — 日付を押すだけ" sub="同じ日に3人そろうと、その日のチャットが始まります" />
        <Tour onZoom={setZoom} items={[
          { src: IMG('av_friend'), title: 'カレンダーで日付を押す', text: '「この日に行ける」で保存' },
          { src: IMG('room_chat'), title: '3人そろうとチャット', text: 'コース・集合場所を相談' },
          { src: IMG('room_dm'), title: '誰も話さないときは運営から', text: 'ボタンでその日のチャットへ' },
        ]} />
        <Cta href="/availability" color="green">📅 行ける日を入れる</Cta>

        {/* ⑤ レビュー */}
        <Anchor id="review" />
        <Head emoji="⭐" title="ラウンド後のレビュー" sub="選んだものは相手に伝わりません。お互いに選んだときだけマッチします" />
        <Tour onZoom={setZoom} items={[
          { src: IMG('review_top'), title: '1人ずつ、必ずどれかを選ぶ', text: '思わない／どっちでも／行きたい' },
          { src: IMG('review_car'), title: '同じ車だった人も', text: '組が違っても「🚗 同じ車だった」' },
          { src: IMG('review_other'), title: '別の組の人は任意', text: 'もう友達の人は押さなくてOK' },
        ]} />
        <Tip>レビューが終わるまで、ほかの画面は使えません。💘「異性として気になる」は同じ組で1人まで。</Tip>

        {/* ⑥ 過去ラウンド */}
        <Anchor id="past" />
        <Head emoji="🏁" title="過去ラウンド" sub="下のタブ「過去ラウンド」から" />
        <Tour onZoom={setZoom} items={[
          { src: IMG('past'), title: '参加したラウンドの一覧', text: '📷＝写真があるラウンド' },
          { src: IMG('past_chat'), title: '押すとその日のチャット', text: 'あとからお礼や次の相談も' },
          { src: IMG('album'), title: '📷でアルバム', text: 'みんながあげた写真を見られる' },
        ]} />

        {/* ⑦ 事前入金 */}
        <Anchor id="pay" />
        <Head emoji="💴" title="事前入金のあるラウンド" sub="プレーフィーを先に振り込み、募集者が当日まとめてゴルフ場に払います" />
        <Tour onZoom={setZoom} items={[
          { src: IMG('pay_notice'), title: '募集ページに案内', text: '期日・金額・振込先' },
          { src: IMG('pay_join'), title: '申請の前に確認', text: '問題なければ「参加申請」' },
          { src: IMG('pay_ack'), title: 'あとから設定されたら', text: '「はい」か、参加の取り消し' },
          { src: IMG('pay_host'), title: '主催者：入金をチェック', text: '本名・性別・年齢つき' },
          { src: IMG('pay_remind'), title: '期日を過ぎたら運営から', text: '未入金の人にだけ・LINEにも' },
        ]} />
        <Tip>昼食代・ゴルフ場利用税・ロッカー代などは、当日ご本人で現地精算です。<Link href="/legal/money" className="text-blue font-bold ml-1">お金のルール</Link></Tip>

        {/* ⑧ 参加する流れ */}
        <Anchor id="join" />
        <Head emoji="🙋" title="募集に参加する" sub="はじめての人はこちらから" />
        <Flow steps={[
          ['プロフィール登録', '名前・年齢・スコア・エリア。主催者はこれを見て承認します'],
          ['募集をさがす', 'ホームか「さがす」タブで'],
          ['「参加を申請する」', '承認されると参加決定（LINEで届く）。車がない人は送迎の希望も'],
          ['グループチャット → 当日', '集合場所・時間はチャットで'],
        ]} />
        <Cta href="/mypage/edit" color="green">プロフィールを登録する</Cta>

        {/* ⑨ 募集する流れ */}
        <Anchor id="host" />
        <Head emoji="✏️" title="自分で募集する" sub="予約が取れたら、まず募集を。枠が余っている段階がいちばん集まります" accent />
        <Flow accent steps={[
          ['募集を投稿（2分）', 'ゴルフ場・日付・時間・人数・費用。日付未定でもOK'],
          ['申請を承認', 'プロフィールと評価を見て決める。断っても理由は伝わりません'],
          ['チャットで決める', '集合・送迎・組み分け・配車'],
          ['当日 → 完了にする', '夜8時に届く通知から「完了」か「中止」を'],
        ]} />
        <Cta href="/create" color="orange">ラウンドを募集する</Cta>

        {/* ⑩ よくある質問 */}
        <Anchor id="faq" />
        <div className="text-[15px] font-black mb-2">❓ よくある質問</div>
        <div className="flex flex-col gap-2 mb-8">
          <Accordion icon="🤝" title="友達申請を承認すると何ができる？">
            <p>ゴル友になり、<b>メッセージ</b>が送れるようになります。「行ける日」では相手の<b>名前と🤝印</b>が見え、自分の行ける日を選んで<b>声をかける</b>ことができます。</p>
            <p className="mt-2">「同じ組で回った」と承認したときは、翌朝お互いにレビューが届きます。<button type="button" onClick={() => go('friends')} className="text-blue font-bold">画面で見る</button></p>
          </Accordion>
          <Accordion icon="💰" title="費用はどれくらい？どう払う？">
            <p>金額の目安は各募集に書いてあります。支払いは<b>当日ゴルフ場で各自</b>が基本です。</p>
            <p className="mt-2">事前入金のある募集は、募集ページに期日・金額・振込先が出ます。昼食代・利用税・ロッカー代は当日現地で。ゴルトモの利用は無料です。</p>
          </Accordion>
          <Accordion icon="🔰" title="初心者でも参加していい？">
            <p>大丈夫です。「初心者歓迎」の募集が安心です。プロフィールに正直なスコアを書いておくと、当日気まずくなりません。</p>
          </Accordion>
          <Accordion icon="🚗" title="車がなくても行ける？">
            <p>行けます。申請のときに<b>「送迎を希望する」</b>で乗りたい駅を選べます。送迎ありの募集には🚗マーク。</p>
          </Accordion>
          <Accordion icon="🙏" title="行けなくなったら？">
            <p>できるだけ早くチャットで伝えてください。キャンセル期日がある募集は、期日を過ぎるとアプリから取り消せず、主催者への連絡になります。</p>
          </Accordion>
          <Accordion icon="😰" title="知らない人と回るのが不安">
            <p>プロフィールに、一緒に回った人のうち何人が「行きたい」と答えたかと参加回数が出ます。先に主催者へ質問してからでも大丈夫。合わない相手はブロック・通報できます。</p>
          </Accordion>
          <Accordion icon="🔔" title="通知が来ない">
            <p>LINE公式アカウントを<b>友だち追加</b>していないとLINEが届きません。種類ごとのON/OFFはマイページの通知設定で。</p>
          </Accordion>
          <Accordion icon="📱" title="QRコードで友達になるには？">
            <p>会ったその場で、マイページのQRを読み合うとすぐ友達になれます。</p>
          </Accordion>
          <Accordion icon="🏌️" title="AIスイング解析">
            <p>「スイング」タブから動画を送ると、AIがフェーズごとに解析してアドバイスします。</p>
          </Accordion>
        </div>

        {/* 困ったとき */}
        <div className="rounded-card border-2 border-border bg-card p-4 mb-6 text-center">
          <div className="text-[13px] font-black mb-1">解決しないときは</div>
          <p className="text-[12px] text-sub leading-relaxed mb-1">運営に直接メッセージできます。トラブル・要望・不具合、何でもどうぞ。</p>
          <Cta href="/mypage" color="green">マイページから問い合わせる</Cta>
        </div>

        {/* 規約・運営情報 */}
        <div className="text-[11px] font-black text-sub mb-2">規約・運営情報</div>
        <div className="bg-card rounded-card shadow-card overflow-hidden border-2 border-border">
          <LinkRow icon="📄" label="利用規約・運営会社" href="/legal/terms" />
          <LinkRow icon="💴" label="お金のやり取りに関するルール" href="/legal/money" />
          <LinkRow icon="🔒" label="プライバシーポリシー" href="/legal/privacy" last />
        </div>
        <div className="text-[10px] text-muted text-center mt-3">ゴルトモ © 2026</div>
      </div>

      {/* 画像の拡大 */}
      {zoom && (
        <Portal>
          <div className="fixed inset-0 z-[400] bg-black/85 flex items-center justify-center p-4" onClick={() => setZoom(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoom} alt="画面の拡大" className="max-h-[88vh] max-w-full rounded-2xl" />
            <button type="button" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 text-[18px] font-black" aria-label="閉じる">✕</button>
          </div>
        </Portal>
      )}
    </div>
  );
}

function Anchor({ id }: { id: string }) {
  return <div id={id} className="h-0" />;
}

function Head({ emoji, title, sub, accent }: { emoji: string; title: string; sub?: string; accent?: boolean }) {
  return (
    <div className="mb-3 pt-1">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl bg-card border-2 border-border grid place-items-center text-[17px] shadow-[2px_2px_0_#1E3A30] flex-none">{emoji}</span>
        <h2 className={'text-[17px] font-black leading-tight ' + (accent ? 'text-orange' : '')}>{title}</h2>
      </div>
      {sub && <p className="text-[11.5px] text-sub mt-1.5 leading-relaxed">{sub}</p>}
    </div>
  );
}

function Benefit({ n, icon, title, text }: { n: string; icon: string; title: string; text: string }) {
  return (
    <div className="relative bg-card rounded-card border-2 border-border p-2.5 shadow-card">
      <span className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-green text-white text-[10px] font-black grid place-items-center border-2 border-border">{n}</span>
      <div className="text-[20px] leading-none">{icon}</div>
      <div className="text-[12.5px] font-black mt-1">{title}</div>
      <div className="text-[10.5px] text-sub leading-snug mt-0.5">{text}</div>
    </div>
  );
}

// 実際の画面を横にめくって見せる。番号つき。タップで拡大。
function Tour({ items, onZoom }: { items: TourItem[]; onZoom: (src: string) => void }) {
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const onScroll = () => {
    const el = ref.current; if (!el) return;
    const w = (el.firstElementChild as HTMLElement | null)?.offsetWidth || 1;
    setIdx(Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / (w + 12)))));
  };
  return (
    <div className="mb-3">
      <div ref={ref} onScroll={onScroll} className="flex gap-3 overflow-x-auto -mx-5 px-5 pb-1 snap-x snap-mandatory no-scrollbar">
        {items.map((it, i) => (
          <figure key={it.src + i} className="flex-none w-[58%] snap-center">
            <button type="button" onClick={() => onZoom(it.src)} className="block w-full rounded-[18px] overflow-hidden border-2 border-border bg-card shadow-[3px_3px_0_#1E3A30]" aria-label={`${it.title}（拡大）`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.src} alt={it.title} className="block w-full h-auto" loading="lazy" />
            </button>
            <figcaption className="mt-2 flex gap-1.5">
              <span className="w-5 h-5 rounded-full bg-orange text-white text-[10px] font-black grid place-items-center flex-none mt-px">{i + 1}</span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-black leading-snug">{it.title}</span>
                {it.text && <span className="block text-[10.5px] text-sub leading-snug mt-0.5">{it.text}</span>}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
      {items.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {items.map((_, i) => <span key={i} className={'h-1.5 rounded-full transition-all ' + (i === idx ? 'w-4 bg-green' : 'w-1.5 bg-border/40')} />)}
        </div>
      )}
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return <div className="mb-8 rounded-xl bg-green-light border-[1.5px] border-green px-3 py-2.5 text-[11.5px] text-text leading-relaxed">💡 {children}</div>;
}

function Flow({ steps, accent }: { steps: Array<[string, string]>; accent?: boolean }) {
  return (
    <ol className="relative mb-3 ml-1">
      {steps.map(([t, d], i) => (
        <li key={t} className="relative pl-9 pb-3 last:pb-0">
          {i < steps.length - 1 && <span className="absolute left-[11px] top-6 bottom-0 w-[2px] bg-border/30" />}
          <span className={'absolute left-0 top-0 w-6 h-6 rounded-full text-white text-[11px] font-black grid place-items-center border-2 border-border ' + (accent ? 'bg-orange' : 'bg-green')}>{i + 1}</span>
          <div className="text-[13px] font-black leading-tight pt-0.5">{t}</div>
          <div className="text-[11.5px] text-sub leading-relaxed mt-0.5">{d}</div>
        </li>
      ))}
    </ol>
  );
}

function Cta({ href, color, children }: { href: string; color: 'green' | 'orange'; children: React.ReactNode }) {
  return (
    <Link href={href} className={'block mt-2 mb-8 py-2.5 rounded-xl text-[13px] font-black text-white text-center border-2 border-border shadow-[2px_2px_0_#1E3A30] ' + (color === 'orange' ? 'bg-orange' : 'bg-green')}>
      {children}
    </Link>
  );
}

function Accordion({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <details className="bg-card rounded-card shadow-card border-2 border-border overflow-hidden group">
      <summary className="flex items-center gap-2.5 px-4 py-3 cursor-pointer list-none text-[13px] font-black">
        <span className="text-lg w-6 text-center">{icon}</span>
        <span className="flex-1">{title}</span>
        <span className="text-muted transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="px-4 pb-3.5 pt-1 text-[12.5px] text-text leading-relaxed border-t-2 border-hair">{children}</div>
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
