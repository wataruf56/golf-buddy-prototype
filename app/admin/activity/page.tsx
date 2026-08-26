'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { appProfileUrl } from '@/lib/adminLinks';

type Report = {
  generatedAt: number;
  // 上部KPI（事業のボトルネックが見える4つ）
  kpi?: { monthPlayers: number; monthRounds: number; monthHosts: number; fillRate: number; active30d: number };
  summary: { active24h: number; active7d: number; totalUsersSeen: number; totalSwingUsers: number; totalSwings: number; logsScanned: number };
  activeUsers: { userId: string; name: string; count: number; lastTs: number; lastPage: string; lastPageNorm?: string; lastActionTs: number; lastActionEvent: string; lastActionPage: string; lastToName?: string; lastRoundTitle?: string; lastRematchWith?: string }[];
  popularPages?: { page: string; views: number; users: number; lastTs: number }[];
  acquisition?: {
    total: number; tagged: number;
    bySource: { source: string; count: number }[];
    // チャネル（Instagram等）でまとめたもの。投稿別タグは tags に入る。
    byChannel?: { channel: string; count: number; tags: { source: string; count: number }[] }[];
  };
  menuEntries?: { menu: string; count: number }[];
  recentActions: { userId: string; name: string; event: string; page: string; pageNorm?: string; ts: number; to?: string; toName?: string; roundTitle?: string; rematchWith?: string }[];
  swingUsers: { userId: string; name: string; total: number; done: number; lastAt: number }[];
  recentSwings: { userId: string; name: string; mode: string; status: string; createdAt: number }[];
};

const MODE_LABEL: Record<string, string> = {
  self: '自分解析', compare: 'プロ比較', past: '過去比較', range_vs_round: '練習場vs本番', question: '質問',
};

// 画面パス → 分かりやすい日本語名（人気の画面の表示用）。
const PAGE_LABEL: Record<string, string> = {
  '/home': '🏠 ホーム',
  '/search': '🔍 さがす',
  '/create': '➕ ラウンド募集の作成',
  '/swing': '🏌️ スイング解析',
  '/swing/new': '🏌️ スイング解析（新規）',
  '/swing/[id]': '🏌️ スイング解析（結果）',
  '/buddies': '👥 ゴル友',
  '/mypage': '👤 マイページ',
  '/mypage/edit': '✏️ プロフィール編集',
  '/guide': '📖 使い方',
  '/round/[id]': '⛳ ラウンド詳細',
  '/round/[id]/chat': '💬 ラウンドチャット',
  '/round/[id]/edit': '✏️ ラウンド編集',
  '/profile/[id]': '👤 他の人のプロフィール',
  '/chat/[id]': '💬 DM（チャット）',
  '/poll/[id]': '📅 日程調整',
  '/rematch/[id]': '🔁 再会エンジン',
  '/qr': '🤝 QRコード',
  '/liff': '🔑 ログイン',
};
const pageLabel = (p: string) => PAGE_LABEL[p] || p;

// 流入経路ソースの日本語ラベル（?ref= の値 → 表示名）。未知の値はそのまま表示。
const SOURCE_LABEL: Record<string, string> = {
  instagram: '📷 Instagram',
  ig: '📷 Instagram',
  x: '𝕏 X (Twitter)',
  twitter: '𝕏 X (Twitter)',
  tiktok: '🎵 TikTok',
  youtube: '▶️ YouTube',
  line: '💬 LINE',
  flyer: '📄 チラシ・QR',
  friend: '🤝 友達紹介',
  google: '🔍 Google',
  web: '🌐 Web',
  unknown: '❓ 不明（直接・LINE検索など）',
};
const sourceLabel = (s: string) => SOURCE_LABEL[s] || `🔗 ${s}`;

