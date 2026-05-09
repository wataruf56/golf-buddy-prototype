import Link from 'next/link';

export const metadata = { title: '利用規約 - ゴルトモ' };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-bg max-w-2xl mx-auto px-5 py-6">
      <Link href="/mypage" className="text-sm text-blue font-bold">← 戻る</Link>
      <h1 className="text-2xl font-black mt-3 mb-1">利用規約</h1>
      <div className="text-[11px] text-muted mb-6">最終更新: 2026年5月</div>

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

      <Section title="第6条（免責事項）">
        本サービスの利用により生じた損害について、当方は一切責任を負いません。
        ベータ版運用中はサービス停止・データ消失等が発生する可能性があります。
      </Section>

      <Section title="第7条（規約の変更）">
        本規約は予告なく変更することがあります。変更後の利用継続をもって同意とみなします。
      </Section>

      <Section title="第8条（準拠法・管轄）">
        本規約の解釈および本サービスに関する紛争は、日本法に準拠し、東京地方裁判所を専属的合意管轄とします。
      </Section>

      <div className="mt-8 text-center">
        <Link href="/legal/privacy" className="text-sm text-blue font-bold">プライバシーポリシーを見る →</Link>
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
