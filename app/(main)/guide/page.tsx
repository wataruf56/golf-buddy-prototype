'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Portal } from '@/components/Portal';
import { useStore } from '@/lib/store';
import { chatIdFor } from '@/lib/utils';
import { ADMIN_MANAGER_ID } from '@/lib/adminManagerId';

// 使い方・ヘルプ（2026-10-11 作り直し → 2026-10-13 トップを2つに分けた）。
//   トップ（/guide）            … ①メインの機能 ②タブごとに機能を見る の2枚の大きな入口＋新機能・よくある質問・わからないことがあったら
//   メインの機能（?view=main）   … 行ける日 → 参加/募集 → チャット → 当日 → レビュー → ゴル友 の流れ
//   タブごと（?view=tabs&tab=…） … 下のタブ（ホーム／さがす／タイムライン／過去ラウンド／スイング／ゴル友／使い方）を1つずつ
// クエリで切り替えるので、どこからでも直リンクできる（例：/guide?view=tabs&tab=buddies）。
// 文章は最小限にして、**実際の画面**を横にめくって見せる（Tour）。タップで拡大（Lightbox）。
// 画面は /guide-shots/v2/{name}.webp。テスト用アカウントで撮ったもの（実在の会員は写っていない）。
// 差し替えは同じ名前で上書きするだけ。
// 運営への問い合わせは「ゴル友」タブの一番上「🛡️ 管理者にDM」に一本化（2026-10-13 本人指定。マイページには入口が無い）。
const IMG = (n: string) => `/guide-shots/v2/${n}.webp`;

type TourItem = { src: string; title: string; text?: string };
type View = 'top' | 'main' | 'tabs';
type TabKey = 'home' | 'search' | 'timeline' | 'past' | 'swing' | 'buddies' | 'guide';

// 下のタブバー（components/TabBar.tsx）と同じ並び・名前・絵文字
const TABS: Array<{ key: TabKey; label: string; emoji: string; href: string; lead: string }> = [
  { key: 'home', label: 'ホーム', emoji: '🏠', href: '/home', lead: '行ける日・参加予定・直近の募集がまとまる場所' },
  { key: 'search', label: 'さがす', emoji: '🔍', href: '/search', lead: '募集をキーワードと条件でしぼりこむ' },
  { key: 'timeline', label: 'タイムライン', emoji: '📰', href: '/timeline', lead: '同じ年代のみんなの動きが流れる' },
  { key: 'past', label: '過去ラウンド', emoji: '🏁', href: '/rounds/past', lead: '参加したラウンドのチャットとアルバム' },
  { key: 'swing', label: 'スイング', emoji: '🏌️', href: '/swing', lead: '動画を送るとAIがスイングを解析' },
  { key: 'buddies', label: 'ゴル友', emoji: '👥', href: '/buddies', lead: '友達の一覧・メッセージ・管理者にDM' },
  { key: 'guide', label: '使い方', emoji: '📖', href: '/guide', lead: 'いま見ているこのページ' },
];
const TAB_KEYS = TABS.map((t) => t.key) as string[];

const MAIN_NAV: Array<{ id: string; label: string }> = [
  { id: 'm-flow', label: '🗺️ 全体の流れ' },
  { id: 'avail', label: '📅 行ける日' },
  { id: 'join', label: '🙋 参加する' },
  { id: 'host', label: '✏️ 募集する' },
  { id: 'pay', label: '💴 事前入金' },
  { id: 'review', label: '⭐ レビュー' },
  { id: 'friends', label: '🤝 友達' },
];

export default function GuidePage() {
  return (
    <Suspense fallback={null}>
      <GuideInner />
    </Suspense>
  );
}