// 生タグの中でよく使う接尾辞を日本語に（ig_story → ストーリーズ）。
// 内訳行はチャネル名が親に出ているので、ここでは「どの投稿か」だけを見せる。
const TAG_SUFFIX_LABEL: Record<string, string> = {
  story: 'ストーリーズ', stories: 'ストーリーズ',
  bio: 'プロフィールのリンク', profile: 'プロフィールのリンク', link: 'プロフィールのリンク',
  post: '通常投稿', feed: '通常投稿', reel: 'リール', reels: 'リール',
  bosyu: 'ラウンド募集の投稿', dm: 'DM', ad: '広告', highlight: 'ハイライト',
};
const tagDetailLabel = (src: string) => {
  const i = src.indexOf('_');
  if (i < 0) return '（タグ指定なし）';
  const suffix = src.slice(i + 1);
  return TAG_SUFFIX_LABEL[suffix] || suffix;
};

// 英語のイベント名 → 日本語の分かりやすい説明
const EVENT_LABEL: Record<string, string> = {
  app_open: 'アプリを開いた',
  hydrate_success: 'アプリ起動（読込成功）',
  hydrate_error: 'アプリ起動エラー',
  mypage_render: 'マイページを表示',
  profile_edit_initialized: 'プロフィール編集を開いた',
  profile_save_click: '［ボタン］プロフィール保存',
  profile_save_success: 'プロフィール保存 完了',
  profile_save_error: 'プロフィール保存 エラー',
  profile_save_blocked_uninitialized: 'プロフィール保存（読込中で不可）',
  profile_save_navigate_attempt: 'プロフィール保存後の遷移（試行）',
  profile_save_navigate_called: 'プロフィール保存後の遷移',
  photo_pick: '写真を選択',
  photo_pick_invalid_type: '写真選択（非対応形式）',
  photo_resize_success: '写真の取り込み 成功',
  photo_resize_error: '写真の取り込み 失敗',
  round_create_click: '［ボタン］募集を作成',
  round_create_success: '募集を作成 完了',
  round_create_error: '募集作成 エラー',
  round_scores_save: 'スコアを保存',
  join_round_click: '［ボタン］ラウンド参加',
  join_round_success: 'ラウンド参加申請 完了',
  join_round_error: 'ラウンド参加 エラー',
  join_round_profile_gate: 'ラウンド参加（プロフィール未登録）',
  review_submit_click: '［ボタン］レビュー送信',
  review_submit_success: 'レビュー投稿 完了',
  review_submit_error: 'レビュー エラー',
  share_round_click: '［ボタン］募集をシェア',
  share_round_clipboard_ok: 'シェア（リンクをコピー）',
  share_round_native_ok: 'シェア（共有メニュー）',
  share_round_text: '募集をテキストでシェア',
  accept_invite_success: '招待を承認して参加',
  friend_add_ok: 'QRで友達追加',
  qr_scan_ok: 'QRコードを読み取り',
  qr_scan_error: 'QR読み取りエラー',
  review_bulk_submit: 'レビューをまとめて送信',
  poll_create: '日程調整を作成',
  poll_add_options: '日程調整に候補日を追加',
  poll_answer: '日程調整に回答',
  poll_decide_create: '日程調整から募集を作成',
  poll_share: '日程調整をシェア',
  dm_open: '💬 DMを開いた',
  dm_send: '💬 DMを送信',
  round_chat_send: '💬 ラウンドチャット送信',
  interest_toggle: '❤️ 気になるを操作',
  match_select: '💘 マッチ選択（また回りたい/気になる）',
  invite_send: '💌 招待した',
  approve_applicant: '✅ 参加を承認',
  block_user: '🚫 ブロック',
  report_user: '🚩 通報した',
};
function eventJa(ev: string): string {
  if (EVENT_LABEL[ev]) return EVENT_LABEL[ev];
  // フォールバック：末尾の語から推測
  if (/click$/.test(ev)) return '［ボタン］' + ev.replace(/_click$/, '');
  if (/success$/.test(ev)) return ev.replace(/_success$/, '') + ' 完了';
  if (/error$/.test(ev)) return ev.replace(/_error$/, '') + ' エラー';
  return ev;
}

