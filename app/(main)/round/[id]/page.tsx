'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { store, useStore } from '@/lib/store';
import { toast } from '@/components/Toast';
import { formatDate } from '@/lib/utils';

export default function RoundDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const round = useStore((s) => s.rounds.find((r) => r.id === params.id));
  const users = useStore((s) => s.users);
  const meId = useStore((s) => s.meId);

  if (!round) {
    return (
      <div className="p-5 text-center text-sub">募集が見つかりません</div>
    );
  }

  const host = users.find((u) => u.id === round.hostId);
  const applicants = round.applicantIds.map((id) => users.find((u) => u.id === id)).filter(Boolean);
  const pendingApplicants = (round.pendingApplicantIds || []).map((id) => users.find((u) => u.id === id)).filter(Boolean);
  const isHost = round.hostId === meId;
  const isApproved = round.applicantIds.includes(meId);
  const isPending = (round.pendingApplicantIds || []).includes(meId);
  const isFull = round.currentCount >= round.maxSpots;
  const remaining = round.maxSpots - round.currentCount;
  const isComp = round.maxSpots >= 5;
  const dateLabel = round.dateType === 'range' ? round.dateRange : formatDate(round.date);

  async function join() {
    try {
      await store.joinRound(round!.id);
      toast('参加申請を送信しました');
    } catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }
  async function close() {
    if (!confirm('この募集を閉じますか？')) return;
    try {
      await store.closeRound(round!.id);
      toast('募集を閉じました');
      router.push('/home');
    } catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }
  async function complete() {
    if (!confirm('ラウンドを完了しますか？\n参加者全員にレビュー依頼が送られます。')) return;
    try {
      await store.completeRound(round!.id);
      toast('ラウンド完了');
      router.push('/home');
    } catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }
  async function approve(userId: string) {
    try { await store.approveApplicant(round!.id, userId); toast('承認しました'); }
    catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }
  async function reject(userId: string) {
    if (!confirm('この申請を断りますか？')) return;
    try { await store.rejectApplicant(round!.id, userId); toast('却下しました'); }
    catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }

  return (
    <div className="px-5 py-3">
      <button onClick={() => router.back()} className="text-sm text-blue font-semibold mb-4">← 戻る</button>

      <div className="bg-card rounded-card p-5 shadow-card">
        {isComp && (
          <span className="inline-block px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-orange text-white mb-3">🏆 コンペ・イベント</span>
        )}
        <div className="text-xl font-black mb-4">{round.title}</div>

        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <Cell label="日時">{dateLabel} {round.startTime || ''}</Cell>
          <Cell label={round.type === 'confirmed' ? 'コース' : 'エリア'}>{round.type === 'confirmed' ? round.courseName : round.area}</Cell>
          <Cell label="レベル">{round.levelCondition}</Cell>
          <Cell label="費用目安">{round.price || '—'}</Cell>
        </div>

        {isComp && (
          <div className="mb-4">
            <div className="flex justify-between items-baseline mb-1.5">
              <span className="text-xs font-semibold text-sub">参加状況</span>
              <span className="text-sm font-black text-orange">{round.currentCount}/{round.maxSpots}人 参加中</span>
            </div>
            <div className="w-full h-2 bg-bg rounded overflow-hidden">
              <div className="h-full bg-orange rounded" style={{ width: `${Math.round((round.currentCount / round.maxSpots) * 100)}%` }} />
            </div>
          </div>
        )}

        {round.description && (
          <div className="mb-4 p-3 bg-bg rounded-xl text-[13px] text-text leading-relaxed">{round.description}</div>
        )}

        {host && (
          <div className="mb-4">
            <div className="text-[13px] font-bold mb-2">主催者</div>
            <Link href={`/profile/${host.id}`} className="flex items-center gap-2.5 p-3 bg-bg rounded-xl">
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-2xl" style={{ background: `${host.color}22` }}>{host.avatar}</div>
              <div className="flex-1">
                <div className="text-sm font-bold">{host.displayName}</div>
                <div className="text-[11px] text-sub">{host.age}歳 ・ {host.scoreRange} ・ {host.playStyle}</div>
              </div>
              <div className="text-right">
                <div className="text-base font-black text-green">★{host.reviewAvg}</div>
                <div className="text-[10px] text-muted">{host.reviewCount}件</div>
              </div>
            </Link>
          </div>
        )}

        {applicants.length > 0 && (
          <div className="mb-4">
            <div className="text-[13px] font-bold mb-2">参加確定（{applicants.length}名）</div>
            {applicants.map((u) => u && (
              <Link href={`/profile/${u.id}`} key={u.id} className="flex items-center gap-2.5 p-2.5 bg-bg rounded-[10px] mb-1.5">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg" style={{ background: `${u.color}22` }}>{u.avatar}</div>
                <div className="flex-1 text-[13px] font-semibold">{u.displayName}</div>
                <div className="text-xs text-green font-bold">★{u.reviewAvg}</div>
              </Link>
            ))}
          </div>
        )}

        {isHost && pendingApplicants.length > 0 && (
          <div className="mb-4">
            <div className="text-[13px] font-bold mb-2">申請中（{pendingApplicants.length}名）— 承認/却下を選んでください</div>
            {pendingApplicants.map((u) => u && (
              <div key={u.id} className="flex items-center gap-2 p-2.5 bg-yellow-light rounded-[10px] mb-1.5">
                <Link href={`/profile/${u.id}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0" style={{ background: `${u.color}22` }}>{u.avatar}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">{u.displayName}</div>
                    <div className="text-[10px] text-sub">★{u.reviewAvg}（{u.reviewCount}件）</div>
                  </div>
                </Link>
                <button onClick={() => approve(u.id)} className="px-3 py-1.5 bg-green text-white rounded-lg text-xs font-bold flex-shrink-0">承認</button>
                <button onClick={() => reject(u.id)} className="px-3 py-1.5 bg-card text-sub border border-border rounded-lg text-xs font-bold flex-shrink-0">却下</button>
              </div>
            ))}
          </div>
        )}

        {isHost ? (
          <div className="space-y-2 mt-4">
            <button onClick={complete} className="w-full py-4 bg-green text-white rounded-xl text-[15px] font-bold">ラウンド完了</button>
            <button onClick={close} className="w-full py-3 bg-bg text-sub rounded-xl text-sm font-bold">募集を閉じる</button>
          </div>
        ) : isApproved ? (
          <div className="text-center py-3 bg-green-light text-green rounded-xl text-sm font-bold mt-2">✅ 参加確定</div>
        ) : isPending ? (
          <div className="text-center py-3 bg-yellow-light text-orange rounded-xl text-sm font-bold mt-2">⏳ 承認待ち</div>
        ) : isFull ? (
          <div className="text-center py-3 bg-bg text-muted rounded-xl text-sm font-bold mt-2">満員のため受付終了</div>
        ) : (
          <>
            <button onClick={join} className="w-full py-4 bg-green text-white rounded-xl text-[15px] font-bold mt-2">
              参加を申請する（残り{remaining}枠）
            </button>
            <div className="text-[11px] text-muted text-center mt-2">主催者が承認するまでお待ちください</div>
          </>
        )}
      </div>
      <div className="h-5" />
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg rounded-[10px] p-3">
      <div className="text-[10px] text-muted mb-1">{label}</div>
      <div className="text-sm font-bold">{children}</div>
    </div>
  );
}
