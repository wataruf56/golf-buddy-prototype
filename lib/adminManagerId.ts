// クライアント/サーバー両用の「管理人」定数（server-only な db を読み込まない軽量モジュール）。
export const ADMIN_MANAGER_ID = 'admin_manager';
export const ADMIN_MANAGER_NAME = '管理人';
export const ADMIN_MANAGER_AVATAR = '🛡️';

// システム発言（入室のお知らせなど）の送り主。実在のユーザーではない。
// チャット画面は、この送り主のときだけ吹き出しではなく中央の1行で描く。
export const SYSTEM_SENDER_ID = 'system';