// 画面パス（正規化済み）→ 日本語ラベル。①で「いま何の画面を見ているか」を表示する用。
const SCREEN_LABEL: Record<string, string> = {
  '/home': '🏠 ホーム',
  '/search': '🔍 さがす',
  '/create': '✏️ 募集する',
  '/swing': '📊 スイング',
  '/buddies': '🤝 ゴル友',
  '/mypage': '👤 マイページ',
  '/mypage/edit': '👤 プロフィール編集',
  '/qr': '📱 QRコード',
  '/rounds/upcoming': '📅 参加予定',
  '/rounds/past': '🏁 過去ラウンド',
  '/chat/[id]': '💬 DM画面',
  '/round/[id]': '⛳ ラウンド詳細',
  '/round/[id]/chat': '💬 ラウンドチャット',
  '/round/[id]/edit': '✏️ ラウンド編集',
  '/profile/[id]': '👤 他の人のプロフィール',
  '/poll/[id]': '📅 日程調整',
  '/rematch/[id]': '💘 再会',
  '/swing/[id]': '📊 スイング詳細',
  '/guide': '📖 ガイド',
};
function screenJa(pageNorm?: string): string {
  if (!pageNorm) return '👀 閲覧中';
  return SCREEN_LABEL[pageNorm] || `👀 ${pageNorm}`;
}

