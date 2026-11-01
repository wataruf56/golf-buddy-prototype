// 管理画面のメニュー（2026-11-01 整理し直し・本人要望）。
// 管理トップ（app/admin/page.tsx）と、各画面の右下の「☰ メニュー」（components/admin/AdminMenu）の両方がこれを読む。
// 画面を足したら、ここに1行足すだけで両方に出る。
//
// 分け方は「何をしに来たか」で6つ：
//   📊 数字を見る / 🪟 ポップアップ・通知 / 👥 会員・やりとり / 🏆 募集・行ける日 / 🛡️ 信頼・トラブル / ⚙️ システム
// 以前は3つ（レポート・運用・設定）に23項目を詰めていて、ポップアップは計測ハブ・イチオシ・運営枠に散らばっていた。
export type AdminMenuItem = { path: string; emoji: string; title: string; desc: string; isNew?: boolean };
export type AdminMenuGroup = { key: string; emoji: string; name: string; lead: string; items: AdminMenuItem[] };

export const ADMIN_MENU: AdminMenuGroup[] = [
  {
    key: 'report', emoji: '📊', name: '数字を見る', lead: '使われ方・流入・LINEの通数・操作の記録',
    items: [
      { path: '/admin/insights', emoji: '📊', title: '計測ハブ', desc: '全体の数字 / イチオシの効果 / ほかの計測への入口' },
      { path: '/admin/activity', emoji: '📈', title: '利用状況', desc: 'よく開かれる画面 / アクティブ会員 / 1人ずつの操作の記録 / 登録の推移' },
      { path: '/admin/lp-funnel', emoji: '🧭', title: 'LP・診断の流入', desc: '入口別のファネル・離脱ポイント・LINE到達 / 診断の中身' },
      { path: '/admin/ab', emoji: '🆚', title: '広告A/Bテスト', desc: '画像違いの広告を比べる / Ads Managerの数字を入れる' },
      { path: '/admin/line-stats', emoji: '📨', title: 'LINE配信の通数', desc: '種別ごとの送信数・月別の推移（有料枠の把握）' },
      { path: '/admin/timeline-stats', emoji: '📰', title: 'タイムラインの閲覧', desc: '見られた回数・見た人数・見ていた時間 / 今日の写真' },
      { path: '/admin/audit', emoji: '📒', title: '操作ログ', desc: '誰が・誰に・何をしたか（自動の通知・設定の変更も含む）' },
    ],
  },
  {
    key: 'notify', emoji: '🪟', name: 'ポップアップ・通知', lead: '会員に「出す・送る」ものを止める・変える・効果を見る',
    items: [
      { path: '/admin/popups', emoji: '🪟', title: 'ポップアップ', desc: '全ポップアップの一覧とオン・オフ / 押されたものの統計 / 記録をさがす', isNew: true },
      { path: '/admin/promo', emoji: '🔥', title: '募集のイチオシ', desc: '選んだ募集をポップアップで1人1回すすめる（予約・停止・効果）' },
      { path: '/admin/notification-templates', emoji: '✉️', title: '通知の文面', desc: 'アプリ内 / LINE / スマホ通知の文面をすべて編集' },
      { path: '/admin/reminders', emoji: '⏰', title: '開催前リマインド', desc: '参加ラウンドの何日前に知らせるか（夜8時に送信）' },
      { path: '/admin/rematch', emoji: '🔁', title: '再会通知', desc: '再会通知のタイミング・今すぐ実行（テスト）・5段ファネル' },
    ],
  },
  {
    key: 'people', emoji: '👥', name: '会員・やりとり', lead: '会員を調べる・DMを見る・管理人として話す',
    items: [
      { path: '/admin/users', emoji: '👥', title: '会員一覧', desc: 'LINE登録ユーザーの一覧 / Swing許可リスト' },
      { path: '/admin/dm', emoji: '💬', title: 'DMログ・未読', desc: '誰↔誰の本文 / 未読ユーザー・未読通知の設定' },
      { path: '/admin/support', emoji: '🛡️', title: '管理人としてDM', desc: '「管理人」名義でユーザーとやりとり（サポート窓口）' },
      { path: '/admin/requests', emoji: '💡', title: '改修要望', desc: '会員から届いた「こんな機能がほしい」。返信・状態・ピン留め' },
      { path: '/admin/hobby-tags', emoji: '🎯', title: '趣味タグ', desc: 'ユーザーが足した趣味タグの確認・削除' },
    ],
  },
  {
    key: 'rounds', emoji: '🏆', name: '募集・行ける日', lead: '募集と行ける日の様子を見る・運営が枠を立てる',
    items: [
      { path: '/admin/rounds', emoji: '🏆', title: '募集の一覧', desc: '全募集の一覧・削除 / タイトル定型文の編集' },
      { path: '/admin/availability', emoji: '📅', title: '行ける日', desc: '日付ごとに誰が行けるか（名前・車・最寄り駅つき）' },
      { path: '/admin/official', emoji: '📣', title: '運営が立てる枠', desc: '代理募集を立てる / ホームの声かけ / レポート' },
    ],
  },
  {
    key: 'trust', emoji: '🛡️', name: '信頼・トラブル', lead: '評価・通報・ドタキャン・レビューの対応',
    items: [
      { path: '/admin/ratings', emoji: '⭐', title: '評価の状況', desc: '★・また回りたいの状況（全員）' },
      { path: '/admin/reports', emoji: '🚨', title: '通報', desc: '届いた通報の確認と対応' },
      { path: '/admin/manner', emoji: '🙅', title: 'ドタキャン・マナー', desc: 'ドタキャン申告・マナーの記録' },
      { path: '/admin/reviews', emoji: '📝', title: 'レビュー', desc: '届いたレビューの中身' },
      { path: '/admin/unreviewed', emoji: '⏰', title: '未レビュー', desc: 'レビューが残っている人への催促' },
      { path: '/admin/friend-requests', emoji: '🤝', title: '友達のつながり', desc: 'QR・友達申請の記録' },
    ],
  },
  {
    key: 'system', emoji: '⚙️', name: 'システム', lead: 'テスト垢・段階公開・解析とシステムの状態',
    items: [
      { path: '/admin/test-accounts', emoji: '🧪', title: 'テスト垢・段階公開', desc: '検証用アカウントの登録 / 一般から隠す / 新機能を一部にだけ出す' },
      { path: '/admin/swing', emoji: '🏌️', title: 'スイング解析の状態', desc: '解析の履歴・状態確認・止まった解析の復旧' },
      { path: '/admin/system', emoji: '🔧', title: 'システム状態', desc: '環境変数 / GCS / LINE Bot の接続確認' },
    ],
  },
];

/** 画面名・説明・グループ名で絞る（管理トップと☰メニューの「画面をさがす」） */
export function filterAdminMenu(q: string): AdminMenuGroup[] {
  const k = q.trim().toLowerCase();
  if (!k) return ADMIN_MENU;
  return ADMIN_MENU
    .map((g) => ({ ...g, items: g.items.filter((it) => `${g.name} ${it.title} ${it.desc}`.toLowerCase().includes(k)) }))
    .filter((g) => g.items.length > 0);
}
