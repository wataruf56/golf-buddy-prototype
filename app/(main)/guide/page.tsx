'use client';

import { useState } from 'react';
import Link from 'next/link';

// 使い方・ヘルプ。
// 初見の人が「何をする場所か → どう使うか → 募集の立て方」を、
// スクロールするだけで（何も開かずに）理解できる構成にしている。
// 折りたたみは「知りたい人だけが読むもの（FAQ・付随機能）」に限定する。
// 画面イメージは /guide-shots/{key}.png。差し替えは同名で上書きするだけ。
export default function GuidePage() {
  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-bg">
      <div className="px-5 pt-6 pb-24 max-w-md mx-auto">

        {/* ① 何をする場所なのか ─ ここだけ読めば分かるように断言する */}
        <div className="text-center mb-5">
          <div className="text-3xl mb-2">⛳</div>
          <h1 className="text-[22px] font-black leading-tight">
            ゴルトモは、<br />同世代とゴルフに行くアプリ
          </h1>
          <p className="text-[13px] text-sub mt-2.5 leading-relaxed">
            「一緒に回る人がいない」を解決します。<br />
            <b className="text-text">誰かの募集に参加する</b>か、<b className="text-text">自分で募集を立てる</b>。<br />
            やることはこの2つだけです。
          </p>
        </div>

        {/* ② 2つの使い方への入口 */}
        <div className="grid grid-cols-2 gap-2.5 mb-8">
          <a href="#join" className="bg-card rounded-card shadow-card border-2 border-border p-3.5 text-center">
            <div className="text-2xl">🙋</div>
            <div className="text-[13px] font-black mt-1">参加する</div>
            <div className="text-[10.5px] text-muted mt-0.5 leading-snug">誰かの募集に<br />申し込む</div>
          </a>
          <a href="#host" className="bg-orange-light rounded-card shadow-card border-2 border-orange p-3.5 text-center">
            <div className="text-2xl">✏️</div>
            <div className="text-[13px] font-black mt-1">募集する</div>
            <div className="text-[10.5px] text-muted mt-0.5 leading-snug">自分で日程を<br />決めて集める</div>
          </a>
        </div>

        {/* ③ 参加する流れ */}
        <SectionTitle id="join" emoji="🙋" title="募集に参加する" sub="はじめての人はこちらから" />
        <div className="flex flex-col gap-2.5 mb-8">
          <Step n={1} title="プロフィールを登録する" time="1分">
            名前・年齢・だいたいのスコア・行けるエリアを入れるだけ。
            <b>主催者はこれを見て承認するか決める</b>ので、空欄が多いと参加しづらくなります。
            <Shot sectionKey="mypage" title="マイページ" caption="マイページの「編集」から登録" />
            <Cta href="/mypage/edit" color="green">プロフィールを登録する</Cta>
          </Step>

          <Step n={2} title="募集をさがす">
            ホームに新しい募集が並びます。エリア・日程・費用・男女枠でしぼり込みたいときは「さがす」タブへ。
            <Shot sectionKey="search" title="さがす" caption="条件を指定してしぼり込む" />
          </Step>

          <Step n={3} title="「参加を申請する」を押す">
            <b className="text-orange">押した時点ではまだ確定しません。</b>
            主催者に申請が届き、承認されると参加が決まります。結果はLINEで届きます。
            <Note>車がない人は、申請のときに「送迎を希望する」を選べます。乗せてもらえる募集ならここで相談できます。</Note>
          </Step>

          <Step n={4} title="グループチャットで相談 → 当日">
            承認されると、その募集専用のチャットに入ります。集合場所・時間・待ち合わせはここで。
            当日はゴルフ場で合流してプレーするだけです。
            <Note>ラウンドが終わったら、一緒に回った人を評価します（次の「ゴル友」につながります）。</Note>
          </Step>
        </div>

        {/* ④ 募集する流れ ─ このアプリの主役なので厚く */}
        <SectionTitle id="host" emoji="✏️" title="自分で募集する" sub="日程が決まっている人・仲間を集めたい人" accent />
        <div className="rounded-card border-2 border-orange bg-orange-light p-3.5 mb-3">
          <div className="text-[13px] font-black mb-1">💡 予約が取れたら、まず募集を立ててください</div>
          <p className="text-[12.5px] leading-relaxed">
            人が集まってから予約する必要はありません。<b>枠が余っている段階で募集を出すのがいちばん集まります。</b>
            1人でも来てくれれば、それだけでラウンドが成立します。
          </p>
        </div>
        <div className="flex flex-col gap-2.5 mb-8">
          <Step n={1} title="募集を投稿する" time="2分" accent>
            入力するのは <b>ゴルフ場・日付・スタート時間・都道府県・募集人数・だいたいの費用</b>。
            日付が未定でも「◯月ごろ」で出せます。
            <Shot sectionKey="create" title="ラウンド募集" caption="「募集する」から入力して投稿" />
            <Ul items={[
              '初心者歓迎／男女枠／送迎できる駅なども指定できます',
              '知り合いを連れて行くときは「主催者の知り合い」で人数を確保できます',
              '事前にお金をまとめる場合は「入金管理」をONにすると、誰が払ったか管理できます',
            ]} />
            <Cta href="/create" color="orange">ラウンドを募集する</Cta>
          </Step>

          <Step n={2} title="申請が来たら承認する" accent>
            申請が届くとLINEに通知が来ます。相手のプロフィールと評価を見て、承認かお断りかを選びます。
            <Note>断ってもかまいません。相手に理由は伝わりません。</Note>
          </Step>

          <Step n={3} title="グループチャットで決める" accent>
            集合時間・待ち合わせ場所・送迎・組み分けをチャットで相談します。
            当日の連絡もここに集約されるので、個別のやり取りは不要です。
          </Step>

          <Step n={4} title="当日プレー → 完了にする" accent>
            終わったら募集を「完了」にします。参加者どうしで評価ができるようになり、
            「また回りたい」がお互い一致した人は<b>ゴル友</b>になります。次に誘いやすくなります。
          </Step>
        </div>

        {/* ⑤ よくある質問 ─ 参加をためらう理由に先回りする */}
        <div className="text-[11px] font-black text-sub mb-2">よくある質問</div>
        <div className="flex flex-col gap-2.5 mb-8">
          <Accordion icon="💰" title="費用はどれくらい？どう払う？">
            <p>プレー費は各募集に書かれている金額の目安を見てください。ゴルフ場によって変わります。</p>
            <p className="mt-2">支払いは<b>当日ゴルフ場で各自</b>が基本です。主催者がまとめて払う場合は、募集に振込先などの案内が書かれます（「入金」タブで誰が払ったか分かります）。</p>
            <p className="mt-2 text-sub">ゴルトモの利用自体は無料です。手数料はいただきません。</p>
          </Accordion>

          <Accordion icon="🔰" title="初心者でも参加していい？">
            <p>大丈夫です。「初心者歓迎」の募集を選ぶと安心です。「さがす」でスコアの条件をしぼり込めます。</p>
            <p className="mt-2">プロフィールに正直なスコアを書いておくと、主催者も組み合わせを考えやすくなり、当日気まずくなりません。</p>
          </Accordion>

          <Accordion icon="🚗" title="車がなくても行ける？">
            <p>行けます。募集によっては主催者や参加者が最寄り駅まで迎えに来てくれます。</p>
            <p className="mt-2">参加を申請するときに<b>「送迎を希望する」</b>と、乗りたい駅を選べます。送迎ありの募集は一覧に🚗マークが付きます。</p>
          </Accordion>

          <Accordion icon="🙏" title="行けなくなったら？ドタキャンは？">
            <p>できるだけ早くグループチャットで伝えてください。人数が変わるとゴルフ場の予約に影響します。</p>
            <p className="mt-2 text-sub">連絡なしの当日キャンセルが確認された場合、運営がプロフィールに注意表示を付けることがあります。困ったときはマイページの「お問い合わせ」から運営にご連絡ください。</p>
          </Accordion>

          <Accordion icon="😰" title="知らない人と回るのが不安">
            <p>プロフィールに<b>「一緒に回った人のうち、また回りたいと答えた人の割合」</b>が出ています。過去に何回参加しているかも分かります。</p>
            <p className="mt-2">はじめは主催者にチャットで質問してから申し込んでも大丈夫です。合わないと感じた相手はブロック・通報できます。</p>
          </Accordion>

          <Accordion icon="🔔" title="通知が来ない">
            <p>LINE公式アカウントを<b>友だち追加</b>していないと、参加申請・承認・リマインドのLINEが届きません。</p>
            <p className="mt-2">通知の種類ごとのON/OFFは、マイページの通知設定で変えられます。</p>
          </Accordion>
        </div>

        {/* ⑥ そのほかの機能 */}
        <div className="text-[11px] font-black text-sub mb-2">そのほかの機能</div>
        <div className="flex flex-col gap-2.5 mb-8">
          <Accordion icon="👥" title="ゴル友（また回りたい人とつながる）">
            <p>ラウンド後、一緒に回った人に「また一緒に回りたい」を送れます。</p>
            <p className="mt-2"><b className="text-green">お互いが選んだときだけ</b>通知される両想い方式です。片思いの間は相手に一切伝わりません。</p>
            <p className="mt-2">成立した相手は「ゴル友」タブに並び、直接メッセージを送れます。次のラウンドに誘うのが簡単になります。</p>
            <Shot sectionKey="buddies" title="ゴル友" caption="両想いになった相手とメッセージ" />
          </Accordion>

          <Accordion icon="🤝" title="QRコードでゴル友になる">
            <p>実際に会った人とは、その場でQRコードを読み合うとすぐゴル友になれます。マイページのQRから。</p>
          </Accordion>

          <Accordion icon="🏌️" title="AIスイング解析">
            <p>「スイング」タブから動画を送ると、AIがフェーズごとに解析してアドバイスします。過去の自分やプロとの比較もできます。</p>
            <Shot sectionKey="swing" title="スイング解析" caption="動画を送るとAIが解析" />
          </Accordion>
        </div>

        {/* ⑦ 困ったとき */}
        <div className="rounded-card border-2 border-border bg-card p-4 mb-6 text-center">
          <div className="text-[13px] font-black mb-1">解決しないときは</div>
          <p className="text-[12.5px] text-sub leading-relaxed mb-2.5">運営に直接メッセージできます。トラブル・要望・不具合、何でもどうぞ。</p>
          <Cta href="/mypage" color="green">マイページから問い合わせる</Cta>
        </div>

        {/* 規約・運営情報 */}
        <div className="text-[11px] font-black text-sub mb-2">規約・運営情報</div>
        <div className="bg-card rounded-card shadow-card overflow-hidden border-2 border-border">
          <LinkRow icon="📄" label="利用規約・運営会社" href="/legal/terms" />
          <LinkRow icon="🔒" label="プライバシーポリシー" href="/legal/privacy" last />
        </div>
        <div className="text-[10px] text-muted text-center mt-3">ゴルトモ © 2026</div>
      </div>
    </div>
  );
}

