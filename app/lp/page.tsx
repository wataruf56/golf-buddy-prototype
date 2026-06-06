// Public landing page served at https://goltomo.com (and https://www.goltomo.com).
// No LIFF required. Standalone. Hosted on GCP (Cloud Run + Firebase Hosting).

export const metadata = {
  title: 'ゴルトモ - ゴル友マッチング × AIスイング解析',
  description:
    '20〜30代のゴルファーと一緒にラウンドを回ろう。スイング動画はAIコーチが解析し、スコアの推移と課題の改善まで可視化。LINEで完結、ダウンロード不要。',
};

// Branded launch URL — /app is handled in middleware.ts and redirects to LIFF.
const LIFF_URL = '/app';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-bg">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-green to-emerald-700 text-white">
        <div className="max-w-3xl mx-auto px-6 pt-14 pb-16 text-center">
          <div className="text-[11px] font-bold tracking-[0.35em] opacity-90 mb-3">GOLTOMO</div>
          <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-3">⛳ ゴルトモ</h1>
          <div className="text-lg sm:text-xl font-black opacity-95 mb-5 leading-relaxed">
            ゴル友マッチング × AIスイング解析
          </div>
          <p className="text-[13px] sm:text-sm opacity-90 mb-8 leading-relaxed max-w-md mx-auto">
            同年代のゴルファーと出会って一緒にラウンド。
            スイング動画はAIコーチが解析し、<b className="font-black">スコアの伸びと課題の改善まで可視化</b>。
            すべてLINEで完結、ダウンロード不要。
          </p>
          <a
            href={LIFF_URL}
            className="inline-block w-full max-w-xs px-6 py-4 bg-white text-green rounded-2xl font-black text-base shadow-xl"
          >
            LINEで始める
          </a>
          <div className="text-[10px] opacity-80 mt-3">無料 ・ LINEログインのみ ・ アプリDL不要</div>
        </div>
      </section>

      {/* 3 features */}
      <section className="max-w-3xl mx-auto px-6 py-12">
        <h2 className="text-center text-2xl font-black mb-2">ゴルトモでできること</h2>
        <p className="text-center text-[12px] text-sub mb-8">仲間が増えて、上達して、また回りたくなる</p>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="bg-card rounded-card p-6 shadow-card">
            <div className="text-4xl mb-3">🤝</div>
            <div className="text-base font-black mb-2">ゴル友マッチング</div>
            <div className="text-[13px] text-sub leading-relaxed">
              同年代とラウンドを募集・参加。ラウンド後の<b className="text-green">相互レビュー</b>で「ゴル友」になり、メッセージでつながれます。
            </div>
          </div>
          <div className="bg-card rounded-card p-6 shadow-card">
            <div className="text-4xl mb-3">📊</div>
            <div className="text-base font-black mb-2">AIスイング解析</div>
            <div className="text-[13px] text-sub leading-relaxed">
              動画を送るだけでAIコーチが各フェーズを解説。さらに<b className="text-green">スコアの推移</b>と<b className="text-green">課題の改善</b>を時系列で見える化。
            </div>
          </div>
          <div className="bg-card rounded-card p-6 shadow-card">
            <div className="text-4xl mb-3">💌</div>
            <div className="text-base font-black mb-2">誘う・気になる</div>
            <div className="text-[13px] text-sub leading-relaxed">
              気になる募集は<b className="text-green">♡で保存</b>。募集者はゴル友や気になった人を<b className="text-green">招待</b>でき、声をかけ合えます。
            </div>
          </div>
        </div>
      </section>

      {/* Highlight: progress visualization */}
      <section className="bg-card py-12">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-center text-2xl font-black mb-2">上達が「数字」で見える</h2>
          <p className="text-center text-[12px] text-sub mb-8">解析するたびに記録され、伸びと課題の改善がひと目で分かる</p>
          <div className="max-w-md mx-auto bg-bg rounded-card p-5">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[13px] font-bold">📊 スイングスコアの推移</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-green leading-none">78</span>
                <span className="text-[11px] font-bold text-green">+12 ↑</span>
              </div>
            </div>
            <svg viewBox="0 0 320 110" width="100%" height="110" className="mt-1">
              <defs>
                <linearGradient id="lpgrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#34A85A" stopOpacity="0.22" />
                  <stop offset="1" stopColor="#34A85A" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line x1="10" y1="28" x2="310" y2="28" stroke="#e7ece9" />
              <line x1="10" y1="62" x2="310" y2="62" stroke="#e7ece9" />
              <polygon points="10,90 70,82 130,70 190,56 250,46 310,34 310,100 10,100" fill="url(#lpgrad)" />
              <polyline points="10,90 70,82 130,70 190,56 250,46 310,34" fill="none" stroke="#2A8C82" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="310" cy="34" r="5" fill="#2A8C82" />
            </svg>
            <div className="mt-3 flex flex-col gap-2">
              {[
                { l: '体重移動', v: 72, c: '#34A85A', s: '良好' },
                { l: '手打ちの抑制', v: 54, c: '#3AA0C9', s: '改善中' },
                { l: '頭の位置', v: 38, c: '#E8943A', s: '要練習' },
              ].map((a) => (
                <div key={a.l} className="flex items-center gap-2">
                  <span className="text-[11px] w-20 flex-shrink-0">{a.l}</span>
                  <div className="flex-1 h-2 bg-card rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${a.v}%`, background: a.c }} />
                  </div>
                  <span className="text-[10px] font-bold w-12 text-right" style={{ color: a.c }}>{a.s}</span>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-muted text-center mt-3">※ イメージ。解析を重ねるほど推移が伸びていきます</div>
          </div>
        </div>
      </section>

      {/* Trust / safety */}
      <section className="max-w-3xl mx-auto px-6 py-12">
        <h2 className="text-center text-2xl font-black mb-8">安心して使えるポイント</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="bg-card rounded-card p-5 shadow-card text-center">
            <div className="text-3xl mb-2">🎯</div>
            <div className="text-sm font-black mb-1">20〜30代コミュニティ</div>
            <div className="text-[12px] text-sub leading-relaxed">年代が近い人だけが集まるので、フラットに楽しめます。</div>
          </div>
          <div className="bg-card rounded-card p-5 shadow-card text-center">
            <div className="text-3xl mb-2">⭐</div>
            <div className="text-sm font-black mb-1">相互レビュー</div>
            <div className="text-[12px] text-sub leading-relaxed">ラウンド後の評価で安心。マナーの良い仲間とつながれます。</div>
          </div>
          <div className="bg-card rounded-card p-5 shadow-card text-center">
            <div className="text-3xl mb-2">💬</div>
            <div className="text-sm font-black mb-1">LINEで完結</div>
            <div className="text-[12px] text-sub leading-relaxed">通知もログインもLINE。アプリのダウンロードは不要です。</div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-card py-12">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-center text-2xl font-black mb-8">使い方</h2>
          <ol className="space-y-4 max-w-md mx-auto">
            {[
              { n: 1, t: 'LINEでログイン', d: '下のボタンからLINEで1秒ログイン。アプリDL不要。' },
              { n: 2, t: 'プロフィール登録', d: '年齢・性別・エリア・スコア帯を1分で登録。' },
              { n: 3, t: 'ラウンドを募集 or 参加', d: '募集を作る／気になる募集に申し込む／ゴル友を招待する。' },
              { n: 4, t: 'スイングをAIに見てもらう', d: '動画を送ると解析。スコアの推移と課題の改善が記録されます。' },
              { n: 5, t: '相互レビューでゴル友に', d: 'ラウンド後に評価し合うとゴル友になり、メッセージでつながれます。' },
            ].map((s) => (
              <li key={s.n} className="flex gap-4 items-start">
                <div className="w-9 h-9 rounded-full bg-green text-white flex items-center justify-center font-black text-sm flex-shrink-0">{s.n}</div>
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
      <section className="bg-gradient-to-br from-green to-emerald-700 text-white py-14">
        <div className="max-w-md mx-auto px-6 text-center">
          <div className="text-2xl font-black mb-2">いますぐ始める</div>
          <div className="text-sm opacity-90 mb-6">完全無料 ・ LINEログインのみ</div>
          <a href={LIFF_URL} className="inline-block w-full px-6 py-4 bg-white text-green rounded-2xl font-black text-base shadow-xl">
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
