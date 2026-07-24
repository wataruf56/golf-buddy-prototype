'use client';

import { useEffect, useState } from 'react';
import { store, useStore, getMe } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';
import { track } from '@/lib/telemetry';
import type { User, ReviewVerdict } from '@/lib/types';
import { cn } from '@/lib/utils';

// ラウンド後のレビュー。同じ組の人には4択（また回りたい／異性として気になる／
// ごめんなさい／どっちでもいい）。コンペで別の組だった人には任意の「回ってみたい」
// （=また回りたいと同じ扱い）。当日来れなかった人は除外として薄く表示。
// 過去に「また回りたい」を押している相手は、その状態（チェック済み）で再表示され、
// 外すと静かに解消される。
type Row = { verdict: ReviewVerdict | null };
type LikeState = { again: boolean; romantic: boolean; sameGroup: boolean };
type MatchInfo = { state: Record<string, LikeState>; users: Record<string, any>; isCompetition: boolean };

export function ReviewOverlay() {
  const me = useStore(getMe);
  const pending = useStore((s) =>
    s.pendingReviews.filter((p) => p.reviewerId === s.meId && p.status === 'pending')
  );
  const users = useStore((s) => s.users);
  const rounds = useStore((s) => s.rounds);
  const noReview = useStore((s) => !!s.restrictions.noReview);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [wanna, setWanna] = useState<Record<string, boolean>>({}); // `${roundId}::${uid}` → 回ってみたい(=again)
  const [match, setMatch] = useState<Record<string, MatchInfo>>({});
  const [busy, setBusy] = useState(false);
  const [reqSent, setReqSent] = useState<Record<string, boolean>>({});

  const roundIds = Array.from(new Set(pending.map((p) => p.roundId)));
  const roundKey = roundIds.slice().sort().join(',');

  // 各ラウンドの現在のlike状態を取得し、過去の「また回りたい」等を事前反映する。
  useEffect(() => {
    if (roundIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(roundIds.map(async (rid) => {
        try {
          const res = await fetch(`/api/rounds/${rid}/match`, { cache: 'no-store', credentials: 'include' });
          if (!res.ok) return [rid, null] as const;
          const d = await res.json();
          return [rid, { state: d.state || {}, users: d.users || {}, isCompetition: !!d.isCompetition }] as const;
        } catch { return [rid, null] as const; }
      }));
      if (cancelled) return;
      const m: Record<string, MatchInfo> = {};
      for (const [rid, info] of entries) if (info) m[rid] = info;
      setMatch(m);
      // pending の verdict を現在のlike状態で事前反映（romantic優先→again）。
      setRows((prev) => {
        const next = { ...prev };
        for (const p of pending) {
          if (next[p.id]) continue;
          const st = m[p.roundId]?.state?.[p.revieweeId];
          next[p.id] = { verdict: st?.romantic ? 'romantic' : st?.again ? 'again' : null };
        }
        return next;
      });
      // 別の組の人（コンペ）の「回ってみたい」を現在のagain状態で事前反映。
      setWanna((prev) => {
        const next = { ...prev };
        for (const rid of roundIds) {
          const info = m[rid];
          if (!info?.isCompetition) continue;
          for (const uid of Object.keys(info.state)) {
            if (info.state[uid].sameGroup) continue;
            const k = `${rid}::${uid}`;
            if (next[k] === undefined) next[k] = !!info.state[uid].again;
          }
        }
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [roundKey]);

  if (pending.length === 0) return null;

  const get = (id: string): Row => rows[id] || { verdict: null };
  const upd = (id: string, patch: Partial<Row>) => setRows((p) => ({ ...p, [id]: { ...get(id), ...patch } }));
  const answered = (r?: Row) => !!r && r.verdict !== null;
  const ratedCount = pending.filter((p) => answered(rows[p.id])).length;
  const allRated = ratedCount === pending.length;

  // 別の組の人（任意・回ってみたい）と、当日来れなかった人（除外）の一覧。
  const wannaList = roundIds.flatMap((rid) => {
    const info = match[rid];
    if (!info?.isCompetition) return [] as Array<{ rid: string; uid: string; user: any }>;
    return Object.keys(info.state)
      .filter((uid) => !info.state[uid].sameGroup)
      .map((uid) => ({ rid, uid, user: info.users[uid] }));
  });
  const noShowList = roundIds.flatMap((rid) => {
    const r = rounds.find((x) => x.id === rid);
    return (r?.noShowIds || []).map((uid) => ({ rid, uid, user: users.find((u) => u.id === uid) }));
  });

  function isOpp(target?: User): boolean {
    return !!(
      (me?.gender === 'male' || me?.gender === 'female') &&
      (target?.gender === 'male' || target?.gender === 'female') &&
      me.gender !== target.gender
    );
  }

  async function setLike(roundId: string, toUserId: string, kind: 'again' | 'romantic', on: boolean) {
    try {
      await fetch(`/api/rounds/${roundId}/match`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId, kind, on }), cache: 'no-store', credentials: 'include',
      });
    } catch { /* best-effort */ }
  }

  // コンペで「一緒に回っていない人がいる」→ 主催者に組分けの見直しを依頼。
  const groupChangeRounds = roundIds.filter(
    (rid) => match[rid]?.isCompetition && rounds.find((r) => r.id === rid)?.hostId !== me?.id,
  );
  async function requestGroupChange(rid: string) {
    try {
      const res = await fetch(`/api/rounds/${rid}/request-group-change`, { method: 'POST', cache: 'no-store', credentials: 'include' });
      if (!res.ok) throw new Error(String(res.status));
      setReqSent((p) => ({ ...p, [rid]: true }));
      toast('主催者に組分けの変更を依頼しました');
    } catch { toast('送信に失敗しました', 'error'); }
  }

  async function submitAll() {
    if (!allRated || busy) return;
    if (noReview) { toast('レビュー投稿の利用が制限されています。', 'error'); return; }
    setBusy(true);
    track('review_bulk_submit', { count: pending.length });
    try {
      for (const p of pending) {
        const r = get(p.id);
        if (!answered(r)) continue;
        await store.submitReview(p.id, 0, [], undefined, r.verdict || undefined);
        // like を「選んだverdict」に合わせて設定する。外した場合は on:false で静かに解消。
        //   romantic → romantic+again ON ／ again → again ON・romantic OFF
        //   never / either → 両方 OFF（＝過去のagainもここで解除される）
        const wantRomantic = r.verdict === 'romantic';
        const wantAgain = r.verdict === 'romantic' || r.verdict === 'again';
        await setLike(p.roundId, p.revieweeId, 'romantic', wantRomantic);
        await setLike(p.roundId, p.revieweeId, 'again', wantAgain);
      }
      // 別の組の「回ってみたい」（again のみ）を反映。
      for (const w of wannaList) {
        await setLike(w.rid, w.uid, 'again', !!wanna[`${w.rid}::${w.uid}`]);
      }
      await store.refreshNotifications().catch(() => {});
      toast('レビューを送信しました');
    } catch (e) {
      toast('送信失敗: ' + (e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="absolute inset-0 bg-black/50 z-[100] flex flex-col backdrop-blur-sm">
      <div className="bg-card w-full max-w-[400px] mx-auto my-auto h-full sm:h-auto sm:max-h-[94%] rounded-card flex flex-col overflow-hidden shadow-lg">
        {/* ヘッダー（固定） */}
        <div className="px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
          <h3 className="text-lg font-black">ラウンドレビュー</h3>
          <div className="text-[12px] text-sub mt-0.5">同じ組で回った{pending.length}人に「また回りたいか」を選んでください（{ratedCount}/{pending.length}）</div>
          <div className="mt-2.5 px-3 py-2.5 bg-green-light rounded-xl text-[12px] text-green font-bold leading-relaxed">
            🔒 「また回りたい」「異性として気になる」は<u>お互いがマッチした時だけ</u>通知されます。<br />
            相手が選ばなかった場合、あなたの選択が相手に知られることは一切ありません。
          </div>
        </div>

        {/* 本文スクロール */}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
          {pending.map((p) => {
            const target = users.find((u) => u.id === p.revieweeId);
            if (!target) return null;
            const r = get(p.id);
            const opp = isOpp(target);
            return (
              <div key={p.id} className="bg-bg rounded-xl p-3">
                <div className="flex items-center gap-2.5 mb-2">
                  <Avatar user={target} size={40} emojiSize={20} />
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{target.displayName}</div>
                    <div className="text-[11px] text-sub">
                      {target.gender === 'male' ? '👨 男性' : target.gender === 'female' ? '👩 女性' : ''}{target.age ? ` ・ ${target.age}歳` : ''}
                    </div>
                  </div>
                </div>

                <div className="mt-1">
                  <div className="text-[12px] font-black text-center mb-1.5">この人とまた回りたいですか？</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      { key: 'again', label: '🏌️ また回りたい', sel: 'bg-green text-white border-green', show: true },
                      { key: 'romantic', label: '💘 異性として気になる', sel: 'bg-pink-600 text-white border-pink-600', show: opp },
                      { key: 'never', label: '🙇 ごめんなさい', sel: 'bg-[#C0392B] text-white border-[#C0392B]', show: true },
                      { key: 'either', label: '🤷 どっちでもいい', sel: 'bg-[#9b876a] text-white border-[#9b876a]', show: true },
                    ] as const).filter((o) => o.show).map((o) => (
                      <button
                        key={o.key}
                        onClick={() => upd(p.id, { verdict: o.key })}
                        className={cn('py-2.5 rounded-[12px] text-[12px] font-bold border-[1.5px] leading-tight', r.verdict === o.key ? o.sel : 'bg-card border-border text-sub')}
                      >{r.verdict === o.key ? '✓ ' : ''}{o.label}</button>
                    ))}
                  </div>
                  {r.verdict === 'romantic' && (
                    <div className="text-[10px] text-pink-600 font-bold mt-1 text-center">「また一緒に回りたい」も自動で含まれます</div>
                  )}
                </div>
              </div>
            );
          })}

          {/* 組分けの変更を希望（コンペ・一緒に回っていない人がいる場合） */}
          {groupChangeRounds.length > 0 && (
            <div className="bg-[#fbf7f2] border border-dashed border-[#e0c9b0] rounded-xl p-3">
              <div className="text-[11px] text-sub leading-relaxed mb-2">
                このメンバーと実際には一緒に回っていない場合は、主催者に組分けの見直しを依頼できます。
                修正されると、その組のレビューはやり直しになります。
              </div>
              {groupChangeRounds.map((rid) => (
                <button
                  key={rid}
                  onClick={() => requestGroupChange(rid)}
                  disabled={!!reqSent[rid]}
                  className={cn('w-full py-2 rounded-lg text-[12px] font-bold border-[1.5px]', reqSent[rid] ? 'bg-bg border-border text-muted' : 'bg-card border-[#d8a05a] text-[#b06a1e]')}
                >{reqSent[rid] ? '✓ 依頼を送信しました' : '🔀 組分けの変更を希望する'}</button>
              ))}
            </div>
          )}

          {/* 別の組の人（任意・回ってみたい） */}
          {wannaList.length > 0 && (
            <div className="bg-bg rounded-xl p-3">
              <div className="text-[12px] font-black mb-0.5">🏌️ 別の組だった人（任意）</div>
              <div className="text-[10px] text-sub mb-2">一緒には回っていないけど「また回ってみたい」人がいれば。相互で選ぶと繋がります。</div>
              <div className="flex flex-col gap-1.5">
                {wannaList.map(({ rid, uid, user }) => {
                  const k = `${rid}::${uid}`;
                  const on = !!wanna[k];
                  return (
                    <div key={k} className="flex items-center gap-2.5 bg-card rounded-[10px] px-2.5 py-2">
                      {user ? <Avatar user={{ id: uid, displayName: user.displayName, avatar: user.avatar, avatarUrl: user.avatarUrl } as any} size={30} emojiSize={15} /> : <span className="w-[30px] h-[30px] rounded-full bg-bg flex items-center justify-center">⛳</span>}
                      <span className="text-[13px] font-bold truncate flex-1 min-w-0">{user?.displayName || 'メンバー'}</span>
                      <button
                        onClick={() => setWanna((prev) => ({ ...prev, [k]: !on }))}
                        className={cn('px-3 py-1.5 rounded-full text-[11px] font-black border-[1.5px] flex-shrink-0', on ? 'bg-green text-white border-green' : 'bg-card border-border text-sub')}
                      >{on ? '✓ 回ってみたい' : '回ってみたい'}</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 当日来れなかった人（除外） */}
          {noShowList.length > 0 && (
            <div className="bg-bg rounded-xl p-3 opacity-60">
              <div className="text-[12px] font-black mb-1.5 text-sub">🚫 当日来れなかった人（レビュー対象外）</div>
              <div className="flex flex-wrap gap-1.5">
                {noShowList.map(({ uid, user }) => (
                  <span key={uid} className="inline-flex items-center gap-1.5 bg-card border border-border rounded-full pl-1.5 pr-2.5 py-1 text-[11px] font-bold text-sub">
                    {user ? <Avatar user={user} size={20} emojiSize={11} /> : <span>👤</span>}
                    {user?.displayName || 'メンバー'}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 送信（固定） */}
        <div className="px-4 py-3 border-t border-border flex-shrink-0">
          <button
            onClick={submitAll}
            disabled={!allRated || busy}
            className={cn('w-full py-3.5 rounded-xl text-[15px] font-bold', allRated && !busy ? 'bg-green text-white' : 'bg-border text-muted cursor-not-allowed')}
          >
            {busy ? '送信中...' : allRated ? `送信する（${pending.length}人）` : `全員に回答してください（${ratedCount}/${pending.length}）`}
          </button>
        </div>
      </div>
    </div>
  );
}
