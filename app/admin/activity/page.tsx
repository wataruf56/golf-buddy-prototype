'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type Report = {
  generatedAt: number;
  summary: { active24h: number; active7d: number; totalUsersSeen: number; totalSwingUsers: number; totalSwings: number; logsScanned: number };
  activeUsers: { userId: string; name: string; count: number; lastTs: number; lastEvent: string; lastPage: string }[];
  recentActions: { userId: string; name: string; event: string; page: string; ts: number }[];
  swingUsers: { userId: string; name: string; total: number; done: number; lastAt: number }[];
  recentSwings: { userId: string; name: string; mode: string; status: string; createdAt: number }[];
};

const MODE_LABEL: Record<string, string> = {
  self: '自分解析', compare: 'プロ比較', past: '過去比較', range_vs_round: '練習場vs本番', question: '質問',
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
};
function eventJa(ev: string): string {
  if (EVENT_LABEL[ev]) return EVENT_LABEL[ev];
  // フォールバック：末尾の語から推測
  if (/click$/.test(ev)) return '［ボタン］' + ev.replace(/_click$/, '');
  if (/success$/.test(ev)) return ev.replace(/_success$/, '') + ' 完了';
  if (/error$/.test(ev)) return ev.replace(/_error$/, '') + ' エラー';
  return ev;
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
        <div className="flex-1 text-center text-base font-black">📈 利用状況レポート</div>
        <button onClick={load} className="text-blue text-sm font-bold">🔄</button>
      </div>

      {err && <div className="bg-red-50 text-red-700 p-3 rounded mb-3 text-sm">エラー: {err}</div>}
      {busy && !data && <div className="text-center text-xs text-muted py-6">読み込み中...</div>}

      {data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Kpi label="24時間以内に利用" value={`${data.summary.active24h}人`} accent="text-green" />
            <Kpi label="7日以内に利用" value={`${data.summary.active7d}人`} accent="text-blue" />
            <Kpi label="スイング解析した人" value={`${data.summary.totalSwingUsers}人`} />
            <Kpi label="解析の総回数" value={`${data.summary.totalSwings}回`} accent="text-orange" />
          </div>
          <div className="text-[10px] text-muted text-center mb-3">
            {jst(data.generatedAt)} 時点 ・ ログ{data.summary.logsScanned}件を集計
          </div>

          {/* 1. Active users */}
          <Section title="① いま使っているユーザー" sub="最近アプリを開いた順" count={data.activeUsers.length}>
            {data.activeUsers.length === 0 ? <Empty /> : data.activeUsers.map((u) => (
              <div key={u.userId} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold truncate">{u.name}</div>
                  <div className="text-[10px] text-muted truncate">{u.lastPage || '—'} ・ {u.lastEvent || '—'}</div>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <div className="text-[11px] font-bold text-green">{ago(u.lastTs)}</div>
                  <div className="text-[9px] text-muted">{u.count}操作</div>
                </div>
              </div>
            ))}
          </Section>

          {/* 2. Recent actions */}
          <Section title="② 直近の操作ログ" sub="誰が・何を・どの画面で" count={data.recentActions.length}>
            {data.recentActions.length === 0 ? <Empty /> : data.recentActions.map((a, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold truncate">{a.name} <span className="text-muted font-normal">/ {eventJa(a.event)}</span></div>
                  <div className="text-[9px] text-muted truncate">{a.page}</div>
                </div>
                <div className="text-[10px] text-muted flex-shrink-0 ml-2">{ago(a.ts)}</div>
              </div>
            ))}
          </Section>

          {/* 3. Recent swing analyses */}
          <Section title="③ 直近のスイング解析" sub="誰が利用したか" count={data.recentSwings.length}>
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

          {/* 4. Swing usage ranking */}
          <Section title="④ スイング解析 回数ランキング" sub="誰が何回やったか" count={data.swingUsers.length}>
            {data.swingUsers.length === 0 ? <Empty /> : data.swingUsers.map((u, i) => (
              <div key={u.userId} className="flex items-center gap-2 py-2 border-b border-border last:border-0">
                <div className="w-6 text-center font-black text-sub">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold truncate">{u.name}</div>
                  <div className="text-[9px] text-muted">最終: {ago(u.lastAt)}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[14px] font-black text-green">{u.total}回</div>
                  <div className="text-[9px] text-muted">完了{u.done}</div>
                </div>
              </div>
            ))}
          </Section>
        </>
      )}
      <div className="h-8" />
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
