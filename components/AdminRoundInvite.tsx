'use client';

import { useEffect, useRef, useState } from 'react';
import { confirmDialog, alertDialog } from '@/components/ConfirmDialog';
import { loginLabel } from '@/lib/loginLabel';
import { inviteStatusLabel, inviteStatusTone, type InviteStatus } from '@/lib/inviteStatus';

// 管理画面「代わりに招待する」（2026-10-13）。
// 運営が、自分の募集ではない募集中のラウンドに、主催者の代わりに会員を招待する。
// 候補 ＝ ❤️ この募集を「気になる」した人／👀 見に来た人／🔍 名前で検索（全会員）。
// 主催者・参加済み・申請中・利用停止・テスト垢（テストの募集なら逆に実ユーザー）は出さない。
// 年代・性別の条件・男女別の枠が合わない人も出さない（検索では理由つきで見せる）。
// 送ると、招待された人には主催者の招待と同じもの（お知らせ＋LINE＋「参加する」で即参加）が「ゴルトモ運営から」の文面で届く。

type Cand = {
  id: string; displayName: string; gender: string; age: number | null; area: string;
  avatar: string; hasPhoto: boolean; lastActiveAt: number | null;
  ng?: string; invited?: { by: 'host' | 'admin' | 'unknown'; at: number | null };
  viewedAt?: number; viewCount?: number;
  status?: InviteStatus;
};
type Info = {
  round: {
    id: string; title: string; status: string; when: string; place: string; hostId: string; hostName: string;
    currentCount: number; maxSpots: number; hostCohort: 'a' | 'b' | null; genderCondition: string; beginnerOnly: boolean;
    isTest: boolean; slots: { male: number; female: number } | null; joinedViaAdmin: number;
  };
  blocked: string | null;
  interested: Cand[]; viewers: Cand[]; invited: Cand[];
  excluded: Record<string, number>;
  preview: { inApp: string | null; line: string };
};

