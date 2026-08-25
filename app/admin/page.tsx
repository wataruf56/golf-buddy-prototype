'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { APP_VERSION } from '@/lib/appUpdate';

export default function AdminTop() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [stats, setStats] = useState<{ users: number; swingAllowed: number; testCount?: number } | null>(null);
  // 「気になる系」通知を全員OFFにする移行（1回限り）。
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState('');
  async function migrateInterestOff() {
    if (migrating) return;
    if (!window.confirm('既存ユーザー全員の「気になる系」LINE通知（気になるが押された／締切間近）を一括OFFにします。1回だけ実行してください。よろしいですか？')) return;
    setMigrating(true); setMigrateMsg('');
    try {
      const r = await fetch(`/api/admin/notif-off-migrate?token=${encodeURIComponent(token)}`, { method: 'POST', cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `${r.status}`);
      setMigrateMsg(`✅ 完了（${j.updated} 人を一括OFFにしました）`);
    } catch (e) { setMigrateMsg('失敗: ' + (e as Error).message); }
    setMigrating(false);
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Always treat /api/admin/init as the source of truth for the token. A
    // cached localStorage token can go stale when ADMIN_LOG_TOKEN rotates on
    // redeploy — that previously made every /api/admin/* call 403 and the
    // screens came up blank. By fetching the live token here and overwriting
    // the cache, a rotation self-heals as soon as the admin opens /admin.
    const cached = tokenFromUrl || localStorage.getItem('gb_admin_token') || '';
    if (cached) setToken(cached); // optimistic: render immediately
    (async () => {
      try {
        const r = await fetch('/api/admin/init', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        const t: string = j?.token || '';
        if (t && t !== cached) {
          localStorage.setItem('gb_admin_token', t);
          setToken(t);
        } else if (t) {
          localStorage.setItem('gb_admin_token', t);
        }
      } catch {}
    })();
  }, [tokenFromUrl]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const r = await fetch(`/api/admin/users?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        setStats({ users: d.count, swingAllowed: d.allowedCount, testCount: d.testCount });
      } catch {}
    })();
  }, [token]);

  if (!token) {
    // Brief loading state while /api/admin/_init responds; no manual prompt.
    return (
      <div className="min-h-screen bg-bg p-5 max-w-md mx-auto flex items-center justify-center">
        <div className="text-sm text-muted">⚙️ 管理画面を読み込み中...</div>
      </div>
    );
  }

  const items = [
    { href: `/admin/activity?token=${token}`, emoji: '📊', title: '利用レポート', desc: 'よく開かれている画面 / アクティブユーザー / 操作ログ / 登録推移・カレンダー / スイング' },
    { href: `/admin/line-stats?token=${token}`, emoji: '📨', title: 'LINE送信レポート', desc: '種別ごとの送信通数・月別推移（LINE有料化の通数把握）' },
    { href: `/admin/lp-funnel?token=${token}`, emoji: '📊', title: 'LPレポート', desc: '流入ファネル（入口別・離脱ポイント・LINE到達）/ 診断の中身・需要プール' },
    { href: `/admin/dm?token=${token}`, emoji: '💬', title: 'メッセージ', desc: 'DMログ（誰↔誰・本文）/ 未読ユーザー・未読通知の設定' },
    { href: `/admin/users?token=${token}`, emoji: '👥', title: 'ユーザー管理', desc: 'LINE登録ユーザー一覧 / Swing許可リスト編集' },
    { href: `/admin/rounds?token=${token}`, emoji: '🏆', title: 'ラウンド募集', desc: '全募集の一覧・削除 / タイトル定型文の編集' },
    { href: `/admin/official?token=${token}`, emoji: '📣', title: '運営が立てる枠', desc: '主催者なしの募集を1本だけ出す / ホームの声かけ' },
    { href: `/admin/audit?token=${token}`, emoji: '📒', title: '操作ログ', desc: '誰が・誰に・何をしたか（自動の再会通知も含む）' },
    { href: `/admin/reminders?token=${token}`, emoji: '⏰', title: '開催前リマインド設定', desc: '参加ラウンドの何日前に全体通知するか（1ヶ月前/1週間前/前日など）' },
    { href: `/admin/rematch?token=${token}`, emoji: '🔁', title: '再会エンジン', desc: '再会通知のタイミング設定・今すぐ実行（テスト）・5段ファネル' },
    { href: `/admin/test-accounts?token=${token}`, emoji: '🧪', title: 'テストアカウント管理', desc: '検証用アカウントの登録 / 一般ユーザーから隠す / 新機能の段階公開' },
    { href: `/admin/notification-templates?token=${token}`, emoji: '✉️', title: '通知メッセージ編集', desc: 'アプリ内 / LINE / スマホ通知の文面をすべて編集' },
    { href: `/admin/ratings?token=${token}`, emoji: '🛡️', title: '信頼・トラブル対応', desc: '評価の状況（全員）/ 通報 / ドタキャン・マナー / レビュー' },
    { href: `/admin/support?token=${token}`, emoji: '🛡️', title: '管理人チャット', desc: 'ユーザーと「管理人」名義でDM（サポート窓口）' },
    { href: `/admin/hobby-tags?token=${token}`, emoji: '🎯', title: '趣味タグの管理', desc: 'ユーザーが追加した趣味タグの確認・不適切タグの削除' },
    { href: `/admin/swing?token=${token}`, emoji: '🏌️', title: 'スイング解析モニタ', desc: '解析履歴・状態確認・スタック復旧' },
    { href: `/admin/system?token=${token}`, emoji: '🔧', title: 'システム状態', desc: '環境変数 / GCS / LINE Bot 接続確認' },
  ];

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto">
      <div className="text-2xl font-black mb-1">⚙️ 管理画面</div>
      {stats && (
        <div className="text-[11px] text-muted mb-4">
          総ユーザー <b className="text-text">{stats.users}</b>
          {!!stats.testCount && <span>（+ 動作確認用 {stats.testCount}）</span>}
          {' '}/ Swing許可 <b className="text-text">{stats.swingAllowed}</b>
        </div>
      )}

      {/* 事業サマリー：見るべき数字だけをここに集約（詳細は各レポートへ） */}
      <KpiSummary token={token} />

      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="flex items-center gap-3 p-4 bg-card rounded-xl shadow-card"
          >
            <span className="text-2xl">{it.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold">{it.title}</div>
              <div className="text-[11px] text-sub mt-0.5 truncate">{it.desc}</div>
            </div>
            <span className="text-muted">›</span>
          </Link>
        ))}
      </div>

      {/* 通知の一括OFF移行（1回限り・見つけやすいよう管理トップに配置） */}
      <div className="bg-card rounded-xl shadow-card p-4 mt-4">
        <div className="text-[13px] font-black mb-1">🔕 「気になる系」通知を全員OFF（1回限り）</div>
        <div className="text-[11px] text-sub mb-3 leading-relaxed">
          既存ユーザー全員の <b>「💚 気になるが押された」「⏰ 締切間近」</b> のLINE通知を一括OFFにします（初期値OFFへの移行）。ユーザーは自分で再度ONにできます。<b>1回だけ</b>押してください。
        </div>
        <button
          onClick={migrateInterestOff}
          disabled={migrating}
          className="w-full py-3 bg-sub text-white rounded-xl text-sm font-black disabled:opacity-50"
        >{migrating ? '実行中…' : '既存ユーザーを一括OFFにする'}</button>
        {migrateMsg && <div className="text-[12px] text-center mt-2 font-bold">{migrateMsg}</div>}
      </div>

      <button
        onClick={() => { localStorage.removeItem('gb_admin_token'); setToken(''); }}
        className="w-full mt-6 p-3 text-xs text-muted underline"
      >トークンを忘れる (ログアウト)</button>

      <div className="text-center text-[11px] text-muted py-3">管理画面 ver {APP_VERSION}</div>
    </div>
  );
}

// ── 事業サマリー ───────────────────────────────────────────────
// マッチング系サービスは「登録者数」を追うと失敗する（人が集まっても出会いが起きないため）。
// 見るのは 北極星＝実際にラウンドした人数 と、その下の 供給／成立／定着 の3つだけ。
type Kpi = {
  northStar: { thisWeek: number; lastWeek: number };
  supply: { roundsThisWeek: number; roundsLastWeek: number; newHostsThisWeek: number; newHostsLastWeek: number; totalHosts: number };
  matching: { fillRateThisWeek: number | null; fillRateAll: number | null };
  retention: { everPlayed: number; repeat: number; repeatRate: number };
  activation: { totalUsers: number; engaged: number; rate: number };
  alerts: Array<{ id: string; title: string; date: string; daysLeft: number | null; joined: number; maxSpots: number; isCompetition: boolean }>;
};

function Delta({ now, prev }: { now: number; prev: number }) {
  const d = now - prev;
  if (d === 0) return <span className="text-[10px] text-muted">±0</span>;
  return <span className={'text-[10px] font-bold ' + (d > 0 ? 'text-green' : 'text-red')}>{d > 0 ? '▲' : '▼'}{Math.abs(d)}</span>;
}

function KpiSummary({ token }: { token: string }) {
  const [k, setK] = useState<Kpi | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`/api/admin/kpi?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.error) setErr(d.error); else setK(d); })
      .catch((e) => setErr(String(e)));
  }, [token]);

  if (err) return <div className="bg-card rounded-xl shadow-card p-4 mb-3 text-[11px] text-red">サマリー取得エラー: {err}</div>;
  if (!k) return <div className="bg-card rounded-xl shadow-card p-4 mb-3 text-[11px] text-muted">サマリーを読み込み中…</div>;

  return (
    <div className="bg-card rounded-xl shadow-card p-4 mb-3">
      <div className="text-[13px] font-black mb-0.5">📈 事業サマリー</div>
      <div className="text-[10px] text-muted mb-3">直近7日 ／ 前の7日と比較</div>

      {/* 北極星 */}
      <div className="bg-green-light rounded-xl p-3 mb-3">
        <div className="text-[10px] font-bold text-green mb-0.5">⭐ 北極星：実際にラウンドした人数</div>
        <div className="flex items-end gap-2">
          <div className="text-[28px] font-black leading-none text-green">{k.northStar.thisWeek}<span className="text-[13px] ml-0.5">人</span></div>
          <div className="pb-1"><Delta now={k.northStar.thisWeek} prev={k.northStar.lastWeek} /> <span className="text-[10px] text-muted">(前週 {k.northStar.lastWeek})</span></div>
        </div>
        <div className="text-[10px] text-sub mt-1">この数字だけが本当の価値提供。登録者数ではなくここを伸ばす。</div>
      </div>

      {/* 供給・成立・定着 */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-bg rounded-lg p-2.5">
          <div className="text-[9px] text-muted mb-0.5">① 供給</div>
          <div className="text-[17px] font-black leading-none">{k.supply.newHostsThisWeek}<span className="text-[10px]">人</span></div>
          <div className="text-[9px] text-muted mt-0.5">初めて主催 <Delta now={k.supply.newHostsThisWeek} prev={k.supply.newHostsLastWeek} /></div>
          <div className="text-[9px] text-sub mt-1">募集 {k.supply.roundsThisWeek}件 / 主催経験 {k.supply.totalHosts}人</div>
        </div>
        <div className="bg-bg rounded-lg p-2.5">
          <div className="text-[9px] text-muted mb-0.5">② 成立</div>
          <div className="text-[17px] font-black leading-none">{k.matching.fillRateAll ?? '—'}<span className="text-[10px]">%</span></div>
          <div className="text-[9px] text-muted mt-0.5">定員の充足率</div>
          <div className="text-[9px] text-sub mt-1">立った募集が埋まったか</div>
        </div>
        <div className="bg-bg rounded-lg p-2.5">
          <div className="text-[9px] text-muted mb-0.5">③ 定着</div>
          <div className="text-[17px] font-black leading-none">{k.retention.repeatRate}<span className="text-[10px]">%</span></div>
          <div className="text-[9px] text-muted mt-0.5">2回以上 {k.retention.repeat}/{k.retention.everPlayed}人</div>
          <div className="text-[9px] text-sub mt-1">戻ってきているか</div>
        </div>
      </div>

      {/* 活性化 */}
      <div className="bg-bg rounded-lg p-2.5 mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold text-sub">登録者のうちラウンドに関与した人</span>
          <span className="text-[12px] font-black">{k.activation.engaged}<span className="text-[10px] text-muted"> / {k.activation.totalUsers}人（{k.activation.rate}%）</span></span>
        </div>
        <div className="h-1.5 bg-card rounded-full overflow-hidden">
          <div className="h-full bg-green rounded-full" style={{ width: `${k.activation.rate}%` }} />
        </div>
      </div>

      {/* 運用アラート */}
      {k.alerts.length > 0 && (
        <div className="border-t border-border pt-2.5">
          <div className="text-[11px] font-black text-red mb-1.5">⚠️ 参加者ゼロのまま開催が近い募集（{k.alerts.length}件）</div>
          <div className="flex flex-col gap-1">
            {k.alerts.slice(0, 5).map((a) => (
              <div key={a.id} className="flex items-center justify-between text-[11px] bg-orange-light rounded-lg px-2.5 py-1.5">
                <span className="truncate flex-1 min-w-0 font-bold">{a.isCompetition ? '🏆 ' : ''}{a.title}</span>
                <span className="flex-shrink-0 ml-2 text-orange font-black">あと{a.daysLeft}日</span>
              </div>
            ))}
          </div>
          <div className="text-[9px] text-muted mt-1.5">※「掘り起こし通知」（希望条件が合う人へ再案内）が自動で走ります。</div>
        </div>
      )}
    </div>
  );
}
