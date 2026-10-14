'use client';

// 公開範囲（みんなに公開／招待した人だけ）と、招待する人を選ぶピッカー（2026-10-14）。
// 募集を作る画面（ラウンド・イベント共通）で使う。候補は /api/me/invite-candidates
// （ゴル友＝友達リスト／同じ組で回ったことがある人・同じ年代だけ）。
import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { cn } from '@/lib/utils';
import type { RoundVisibility } from '@/lib/types';

export type InviteCandidate = {
  id: string;
  displayName: string;
  avatar: string;
  avatarUrl?: string;
  age?: number;
  gender?: string;
  car?: string;
  lastActiveAt?: number;
  tags: ('friend' | 'group')[];
};

type Accent = 'green' | 'purple';

// 色（ラウンド＝緑／イベント＝紫）。紫は tailwind に無いので任意値で持つ。
const ACCENT: Record<Accent, { on: string; text: string; check: string; chip: string }> = {
  green: { on: 'border-green bg-green-light', text: 'text-green', check: 'bg-green border-green text-white', chip: 'bg-green text-white border-green' },
  purple: { on: 'border-[#7B5CD6] bg-[#EFEAFF]', text: 'text-[#7B5CD6]', check: 'bg-[#7B5CD6] border-[#7B5CD6] text-white', chip: 'bg-[#7B5CD6] text-white border-[#7B5CD6]' },
};

/** 「👀 誰に見せる？（公開範囲）」のカード。招待した人だけ を選ぶとピッカーが出る。 */
export function VisibilityCard({
  visibility, onVisibility, inviteIds, onInviteIds, accent = 'green',
}: {
  visibility: RoundVisibility;
  onVisibility: (v: RoundVisibility) => void;
  inviteIds: string[];
  onInviteIds: (ids: string[]) => void;
  accent?: Accent;
}) {
  const a = ACCENT[accent];
  const opts: { key: RoundVisibility; icon: string; label: string; sub: string }[] = [
    { key: 'public', icon: '🌐', label: 'みんなに公開', sub: 'さがす・ホーム・タイムラインに出る（今までどおり）' },
    { key: 'invite', icon: '🔒', label: '招待した人だけ', sub: '選んだ人にだけ招待状が届く。ほかの人には募集があること自体が見えない' },
  ];
  return (
    <div className="mb-4">
      <label className="block text-xs font-bold text-sub mb-1.5">👀 誰に見せる？（公開範囲）</label>
      <div className="flex flex-col gap-2">
        {opts.map((o) => {
          const on = visibility === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onVisibility(o.key)}
              className={cn('w-full flex items-center gap-3 p-3 rounded-[12px] border-[1.5px] text-left', on ? a.on : 'border-border bg-bg')}
            >
              <span className="text-xl flex-shrink-0">{o.icon}</span>
              <span className="flex-1 min-w-0">
                <span className={cn('block text-sm font-black', on ? a.text : 'text-text')}>{o.label}</span>
                <span className="block text-[10px] text-sub font-medium mt-0.5 leading-relaxed">{o.sub}</span>
              </span>
              <span className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0', on ? (accent === 'purple' ? 'border-[#7B5CD6]' : 'border-green') : 'border-border')}>
                {on && <span className={cn('w-2.5 h-2.5 rounded-full', accent === 'purple' ? 'bg-[#7B5CD6]' : 'bg-green')} />}
              </span>
            </button>
          );
        })}
      </div>
      {visibility === 'invite' && <InvitePicker value={inviteIds} onChange={onInviteIds} accent={accent} />}
    </div>
  );
}

/** 招待する人を選ぶ（すべて／友達／同じ組・名前で探す・チェックで選ぶ）。 */
export function InvitePicker({ value, onChange, accent = 'green' }: { value: string[]; onChange: (ids: string[]) => void; accent?: Accent }) {
  const a = ACCENT[accent];
  const [list, setList] = useState<InviteCandidate[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<'all' | 'friend' | 'group'>('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/me/invite-candidates', { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (alive) setList(Array.isArray(d?.candidates) ? d.candidates : []); })
      .catch(() => { if (alive) { setFailed(true); setList([]); } });
    return () => { alive = false; };
  }, []);

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return (list || []).filter((c) => (filter === 'all' || c.tags.includes(filter)) && (!kw || c.displayName.toLowerCase().includes(kw)));
  }, [list, filter, q]);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="mt-3 p-3 rounded-[12px] border-[1.5px] border-border bg-card">
      <div className="text-[12px] font-black mb-2">📮 招待する人</div>
      {list === null ? (
        <div className="py-4 text-center text-[11px] text-muted font-bold">読み込み中…</div>
      ) : list.length === 0 ? (
        <div className="px-3 py-3 bg-bg rounded-lg text-[11px] text-sub font-medium leading-relaxed">
          {failed
            ? '招待できる人を読み込めませんでした。時間をおいて開き直してください。'
            : '招待できる人がまだいません。ゴル友（QR・友達申請・お互いに『行きたい』）か、同じ組で回ったことがある人を招待できます'}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {([['all', 'すべて'], ['friend', '🤝 友達'], ['group', '⛳ 同じ組']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFilter(k)}
                className={cn('px-3 py-1 rounded-full border-[1.5px] text-[11px] font-black', filter === k ? a.chip : 'border-border bg-bg text-sub')}>
                {label}
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value.slice(0, 30))}
            placeholder="🔍 名前で探す"
            className="w-full mb-2 px-3 py-2 border-[1.5px] border-border rounded-[10px] text-[13px] bg-bg outline-none"
          />
          <div className="flex flex-col max-h-72 overflow-y-auto">
            {shown.length === 0 ? (
              <div className="py-3 text-center text-[11px] text-muted font-bold">当てはまる人がいません</div>
            ) : shown.map((c) => {
              const on = value.includes(c.id);
              const meta = [c.age ? `${c.age}歳` : '', c.car === 'have' ? '車あり🚗' : ''].filter(Boolean).join('・');
              return (
                <button key={c.id} type="button" onClick={() => toggle(c.id)}
                  className="flex items-center gap-2.5 py-2 border-b border-hair last:border-b-0 text-left">
                  <Avatar user={{ avatar: c.avatar, avatarUrl: c.avatarUrl } as any} size={36} />
                  <span className="flex-1 min-w-0">
                    <span className="text-sm font-black text-text">{c.displayName}</span>
                    {meta && <span className="ml-1.5 text-[11px] text-sub font-medium">{meta}</span>}
                    <span className="block text-[10px] text-muted font-bold">
                      {[c.tags.includes('friend') ? '🤝 友達' : '', c.tags.includes('group') ? '⛳ 同じ組' : ''].filter(Boolean).join('　')}
                    </span>
                  </span>
                  <span className={cn('w-6 h-6 rounded-md flex items-center justify-center text-[13px] font-black flex-shrink-0 border-2', on ? a.check : 'bg-card border-border text-transparent')}>✓</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      <div className={cn('mt-2 text-[11px] font-black', value.length ? a.text : 'text-muted')}>{value.length}人を選択中</div>
    </div>
  );
}
