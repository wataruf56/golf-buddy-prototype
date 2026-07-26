'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// 管理画面：開催前リマインドの「開催の何日前に全体へ通知するか」を設定する。
// プリセット（1ヶ月前/2週間前/1週間前/3日前/前日/当日朝）＋自由入力。

const PRESETS: { days: number; label: string }[] = [
  { days: 30, label: '1ヶ月前（30日前）' },
  { days: 14, label: '2週間前（14日前）' },
  { days: 7, label: '1週間前（7日前）' },
  { days: 3, label: '3日前' },
  { days: 1, label: '前日' },
  { days: 0, label: '当日の朝' },
];

export default function AdminRemindersPage() {
  return (
    <Suspense fallback={null}><Inner /></Suspense>
  );
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [custom, setCustom] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  // 未レビュー者への一斉通知（1回限り）。
  const [blasting, setBlasting] = useState(false);
  const [blastMsg, setBlastMsg] = useState('');
  // 「気になる系」通知を全員OFFにする移行（1回限り）。
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cached = tokenFromUrl || localStorage.getItem('gb_admin_token') || '';
    if (cached) setToken(cached);
    (async () => {
      try {
        const r = await fetch('/api/admin/init', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (j?.token) { localStorage.setItem('gb_admin_token', j.token); setToken(j.token); }
      } catch {}
    })();
  }, [tokenFromUrl]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const r = await fetch(`/api/admin/reminder-config?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        const j = await r.json();
        if (r.ok && Array.isArray(j.daysBefore)) setDays(j.daysBefore);
      } catch {}
      setLoaded(true);
    })();
  }, [token]);

  function toggle(d: number) {
    setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => b - a));
  }
  function addCustom() {
    const n = parseInt(custom, 10);
    if (!Number.isFinite(n) || n < 0 || n > 120) { setMsg('0〜120 の数字を入力してください'); return; }
    setDays((prev) => Array.from(new Set([...prev, n])).sort((a, b) => b - a));
    setCustom(''); setMsg('');
  }

  async function save() {
    setSaving(true); setMsg('');
    try {
      const r = await fetch(`/api/admin/reminder-config?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysBefore: days }), cache: 'no-store',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `${r.status}`);
      setDays(j.daysBefore || []);
      setMsg('保存しました ✅');
    } catch (e) { setMsg('保存失敗: ' + (e as Error).message); }
    setSaving(false);
  }

  async function reviewBlast() {
    if (blasting) return;
    if (!window.confirm('いまレビューが未対応の全ユーザーへ、レビュー依頼を今すぐ送ります。1回だけ実行してください。よろしいですか？')) return;
    setBlasting(true); setBlastMsg('');
    try {
      const r = await fetch(`/api/admin/review-blast?token=${encodeURIComponent(token)}`, { method: 'POST', cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `${r.status}`);
      setBlastMsg(`✅ 送信しました（対象 ${j.reviewers} 人 / 送信 ${j.sent} 件）`);
    } catch (e) { setBlastMsg('送信失敗: ' + (e as Error).message); }
    setBlasting(false);
  }

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

  const label = (d: number) => d === 0 ? '当日の朝' : d === 1 ? '前日' : `${d}日前`;

  if (!token) return <div className="min-h-screen bg-bg p-5 max-w-md mx-auto flex items-center justify-center text-sm text-muted">⚙️ 読み込み中...</div>;

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto pb-16">
      <Link href={`/admin?token=${token}`} className="text-muted text-sm">‹ 管理</Link>
      <div className="text-2xl font-black mb-1 mt-1">⏰ 開催前リマインド設定</div>
      <div className="text-[12px] text-muted mb-4 leading-relaxed">
        参加ラウンドの開催が近づいたら、参加者全員へ自動でLINE＋アプリ内通知します。<br />
        「開催の何日前に通知するか」を選んでください（複数可）。
      </div>

      {!loaded ? (
        <div className="text-sm text-muted">読み込み中...</div>
      ) : (
        <div className="bg-card rounded-xl shadow-card p-4">
          <div className="text-[12px] font-bold text-sub mb-2">よく使う設定</div>
          <div className="flex flex-col gap-1.5 mb-4">
            {PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => toggle(p.days)}
                className={'flex items-center justify-between px-3 py-2.5 rounded-lg border-[1.5px] text-left ' + (days.includes(p.days) ? 'border-green bg-green-light' : 'border-border bg-bg')}
              >
                <span className="text-[13px] font-bold">{p.label}</span>
                <span className={'text-[12px] font-black ' + (days.includes(p.days) ? 'text-green' : 'text-muted')}>{days.includes(p.days) ? '✓ ON' : 'OFF'}</span>
              </button>
            ))}
          </div>

          <div className="text-[12px] font-bold text-sub mb-1.5">その他の日数を追加</div>
          <div className="flex gap-1.5 mb-2">
            <input
              type="number" min={0} max={120} value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="例: 10"
              className="flex-1 min-w-0 text-sm border-[1.5px] border-border rounded-lg px-3 py-2 bg-bg outline-none"
            />
            <span className="self-center text-[12px] text-sub">日前</span>
            <button onClick={addCustom} className="px-3 py-2 bg-bg border-[1.5px] border-border rounded-lg text-xs font-bold">＋ 追加</button>
          </div>

          {days.length > 0 && (
            <div className="bg-bg rounded-lg p-3 mb-3">
              <div className="text-[11px] text-muted mb-1.5">現在の設定（{days.length}件）</div>
              <div className="flex flex-wrap gap-1.5">
                {days.map((d) => (
                  <span key={d} className="inline-flex items-center gap-1 bg-green-light text-green border border-green rounded-full pl-2.5 pr-1 py-0.5 text-[12px] font-bold">
                    {label(d)}
                    <button onClick={() => toggle(d)} className="w-4 h-4 rounded-full bg-card text-red-600 text-[11px] leading-none flex items-center justify-center">×</button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {days.length === 0 && <div className="text-[12px] text-orange font-bold mb-3">通知なし（リマインドは送られません）</div>}

          <button onClick={save} disabled={saving} className="w-full py-3 bg-green text-white rounded-xl text-sm font-bold disabled:opacity-50">
            {saving ? '保存中…' : 'この設定で保存する'}
          </button>
          {msg && <div className="text-[12px] text-center mt-2 font-bold">{msg}</div>}

          <div className="text-[10px] text-muted mt-4 leading-relaxed">
            ※ 通知文には実際の残り日数（「あと◯日」「明日」「本日」）が入ります。<br />
            ※ 各ラウンド・各タイミングにつき1回だけ送信（重複なし）。<br />
            ※ 募集を後から作成した場合、その時点で過ぎたタイミングは送られません。
          </div>
        </div>
      )}

      {/* 未レビュー者へ一斉通知（1回限りの手動オペレーション） */}
      <div className="bg-card rounded-xl shadow-card p-4 mt-4">
        <div className="text-[13px] font-black mb-1">📣 未レビュー者へ一斉通知（1回限り）</div>
        <div className="text-[11px] text-muted mb-3 leading-relaxed">
          いま<b>レビューが未対応の全ユーザー</b>へ「レビューをお願いします」を今すぐ送ります。<br />
          3日後の自動リマインドとは別の、その場かぎりの手動送信です。<b>連打せず1回だけ</b>押してください。
        </div>
        <button
          onClick={reviewBlast}
          disabled={blasting}
          className="w-full py-3 bg-orange text-white rounded-xl text-sm font-black disabled:opacity-50"
        >
          {blasting ? '送信中…' : '未レビュー者へ今すぐ一斉通知する'}
        </button>
        {blastMsg && <div className="text-[12px] text-center mt-2 font-bold">{blastMsg}</div>}
      </div>

      {/* 「気になる系」通知を全員OFFにする移行（1回限り） */}
      <div className="bg-card rounded-xl shadow-card p-4 mt-4">
        <div className="text-[13px] font-black mb-1">🔕 「気になる系」通知を全員OFF（1回限り）</div>
        <div className="text-[11px] text-muted mb-3 leading-relaxed">
          既存ユーザー全員の <b>「💚 気になるが押された」「⏰ 締切間近」</b> のLINE通知を一括でOFFにします（初期値OFFへの移行）。ユーザーは自分で再度ONにできます。<b>1回だけ</b>押してください。
        </div>
        <button
          onClick={migrateInterestOff}
          disabled={migrating}
          className="w-full py-3 bg-sub text-white rounded-xl text-sm font-black disabled:opacity-50"
        >
          {migrating ? '実行中…' : '既存ユーザーを一括OFFにする'}
        </button>
        {migrateMsg && <div className="text-[12px] text-center mt-2 font-bold">{migrateMsg}</div>}
      </div>
    </div>
  );
}
