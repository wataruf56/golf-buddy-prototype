# ゴルトモ（Goltomo）

ゴルフ仲間マッチング＋AIスイング解析の LINE LIFF アプリ（Next.js 14 / App Router）。

- 本番（LP・マーケ）: https://goltomo.com
- 本番（アプリ本体・LIFF）: https://app.goltomo.com
- 本番（管理画面）: https://admin.goltomo.com
- ゴルフ性格診断 GOLMOTI: https://goltomo.com/golmoti

---

## 🔑 いちばん大事な前提：GitHub が「正本」

- **このGitHubリポジトリ（`main` ブランチ）が唯一の正本（source of truth）です。**
- 本番環境は「ローカルのPC」からではなく、**GitHub 上のコードからビルドして作られます**。
- ローカルは「編集する作業コピー」。PCが消えても `git clone` でGitHubから完全復元できます（＝GitHubがバックアップ）。
- **push していないローカルの変更は、本番にも履歴にも反映されません。** 変更は必ず commit → push すること。

> ⚠️ 注意：LP/配色のHTMLモック類（`Cowork/ゴルトモ/モック/lp-mockups/…`）は**このリポジトリには含まれていません**（ローカルのみ・Git管理外）。本番に出ている診断ページの実体は、このリポジトリ内の `public/golmoti.html` です。

---

## 🚀 ローカル → GitHub → 本番 の流れ

```
[ローカルで編集]
      │  git add / git commit
      ▼
[git push origin main]  ──►  GitHub: wataruf56/golf-buddy-prototype (main)
      │
      ▼  push を検知して自動起動
[Cloud Build トリガー: goltomo-deploy-main]   ※GCPプロジェクト golf-buddy-d2305 / region asia-northeast1
      │  Docker ビルド（cloudbuild.yaml / Dockerfile, output: standalone）
      ▼
[Cloud Run（asia-northeast1）にデプロイ]  ＋  [Firebase Hosting がドメインをプロキシ]
      │
      ▼
[本番反映]  goltomo.com / app.goltomo.com / admin.goltomo.com
```

### 手順（通常リリース）
1. ローカルで編集する。
2. 型チェック：`npx tsc -p tsconfig.json --noEmit`（エラーが無いこと）
3. （ユーザー向けに表示する版を上げる場合）`lib/appUpdate.ts` の `APP_VERSION` を更新。
4. `git add -A && git commit -m "..."`
5. `git push origin main` → これだけで Cloud Build が自動でビルド＆デプロイする。
6. デプロイ状況の確認：
   ```
   gcloud builds list --region=asia-northeast1 --project=golf-buddy-d2305 --limit=1
   ```
   （`SUCCESS` になれば本番反映完了）

> ❗ `main` への push＝即・本番デプロイです。実験は別ブランチで行うこと。

---

## 🏷 バージョン表示の仕組み

- 画面に出る表示用バージョン：`lib/appUpdate.ts` の `APP_VERSION`（手動更新。例: `4.8`）。
- 「アップデートがあります」バナーの検知：`NEXT_PUBLIC_BUILD_ID`（ビルド時に git の short SHA を埋め込み）と `/api/version` を比較。
  - 検知は SHA ベースなので、`APP_VERSION` を上げなくても push のたびに新バージョンとして検知される。

---

## 🌐 ドメイン / ルーティング

`middleware.ts` が `x-forwarded-host` を見てホスト別に振り分け：

| ホスト | 役割 |
|---|---|
| `goltomo.com` / `www.goltomo.com` | マーケLP（`/lp` を表示）。`/golmoti` は静的診断ページ |
| `app.goltomo.com` | アプリ本体（LIFF）。ログイン保護あり |
| `admin.goltomo.com` | 管理画面（`/admin`） |

- LIFF起動の共有URL：`https://goltomo.com/app`（middlewareが `liff.line.me/{LIFF_ID}` へリダイレクト）。

---

## 🧱 技術スタック / 構成

- Next.js 14（App Router）/ TypeScript / TailwindCSS
- 認証：NextAuth(LINE) ＋ LIFFセッション（Cookie名は必ず `__session`：Firebase Hosting がこの名前のみ Cloud Run へ転送するため）
- DB：Firestore（Admin SDK）。主なコレクション：`users` / `rounds` / `reviews` / `swings` / `_logs` / `_lpQuiz`（診断ログ）ほか
- ホスティング：Cloud Run（asia-northeast1）＋ Firebase Hosting、ビルドは Cloud Build（`cloudbuild.yaml`）
- 静的配信：`public/`（例：診断 `public/golmoti.html`、`/golmoti` は `next.config.js` の rewrite でクリーンURL化）

### ローカル開発コマンド
```
npm install          # 初回のみ
npm run dev          # 開発サーバー
npx tsc -p tsconfig.json --noEmit   # 型チェック
npm run build        # 本番ビルド確認
```

---

## 📍 ローカルの場所

```
C:\Users\da_is\OneDrive\Desktop\Cowork\ゴルトモ\アプリ本体_本番デプロイ中\golf-buddy-prototype
```

関連ドキュメント（このリポジトリ外・ローカルのみ。2026-06 にフォルダ整理済み）：
- 仕様 / 技術：`Cowork\ゴルトモ\01_仕様`（＋ `01_仕様\技術ドキュメント`）
- マーケ・競合：`Cowork\ゴルトモ\02_マーケ・リサーチ`
- LP・配色モック / 構成図 / リッチメニュー：`Cowork\ゴルトモ\03_デザイン・素材`（`LPモック` / `システム構成図` / `LINEリッチメニュー`）
- 戦略・ロードマップ：`Cowork\ゴルトモ\04_戦略・運用\現状サマリとロードマップ草案.md`
- 引き継ぎ書：`Cowork\ゴルトモ\ハンドオフ.md`

---

## 📦 GitHub の現在の状態（最終更新時点）

- リポジトリ：`github.com/wataruf56/golf-buddy-prototype`
- 既定ブランチ：`main`（＝本番デプロイ対象）
- ローカルと `origin/main` は同期済み（差分なし）
- 表示バージョン：`APP_VERSION = 4.8`（`lib/appUpdate.ts`）

最新の同期状態は次で確認できる：
```
git fetch origin && git status        # "up to date" なら同期済み
git log --oneline -5                  # 直近の履歴
```

---

_この README はデプロイ運用の単一の参照元です。フロー（push＝本番デプロイ）や正本（GitHub）の位置づけを変えた場合は、ここも更新すること。_
