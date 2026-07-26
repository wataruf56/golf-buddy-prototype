'use client';

import { useMemo, useState } from 'react';
import type { Round, User } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { store } from '@/lib/store';
import { toast } from '@/components/Toast';

const MAX_AVOID = 2;

// コンペの組み分け希望。
//  - 参加者本人（主催者以外）：「同じ組は避けたい（最大2人）」「一緒だと嬉しい（最大1人）」を選ぶ。
//    他の参加者の希望は見えない（本人の入力のみ）。
//  - 主催者：全参加者の希望を集計表示（組み分けの参考用）。本人の入力欄は出さない。
export function GroupPrefs({ round, users, meId, isHost }: { round: Round; users: User[]; meId: string; isHost: boolean }) {
  const participantIds = useMemo(
    () => [round.hostId, ...(round.applicantIds || [])].filter(Boolean),
    [round.hostId, round.applicantIds],
  );
  const userOf = (id: string) => users.find((u) => u.id === id);
  const nameOf = (id: string) => userOf(id)?.displayName || 'メンバー';

  if (isHost) return <HostAggregate round={round} participantIds={participantIds} userOf={userOf} nameOf={nameOf} />;
  return <ParticipantEditor round={round} meId={meId} participantIds={participantIds} userOf={userOf} nameOf={nameOf} />;
}

function ParticipantEditor({
  round, meId, participantIds, userOf, nameOf,
}: {
  round: Round; meId: string; participantIds: string[];
  userOf: (id: string) => User | undefined; nameOf: (id: string) => string;
}) {
  const mine = round.groupPrefs?.[meId] || {};
  const [avoid, setAvoid] = useState<string[]>(() => (mine.avoid || []).slice(0, MAX_AVOID));
  const [prefer, setPrefer] = useState<string>(() => mine.prefer || '');
  const [saving, setSaving] = useState(false);

  const candidates = participantIds.filter((id) => id !== meId);

  function toggleAvoid(id: string) {
    setPrefer((p) => (p === id ? '' : p)); // 避けたいと一緒がいいは排他
    setAvoid((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_AVOID) { toast(`避けたい人は最大${MAX_AVOID}人までです`, 'error'); return prev; }
      return [...prev, id];
    });
  }
  function togglePrefer(id: string) {
    setAvoid((prev) => prev.filter((x) => x !== id)); // 排他
    setPrefer((p) => (p === id ? '' : id));
  }

  const changed =
    JSON.stringify([...avoid].sort()) !== JSON.stringify([...(mine.avoid || [])].sort()) ||
    prefer !== (mine.prefer || '');

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/rounds/${round.id}/group-prefs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avoid, prefer: prefer || undefined }), cache: 'no-store',
      });
      if (!res.ok) throw new Error(`${res.status}`);
      await store.refreshRounds().catch(() => {});
      toast('組み分けの希望を保存しました');
    } catch (e) { toast('保存に失敗しました: ' + (e as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  if (candidates.length === 0) {
    return <div className="text-center text-sub text-sm py-6">他の参加者が増えると、組み分けの希望を出せます。</div>;
  }

  return (
    <div className="bg-card rounded-card p-4 shadow-card mb-4">
      <div className="text-[13px] font-black mb-1">🙋 組み分けの希望</div>
      <div className="text-[11px] text-sub mb-3 leading-relaxed">
        <b>避けたい人（最大2人）</b>と<b>一緒だと嬉しい人（1人）</b>を選べます。<br />
        この内容は<b className="text-text">主催者だけ</b>が見ます（他の参加者には見えません）。組み分けの参考にされます。
      </div>
      <div className="flex flex-col gap-1.5">
        {candidates.map((id) => {
          const u = userOf(id);
          const isAvoid = avoid.includes(id);
          const isPrefer = prefer === id;
          return (
            <div key={id} className="flex items-center gap-2 p-2 bg-bg rounded-[10px]">
              {u ? <Avatar user={u} size={32} /> : <div className="w-8 h-8 rounded-full bg-card" />}
              <div className="flex-1 min-w-0 text-[13px] font-semibold truncate">{nameOf(id)}</div>
              <button
                type="button"
                onClick={() => togglePrefer(id)}
                className={'px-2.5 py-1.5 rounded-lg text-[11px] font-bold border-[1.5px] flex-shrink-0 ' + (isPrefer ? 'bg-green text-white border-green' : 'bg-card border-border text-sub')}
              >🙆 一緒がいい</button>
              <button
                type="button"
                onClick={() => toggleAvoid(id)}
                className={'px-2.5 py-1.5 rounded-lg text-[11px] font-bold border-[1.5px] flex-shrink-0 ' + (isAvoid ? 'bg-red-500 text-white border-red-500' : 'bg-card border-border text-sub')}
              >🙅 避けたい</button>
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 text-[11px] font-bold text-sub">
        避けたい {avoid.length}/{MAX_AVOID}人 ・ 一緒がいい {prefer ? '1' : '0'}/1人
      </div>
      <button
        onClick={save}
        disabled={saving || !changed}
        className="w-full mt-2 py-3 bg-green text-white rounded-xl text-sm font-black disabled:opacity-50"
      >{saving ? '保存中…' : changed ? '希望を保存する' : '保存済み'}</button>
    </div>
  );
}

function HostAggregate({
  round, participantIds, userOf, nameOf,
}: {
  round: Round; participantIds: string[];
  userOf: (id: string) => User | undefined; nameOf: (id: string) => string;
}) {
  const prefs = round.groupPrefs || {};
  const entries = participantIds
    .filter((id) => id !== round.hostId) // 主催者本人の希望は出さない
    .map((id) => ({ id, pref: prefs[id] }))
    .filter((e) => e.pref && ((e.pref.avoid && e.pref.avoid.length) || e.pref.prefer));

  return (
    <div className="bg-card rounded-card p-4 shadow-card mb-4">
      <div className="text-[13px] font-black mb-1">🙋 参加者の組み分け希望（主催者のみ表示）</div>
      <div className="text-[11px] text-sub mb-3 leading-relaxed">
        各参加者が出した「避けたい人／一緒だと嬉しい人」です。組み分けの参考にしてください（強制ではありません）。
      </div>
      {entries.length === 0 ? (
        <div className="text-center text-sub text-sm py-5">まだ希望を出した参加者はいません。</div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map(({ id, pref }) => {
            const u = userOf(id);
            return (
              <div key={id} className="bg-bg rounded-xl p-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  {u ? <Avatar user={u} size={26} /> : <div className="w-[26px] h-[26px] rounded-full bg-card" />}
                  <span className="text-[13px] font-bold">{nameOf(id)}</span>
                </div>
                <div className="flex flex-col gap-1 pl-0.5">
                  {pref?.prefer && (
                    <div className="text-[12px]"><span className="font-bold text-green">🙆 一緒がいい：</span>{nameOf(pref.prefer)}</div>
                  )}
                  {pref?.avoid && pref.avoid.length > 0 && (
                    <div className="text-[12px]"><span className="font-bold text-red-500">🙅 避けたい：</span>{pref.avoid.map(nameOf).join('・')}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
