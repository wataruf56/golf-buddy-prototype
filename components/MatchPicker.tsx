'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/components/Toast';
import { useStore, getMe } from '@/lib/store';

// ラウンドに参加した人を一覧表示し、「また回りたい」「異性として気になる」を
// それぞれ選べるマッチングUI。マッチ（相互に選択）した時だけ双方に通知が
// 届く。片思いの状態は相手に一切知られない。
// 参加者・状態は /api/rounds/[id]/match から取得（自分以外の参加者を返す）。

type MatchEntry = { again: boolean; romantic: boolean; matchedAgain: boolean; matchedRomantic: boolean; sameGroup?: boolean };
type UserInfo = { displayName: string; avatar?: string; avatarUrl?: string; gender?: string; age?: number };

export function MatchPicker({ roundId }: { roundId: string }) {
  const me = useStore(getMe);
  // 「異性として気になる」は異性同士のときだけ。自分と相手の性別が両方あり、かつ異なる場合。
  const isOpp = (g?: string) =>
    (me?.gender === 'male' || me?.gender === 'female') && (g === 'male' || g === 'female') && me.gender !== g;
  const [state, setState] = useState<Record<string, MatchEntry>>({});
  const [users, setUsers] = useState<Record<string, UserInfo>>({});
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/rounds/${roundId}/match`, { cache: 'no-store', credentials: 'include' });
        const d = await res.json();
        if (cancelled || !res.ok) { if (!cancelled) setLoading(false); return; }
        setState(d.state || {});
        setUsers(d.users || {});
        setIds(Object.keys(d.state || {}));
      } catch { /* noop */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [roundId]);

  async function toggle(toUserId: string, kind: 'again' | 'romantic') {
    if (busy) return;
    setBusy(`${toUserId}:${kind}`);
    const cur = state[toUserId] || { again: false, romantic: false, matchedAgain: false, matchedRomantic: false };
    const on = !(kind === 'again' ? cur.again : cur.romantic);
    setState((s) => ({ ...s, [toUserId]: { ...cur, [kind]: on, ...(on ? {} : kind === 'again' ? { matchedAgain: false } : { matchedRomantic: false }) } }));
    try {
      const res = await fetch(`/api/rounds/${roundId}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId, kind, on }),
        cache: 'no-store',
        credentials: 'include',
      });
      const d = await res.json();
      if (res.ok && on && d?.matched) {
        setState((s) => ({ ...s, [toUserId]: { ...(s[toUserId] as MatchEntry), [kind === 'again' ? 'matchedAgain' : 'matchedRomantic']: true } }));
        toast(kind === 'again' ? '🏌️ マッチ成立！「また回りたい」同士です' : '💘 マッチ成立！気になる同士です');
      }
    } catch {
      toast('通信に失敗しました', 'error');
      setState((s) => ({ ...s, [toUserId]: cur }));
    } finally {
      setBusy('');
    }
  }

  if (loading) return <div className="text-center text-[12px] text-muted py-6">読み込み中...</div>;
  if (ids.length === 0) return <div className="text-center text-[12px] text-muted py-6">一緒に回ったメンバーがいません。</div>;

  return (
    <div>
      {/* 注意書き（メモ欄） */}
      <div className="mb-3 px-3 py-2.5 bg-green-light rounded-lg text-[11px] text-green leading-relaxed">
        💡 <b>マッチした時だけ</b>、お互いに「マッチングしました」と通知されます。<br />
        <b>片方がマッチングを希望しなかった場合、相手に知られることはありません。</b><br />
        🔒 同じ組で回った人のレビューは<b>確定済みで変更できません</b>。別の組の「回ってみたい」だけ後から変更できます。
      </div>

      <div className="flex flex-col gap-2.5">
        {ids
          .slice()
          .sort((a, b) => Number((state[b]?.sameGroup) !== false) - Number((state[a]?.sameGroup) !== false))
          .map((id) => {
          const u = users[id] || { displayName: 'メンバー' };
          const e = state[id] || { again: false, romantic: false, matchedAgain: false, matchedRomantic: false, sameGroup: true };
          const same = e.sameGroup !== false; // 別の組(コンペ)は「回ってみたい」(=again)だけ
          const initial = (u.displayName || '?').slice(0, 1);
          return (
            <div key={id} className="p-2.5 bg-bg rounded-[10px]">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center text-[15px] flex-shrink-0">{u.avatar || initial}</span>
                <div className="text-[13px] font-bold flex-1 min-w-0 truncate">
                  {u.displayName}
                  {u.gender === 'male' ? ' 👨' : u.gender === 'female' ? ' 👩' : ''}
                  {u.age ? <span className="text-[11px] text-sub font-medium"> ・{u.age}歳</span> : null}
                </div>
                {!same && <span className="text-[10px] font-bold text-sub bg-card px-2 py-0.5 rounded-full border border-border">別の組</span>}
                {e.matchedAgain && <span className="text-[10px] font-black text-green bg-green-light px-2 py-0.5 rounded-full border border-green">🏌️ マッチ</span>}
                {e.matchedRomantic && <span className="text-[10px] font-black text-pink-600 bg-pink-100 px-2 py-0.5 rounded-full border border-pink-600">💘 マッチ</span>}
              </div>
              {same ? (
                // 同じ組（必須レビュー）は確定済み＝変更不可。現在の選択を表示のみ。
                <>
                  <div className="flex gap-1.5">
                    <div className={'flex-1 px-2 py-2 rounded-full text-[12px] font-bold border-[1.5px] text-center ' + (e.again ? 'bg-green text-white border-green' : 'bg-bg border-border text-muted')}>{e.again ? '✓ ' : ''}🏌️ また回りたい</div>
                    {isOpp(u.gender) && (
                      <div className={'flex-1 px-2 py-2 rounded-full text-[12px] font-bold border-[1.5px] text-center ' + (e.romantic ? 'bg-pink-600 text-white border-pink-600' : 'bg-bg border-border text-muted')}>{e.romantic ? '✓ ' : ''}💘 異性として気になる</div>
                    )}
                  </div>
                  <div className="text-[10px] text-muted mt-1 text-center">🔒 同じ組のレビューは確定済みのため変更できません</div>
                </>
              ) : (
                // 別の組（任意）の「回ってみたい」だけ後から変更できる。
                <div className="flex gap-1.5">
                  <button
                    onClick={() => toggle(id, 'again')}
                    disabled={!!busy}
                    className={'flex-1 px-2 py-2 rounded-full text-[12px] font-bold border-[1.5px] ' + (e.again ? 'bg-green text-white border-green' : 'bg-card border-border text-sub')}
                  >{e.again ? '✓ ' : ''}🏌️ 回ってみたい</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
