'use client';

import { useEffect, useState } from 'react';

type Platform = 'ios-safari' | 'android-chrome' | 'line-webview' | 'pc' | 'other';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  // LINE in-app browser — both iOS and Android Line apps inject "Line/x.y.z".
  if (/Line\//i.test(ua)) return 'line-webview';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  if (isIOS) return 'ios-safari';
  if (isAndroid) return 'android-chrome';
  return 'pc';
}

export function InstallToHomeModal({ onClose }: { onClose: () => void }) {
  const [platform, setPlatform] = useState<Platform>('other');
  useEffect(() => { setPlatform(detectPlatform()); }, []);

  return (
    <div className="absolute inset-0 bg-black/60 z-[180] flex items-end sm:items-center justify-center p-0 sm:p-5 backdrop-blur-sm">
      <div className="bg-card rounded-t-3xl sm:rounded-card w-full max-w-[420px] max-h-[85vh] overflow-y-auto shadow-lg">
        <div className="sticky top-0 bg-card flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <div className="text-base font-black">📱 ホーム画面に追加</div>
          <button onClick={onClose} className="text-muted text-xl leading-none px-1" aria-label="閉じる">×</button>
        </div>

        <div className="px-5 pt-3 pb-2 text-[12px] text-sub leading-relaxed">
          ホーム画面に追加すると、アプリのように1タップで開けるようになります(LINE経由で開かなくてOKです)。
        </div>

        {platform === 'line-webview' && (
          <Section
            tone="warn"
            title="LINE内ブラウザでは追加できません"
          >
            <div>下記いずれかの方法で <span className="font-bold">通常のブラウザ</span> で開いてから操作してください:</div>
            <ol className="list-decimal pl-5 mt-2 space-y-1">
              <li>右上「⋯」(3点メニュー)→「ブラウザで開く」/「Safari/Chromeで開く」</li>
              <li>その後 iOS/Android の手順に従ってホーム追加</li>
            </ol>
          </Section>
        )}

        {platform === 'ios-safari' && (
          <Section title="iOS (Safari)">
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>画面下の <span className="inline-block px-1.5 py-0.5 bg-bg rounded border border-border">⬆️ 共有</span> ボタンをタップ</li>
              <li>メニューを下にスクロールして <span className="font-bold">「ホーム画面に追加」</span> を選択</li>
              <li>右上の「追加」をタップ → ホーム画面に⛳ ゴルトモのアイコンができます</li>
            </ol>
          </Section>
        )}

        {platform === 'android-chrome' && (
          <Section title="Android (Chrome)">
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>右上の <span className="inline-block px-1.5 py-0.5 bg-bg rounded border border-border">⋮</span> メニューをタップ</li>
              <li><span className="font-bold">「ホーム画面に追加」</span>(または「アプリをインストール」)を選択</li>
              <li>「追加」をタップ → ホーム画面にショートカットができます</li>
            </ol>
          </Section>
        )}

        {(platform === 'pc' || platform === 'other') && (
          <>
            <Section title="iPhone / iPad (Safari)">
              <ol className="list-decimal pl-5 space-y-1">
                <li>下の「⬆️ 共有」 → 「ホーム画面に追加」 → 「追加」</li>
              </ol>
            </Section>
            <Section title="Android (Chrome)">
              <ol className="list-decimal pl-5 space-y-1">
                <li>右上の「⋮」 → 「ホーム画面に追加」 → 「追加」</li>
              </ol>
            </Section>
            <Section title="PC (Chrome / Edge)">
              <ol className="list-decimal pl-5 space-y-1">
                <li>アドレスバー右側の「インストール」アイコン、または「⋮」→「ゴルトモをインストール」</li>
              </ol>
            </Section>
          </>
        )}

        <Section title="ホーム画面追加で何が変わる?">
          <ul className="list-disc pl-5 space-y-1">
            <li>ホーム画面の⛳ アイコンから1タップで起動</li>
            <li>アドレスバー無しの全画面表示でアプリっぽくなる</li>
            <li>毎回 LINE を経由する必要なし</li>
            <li>ログイン状態は維持される(初回だけ LINE 認証)</li>
          </ul>
        </Section>

        <div className="px-5 py-4">
          <button onClick={onClose} className="w-full py-3 bg-bg border border-border rounded-xl text-sm font-bold">
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, tone, children }: { title: string; tone?: 'warn'; children: React.ReactNode }) {
  const toneCls = tone === 'warn' ? 'bg-yellow-light border-yellow' : 'bg-bg border-border';
  return (
    <div className="px-5 pb-3">
      <div className={`rounded-card p-3.5 border-[1.5px] ${toneCls}`}>
        <div className="text-[12px] font-black mb-1.5">{title}</div>
        <div className="text-[12px] text-text leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
