'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AdminTabs } from '@/components/AdminTabs';

// 管理画面「⏰ 未レビュー」（2026-10-14）。
// 完了したラウンドごとに、まだレビューしていない人を並べ、
//   ・この人に催促 ／ ・この募集の未レビュー全員に催促 ／ ・全部の未レビューに一斉送信
// を送れる。12時間以内に（手動・自動どちらでも）知らせた人には送らない。
// API: /api/admin/review-nudges（GET 一覧 / POST 送信）

type Member = {
  userId: string; name: string; avatar: string; isTest: boolean; deleted: boolean;
  left: number; revieweeNames: string[];
  lastRemindedAt: number | null; lastRemindedBy: 'manual' | 'autoComplete' | 'autoFollowup' | null;
  manualCount: number; canNudge: boolean; blockedReason?: string;
};
type RoundRow = {
  roundId: string; title: string; courseName?: string; date?: string; startTime?: string;
  hostId?: string; hostName?: string; completedAt?: number;
  autoCompleteAt?: number; autoFollowupAt?: number; members: Member[];
};
type Totals = { rounds: number; pairs: number; reviewers: number; sendablePairs: number; sendableReviewers: number };

const DAY_OPTIONS = [30, 60, 90, 3650];
const WD = '日月火水木金土';
function fmtTime(ms: number) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function fmtDate(iso?: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso || '日付なし';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return `${+m[2]}/${+m[3]}（${WD[d.getDay()]}）`;
}
const BY_LABEL: Record<string, string> = { manual: '手動', autoComplete: '自動・完了時', autoFollowup: '自動・3日後' };