function ago(ts: number): string {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}秒前`;
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  return `${Math.floor(s / 86400)}日前`;
}
function jst(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AdminActivityPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [data, setData] = useState<Report | null>(null);
  // ①でどのユーザーの操作ログを開いているか（②を①に内包したため）
  const [openUser, setOpenUser] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = tokenFromUrl || localStorage.getItem('gb_admin_token') || '';
    if (tokenFromUrl) localStorage.setItem('gb_admin_token', tokenFromUrl);
    setToken(t);
  }, [tokenFromUrl]);

  async function load() {
    if (!token) return;
    setBusy(true); setErr('');
    try {
      let useToken = token;
      let r = await fetch(`/api/admin/activity?token=${encodeURIComponent(useToken)}`, { cache: 'no-store' });
      if (r.status === 403) {
        try {
          const ir = await fetch('/api/admin/init', { cache: 'no-store' });
          const ij = ir.ok ? await ir.json() : null;
          const fresh = ij?.token || '';
          if (fresh && fresh !== useToken) {
            useToken = fresh; localStorage.setItem('gb_admin_token', fresh); setToken(fresh);
            r = await fetch(`/api/admin/activity?token=${encodeURIComponent(fresh)}`, { cache: 'no-store' });
          }
        } catch {}
      }
      if (!r.ok) throw new Error(`${r.status}`);
      setData(await r.json());
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (token) load(); }, [token]);


  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <Link href={`/admin?token=${token}`} className="text-blue text-sm font-bold">← 管理</Link>
        <div className="flex-1 text-center text-base font-black">📊 利用レポート</div>
        <button onClick={load} className="text-blue text-sm font-bold">🔄</button>
      </div>

      {err && <div className="bg-red-50 text-red-700 p-3 rounded mb-3 text-sm">エラー: {err}</div>}
      {busy && !data && <div className="text-center text-xs text-muted py-6">読み込み中...</div>}

      {data && (
        <>
          {/* 登録＝LINE公式アカウントの友だち追加、として見る。
              LINE Insight は前日23:59時点の集計なので「◯/◯時点」を明示する。 */}
          <Followers token={token} />

          {/* Summary＝事業のボトルネックが見える4つ。
              ラウンドが実際に行われた人数（価値が届いた量）→ 供給（募集と主催者）→
              立てれば埋まるか（満員率）→ 生きているユーザー数、の順で並べる。 */}
          <div className="grid grid-cols-2 gap-2 mb-1">
            <Kpi label="今月ラウンドした人" value={`${data.kpi?.monthPlayers ?? 0}人`} accent="text-green" />
            <Kpi label="今月の募集 / 主催者" value={`${data.kpi?.monthRounds ?? 0}件 / ${data.kpi?.monthHosts ?? 0}人`} accent="text-orange" />
            <Kpi label="募集の満員率" value={`${data.kpi?.fillRate ?? 0}%`} accent="text-blue" />
            <Kpi label="30日以内に利用" value={`${data.kpi?.active30d ?? 0}人`} />
          </div>
          <div className="text-[10px] text-muted leading-relaxed mb-2 px-1">
            主催者の人数がボトルネック。満員率が高いのに募集が少なければ「立ててもらう」施策が効きます。
          </div>
          <div className="text-[10px] text-muted text-center mb-3">
            {jst(data.generatedAt)} 時点 ・ 直近24時間 {data.summary.active24h}人 / 7日 {data.summary.active7d}人 ・ ログ{data.summary.logsScanned}件を集計
          </div>

          {/* ★ 人気の画面（直近7日でよく開かれている画面） */}
          <Section title="🔥 よく開かれている画面" sub="直近7日・開いた回数の多い順" count={(data.popularPages || []).length}>
            {(!data.popularPages || data.popularPages.length === 0) ? (
              <div className="text-center text-[11px] text-muted py-4 leading-relaxed">
                まだ十分なデータがありません。<br />画面の閲覧記録がたまると、ここに「よく見られている画面」が並びます。
              </div>
            ) : (() => {
              const max = Math.max(...data.popularPages.map((p) => p.views)) || 1;
              return data.popularPages.map((p, i) => (
                <div key={p.page} className="py-2 border-b border-border last:border-0">
                  <div className="flex items-baseline justify-between mb-1 gap-2">
                    <span className="text-[13px] font-bold truncate">{i + 1}. {pageLabel(p.page)}</span>
                    <span className="text-[12px] font-black text-green flex-shrink-0">{p.views}回<span className="text-[10px] text-muted font-normal ml-1">/ {p.users}人</span></span>
                  </div>
                  <div className="h-2 bg-bg rounded overflow-hidden">
                    <div className="h-full bg-green rounded" style={{ width: `${Math.round((p.views / max) * 100)}%` }} />
                  </div>
                </div>
              ));
            })()}
          </Section>

          {/* 登録推移・時間帯別・カレンダーの詳細へ */}
          <Link href={`/admin/analytics?token=${token}`} className="flex items-center gap-3 p-3.5 bg-card rounded-xl shadow-card mb-3">
            <span className="text-xl">📅</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold">登録者数の推移・時間帯別・カレンダー</div>
              <div className="text-[10px] text-sub mt-0.5">日付×時間帯のアクセス詳細はこちら</div>
            </div>
            <span className="text-muted">›</span>
          </Link>

          {/* 流入経路（登録ユーザーの経路内訳） */}
          <Section title="📥 流入経路（登録の経路）" sub={data.acquisition ? `登録${data.acquisition.total}人・経路タグあり${data.acquisition.tagged}人` : ''} count={(data.acquisition?.bySource || []).length}>
            {(!data.acquisition || data.acquisition.bySource.length === 0) ? (
              <div className="text-center text-[11px] text-muted py-4 leading-relaxed">
                まだデータがありません。<br />各SNSに <b>?ref=instagram</b> のようなタグ付きリンクを貼ると、ここに経路別の登録数が並びます。
              </div>
            ) : (() => {
              // チャネル単位（Instagram等）で束ねて表示し、投稿ごとのタグは内訳として下にぶら下げる。
              // 旧APIのレスポンス（byChannel 無し）でも壊れないよう bySource から作り直す。
              const channels = (data.acquisition.byChannel && data.acquisition.byChannel.length > 0)
                ? data.acquisition.byChannel
                : data.acquisition.bySource.map((s) => ({ channel: s.source, count: s.count, tags: [s] }));
              const total = data.acquisition.total || 1;
              const max = Math.max(...channels.map((c) => c.count)) || 1;
              return channels.map((c) => (
                <div key={c.channel} className="py-2.5 border-b border-border last:border-0">
                  <div className="flex items-baseline justify-between mb-1 gap-2">
                    <span className="text-[13px] font-bold truncate">{sourceLabel(c.channel)}</span>
                    <span className="text-[12px] font-black text-green flex-shrink-0">
                      {c.count}人
                      <span className="text-[10px] font-bold text-sub ml-1">
                        {Math.round((c.count / total) * 100)}%
                      </span>
                    </span>
                  </div>
                  <div className="h-2 bg-bg rounded overflow-hidden">
                    <div className="h-full bg-blue rounded" style={{ width: `${Math.round((c.count / max) * 100)}%` }} />
                  </div>
                  {/* 投稿別タグの内訳（ig_story / ig_bosyu 等）。1種類しかない場合は出さない。 */}
                  {c.tags.length > 1 && (
                    <div className="mt-1.5 pl-2 border-l-2 border-hair">
                      {c.tags.map((t) => (
                        <div key={t.source} className="flex items-baseline justify-between gap-2 py-0.5">
                          <span className="text-[11px] text-sub truncate">
                            {tagDetailLabel(t.source)}
                            <span className="text-[10px] text-muted ml-1">{t.source}</span>
                          </span>
                          <span className="text-[11px] font-bold flex-shrink-0">{t.count}人</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ));
            })()}
            <div className="text-[10px] text-muted mt-2 leading-relaxed">
              ※ 各リンクの末尾に <b>?ref=◯◯</b> を付けて配ると自動で集計されます（例: <b>?ref=instagram</b>）。<br />
              ※ 投稿ごとに <b>ig_story</b> / <b>ig_bosyu</b> のように分けると、Instagram全体の人数はまとめたまま、どの投稿が効いたかも見られます。<br />
              ※ 記録されるのは<b>新規登録した人だけ</b>で、既存ユーザーの経路は上書きされません。
            </div>
          </Section>

          {/* リッチメニューからの入口 */}
          <Section title="🔀 リッチメニューからの入口" sub="どのボタンからサービスに入ったか" count={(data.menuEntries || []).length}>
            {(!data.menuEntries || data.menuEntries.length === 0) ? (
              <div className="text-center text-[11px] text-muted py-4 leading-relaxed">
                まだデータがありません。<br />リッチメニュー各ボタンのリンクを <b>?e=home</b> のようにタグ付けすると、ここに「どのボタンから入ったか」が並びます。
              </div>
            ) : (() => {
              const max = Math.max(...data.menuEntries.map((m) => m.count)) || 1;
              return data.menuEntries.map((m) => (
                <div key={m.menu} className="py-2 border-b border-border last:border-0">
                  <div className="flex items-baseline justify-between mb-1 gap-2">
                    <span className="text-[13px] font-bold truncate">🔘 {m.menu}</span>
                    <span className="text-[12px] font-black text-green flex-shrink-0">{m.count}回</span>
                  </div>
                  <div className="h-2 bg-bg rounded overflow-hidden"><div className="h-full bg-orange rounded" style={{ width: `${Math.round((m.count / max) * 100)}%` }} /></div>
                </div>
              ));
            })()}
            <div className="text-[10px] text-muted mt-2 leading-relaxed">
              ※ リッチメニューの各ボタンのURLを <b>https://goltomo.com/app?to=/swing&amp;e=swing</b> のように <b>?e=◯◯</b> を付けて設定すると集計されます（<b>to</b>=開く画面 / <b>e</b>=ボタン名）。今日以降の入室から記録。
            </div>
          </Section>

          {/* 1. Active users（直近の操作ログを内包。名前をタップでその人のログが開く） */}
          <Section title="① いま使っているユーザー" sub="最新の活動が新しい順。名前をタップするとその人の操作ログが開きます" count={data.activeUsers.length}>
            {data.activeUsers.length === 0 ? <Empty /> : data.activeUsers.map((u) => {
              // 「最新の状態」を表示する。直近イベントが操作なら操作ラベル、閲覧なら画面ラベル。
              // lastTs は page_view を含む真の最新。lastActionTs は“操作”の最新（lastActionTs ≤ lastTs）。
              // 直近が操作（lastActionTs が lastTs と同じ）→ 操作を出す。そうでなければ今見ている画面を出す。
              const whenTs = u.lastTs || u.lastActionTs;
              const showAction = !!u.lastActionEvent && u.lastActionTs >= u.lastTs;
              const what = showAction ? eventJa(u.lastActionEvent) : screenJa(u.lastPageNorm);
              const open = openUser === u.userId;
              const mine = open ? data.recentActions.filter((a) => a.userId === u.userId) : [];
              return (
              <div key={u.userId} className="border-b border-border last:border-0">
                <button
                  onClick={() => setOpenUser(open ? '' : u.userId)}
                  className="w-full flex items-start justify-between gap-2 py-2 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold break-words">
                      <span className="text-muted mr-1">{open ? '▾' : '▸'}</span>{u.name}
                    </div>
                    <div className="text-[10px] text-muted break-words leading-snug">
                      {what}{u.lastToName && <span className="text-green font-bold"> → {u.lastToName}</span>}
                      {!u.lastToName && u.lastRoundTitle && <span className="text-blue font-bold"> → {u.lastRoundTitle}</span>}
                      {!u.lastToName && !u.lastRoundTitle && u.lastRematchWith && (
                        <span className="text-pink-600 font-bold"> → {u.lastRematchWith}さんとの再会</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <div className="text-[11px] font-bold text-green">{ago(whenTs)}</div>
                    <div className="text-[9px] text-muted">{u.count}件</div>
                  </div>
                </button>
                {open && (
                  <div className="pl-3 pb-2.5 border-l-2 border-green/40 ml-1 mb-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-[10px] font-bold text-sub">🧾 この人の操作ログ（{mine.length}件）</div>
                      <a href={appProfileUrl(u.userId)} target="_blank" rel="noreferrer" className="text-[10px] text-blue font-bold ml-auto">プロフィール ›</a>
                    </div>
                    {mine.length === 0 ? (
                      <div className="text-[10px] text-muted py-2">この期間の操作ログはありません。</div>
                    ) : mine.map((a, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 py-1 border-b border-border last:border-0">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11.5px] leading-snug break-words">
                            {a.event === 'page_view' ? `📱 ${pageLabel(a.pageNorm || a.page)}を開いた` : eventJa(a.event)}
                            {a.toName && <span className="text-green font-bold"> → {a.toName}</span>}
                            {!a.toName && a.roundTitle && <span className="text-blue font-bold"> → {a.roundTitle}</span>}
                            {/* 再会エンジンはURLにペアIDが入るだけなので、相手の名前に置き換える */}
                            {!a.toName && !a.roundTitle && a.rematchWith && (
                              <span className="text-pink-600 font-bold"> → {a.rematchWith}さんとの再会</span>
                            )}
                          </div>
                          {!a.toName && !a.roundTitle && !a.rematchWith && (
                            <div className="text-[9px] text-muted break-all">{a.page}</div>
                          )}
                        </div>
                        <div className="text-[10px] text-muted flex-shrink-0 whitespace-nowrap">{ago(a.ts)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
            })}
          </Section>

          {/* 2. Recent swing analyses */}
          <Section title="② 直近のスイング解析" sub="誰が利用したか" count={data.recentSwings.length}>
            {data.recentSwings.length === 0 ? <Empty /> : data.recentSwings.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold truncate">{s.name}</div>
                  <div className="text-[9px] text-muted">{MODE_LABEL[s.mode] || s.mode} ・ {s.status}</div>
                </div>
                <div className="text-[10px] text-muted flex-shrink-0 ml-2">{ago(s.createdAt)}</div>
              </div>
            ))}
          </Section>
        </>
      )}
      <div className="h-8" />
    </div>
  );
}

// LINE公式アカウントの友だち数（＝登録者数とみなす）。/api/admin/line-followers から取得。
type Fw = {
  followers: number | null; blocks: number | null; targetedReaches: number | null; asOf: string;
  gainedInRange: number | null; rangeFrom: string; appUsers: number; notOpenedApp: number | null;
  followed?: number; notFollowed?: number; unknownFollow?: number;
  pushOk?: number; pushFail?: number; pushFailList?: { id: string; name: string; status: number; at: number }[];
  gapNotFollowing?: number | null; followUnknownAll?: boolean;
  series: { date: string; followers: number | null; delta: number | null }[];
  note?: string; error?: string;
};
function Followers({ token }: { token: string }) {
  // 誰が友だち追加していないかの一括判定。ここで完結させる（親のstateには持たせない）。
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState('');
  const [notFollowedList, setNotFollowedList] = useState<{ id: string; name: string }[]>([]);

  async function checkFollowers() {
    if (checking || !token) return;
    setChecking(true); setCheckMsg('');
    try {
      const r = await fetch(`/api/admin/check-followers?token=${encodeURIComponent(token)}`, { method: 'POST', cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `${r.status}`);
      setNotFollowedList(j.notFollowedList || []);
      setCheckMsg(`✅ ${j.checked}人を確認：友だち ${j.followed}人 / 未追加 ${j.notFollowed}人` + (j.errored ? ` / 判定できず ${j.errored}人` : ''));
    } catch (e) { setCheckMsg('失敗: ' + (e as Error).message); }
    finally { setChecking(false); }
  }

  // 前回の判定結果があれば最初から見せる
  useEffect(() => {
    if (!token) return;
    fetch(`/api/admin/check-followers?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || !j.checkedAt) return;
        if (Array.isArray(j.notFollowedList)) setNotFollowedList(j.notFollowedList);
        setCheckMsg(`前回の判定：友だち ${j.followed}人 / 未追加 ${j.notFollowed}人（${new Date(j.checkedAt).toLocaleString('ja-JP')}）`);
      })
      .catch(() => {});
  }, [token]);

  const [f, setF] = useState<Fw | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!token) return;
    fetch(`/api/admin/line-followers?token=${encodeURIComponent(token)}&days=30`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (j?.error) setErr(j.error); else setF(j); })
      .catch((e) => setErr(String(e)));
  }, [token]);

  const md = (d: string) => (d && d.length === 8 ? `${Number(d.slice(4, 6))}/${Number(d.slice(6, 8))}` : '');
  const recent = (f?.series || []).slice(-14).reverse();

  return (
    <div className="bg-card rounded-xl shadow-card p-3.5 mb-3">
      <div className="text-[13px] font-black mb-0.5">💚 LINE公式アカウントの友だち（＝登録者）</div>
      <div className="text-[10px] text-muted mb-2.5">
        友だち追加＝サービス登録として数えています。LINEの集計は前日23:59時点です。
      </div>
      {err ? (
        <div className="text-[11px] text-red-600">取得できませんでした（{err}）</div>
      ) : !f ? (
        <div className="text-[11px] text-muted py-2">読み込み中...</div>
      ) : f.followers == null ? (
        <div className="text-[11px] text-muted py-2 leading-relaxed">
          LINEからまだ数値が返っていません{f.note ? `（${f.note}）` : ''}。友だちが少ない期間は集計が出ないことがあります。
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="bg-bg rounded-lg p-2.5">
              <div className="text-[10px] text-muted font-bold">友だち（登録者）</div>
              <div className="text-[22px] font-black text-green leading-tight">{f.followers}<span className="text-[11px]">人</span></div>
              <div className="text-[9px] text-muted">{md(f.asOf)} 時点</div>
            </div>
            <div className="bg-bg rounded-lg p-2.5">
              <div className="text-[10px] text-muted font-bold">この30日で増えた</div>
              <div className={'text-[22px] font-black leading-tight ' + ((f.gainedInRange ?? 0) > 0 ? 'text-blue' : '')}>
                {f.gainedInRange == null ? '—' : `${f.gainedInRange > 0 ? '+' : ''}${f.gainedInRange}`}<span className="text-[11px]">人</span>
              </div>
              <div className="text-[9px] text-muted">{md(f.rangeFrom)} から</div>
            </div>
            <div className="bg-bg rounded-lg p-2.5">
              <div className="text-[10px] text-muted font-bold">アプリの利用者</div>
              <div className="text-[22px] font-black leading-tight">{f.appUsers}<span className="text-[11px]">人</span></div>
              <div className="text-[9px] text-muted">LIFFでログインした数</div>
            </div>
            <div className="bg-bg rounded-lg p-2.5">
              <div className="text-[10px] text-muted font-bold">LINEが届かなかった</div>
              <div className={'text-[22px] font-black leading-tight ' + ((f.pushFail ?? 0) > 0 ? 'text-red-600' : '')}>
                {f.pushFail ?? 0}<span className="text-[11px]">人</span>
              </div>
              <div className="text-[9px] text-muted">送信が失敗した実績</div>
            </div>
          </div>

          {(f.gapNotFollowing ?? 0) > 0 && (
            <div className="text-[10.5px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 mb-2 leading-relaxed">
              ⚠️ アプリの利用者({f.appUsers}人)が LINE公式の友だち({f.followers}人)より <b>{f.gapNotFollowing}人</b> 多いです。
              LINEログインは友だち追加を必須としないため、その差の人にはマッチ通知やリマインドが届きません。
            </div>
          )}
          {/* 誰が友だち追加していないかを、メッセージを送らずに割り出す。
              LINEのプロフィール取得APIは友だちなら200・そうでなければ404を返すので、
              それで一人ずつ判定できる（LIFFの getFriendship は連携設定がないと取れない）。 */}
          <div className="bg-bg rounded-lg p-2.5 mb-2">
            <div className="flex items-center gap-2">
              <div className="text-[11px] font-bold flex-1">🔍 誰が友だち追加していないか調べる</div>
              <button
                onClick={checkFollowers}
                disabled={checking}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-green text-white font-bold disabled:opacity-50 flex-none"
              >{checking ? '判定中…' : '判定する'}</button>
            </div>
            <div className="text-[10px] text-muted mt-1 leading-relaxed">
              メッセージは送りません。全員のLINE側の状態を1人ずつ確認します。
            </div>
            {checkMsg && <div className="text-[11px] font-bold mt-1.5">{checkMsg}</div>}
            {notFollowedList.length > 0 && (
              <details className="mt-1.5" open>
                <summary className="text-[11px] font-bold text-red-700 cursor-pointer list-none">
                  🚫 友だち追加していない人（{notFollowedList.length}人）▾
                </summary>
                <div className="mt-1">
                  {notFollowedList.map((p) => (
                    <div key={p.id} className="text-[11px] py-1 border-b border-border last:border-0 font-bold truncate">{p.name}</div>
                  ))}
                </div>
              </details>
            )}
          </div>
          {(f.pushFailList || []).length > 0 && (
            <details className="mb-2">
              <summary className="text-[11px] font-bold text-red-700 cursor-pointer list-none">🚫 LINEが届かなかった人（{f.pushFailList!.length}人） ▾</summary>
              <div className="mt-1.5">
                {f.pushFailList!.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-[11px] py-1 border-b border-border last:border-0">
                    <span className="font-bold truncate">{p.name}</span>
                    <span className="text-muted flex-none ml-2">{p.status ? `${p.status}` : ''} ・ {ago(p.at)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          {f.notOpenedApp != null && f.notOpenedApp > 0 && (
            <div className="text-[10.5px] text-muted mb-2">友だち追加はしたが、まだアプリを開いていない人：{f.notOpenedApp}人</div>
          )}
          {f.blocks != null && <div className="text-[10px] text-muted mb-2">ブロック累計 {f.blocks}人 ・ メッセージが届く人 {f.targetedReaches ?? '—'}人</div>}
          {recent.length > 0 && (
            <details>
              <summary className="text-[11px] font-bold text-sub cursor-pointer list-none">📈 日別の推移（直近14日） ▾</summary>
              <div className="mt-1.5">
                {recent.map((d) => (
                  <div key={d.date} className="flex items-center justify-between text-[11px] py-1 border-b border-border last:border-0">
                    <span className="text-sub">{md(d.date)}</span>
                    <span>
                      {d.followers}人
                      {d.delta != null && d.delta !== 0 && (
                        <b className={d.delta > 0 ? 'text-green ml-2' : 'text-red-600 ml-2'}>{d.delta > 0 ? `+${d.delta}` : d.delta}</b>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-card rounded-xl p-3 shadow-card text-center">
      <div className={`text-xl font-black ${accent || ''}`}>{value}</div>
      <div className="text-[10px] text-muted mt-0.5">{label}</div>
    </div>
  );
}
function Section({ title, sub, count, children }: { title: string; sub?: string; count?: number; children: React.ReactNode }) {
  return (
    <details className="bg-card rounded-xl shadow-card mb-3">
      <summary className="flex items-center justify-between p-4 cursor-pointer list-none gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-black">{title}</div>
          {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {typeof count === 'number' && <span className="text-[11px] font-bold text-green">{count}件</span>}
          <span className="text-muted text-[11px]">開く ▾</span>
        </div>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}
function Empty() {
  return <div className="text-[11px] text-muted py-3 text-center">データがありません</div>;
}
