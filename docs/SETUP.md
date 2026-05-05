# Golf Buddy — セットアップ手順

このアプリは **デモモード** と **本番モード** の2段階で動かせます。
まずデモモードで動作確認してから、LINE/Firebase を本番接続するのが推奨です。

---

## 0. ローカル起動（デモモード）

```bash
npm install
cp .env.local.example .env.local
# デフォルトで NEXT_PUBLIC_DEMO_MODE=true なのでそのまま
npm run dev
# → http://localhost:3000
```

LINE / Firebase の設定なしで全画面が動きます。インメモリのモックデータで募集作成・参加・レビュー・チャットがリアクティブに反映されます。

---

## 1. Vercel へのデプロイ

### 1-1. GitHub リポジトリを Vercel に接続
1. [vercel.com](https://vercel.com) にログイン → **New Project**
2. `wataruf56/golf-buddy-prototype` を **Import**
3. Framework Preset: **Next.js**（自動検出されるはず）
4. Root Directory: そのまま（リポジトリのルート）

### 1-2. 環境変数を設定（最低限デモで動かす場合）
Vercel の Project Settings → **Environment Variables** に以下を追加：

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_DEMO_MODE` | `true` |
| `NEXTAUTH_URL` | `https://<your-project>.vercel.app` |
| `NEXTAUTH_SECRET` | ランダム文字列（`openssl rand -base64 32` 等で生成） |

**Deploy** ボタンを押せば数分で公開されます。

---

## 2. LINE Login を本番接続

### 2-1. LINE Developers Console
1. [LINE Developers](https://developers.line.biz/console/) にログイン
2. **Provider** を作成（既存のものでも可）
3. その Provider 内に **チャネル** を作成
   - Channel type: **LINE Login**
   - App type: **Web app**
4. 作成したチャネルの設定画面で：
   - **Callback URL** に登録：
     - 開発: `http://localhost:3000/api/auth/callback/line`
     - 本番: `https://<your-project>.vercel.app/api/auth/callback/line`
   - **OpenID Connect** を有効化、scope: `profile`, `openid`

### 2-2. 環境変数を設定
ローカル `.env.local` と Vercel の Environment Variables 両方に：

```env
NEXT_PUBLIC_DEMO_MODE=false
LINE_CLIENT_ID=<チャネルID>
LINE_CLIENT_SECRET=<チャネルシークレット>
NEXTAUTH_URL=https://<your-project>.vercel.app
NEXTAUTH_SECRET=<ランダム文字列>
```

`NEXT_PUBLIC_DEMO_MODE=false` に切り替えると、ログイン画面のボタンが「LINEでログイン」になり、実際のLINE OAuthフローが走ります。

---

## 3. Firebase / Firestore を本番接続

### 3-1. Firebase プロジェクト作成
1. [Firebase Console](https://console.firebase.google.com/) で新規プロジェクト作成
2. **Build → Firestore Database** を有効化（**Native mode** を選択）
3. **Project Settings → Service accounts → Generate new private key** で JSON をダウンロード

### 3-2. 環境変数を設定
ダウンロードしたJSONから以下を抽出して環境変数に：

```env
FIREBASE_PROJECT_ID=<project_id>
FIREBASE_CLIENT_EMAIL=<client_email>
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Vercel に貼るときは `FIREBASE_PRIVATE_KEY` の改行を `\n` のまま貼り付けると `lib/firebase.ts` が自動でデコードします。

### 3-3. クライアント側 Firebase（チャットのリアルタイム更新用）
**Project Settings → General → Your apps → Web app を追加** で取得した値を：

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

### 3-4. セキュリティルール
Firestore コンソール → **Rules** タブに `golf-buddy-architecture.md` セクション8のルールを貼り付け。

### 3-5. インデックス
最初の本番クエリでエラーになると、Firestore コンソールにインデックス作成リンクが出るので、そこから1クリックで作成可能。事前作成する場合は `golf-buddy-architecture.md` セクション3「インデックス設計」を参照。

---

## 4. 動作確認チェックリスト

- [ ] `npm run build` がローカルで通る
- [ ] Vercel で Production デプロイが成功
- [ ] `/login` から LINE ログイン（または Demo ログイン）でホームに遷移
- [ ] 募集作成（コース確定 / コース未定 両タイプ）→ ホームに反映
- [ ] 募集詳細から「参加を申請」できる
- [ ] 主催者として「ラウンド完了」→ レビューオーバーレイが起動
- [ ] レビュー未完了で他タブに移動 → ブロッカーポップアップ表示
- [ ] ゴル友 → チャット画面でメッセージ送信
- [ ] PWA としてホーム画面に追加できる

---

## 5. トラブルシュート

| 症状 | 対処 |
|------|------|
| LINE ログイン後 redirect_uri エラー | LINE Developers の Callback URL に Vercel URL が登録されているか確認 |
| `NEXTAUTH_URL` が undefined | Vercel Env で Production / Preview / Development 全環境にセット |
| Firestore permission-denied | セキュリティルールが反映されているか確認、`request.auth` を使うルールは認証済みでないと動かない |
| `FIREBASE_PRIVATE_KEY` が読めない | Vercel に貼るときは値全体をダブルクォートで囲み、改行は `\n` のまま |
