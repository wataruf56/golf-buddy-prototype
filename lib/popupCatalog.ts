// ポップアップの一覧（管理画面の集計で使う名前・操作の意味）（2026-10-12）。
// id は lib/popupSlot の usePopupSlot / popupEvent と同じ。新しい自動ポップアップを足したらここにも足す。
//   forced   … 閉じるボタンが無い（何かを選ぶまで消えない）
//   goal     … 「成果」とみなす操作（率の分子）
//   terminal … ポップアップが閉じる操作（「何もしなかった人」の判定に使う）。next・recheck などの途中の操作は入れない
//   lock     … 管理画面（🪟 ポップアップ）で止められない理由。止めると業務が止まるもの（2026-11-01）
//   settings … そのポップアップ専用の設定画面（中身・対象・予約を変えるところ）
// オン・オフは _config/popups（lib/popupSwitch）。止めたものは usePopupSlot が出さない。
export type PopupDef = {
  id: string; name: string; emoji: string; who: string; forced: boolean;
  goal: string[]; terminal: string[]; actions: Record<string, string>;
  lock?: string; settings?: { href: string; label: string };
};

export const POPUP_CATALOG: PopupDef[] = [
  { id: 'completion', name: 'ラウンド完了の確認', emoji: '⚠️', who: '主催者（開催日の夜8時〜）', forced: true,
    goal: ['complete'], terminal: ['complete', 'held_cancel', 'open_round'],
    actions: { complete: '完了にした', held_cancel: '中止にした', open_round: '募集ページへ' }, lock: '止めると、開催日を過ぎた募集が「完了」にならず、レビューも始まらないため' },
  { id: 'holdDue', name: '保留にしていた申請の期日', emoji: '⏰', who: '主催者・共同管理者（保留の期日が来たとき）', forced: true,
    goal: ['approve', 'decline'], terminal: ['approve', 'decline', 'snooze_after_error'],
    actions: { approve: '承認した', decline: '今回は見送った', error: '送信に失敗した', snooze_after_error: '失敗のあと、いったん閉じた' }, lock: '止めると、保留にした申請が期日を過ぎても決まらないまま残るため' },
  { id: 'groups', name: '組み分けの登録', emoji: '⛳', who: 'コンペの主催者（当日・前日）', forced: true,
    goal: ['open_round'], terminal: ['open_round'],
    actions: { open_round: '組み分けを開いた' }, lock: '止めると、コンペ当日の組み分けが登録されないため' },
  { id: 'review', name: 'ラウンド後のレビュー', emoji: '⭐', who: '参加者（完了後）', forced: true,
    goal: ['submit'], terminal: ['submit'],
    actions: { submit: '送信した', tab_blocked: 'タブを押して止められた', open_from_banner: '下の案内から開いた' }, lock: '止めると、レビュー（★・また回りたい）が集まらなくなるため' },
  { id: 'paymentAck', name: '事前入金の確認', emoji: '💴', who: 'あとから入金設定された募集の参加者', forced: true,
    goal: ['yes'], terminal: ['yes', 'cancel_round', 'keep_joined'],
    actions: { yes: 'はい（問題ない）', no: 'いいえ', cancel_round: '参加を取り消した', keep_joined: '取り消さなかった' }, lock: '止めると、あとから事前入金になった参加者が知らないまま当日を迎えるため' },
  { id: 'friendGate', name: 'LINEの友だち追加', emoji: '💚', who: '未追加の人（登録・参加申請・ホーム）', forced: true,
    goal: ['passed'], terminal: ['passed'],
    actions: { add_friend: 'LINEで追加を押した', recheck: '確認ボタンを押した', passed: '追加が確認できた' }, lock: '止めると、LINEの通知が届かない人が増えるため' },
  { id: 'birthday', name: '誕生日の入力のお願い', emoji: '🎂', who: '前からの会員で誕生日が未入力の人（マイページを開いたとき）', forced: false,
    goal: ['save'], terminal: ['save', 'later'],
    actions: { save: '誕生日を登録した', later: 'あとで' } },
  { id: 'chase', name: '追いDMの確認', emoji: '💬', who: '返事をしていない相手から続けて届いた人', forced: false,
    goal: ['change'], terminal: ['keep', 'change'],
    actions: { keep: 'このままにした', change: '気持ちを選び直しに行った' } },
  { id: 'official', name: '運営枠の声かけ', emoji: '📣', who: '運営が立てた枠の対象者', forced: false,
    goal: ['join'], terminal: ['join', 'snooze'],
    actions: { join: '参加した', snooze: 'あとで' }, settings: { href: '/admin/official', label: '運営が立てる枠' } },
  { id: 'guideIntro', name: '「使い方を見てみませんか？」', emoji: '📖', who: '初めて登録した人', forced: false,
    goal: ['go'], terminal: ['go', 'later'],
    actions: { go: '使い方を開いた', later: 'あとで' } },
  { id: 'availPrompt', name: 'ラウンド後の「行ける日を入れてみませんか？」', emoji: '📅', who: 'コンペ参加者（運営がOKを出した回）', forced: false,
    goal: ['go'], terminal: ['go', 'close'],
    actions: { go: '行ける日を入力する', close: '閉じる' } },
  { id: 'roomIntro', name: '行ける日の部屋のあいさつ（選ぶだけ）', emoji: '👋', who: '行ける日の部屋に入って、まだ話していない人', forced: false,
    goal: ['send'], terminal: ['send', 'skip'],
    actions: { send: 'あいさつを送った', skip: 'あいさつしないで入った' }, lock: 'あいさつをしないと部屋で話せない仕組みのため（止めると部屋に書き込めなくなる）' },
  { id: 'availMonthly', name: '毎月の「行ける日を入れませんか？」', emoji: '📅', who: '月末2日前〜月末・翌月と翌々月が未入力の人', forced: false,
    goal: ['go'], terminal: ['go', 'close'],
    actions: { go: '行ける日を入力する', close: '閉じる' } },
  { id: 'availIntro', name: '行ける日の使い方', emoji: '📖', who: 'はじめて行ける日を開いた人', forced: false,
    goal: ['go_calendar', 'go_station'], terminal: ['go_calendar', 'go_station', 'close'],
    actions: { next: '次へ', go_calendar: 'カレンダーへ', go_station: '最寄り駅を入れに行った', close: '閉じる' } },
  { id: 'swingIntro', name: 'スイング解析の使い方', emoji: '🏌️', who: 'はじめてスイングを開いた人', forced: false,
    goal: ['done'], terminal: ['done', 'skip'],
    actions: { done: '最後まで見た', skip: 'スキップ' } },
  { id: 'hostNudge', name: '「次は募集してみない？」', emoji: '✏️', who: '参加経験あり・主催経験なし', forced: false,
    goal: ['create'], terminal: ['create', 'close'],
    actions: { create: '募集をつくる', close: 'あとで／✕' } },
  { id: 'promo', name: '募集のイチオシ', emoji: '🔥', who: '運営が選んだ募集の対象者（1人1回）', forced: false,
    goal: ['go'], terminal: ['go', 'close'],
    actions: { go: 'ぜひ参加してみる', close: '今回は見送る' }, settings: { href: '/admin/promo', label: '募集のイチオシ（予約・停止）' } },
];

export const popupDef = (id: string) => POPUP_CATALOG.find((p) => p.id === id);