function GuideInner() {
  const router = useRouter();
  const params = useSearchParams();
  const meId = useStore((s) => s.meId);
  const scroller = useRef<HTMLDivElement>(null);
  const pendingAnchor = useRef<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const rawView = params?.get('view');
  const view: View = rawView === 'main' || rawView === 'tabs' ? rawView : 'top';
  const rawTab = params?.get('tab') || '';
  const tab: TabKey = (TAB_KEYS.includes(rawTab) ? rawTab : 'home') as TabKey;

  // 管理者（管理人）とのDM。ゴル友タブの一番上と同じ行き先。
  const adminDmHref = meId ? `/chat/${chatIdFor(meId, ADMIN_MANAGER_ID)}?other=${ADMIN_MANAGER_ID}` : '/buddies';

  const scrollToId = (id: string) => {
    const el = document.getElementById(id);
    const box = scroller.current;
    if (el && box) box.scrollTo({ top: el.offsetTop - 64, behavior: 'smooth' });
  };

  // 画面（トップ／メイン／タブ）が切り替わったら先頭へ。行き先の見出しがあればそこへ。
  useEffect(() => {
    const id = pendingAnchor.current;
    pendingAnchor.current = null;
    if (id) { requestAnimationFrame(() => scrollToId(id)); return; }
    scroller.current?.scrollTo({ top: 0 });
  }, [view, tab]);

  const open = (next: View, opts?: { tab?: TabKey; anchor?: string }) => {
    pendingAnchor.current = opts?.anchor || null;
    const q = next === 'top' ? '' : next === 'main' ? '?view=main' : `?view=tabs&tab=${opts?.tab || 'home'}`;
    router.push(`/guide${q}`, { scroll: false });
    // 同じ画面のままアンカーだけ変わるとき（effect が走らない）
    if (next === view && (next !== 'tabs' || (opts?.tab || 'home') === tab) && opts?.anchor) {
      pendingAnchor.current = null;
      scrollToId(opts.anchor);
    }
  };

  return (
    <div ref={scroller} className="h-full overflow-y-auto overflow-x-hidden bg-bg relative">
      {view === 'top' && <TopView open={open} adminDmHref={adminDmHref} />}
      {view === 'main' && <MainView open={open} go={scrollToId} onZoom={setZoom} adminDmHref={adminDmHref} />}
      {view === 'tabs' && <TabsView tab={tab} open={open} onZoom={setZoom} adminDmHref={adminDmHref} />}

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

type OpenFn = (next: View, opts?: { tab?: TabKey; anchor?: string }) => void;

/* ───────────────────────── トップ ───────────────────────── */

function TopView({ open, adminDmHref }: { open: OpenFn; adminDmHref: string }) {
  return (
    <div className="px-5 pt-5 pb-24 max-w-md mx-auto">
      {/* 何をする場所なのか */}
      <div className="text-center mb-5">
        <div className="text-3xl mb-1.5">⛳</div>
        <h1 className="text-[21px] font-black leading-tight">ゴルトモは、<br />同世代とゴルフに行くアプリ</h1>
        <p className="text-[12.5px] text-sub mt-2 leading-relaxed">
          <b className="text-text">募集に参加する</b>か、<b className="text-text">自分で募集する</b>か、<br /><b className="text-text">行ける日を押しておく</b>だけ。
        </p>
      </div>

      {/* 大きな入口 2つ */}
      <div className="flex flex-col gap-3 mb-7">
        <button type="button" onClick={() => open('main')}
          className="text-left bg-card rounded-card shadow-card border-[2.5px] border-border p-4 active:bg-green-light">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-green text-white grid place-items-center text-[24px] border-2 border-border flex-none">⭐</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-black text-green">1</span>
              <span className="block text-[17px] font-black leading-tight">メインの機能を見る</span>
            </span>
            <span className="text-[20px] text-muted">›</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1 text-[11px] font-bold text-sub">
            {['📅 行ける日', '🙋 参加・✏️ 募集', '💬 チャット', '⛳ 当日', '⭐ レビュー', '🤝 ゴル友'].map((s, i, a) => (
              <span key={s} className="flex items-center gap-1">
                <span className="px-2 py-0.5 rounded-full bg-green-light border border-green text-text whitespace-nowrap">{s}</span>
                {i < a.length - 1 && <span className="text-muted">→</span>}
              </span>
            ))}
          </div>
          <div className="text-[11.5px] text-sub mt-2 leading-relaxed">はじめての人はここから。ゴルフに行くまでの流れを、実際の画面で。</div>
        </button>

        <button type="button" onClick={() => open('tabs', { tab: 'home' })}
          className="text-left bg-card rounded-card shadow-card border-[2.5px] border-border p-4 active:bg-orange-light">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-orange text-white grid place-items-center text-[24px] border-2 border-border flex-none">📱</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-black text-orange">2</span>
              <span className="block text-[17px] font-black leading-tight">タブごとに機能を見る</span>
            </span>
            <span className="text-[20px] text-muted">›</span>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1">
            {TABS.map((t) => (
              <span key={t.key} className="flex flex-col items-center gap-0.5">
                <span className="text-[18px] leading-none">{t.emoji}</span>
                <span className="text-[8.5px] font-bold text-sub whitespace-nowrap tracking-tighter">{t.label}</span>
              </span>
            ))}
          </div>
          <div className="text-[11.5px] text-sub mt-2 leading-relaxed">画面の下に並んでいるタブで、それぞれ何ができるか。</div>
        </button>
      </div>

      {/* 新しくできたこと */}
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[15px] font-black">🆕 新しくできたこと</div>
        <div className="text-[10.5px] text-muted">横にスクロール →</div>
      </div>
      <div className="flex gap-2.5 overflow-x-auto -mx-5 px-5 pb-2 mb-7 snap-x snap-mandatory no-scrollbar">
        {([
          { img: 'buddies', t: '友達になると', d: '名前が見えて、声をかけられる', to: () => open('main', { anchor: 'friends' }) },
          { img: 'room_dm', t: '行ける日', d: '人数がそろうと運営が声かけ', to: () => open('main', { anchor: 'avail' }) },
          { img: 'review_car', t: 'レビュー', d: '同じ車の人も・必ず選ぶ形に', to: () => open('main', { anchor: 'review' }) },
          { img: 'past', t: '過去ラウンド', d: 'チャットとアルバムがすぐ開く', to: () => open('tabs', { tab: 'past' }) },
          { img: 'pay_notice', t: '事前入金', d: '金額と期日がひと目でわかる', to: () => open('main', { anchor: 'pay' }) },
        ] as const).map((c) => (
          <button key={c.img} type="button" onClick={c.to}
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

      {/* よくある質問 */}
      <div id="faq" className="text-[15px] font-black mb-2">❓ よくある質問</div>
      <div className="flex flex-col gap-2 mb-7">
        <Accordion icon="🛡️" title="運営に連絡したい・わからないことがある">
          <p>下のタブ<b>「ゴル友」</b>を開いて、一番上の<b>「🛡️ 管理者にDM」</b>からメッセージしてください。トラブル・要望・不具合・通報のあとのやりとりも、ここで受け付けています。</p>
          <p className="mt-2"><Link href={adminDmHref} className="text-blue font-bold">管理者にDMを開く</Link></p>
        </Accordion>
        <Accordion icon="🤝" title="友達申請を承認すると何ができる？">
          <p>ゴル友になり、<b>メッセージ</b>が送れるようになります。「行ける日」では相手の<b>名前と🤝印</b>が見え、自分の行ける日を選んで<b>声をかける</b>ことができます。</p>
          <p className="mt-2">「同じ組で回った」と承認したときは、翌朝お互いにレビューが届きます。<button type="button" onClick={() => open('main', { anchor: 'friends' })} className="text-blue font-bold">画面で見る</button></p>
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
          <p>LINE公式アカウントを<b>友だち追加</b>していないとLINEが届きません。種類ごとのON/OFFはマイページの通知設定で（ホーム右上の自分のアイコンから）。</p>
        </Accordion>
        <Accordion icon="📱" title="QRコードで友達になるには？">
          <p>会ったその場で、マイページのQRを読み合うとすぐ友達になれます（マイページはホーム右上の自分のアイコンから）。</p>
        </Accordion>
        <Accordion icon="🏌️" title="AIスイング解析">
          <p>「スイング」タブから動画を送ると、AIがフェーズごとに解析してアドバイスします。<button type="button" onClick={() => open('tabs', { tab: 'swing' })} className="text-blue font-bold">くわしく</button></p>
        </Accordion>
      </div>

      <HelpBox adminDmHref={adminDmHref} />
      <LegalLinks />
    </div>
  );
}

/* ───────────────────────── メインの機能 ───────────────────────── */

function MainView({ open, go, onZoom, adminDmHref }: { open: OpenFn; go: (id: string) => void; onZoom: (s: string) => void; adminDmHref: string }) {
  return (
    <>
      <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur border-b-2 border-hair">
        <BackBar title="⭐ メインの機能" onBack={() => open('top')} />
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-2.5 no-scrollbar">
          {MAIN_NAV.map((n) => (
            <button key={n.id} type="button" onClick={() => go(n.id)}
              className="flex-none px-3 py-1.5 rounded-full bg-card border-[1.5px] border-border text-[11.5px] font-black whitespace-nowrap active:bg-green-light">{n.label}</button>
          ))}
        </div>
      </div>

      <div className="px-5 pt-5 pb-24 max-w-md mx-auto">
        {/* 全体の流れ */}
        <Anchor id="m-flow" />
        <Head emoji="🗺️" title="ゴルフに行くまでの流れ" sub="入り口は3つ。どれから始めても、そのあとは同じです" />
        <div className="grid grid-cols-3 gap-2 mb-3">
          <EntryChip icon="📅" title="行ける日を押す" onClick={() => go('avail')} />
          <EntryChip icon="🙋" title="募集に参加" onClick={() => go('join')} />
          <EntryChip icon="✏️" title="自分で募集" onClick={() => go('host')} accent />
        </div>
        <Flow steps={[
          ['チャットで相談', '人数がそろう／参加が決まると、その日のグループチャットへ。集合・送迎・組み分けを決める'],
          ['ラウンド当日', '開催が近づくとチャットにリマインド（1週間前・前日など）。事前入金がある募集は期日までに振り込み'],
          ['レビュー', 'ラウンドが終わると届きます。一緒に回った人に「また行きたいか」を1人ずつ'],
          ['ゴル友になる', 'お互いに「行きたい」ならゴル友に。次は行ける日で声をかけられる'],
        ]} />
        <div className="mb-8" />

        {/* 行ける日 */}
        <Anchor id="avail" />
        <Head emoji="📅" title="行ける日 — 日付を押すだけ" sub="同じ日に3人そろうと、その日のチャットが始まります" />
        <Tour onZoom={onZoom} items={[
          { src: IMG('av_friend'), title: 'カレンダーで日付を押す', text: '「この日に行ける」で保存' },
          { src: IMG('room_chat'), title: '3人そろうとチャット', text: 'コース・集合場所を相談' },
          { src: IMG('room_dm'), title: '誰も話さないときは運営から', text: 'ボタンでその日のチャットへ' },
        ]} />
        <Cta href="/availability" color="green">📅 行ける日を入れる</Cta>

        {/* 参加する流れ */}
        <Anchor id="join" />
        <Head emoji="🙋" title="募集に参加する" sub="はじめての人はこちらから" />
        <Flow steps={[
          ['プロフィール登録', '名前・年齢・スコア・エリア。主催者はこれを見て承認します'],
          ['募集をさがす', 'ホームか「さがす」タブで'],
          ['「参加を申請する」', '承認されると参加決定（LINEで届く）。車がない人は送迎の希望も'],
          ['グループチャット → 当日', '集合場所・時間はチャットで'],
        ]} />
        <Cta href="/mypage/edit" color="green">プロフィールを登録する</Cta>

        {/* 募集する流れ */}
        <Anchor id="host" />
        <Head emoji="✏️" title="自分で募集する" sub="予約が取れたら、まず募集を。枠が余っている段階がいちばん集まります（ホーム右上の「＋ 募集」から）" accent />
        <Flow accent steps={[
          ['募集を投稿（2分）', 'ゴルフ場・日付・時間・人数・費用。日付未定でもOK'],
          ['申請を承認', 'プロフィールと評価を見て決める。断っても理由は伝わりません'],
          ['チャットで決める', '集合・送迎・組み分け・配車'],
          ['当日 → 完了にする', '夜8時に届く通知から「完了」か「中止」を'],
        ]} />
        <Cta href="/create" color="orange">ラウンドを募集する</Cta>

        {/* 事前入金 */}
        <Anchor id="pay" />
        <Head emoji="💴" title="事前入金のあるラウンド" sub="プレーフィーを先に振り込み、募集者が当日まとめてゴルフ場に払います" />
        <Tour onZoom={onZoom} items={[
          { src: IMG('pay_notice'), title: '募集ページに案内', text: '期日・金額・振込先' },
          { src: IMG('pay_join'), title: '申請の前に確認', text: '問題なければ「参加申請」' },
          { src: IMG('pay_ack'), title: 'あとから設定されたら', text: '「はい」か、参加の取り消し' },
          { src: IMG('pay_host'), title: '主催者：入金をチェック', text: '本名・性別・年齢つき' },
          { src: IMG('pay_remind'), title: '期日を過ぎたら運営から', text: '未入金の人にだけ・LINEにも' },
        ]} />
        <Tip>昼食代・ゴルフ場利用税・ロッカー代などは、当日ご本人で現地精算です。<Link href="/legal/money" className="text-blue font-bold ml-1">お金のルール</Link></Tip>

        {/* レビュー */}
        <Anchor id="review" />
        <Head emoji="⭐" title="ラウンド後のレビュー" sub="選んだものは相手に伝わりません。お互いに選んだときだけマッチします" />
        <Tour onZoom={onZoom} items={[
          { src: IMG('review_top'), title: '1人ずつ、必ずどれかを選ぶ', text: '思わない／どっちでも／行きたい' },
          { src: IMG('review_car'), title: '同じ車だった人も', text: '組が違っても「🚗 同じ車だった」' },
          { src: IMG('review_other'), title: '別の組の人は任意', text: 'もう友達の人は押さなくてOK' },
        ]} />
        <Tip>レビューが終わるまで、ほかの画面は使えません。💘「異性として気になる」は同じ組で1人まで。</Tip>

        {/* 友達 */}
        <Anchor id="friends" />
        <FriendsSection onZoom={onZoom} />

        <NextBox
          label="📱 タブごとの使い方も見る"
          sub="ホーム・さがす・ゴル友など、下のタブで何ができるか"
          onClick={() => open('tabs', { tab: 'home' })}
        />
        <HelpBox adminDmHref={adminDmHref} />
        <BackToTop onClick={() => open('top')} />
      </div>
    </>
  );
}

/* ───────────────────────── タブごと ───────────────────────── */

function TabsView({ tab, open, onZoom, adminDmHref }: { tab: TabKey; open: OpenFn; onZoom: (s: string) => void; adminDmHref: string }) {
  const i = TABS.findIndex((t) => t.key === tab);
  const cur = TABS[i];
  const prev = i > 0 ? TABS[i - 1] : null;
  const next = i < TABS.length - 1 ? TABS[i + 1] : null;

  return (
    <>
      <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur border-b-2 border-hair">
        <BackBar title="📱 タブごとの機能" onBack={() => open('top')} />
        {/* 下のタブバーと同じ並び。押すとそのタブの説明に切り替わる */}
        <div className="grid grid-cols-7 gap-0.5 px-2 pb-2">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button key={t.key} type="button" onClick={() => open('tabs', { tab: t.key })} aria-pressed={active}
                className={'flex flex-col items-center gap-0.5 py-1.5 rounded-xl border-[1.5px] ' + (active ? 'bg-green-light border-green text-green' : 'border-transparent text-muted')}>
                <span className="text-[19px] leading-none">{t.emoji}</span>
                <span className={'text-[8.5px] whitespace-nowrap tracking-tighter ' + (active ? 'font-black' : 'font-bold')}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 pt-5 pb-24 max-w-md mx-auto">
        <div className="bg-card rounded-card shadow-card border-[2.5px] border-border p-4 mb-6 flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl bg-green-light border-2 border-border grid place-items-center text-[26px] flex-none">{cur.emoji}</span>
          <div className="min-w-0">
            <div className="text-[11px] font-black text-sub">下のタブ</div>
            <h1 className="text-[19px] font-black leading-tight">「{cur.label}」</h1>
            <div className="text-[11.5px] text-sub mt-0.5 leading-snug">{cur.lead}</div>
          </div>
        </div>

        {tab === 'home' && <HomeTab open={open} />}
        {tab === 'search' && <SearchTab open={open} />}
        {tab === 'timeline' && <TimelineTab />}
        {tab === 'past' && <PastTab onZoom={onZoom} />}
        {tab === 'swing' && <SwingTab />}
        {tab === 'buddies' && <BuddiesTab onZoom={onZoom} adminDmHref={adminDmHref} />}
        {tab === 'guide' && <GuideTab open={open} />}

        {tab !== 'guide' && <Cta href={cur.href} color="green">{cur.emoji} 「{cur.label}」タブを開く</Cta>}

        {/* 前後のタブへ */}
        <div className="grid grid-cols-2 gap-2 mb-8">
          {prev ? (
            <button type="button" onClick={() => open('tabs', { tab: prev.key })}
              className="text-left bg-card rounded-xl border-2 border-border px-3 py-2.5 shadow-card">
              <div className="text-[10px] text-muted font-bold">← 前のタブ</div>
              <div className="text-[13px] font-black truncate">{prev.emoji} {prev.label}</div>
            </button>
          ) : <span />}
          {next ? (
            <button type="button" onClick={() => open('tabs', { tab: next.key })}
              className="text-right bg-card rounded-xl border-2 border-border px-3 py-2.5 shadow-card">
              <div className="text-[10px] text-muted font-bold">次のタブ →</div>
              <div className="text-[13px] font-black truncate">{next.emoji} {next.label}</div>
            </button>
          ) : <span />}
        </div>

        {tab !== 'buddies' && <HelpBox adminDmHref={adminDmHref} />}
        <BackToTop onClick={() => open('top')} />
      </div>
    </>
  );
}

function HomeTab({ open }: { open: OpenFn }) {
  return (
    <>
      <Head emoji="🏠" title="ホームに並ぶもの" sub="上から順に。アプリを開いたら、まずここを見ればOK" />
      <Points items={[
        ['📅', '行ける日', 'この先の日付ごとに、行ける人が何人いるか。押すとカレンダーへ'],
        ['📅', '参加予定のラウンド', '自分が主催・参加・申請中で、まだ開催前のもの。押すと募集ページ'],
        ['⛳', '直近のラウンド', 'ゴルトモ公式コンペと、募集中のラウンド。「もっと見る」で「さがす」へ'],
      ]} />
      <Head emoji="👆" title="右上のボタン" />
      <Points items={[
        ['🙂', '自分のアイコン', 'マイページ。プロフィール編集・QRで友達・通知設定はここから'],
        ['＋', '＋ 募集', '自分でラウンドを募集する'],
        ['🔔', 'お知らせ', '承認・メッセージ・リマインドなど。赤い数字は未読'],
      ]} />
      <Tip>LINEの友だち追加がまだの人には、一番上に「LINEで通知を受け取る」が出ます。<button type="button" onClick={() => open('main', { anchor: 'avail' })} className="text-blue font-bold ml-1">行ける日の使い方</button></Tip>
    </>
  );
}

function SearchTab({ open }: { open: OpenFn }) {
  return (
    <>
      <Head emoji="🔍" title="募集をさがす" sub="キーワードと「詳細フィルタ」でしぼりこみ" />
      <Points items={[
        ['⌨️', 'キーワード', 'タイトル・コース名・エリアで検索'],
        ['🎛️', '詳細フィルタ', '種別（ゴルフ／飲み会）・期間・エリア・募集の性別・予算上限・並び順'],
        ['✓', 'その他', '「空きありのみ」「🏆 コンペのみ」「🔰 初心者歓迎」'],
      ]} />
      <Head emoji="🙋" title="気になる募集があったら" />
      <Flow steps={[
        ['募集を押す', '日時・費用・主催者のプロフィールを確認。質問は主催者欄の💬から'],
        ['「参加を申請する」', '承認されると参加決定。LINEにも届きます'],
      ]} />
      <Tip>はじめての人は、先にプロフィールを登録しておくと承認されやすくなります。<button type="button" onClick={() => open('main', { anchor: 'join' })} className="text-blue font-bold ml-1">参加する流れ</button></Tip>
    </>
  );
}

function TimelineTab() {
  return (
    <>
      <Head emoji="📰" title="みんなの動き" sub="同じ年代のメンバーだけ・30日分。新しい順に1行ずつ流れます" />
      <Points items={[
        ['👋', '新しく入った人', '新規登録'],
        ['📅', '行ける日', '誰かが行ける日を入れた'],
        ['⛳', '募集・参加', '新しい募集、参加が決まったラウンド'],
      ]} />
      <Tip>右に「›」がある行は、押すとその募集や行ける日が開きます。同じ日に行けそうなら、そのまま参加や行ける日の登録へ。</Tip>
    </>
  );
}

function PastTab({ onZoom }: { onZoom: (s: string) => void }) {
  return (
    <>
      <Head emoji="🏁" title="過去ラウンド" sub="参加して完了したラウンドが、新しい順に残ります" />
      <Tour onZoom={onZoom} items={[
        { src: IMG('past'), title: '参加したラウンドの一覧', text: '📷＝写真があるラウンド' },
        { src: IMG('past_chat'), title: '押すとその日のチャット', text: 'あとからお礼や次の相談も' },
        { src: IMG('album'), title: '📷でアルバム', text: 'みんながあげた写真を見られる' },
      ]} />
      <Tip>同じ組の人への「行きたい」は、「ゴル友」タブの「過去参加したラウンド」から後でも付け直せます。</Tip>
    </>
  );
}

function SwingTab() {
  return (
    <>
      <Head emoji="🏌️" title="AIスイング解析" sub="スマホで撮った動画を送ると、AIがフェーズごとに見てアドバイスします" />
      <Flow steps={[
        ['「＋ 新規分析」を押す', 'スイングタブの右上から'],
        ['モードを選んで動画を送る', '🏌️ 自分解析／🆚 プロ比較／📈 過去比較／🏟️ 練習場vs本番／❓ 質問'],
        ['結果を見る', 'スコアとフェーズごとのアドバイス。履歴に残るので前回とくらべられます'],
      ]} />
      <Tip>動画は結果ページからいつでも削除できます。</Tip>
    </>
  );
}

function BuddiesTab({ onZoom, adminDmHref }: { onZoom: (s: string) => void; adminDmHref: string }) {
  return (
    <>
      {/* 運営への問い合わせ窓口（一番上） */}
      <Head emoji="🛡️" title="一番上：管理者にDM" sub="わからないこと・困りごと・不具合・要望・通報のあとのやりとりは、ここから運営にメッセージできます" />
      <Link href={adminDmHref}
        className="mb-8 bg-card rounded-card p-4 shadow-card border-[2.5px] border-border flex items-center gap-3">
        <span className="w-12 h-12 rounded-full bg-green-light flex items-center justify-center text-2xl flex-shrink-0 border-2 border-border">🛡️</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-black">管理者にDM</span>
          <span className="block text-[11px] text-sub mt-0.5">押すと運営とのメッセージが開きます</span>
        </span>
        <span className="text-lg">💬</span>
      </Link>

      <Head emoji="👥" title="友達の一覧" sub="QRでつながった人・レビューで「行きたい」同士の人・一緒に回った人・メッセージした相手が、ログインが新しい順に並びます" />
      <Points items={[
        ['💬', 'メッセージ', '右の💬から。未読はオレンジの数字'],
        ['📣', '声をかける', '自分の行ける日を選んで、まとめて送る'],
        ['📅', '候補日', '💘「気になる」同士のときだけ。日程をすり合わせる'],
        ['🏆', '同じコンペ参加者', '上の切り替えで。まだつながっていない人には友達申請'],
      ]} />

      <FriendsSection onZoom={onZoom} />
    </>
  );
}

function GuideTab({ open }: { open: OpenFn }) {
  return (
    <>
      <Head emoji="📖" title="使い方ページでできること" />
      <div className="flex flex-col gap-2 mb-8">
        <NextBox label="⭐ メインの機能" sub="行ける日 → 参加・募集 → チャット → レビュー → ゴル友" onClick={() => open('main')} />
        <NextBox label="❓ よくある質問" sub="費用・初心者・車がない・通知が来ない など" onClick={() => open('top', { anchor: 'faq' })} />
      </div>
    </>
  );
}

/* ───────────────────────── 共通の部品 ───────────────────────── */

// 友達になるとできること（メインの機能とゴル友タブの両方で使う）
function FriendsSection({ onZoom }: { onZoom: (s: string) => void }) {
  return (
    <>
      <Head emoji="🤝" title="友達になると、できること" sub="友達申請の承認・QR・レビューでお互いに「行きたい」を選ぶと友達（ゴル友）になります" />
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Benefit n="1" icon="💬" title="メッセージ" text="いつでも直接送れる" />
        <Benefit n="2" icon="👀" title="行ける日で見える" text="名前と🤝印が出る" />
        <Benefit n="3" icon="📣" title="声をかけられる" text="自分の行ける日を送れる" />
        <Benefit n="4" icon="⭐" title="レビューがラク" text="「すでに友達」で選ばなくてOK" />
      </div>
      <Tour onZoom={onZoom} items={[
        { src: IMG('fr_send'), title: '相手のプロフィールから申請', text: 'どこで一緒だったかを選んで送る' },
        { src: IMG('fr_receive'), title: '相手が承認', text: '受け取った側は「友達の確認」に届く' },
        { src: IMG('buddies'), title: 'ゴル友に並ぶ', text: '💬メッセージ・📣声をかける' },
        { src: IMG('av_friend'), title: '行ける日で名前が見える', text: '友達には🤝。タップでプロフィール' },
        { src: IMG('nudge_sheet'), title: '行ける日で声をかける', text: '自分の行ける日を選んでまとめて送る' },
        { src: IMG('nudge_dm'), title: '相手に届く', text: 'ボタンからそのまま行ける日へ' },
      ]} />
      <Tip>「同じ組で回った」と承認した場合は、翌朝お互いにレビューが届きます。</Tip>
    </>
  );
}

// わからないことがあったら → ゴル友タブ →「管理者にDM」
function HelpBox({ adminDmHref }: { adminDmHref: string }) {
  return (
    <div className="rounded-card border-[2.5px] border-border bg-card shadow-card p-4 mb-6">
      <div className="text-[14px] font-black mb-1">🛟 わからないことがあったら</div>
      <p className="text-[12px] text-sub leading-relaxed">
        運営に直接メッセージできます。トラブル・要望・不具合、何でもどうぞ。
      </p>
      <div className="mt-2.5 flex items-center gap-1.5 text-[11.5px] font-black flex-wrap">
        <span className="px-2 py-1 rounded-full bg-green-light border border-green whitespace-nowrap">👥 下の「ゴル友」タブ</span>
        <span className="text-muted">→</span>
        <span className="px-2 py-1 rounded-full bg-green-light border border-green whitespace-nowrap">🛡️ 一番上の「管理者にDM」</span>
      </div>
      <Link href={adminDmHref}
        className="block mt-3 py-2.5 rounded-xl text-[13px] font-black text-white text-center border-2 border-border shadow-[2px_2px_0_#1E3A30] bg-green">
        🛡️ 管理者にDMする
      </Link>
    </div>
  );
}

function LegalLinks() {
  return (
    <>
      <div className="text-[11px] font-black text-sub mb-2">規約・運営情報</div>
      <div className="bg-card rounded-card shadow-card overflow-hidden border-2 border-border">
        <LinkRow icon="📄" label="利用規約・運営会社" href="/legal/terms" />
        <LinkRow icon="💴" label="お金のやり取りに関するルール" href="/legal/money" />
        <LinkRow icon="🔒" label="プライバシーポリシー" href="/legal/privacy" last />
      </div>
      <div className="text-[10px] text-muted text-center mt-3">ゴルトモ © 2026</div>
    </>
  );
}

function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-2.5 pb-2">
      <button type="button" onClick={onBack}
        className="flex-none px-3 py-1.5 rounded-full bg-card border-[1.5px] border-border text-[12px] font-black active:bg-green-light">← 使い方トップ</button>
      <div className="text-[14px] font-black truncate">{title}</div>
    </div>
  );
}

function BackToTop({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="block w-full py-2.5 rounded-xl text-[13px] font-black text-text text-center bg-card border-2 border-border shadow-[2px_2px_0_#1E3A30]">
      ← 使い方トップへ戻る
    </button>
  );
}

function NextBox({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full text-left mb-4 bg-card rounded-card shadow-card border-[2.5px] border-border px-4 py-3 flex items-center gap-2">
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-black">{label}</span>
        <span className="block text-[11px] text-sub mt-0.5 leading-snug">{sub}</span>
      </span>
      <span className="text-[18px] text-muted">›</span>
    </button>
  );
}

function EntryChip({ icon, title, onClick, accent }: { icon: string; title: string; onClick: () => void; accent?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={'bg-card rounded-card border-2 border-border shadow-card px-1.5 py-2.5 text-center ' + (accent ? 'active:bg-orange-light' : 'active:bg-green-light')}>
      <div className="text-[20px] leading-none">{icon}</div>
      <div className={'text-[11.5px] font-black mt-1 leading-tight ' + (accent ? 'text-orange' : '')}>{title}</div>
    </button>
  );
}

function Points({ items }: { items: Array<[string, string, string]> }) {
  return (
    <div className="bg-card rounded-card shadow-card border-2 border-border overflow-hidden mb-6">
      {items.map(([icon, t, d], i) => (
        <div key={t} className={'flex gap-2.5 px-3.5 py-3 ' + (i < items.length - 1 ? 'border-b-2 border-hair' : '')}>
          <span className="w-6 text-center text-[17px] leading-none pt-0.5 font-black flex-none">{icon}</span>
          <span className="min-w-0">
            <span className="block text-[13px] font-black leading-snug">{t}</span>
            <span className="block text-[11.5px] text-sub leading-relaxed mt-0.5">{d}</span>
          </span>
        </div>
      ))}
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
