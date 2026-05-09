// Public landing page served at https://goltomo.com (and https://www.goltomo.com).
// No LIFF required. Standalone.

export const metadata = {
  title: 'ゴルトモ - ゴル友マッチング × AIスイング解析',
  description: '同年代のゴルファーと一緒にラウンドを回ろう。スイング動画をAIコーチが7フェーズに分けて解析。LINEで完結、ダウンロード不要。',
};

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || '2009973733-P5UdNex9';
const LIFF_URL = `https://liff.line.me/${LIFF_ID}`;

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-bg">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-green to-emerald-600 text-white">
        <div className="max-w-3xl mx-auto px-6 pt-12 pb-16 text-center">
          <div className="text-[11px] font-bold tracking-[0.3em] opacity-90 mb-3">GOLTOMO</div>
          <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-4">
            ⛳ ゴルトモ
          </h1>
          <div className="text-base sm:text-lg font-bold opacity-95 mb-6 leading-relaxed">
            ゴル友マッチング<br className="sm:hidden" /> × AIスイング解析<br />
            一緒にラウンドを回ろう
          </div>
          <p className="text-[13px] sm:text-sm opacity-90 mb-8 leading-relaxed max-w-md mx-auto">
            同年代のゴルファーと出会い、一緒にラウンドを回る。
            撮ったスイング動画はAIコーチが7フェーズに分けて即解析。
            すべてLINE上で完結、ダウンロード不要。
          </p>
          <a
            href={LIFF_URL}
            className="inline-block w-full max-w-xs px-6 py-4 bg-white text-green rounded-2xl font-black text-base shadow-xl"
          >
            LINEで始める
          </a>
          <div className="text-[10px] opacity-80 mt-3">無料・LINEログインのみ</div>
        </div>
      </section>

      {/* Two main features */}
      <section className="max-w-3xl mx-auto px-6 py-12">
        <h2 className="text-center text-2xl font-black mb-8">2つの機能</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-card rounded-card p-6 shadow-card">
            <div className="text-4xl mb-3">🤝</div>
            <div className="text-base font-black mb-2">ゴル友マッチング</div>
            <div className="text-[13px] text-sub leading-relaxed mb-3">
              同年代のゴルファーとラウンドを募集・参加。
              性別・スコア帯・エリアで絞り込み。
            </div>
            <div className="text-[11px] text-muted">
              年齢で2つのコミュニティに自動分離:<br />
              <b className="text-green">20〜30代</b> / <b className="text-orange">40〜50代</b>
            </div>
          </div>

          <div className="bg-card rounded-card p-6 shadow-card">
            <div className="text-4xl mb-3">🏌️</div>
            <div className="text-base font-black mb-2">AIスイング解析</div>
            <div className="text-[13px] text-sub leading-relaxed mb-3">
              動画を送るだけでAIコーチが解析。
              アドレスからフィニッシュまで7フェーズで具体的にアドバイス。
            </div>
            <div className="text-[11px] text-muted">
              4つのモード:<br />
              自分解析 / プロ比較 / 過去比較 / 自由質問
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-card py-12">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-center text-2xl font-black mb-8">使い方</h2>
          <ol className="space-y-4">
            {[
              { n: 1, t: 'LINEでログイン', d: '下のボタンをタップしてLINEアカウントで1秒ログイン。アプリのダウンロード不要。' },
              { n: 2, t: 'プロフィール登録', d: '年齢・性別・エリア・スコア帯を1分で登録。' },
              { n: 3, t: 'ラウンドを募集 or 参加', d: 'コース/エリア/日程で募集を作るか、他の人の募集に申請。' },
              { n: 4, t: 'スイング動画もAIに見てもらう', d: 'いつでも動画をアップして7フェーズ解析。完了するとLINEに通知。' },
            ].map((s) => (
              <li key={s.n} className="flex gap-4 items-start">
                <div className="w-9 h-9 rounded-full bg-green text-white flex items-center justify-center font-black text-sm flex-shrink-0">
                  {s.n}
                </div>
                <div>
                  <div className="font-bold text-sm mb-0.5">{s.t}</div>
                  <div className="text-[12px] text-sub leading-relaxed">{s.d}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-gradient-to-br from-green to-emerald-600 text-white py-12">
        <div className="max-w-md mx-auto px-6 text-center">
          <div className="text-2xl font-black mb-2">いますぐ始める</div>
          <div className="text-sm opacity-90 mb-6">完全無料・LINEログインのみ</div>
          <a
            href={LIFF_URL}
            className="inline-block w-full px-6 py-4 bg-white text-green rounded-2xl font-black text-base shadow-xl"
          >
            LINEで始める →
          </a>
        </div>
      </section>

      <footer className="px-6 py-8 text-center text-[11px] text-muted">
        <div className="space-x-3 mb-2">
          <a href="/legal/terms" className="underline">利用規約</a>
          <a href="/legal/privacy" className="underline">プライバシーポリシー</a>
        </div>
        <div>© 2026 ゴルトモ (合同会社シクミヤ)</div>
      </footer>
    </main>
  );
}