export default function AdminUnreviewedPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [days, setDays] = useState(60);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState('');   // 送信中のキー（'all' / 'r:<roundId>' / 'u:<roundId>:<userId>'）
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = tokenFromUrl || localStorage.getItem('gb_admin_token') || '';
    if (tokenFromUrl) localStorage.setItem('gb_admin_token', tokenFromUrl);
    if (t) setToken(t);
    (async () => {
      try {
        const r = await fetch('/api/admin/init', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (j?.token) { localStorage.setItem('gb_admin_token', j.token); setToken(j.token); }
      } catch {}
    })();
  }, [tokenFromUrl]);

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch(`/api/admin/review-nudges?token=${encodeURIComponent(token)}&days=${days}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `${r.status}`);
      setRounds(j.rounds || []);
      setTotals(j.totals || null);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }, [token, days]);
  useEffect(() => { load(); }, [load]);

  async function send(key: string, body: Record<string, unknown>, confirmText: string) {
    if (sending) return;
    if (!window.confirm(confirmText)) return;
    setSending(key); setMsg('');
    try {
      const r = await fetch(`/api/admin/review-nudges?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, days }), cache: 'no-store',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `${r.status}`);
      const skip = [j.skippedCooldown ? `12時間以内のため見送り ${j.skippedCooldown}件` : '', j.skippedOther ? `退会などで見送り ${j.skippedOther}件` : ''].filter(Boolean).join(' / ');
      setMsg(`✅ ${j.notifiedUsers}人に送信しました（うちLINE ${j.lineSent}人）${skip ? `　${skip}` : ''}`);
      await load();
    } catch (e) { setMsg('送信失敗: ' + (e as Error).message); }
    setSending('');
  }

  if (!token) return <div className="min-h-screen bg-bg p-5 max-w-md mx-auto flex items-center justify-center text-sm text-muted">⚙️ 読み込み中...</div>;

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto pb-16">
      <div className="flex items-center gap-2 mb-3">
        <Link href={`/admin?token=${token}`} className="text-blue text-sm font-bold">← 管理</Link>
        <div className="flex-1 text-center text-base font-black">⏰ 未レビュー</div>
        <button onClick={load} className="text-blue text-sm font-bold">🔄</button>
      </div>
      <AdminTabs token={token} group="trust" current="/admin/unreviewed" />

      <div className="text-[11px] text-muted mb-3 leading-relaxed px-1">
        完了したラウンドで、まだレビューしていない人の一覧です。「レビューをお願いします」をアプリ内お知らせ＋LINEで送れます（文面は通知テンプレ「レビューのお願い」）。<br />
        同じ人には<b>12時間に1回まで</b>（完了時・3日後の自動のお願いも含む）。
      </div>

      <div className="flex gap-1 mb-3">
        {DAY_OPTIONS.map((d) => (
          <button key={d} onClick={() => setDays(d)}
            className={'flex-1 py-1.5 rounded-full text-[11px] font-bold border ' + (days === d ? 'bg-green text-white border-green' : 'bg-card text-sub border-border')}>
            {d >= 3650 ? '全期間' : `直近${d}日`}
          </button>
        ))}
      </div>

      {/* 全部の未レビューに一斉送信 */}
      <div className="bg-card rounded-xl shadow-card p-3 mb-3">
        <div className="text-[12px] text-sub mb-2">
          {totals ? <>未レビュー <b>{totals.reviewers}人</b>（{totals.rounds}ラウンド・{totals.pairs}件）／ いま送れるのは <b>{totals.sendableReviewers}人</b></> : '—'}
        </div>
        <button
          disabled={!!sending || !totals || totals.sendableReviewers === 0}
          onClick={() => send('all', { scope: 'all' },
            `${days >= 3650 ? '全期間' : `直近${days}日`}の未レビュー ${totals?.sendableReviewers ?? 0}人へ、レビューの催促を今すぐ送ります（1人1通・12時間以内に知らせた人は除く）。よろしいですか？`)}
          className="w-full py-2.5 bg-orange text-white rounded-xl text-sm font-black disabled:opacity-40"
        >{sending === 'all' ? '送信中…' : `📣 全部の未レビューに一斉送信（${totals?.sendableReviewers ?? 0}人）`}</button>
        {msg && <div className="text-[12px] text-center mt-2 font-bold">{msg}</div>}
      </div>

      {err && <div className="bg-red-50 text-red-700 p-3 rounded mb-3 text-sm">{err}</div>}
      {busy && <div className="text-center text-xs text-muted mb-2">読み込み中...</div>}
      {!busy && !err && rounds.length === 0 && <div className="text-center text-sm text-muted py-8">未レビューはありません 🎉</div>}

      <div className="flex flex-col gap-2">
        {rounds.map((r) => {
          const sendable = r.members.filter((m) => m.canNudge).length;
          const isOpen = open[r.roundId] ?? true;
          return (
            <div key={r.roundId} className="bg-card rounded-xl shadow-card p-3">
              <button className="w-full text-left" onClick={() => setOpen((o) => ({ ...o, [r.roundId]: !isOpen }))}>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-bold flex-1 min-w-0">{r.title}</div>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-orange-light text-orange rounded-full whitespace-nowrap">未 {r.members.length}人</span>
                </div>
                <div className="text-[11px] text-sub mt-0.5">
                  {[fmtDate(r.date) + (r.startTime ? ` ${r.startTime}` : ''), r.courseName && r.courseName !== r.title ? r.courseName : ''].filter(Boolean).join(' ・ ')}
                </div>
                <div className="text-[10.5px] text-muted mt-0.5">
                  {r.hostName ? `主催: ${r.hostName}` : ''}
                  {r.completedAt ? `　完了 ${fmtTime(r.completedAt)}` : ''}
                  {r.autoFollowupAt ? '　3日後リマインド済' : ''}
                </div>
              </button>

              {isOpen && (
                <>
                  <div className="text-right -mt-0.5"><Link href={`/admin/reviews/${r.roundId}?token=${token}`} className="text-blue text-[10.5px] font-bold">この募集のレビューを見る ›</Link></div>
                  <div className="flex flex-col divide-y divide-border mt-1 border-t border-border">
                    {r.members.map((m) => {
                      const k = `u:${r.roundId}:${m.userId}`;
                      return (
                        <div key={m.userId} className="py-2 flex items-start gap-2">
                          <span className="text-lg leading-none mt-0.5">{m.avatar}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-bold truncate">
                              {m.name}
                              {m.isTest && <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 bg-bg text-muted rounded">テスト</span>}
                            </div>
                            <div className="text-[10.5px] text-sub" title={m.revieweeNames.join('、')}>
                              残り {m.left}人（{m.revieweeNames.slice(0, 3).join('、')}{m.revieweeNames.length > 3 ? ' ほか' : ''}）
                            </div>
                            <div className="text-[10px] text-muted">
                              {m.lastRemindedAt ? `最後の催促：${fmtTime(m.lastRemindedAt)}（${BY_LABEL[m.lastRemindedBy || 'manual']}）` : '最後の催促：なし'}
                              {m.manualCount ? `・手動${m.manualCount}回` : ''}
                            </div>
                            {!m.canNudge && m.blockedReason && <div className="text-[10px] text-orange font-bold">{m.blockedReason}</div>}
                          </div>
                          <button
                            disabled={!!sending || !m.canNudge}
                            onClick={() => send(k, { scope: 'user', roundId: r.roundId, userId: m.userId }, `${m.name}さんに「${r.title}」のレビューの催促を送ります。よろしいですか？`)}
                            className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border-[1.5px] border-green text-green bg-card disabled:opacity-40 disabled:border-border disabled:text-muted"
                          >{sending === k ? '送信中…' : 'この人に催促'}</button>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    disabled={!!sending || sendable === 0}
                    onClick={() => send(`r:${r.roundId}`, { scope: 'round', roundId: r.roundId }, `「${r.title}」の未レビュー ${sendable}人へ、レビューの催促を送ります。よろしいですか？`)}
                    className="w-full mt-2 py-2 bg-green text-white rounded-lg text-[12px] font-bold disabled:opacity-40"
                  >{sending === `r:${r.roundId}` ? '送信中…' : sendable ? `この募集の未レビュー全員に催促（${sendable}人）` : 'いま送れる人はいません（12時間以内に送信済み）'}</button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
