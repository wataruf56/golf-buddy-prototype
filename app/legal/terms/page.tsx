import type { Metadata } from 'next';
import Link from 'next/link';

const SITE = 'https://goltomo.com';
const APP = 'https://app.goltomo.com';

export const metadata: Metadata = {
  title: '利用規約 - ゴルトモ',
  description:
    'ゴルフ友達マッチングアプリ「ゴルトモ」の利用規約。利用登録、禁止事項、スイング分析機能の取り扱い、ラウンド参加時の責任範囲、ユーザー間のお金のやり取り、免責事項などを定めています。',
  alternates: { canonical: `${SITE}/legal/terms` },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-bg max-w-2xl mx-auto px-5 py-6">
      {/* 戻り先はアプリ側のマイページ（絶対URL）。相対 `/mypage` だと、検索から goltomo.com/legal/... に
          直接来た人には LP ホストに /mypage が無く 404 になっていた（2026-10-07）。app ホスト上では従来と同じ挙動。 */}
      <Link href={`${APP}/mypage`} className="text-sm text-blue font-bold">← 戻る</Link>
      <h1 className="text-2xl font-black mt-3 mb-1">利用規約</h1>
      <div className="text-[11px] text-muted mb-6">最終更新: 2026年10月11日</div>

      <Section title="第1条（適用）">
        本規約は、ゴルトモ（以下「本サービス」）の利用に関するすべての関係に適用されます。
        ユーザーは本サービスを利用することで、本規約に同意したものとみなします。
      </Section>

      <Section title="第2条（利用登録）">
        本サービスは LINE アカウントを用いた認証により利用登録が完了します。
        以下に該当する場合、当方の判断により利用を制限・停止することがあります。
        <ul className="list-disc ml-5 mt-2 space-y-1">
          <li>虚偽の情報を登録した場合</li>
          <li>他のユーザーへの迷惑行為（誹謗中傷、ハラスメント等）が確認された場合</li>
          <li>本規約または法令に違反した場合</li>
        </ul>
      </Section>

      <Section title="第3条（禁止事項）">
        <ul className="list-disc ml-5 space-y-1">
          <li>法令または公序良俗に違反する行為</li>
          <li>他のユーザーの個人情報を収集・公開する行為</li>
          <li>本サービスの運営を妨害する行為</li>
          <li>商用目的でのアカウント取得・利用（事前承諾を得た場合を除く）</li>
          <li>他人になりすます行為</li>
          <li>ゴルフ場の予約がない・開催するつもりがないのに募集を出すなど、虚偽の内容で参加者を集める行為</li>
          <li>参加費・キャンセル料などの名目で、金銭をだまし取る、または不当に要求する行為</li>
        </ul>
      </Section>

      <Section title="第4条（スイング分析機能について）">
        <ul className="list-disc ml-5 space-y-1">
          <li>スイング分析機能はAI（人工知能）による自動分析であり、結果の正確性は保証されません。</li>
          <li>分析結果は参考情報であり、医療・トレーニング・指導における正式なアドバイスではありません。</li>
          <li>アップロードされた動画は分析処理のために Google Cloud Platform 上に保存され、AI（Vertex AI Gemini）に送信されます。</li>
          <li>ユーザーは結果ページから動画を任意に削除できます。</li>
        </ul>
      </Section>

      <Section title="第5条（知的財産権）">
        本サービスのコンテンツ（プロンプト、UI、テキスト等）の著作権は当方に帰属します。
        ユーザーが投稿した動画・テキストの著作権はユーザーに帰属しますが、当方はサービス改善・解析のために利用できるものとします。
      </Section>

      <Section title="第6条（ユーザー間のやり取り・お金について）">
        <ul className="list-disc ml-5 space-y-1">
          <li>ラウンド・コンペ等の募集、参加、当日のプレー、参加費の集金、キャンセル料などは、ユーザー同士のあいだの約束であり、当方はその当事者・代理人・保証人になりません。</li>
          <li>ユーザーが主催する募集では、当方は参加費・キャンセル料などのお金を受け取らず、預からず、立て替え・返金・回収もしません。ユーザー間のトラブル（集金後の連絡不能、返金・キャンセル料・未払いをめぐる争いなど）は、当事者間で解決するものとします。</li>
          <li>当方が主催する「ゴルトモ公式コンペ」では、当方が参加費を事前入金で受け取り、コンペ当日にゴルフ場へプレーフィーをまとめて支払います。プレーフィー以外の費用（飲食など）は各自でゴルフ場にお支払いいただきます。キャンセル・返金の条件は下記のルールに定めます。</li>
          <li>詳しくは<Link href="/legal/money" className="text-blue font-bold">「お金のやり取りに関するルール」</Link>に定めます。このルールは本規約の一部です。</li>
        </ul>
      </Section>

      <Section title="第7条（免責事項）">
        本サービスの利用により生じた損害、およびユーザー間またはユーザーと第三者のあいだで生じた紛争について、当方は責任を負いません。
        ただし、当方の故意または重大な過失による場合はこの限りではありません。
        ベータ版運用中はサービス停止・データ消失等が発生する可能性があります。
      </Section>

      <Section title="第8条（規約の変更）">
        本規約は予告なく変更することがあります。変更後の利用継続をもって同意とみなします。
      </Section>

      <Section title="第9条（準拠法・管轄）">
        本規約の解釈および本サービスに関する紛争は、日本法に準拠し、東京地方裁判所を専属的合意管轄とします。
      </Section>

      <div className="mt-8 text-center space-y-2">
        <div><Link href="/legal/money" className="text-sm text-blue font-bold">お金のやり取りに関するルールを見る →</Link></div>
        <div><Link href="/legal/privacy" className="text-sm text-blue font-bold">プライバシーポリシーを見る →</Link></div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-base font-black mb-2">{title}</h2>
      <div className="text-[13px] leading-relaxed text-text">{children}</div>
    </section>
  );
}