function SectionTitle({ id, emoji, title, sub, accent }: { id?: string; emoji: string; title: string; sub?: string; accent?: boolean }) {
  return (
    <div id={id} className="scroll-mt-4 mb-3">
      <div className="flex items-center gap-2">
        <span className="text-xl">{emoji}</span>
        <h2 className={'text-[18px] font-black ' + (accent ? 'text-orange' : '')}>{title}</h2>
      </div>
      {sub && <p className="text-[11.5px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

// 手順の1ステップ。開閉せず、最初から中身が見える。
function Step({ n, title, time, accent, children }: { n: number; title: string; time?: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-card shadow-card border-2 border-border overflow-hidden">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b-2 border-hair">
        <span className={'w-6 h-6 rounded-full grid place-items-center text-[12px] font-black text-white flex-none ' + (accent ? 'bg-orange' : 'bg-green')}>{n}</span>
        <span className="text-[14px] font-black flex-1">{title}</span>
        {time && <span className="text-[10px] font-bold text-muted flex-none">約{time}</span>}
      </div>
      <div className="px-3.5 py-3 text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="mt-2.5 rounded-lg bg-bg border border-border px-3 py-2 text-[12px] text-sub leading-relaxed">{children}</div>;
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {items.map((t) => (
        <li key={t} className="text-[12.5px] text-sub leading-relaxed flex gap-1.5">
          <span className="text-muted flex-none">・</span><span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Cta({ href, color, children }: { href: string; color: 'green' | 'orange'; children: React.ReactNode }) {
  return (
    <Link href={href} className={'block mt-3 py-2.5 rounded-xl text-[13px] font-black text-white text-center ' + (color === 'orange' ? 'bg-orange' : 'bg-green')}>
      {children}
    </Link>
  );
}

// 画面イメージ。縦長のスクショを開いたまま置くと手順の流れが分断されるので、
// 既定は閉じておき、見たい人だけが開く。画像が無ければ何も出さない。
function Shot({ sectionKey, title, caption }: { sectionKey: string; title: string; caption?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <details className="mt-2.5">
      <summary className="list-none cursor-pointer inline-flex items-center gap-1 text-[11.5px] font-bold text-blue">
        📷 画面イメージを見る
      </summary>
      <figure className="mt-2">
        <div className="rounded-xl overflow-hidden border border-border bg-bg mx-auto max-w-[210px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/guide-shots/${sectionKey}.png`}
            alt={`${title}の画面`}
            className="block w-full max-w-full h-auto"
            loading="lazy"
            onError={() => setFailed(true)}
          />
        </div>
        {caption && <figcaption className="text-[10.5px] text-muted text-center mt-1">{caption}</figcaption>}
      </figure>
    </details>
  );
}

function Accordion({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <details className="bg-card rounded-card shadow-card border-2 border-border overflow-hidden group">
      <summary className="flex items-center gap-2.5 px-4 py-3.5 cursor-pointer list-none text-[13.5px] font-black">
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