const fmt = (ms?: number | null) => (ms ? new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const genderMark = (g: string) => (g === 'male' ? '👨男性' : g === 'female' ? '👩女性' : '性別未設定');
const byLabel = (b?: string) => (b === 'admin' ? '運営' : b === 'host' ? '主催者' : '—');

export function AdminRoundInvite({ token, roundId }: { token: string; roundId: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, string>>({}); // id → 名前
  const [message, setMessage] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Cand[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const searchSeq = useRef(0);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/round-invite?token=${encodeURIComponent(token)}&roundId=${encodeURIComponent(roundId)}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) { alertDialog('取得失敗: ' + (d.message || d.error || r.status)); return; }
      setInfo(d);
    } catch { alertDialog('取得失敗'); }
    finally { setLoading(false); }
  }

  // 名前検索（入力が止まって0.35秒後）。古い応答で上書きしないよう連番で捨てる
  useEffect(() => {
    const term = q.trim();
    if (!term || !info) { setResults(null); return; }
    const seq = ++searchSeq.current;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/admin/round-invite?token=${encodeURIComponent(token)}&roundId=${encodeURIComponent(roundId)}&q=${encodeURIComponent(term)}`, { cache: 'no-store' });
        const d = await r.json();
        if (seq === searchSeq.current) setResults(r.ok ? (d.results || []) : []);
      } catch { if (seq === searchSeq.current) setResults([]); }
      finally { if (seq === searchSeq.current) setSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [q, info, token, roundId]);

  function toggle(c: Cand) {
    if (c.ng || c.invited) return;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[c.id]) delete next[c.id]; else next[c.id] = c.displayName;
      return next;
    });
  }

  async function send() {
    const ids = Object.keys(selected);
    if (!ids.length || !info) return;
    if (ids.length > 20) { alertDialog('一度に招待できるのは20人までです'); return; }
    const names = ids.map((id) => `・${selected[id]}`).join('\n');
    const ok = await confirmDialog({
      title: `💌 ${ids.length}人に招待を送ります`,
      message: `「${info.round.title}」（${info.round.when}・主催 ${info.round.hostName}さん）\n\n${names}\n\n「ゴルトモ運営から」の招待として、お知らせとLINEが届きます。主催者にはアプリ内のお知らせだけが届きます。`,
      confirmText: '招待を送る', cancelText: 'やめる',
    });
    if (!ok) return;
    setSending(true);
    try {
      const r = await fetch(`/api/admin/round-invite?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ roundId, userIds: ids, message: message.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { alertDialog('送信失敗: ' + (d.message || d.error || r.status)); return; }
      const lines = [`招待を送りました：${(d.sent || []).length}人`];
      for (const s of d.skipped || []) lines.push(`送らなかった：${s.name}（${s.reason}）`);
      alertDialog(lines.join('\n'));
      setSelected({}); setMessage(''); setQ(''); setResults(null);
      await load();
    } catch { alertDialog('送信に失敗しました'); }
    finally { setSending(false); }
  }

  const row = (c: Cand, extra?: string) => {
    const on = !!selected[c.id];
    const disabled = !!c.ng || !!c.invited;
    const ll = loginLabel(c.lastActiveAt);
    return (
      <button
        key={c.id}
        type="button"
        onClick={() => toggle(c)}
        disabled={disabled}
        className={`w-full text-left flex items-center gap-2 p-2 rounded-lg border ${on ? 'border-green bg-green-light' : 'border-border bg-card'} ${disabled ? 'opacity-55' : ''}`}
      >
        <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-[10px] ${on ? 'bg-green border-green text-white' : 'border-border bg-bg'}`}>{on ? '✓' : ''}</span>
        <span className="text-lg flex-shrink-0">{c.hasPhoto ? '🖼️' : c.avatar}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[12px] font-bold truncate">{c.displayName}</span>
          <span className="block text-[10px] text-sub truncate">
            {[genderMark(c.gender), c.age ? `${c.age}歳` : '年齢未設定', c.area].filter(Boolean).join('・')}
          </span>
          <span className="block text-[10px] text-muted truncate">
            {ll ? <>{ll.live && <span className="text-green">● </span>}{ll.text}</> : 'ログイン記録なし'}
            {extra ? ` ／ ${extra}` : ''}
          </span>
        </span>
        {c.invited && <span className="text-[10px] font-bold text-green flex-shrink-0">招待済み（{byLabel(c.invited.by)}）</span>}
        {!c.invited && c.ng && <span className="text-[10px] font-bold text-red-600 flex-shrink-0 max-w-[90px] text-right">{c.ng}</span>}
      </button>
    );
  };

  const selCount = Object.keys(selected).length;
  const excludedText = info ? Object.entries(info.excluded).map(([k, v]) => `${k} ${v}人`).join('・') : '';
  const hitokoto = message.trim() ? `\n「${message.trim()}」` : '';

  return (
    <details className="mt-2" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && !info) load(); }}>
      <summary className="text-[11px] font-bold text-green cursor-pointer py-1">💌 代わりに招待する</summary>
      <div className="mt-1 flex flex-col gap-2">
        {loading && <div className="text-[10px] text-muted">読み込み中...</div>}
        {info && (
          <>
            <div className="bg-bg rounded-lg p-2 text-[11px] leading-relaxed">
              <div>主催 <b>{info.round.hostName}</b> ／ {info.round.when} ／ {info.round.place || '場所未定'}</div>
              <div>
                参加 {info.round.currentCount}/{info.round.maxSpots}人
                {info.round.slots && ` ／ 空き 男性${info.round.slots.male}・女性${info.round.slots.female}`}
                {info.round.hostCohort && ` ／ ${info.round.hostCohort === 'a' ? '20〜30代' : '40〜50代'}`}
                {info.round.genderCondition !== 'any' && ` ／ ${info.round.genderCondition === 'male' ? '男性のみ' : '女性のみ'}`}
                {info.round.beginnerOnly && ' ／ 初心者のみ'}
                {info.round.isTest && ' ／ 🧪テストの募集'}
              </div>
              {info.round.joinedViaAdmin > 0 && <div className="text-green">運営の招待から参加：{info.round.joinedViaAdmin}人</div>}
            </div>

            {info.blocked ? (
              <div className="bg-red-50 text-red-700 rounded-lg p-2 text-[11px] font-bold">この募集には招待できません：{info.blocked}</div>
            ) : (
              <>
                <div>
                  <div className="text-[11px] font-black mb-1">✍️ 一言（任意・200字まで）</div>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, 200))}
                    rows={2}
                    placeholder="例：初心者の方も多い募集です。よければぜひ！"
                    className="w-full p-2 border-[1.5px] border-border rounded-lg text-[12px] bg-card outline-none"
                  />
                  <div className="text-[10px] text-muted mb-0.5">招待された人に届くLINE（見本）</div>
                  <div className="bg-bg rounded-lg p-2 text-[11px] whitespace-pre-wrap leading-relaxed">{info.preview.line}{hitokoto}</div>
                </div>

                <div>
                  <div className="text-[11px] font-black mb-1">❤️ この募集を「気になる」した人（{info.interested.length}）</div>
                  <div className="flex flex-col gap-1">
                    {info.interested.length === 0 ? <div className="text-[10px] text-muted">招待できる人はいません</div> : info.interested.map((c) => row(c))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-black mb-1">👀 見に来た人（{info.viewers.length}）</div>
                  <div className="flex flex-col gap-1 max-h-[360px] overflow-y-auto">
                    {info.viewers.length === 0 ? <div className="text-[10px] text-muted">招待できる人はいません</div>
                      : info.viewers.map((c) => row(c, c.viewedAt ? `${fmt(c.viewedAt)}に閲覧${(c.viewCount || 0) > 1 ? `（${c.viewCount}回）` : ''}` : ''))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-black mb-1">🔍 名前で探す（全会員）</div>
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="表示名の一部（またはユーザーID）"
                    className="w-full p-2 border-[1.5px] border-border rounded-lg text-[12px] bg-card outline-none mb-1"
                  />
                  {searching && <div className="text-[10px] text-muted">検索中...</div>}
                  {results && !searching && (
                    <div className="flex flex-col gap-1 max-h-[360px] overflow-y-auto">
                      {results.length === 0 ? <div className="text-[10px] text-muted">見つかりません（主催者・参加済み・利用停止・テスト垢は出ません）</div> : results.map((c) => row(c))}
                    </div>
                  )}
                </div>

                {excludedText && <div className="text-[10px] text-muted">条件が合わないので候補から外した人：{excludedText}</div>}

                <button
                  onClick={send}
                  disabled={!selCount || sending}
                  className={`w-full py-2 rounded-lg text-[12px] font-black ${selCount && !sending ? 'bg-green text-white' : 'bg-bg text-muted border border-border'}`}
                >
                  {sending ? '送信中...' : selCount ? `💌 選んだ${selCount}人に招待を送る` : '招待する人を選んでください'}
                </button>
              </>
            )}

            <div>
              <div className="text-[11px] font-black mb-1">💌 招待した人と返事（{info.invited.length}）</div>
              {info.invited.length > 0 && (
                <div className="text-[10px] text-sub mb-1">
                  {(['unread', 'seen', 'declined', 'joined'] as const)
                    .map((k) => [k, info.invited.filter((c) => c.status?.kind === k).length] as const)
                    .filter(([, n]) => n > 0)
                    .map(([k, n]) => `${{ unread: '未読', seen: '既読', declined: '行けない', joined: '参加' }[k]} ${n}`)
                    .join('・')}
                </div>
              )}
              {info.invited.length === 0 ? <div className="text-[10px] text-muted">いません</div> : (
                <div className="flex flex-col gap-1">
                  {info.invited.map((c) => (
                    <div key={c.id} className="bg-bg rounded-lg px-2 py-1.5 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{c.hasPhoto ? '🖼️' : c.avatar} {c.displayName}<span className="text-muted text-[10px] ml-1">{loginLabel(c.lastActiveAt)?.text || ''}</span></span>
                        {c.status && <span className={`text-[10px] font-bold rounded-full px-1.5 py-[1px] flex-shrink-0 ${inviteStatusTone(c.status.kind)}`}>{inviteStatusLabel(c.status)}</span>}
                      </div>
                      <div className="text-[10px] text-sub mt-0.5">
                        {byLabel(c.invited?.by)}が招待{c.invited?.at ? `・${fmt(c.invited.at)}` : ''}
                        {c.status?.reason ? ` ／ 「${c.status.reason}」` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={load} className="text-[10px] text-blue font-bold self-end">🔄 更新</button>
          </>
        )}
      </div>
    </details>
  );
}
