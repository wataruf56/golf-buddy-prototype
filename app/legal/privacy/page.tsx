import Link from 'next/link';

export const metadata = { title: 'プライバシーポリシー - ゴルトモ' };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-bg max-w-2xl mx-auto px-5 py-6">
      <Link href="/mypage" className="text-sm text-blue font-bold">← 戻る</Link>
      <h1 className="text-2xl font-black mt-3 mb-1">プライバシーポリシー</h1>
      <div className="text-[11px] text-muted mb-6">最終更新: 2026年5月</div>

      <Section title="1. 取得する情報">
        本サービスでは以下の情報を取得・保存します。
        <ul className="list-disc ml-5 mt-2 space-y-1">
          <li><b>LINE プロフィール情報</b>: LINE userId、表示名、プロフィール画像URL（LIFF idTokenを介して取得）</li>
          <li><b>ユーザー入力情報</b>: 年齢・性別・エリア・スコア帯・ゴルフ歴など、プロフィール編集画面で入力された情報</li>
          <li><b>動画データ</b>: スイング分析機能で投稿された動画ファイル</li>
          <li><b>アクセスログ</b>: ページアクセス、エラー情報、操作イベント（解析・改善のため）</li>
        </ul>
        メールアドレス、電話番号、LINE 友だちリスト、位置情報は<b>取得しません</b>。
      </Section>

      <Section title="2. 利用目的">
        <ul className="list-disc ml-5 space-y-1">
          <li>本サービス（マッチング・スイング分析）の提供</li>
          <li>本人確認、不正利用防止</li>
          <li>サービス改善のための統計分析</li>
          <li>新機能・障害情報のLINE通知</li>
        </ul>
      </Section>

      <Section title="3. 第三者提供">
        以下の場合を除き、ユーザーの個人情報を第三者に提供しません。
        <ul className="list-disc ml-5 mt-2 space-y-1">
          <li>法令に基づく開示要求があった場合</li>
          <li>人の生命・身体・財産の保護のために必要な場合</li>
        </ul>
      </Section>

      <Section title="4. 外部サービスへの送信">
        本サービスは以下の外部サービスを利用しています。これらに対する情報送信があります。
        <ul className="list-disc ml-5 mt-2 space-y-1">
          <li><b>LINE Platform</b>: 認証・通知のため（LINE Corp 提供）</li>
          <li><b>Google Cloud Platform</b>: 動画ストレージ（Cloud Storage）・AI分析（Vertex AI Gemini）のため。動画はAI分析のために Vertex AI に送信されます。</li>
          <li><b>Firebase</b>: ユーザー情報のデータベースとして利用</li>
          <li><b>Vercel</b>: アプリケーションのホスティング</li>
        </ul>
        各サービスのプライバシーポリシーも合わせてご確認ください。
      </Section>

      <Section title="5. データの保管期間">
        <ul className="list-disc ml-5 space-y-1">
          <li>プロフィール情報: アカウント削除まで保管</li>
          <li>スイング動画: ユーザー自身が削除するか、サービス終了時まで保管</li>
          <li>アクセスログ: 最長180日間</li>
        </ul>
      </Section>

      <Section title="6. ユーザーの権利">
        ユーザーはアプリ内のプロフィール編集画面から、いつでも登録情報を変更・削除できます。
        スイング分析の動画も結果ページから個別に削除可能です。
        アカウント自体の削除をご希望の場合、本サービスのお問い合わせ窓口までご連絡ください。
      </Section>

      <Section title="7. Cookieの使用">
        本サービスはユーザーの認証情報を保持するために HTTP-only Cookie を使用します。トラッキングや広告目的の Cookie は使用していません。
      </Section>

      <Section title="8. 改定">
        本ポリシーは予告なく改定することがあります。重要な変更がある場合はサービス内で通知します。
      </Section>

      <Section title="9. お問い合わせ">
        プライバシーに関するご質問は、本サービスの管理者までLINEを通じてお問い合わせください。
      </Section>

      <div className="mt-8 text-center">
        <Link href="/legal/terms" className="text-sm text-blue font-bold">← 利用規約を見る</Link>
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
