'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';

// 「決めること」。集まってから決める3つを、参加している人なら**誰でも**入力できる。
//   ⛳ ゴルフ場（自由入力） / 📅 日時（カレンダー） / 💰 参加費（数値）
//
// 誰が入れたかを残す。「勝手に変えられた」を防ぐため。
// 集合場所と車のことはここでは扱わない——チャットで決めてもらう。
type Member = { id: string; displayName?: string; avatar?: string; avatarUrl?: string; color?: string };
type Decide = {
  course?: string; courseBy?: string; courseAt?: number;
  date?: string; startTime?: string; dateBy?: string; dateAt?: number;
  price?: string; priceBy?: string; priceAt?: number;
};
type Data = { id: string; title: string; stage: string; decide: Decide; members: Member[] };

const fmtAt = (ms?: number) => ms
  ? new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '';

export default function Page() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || '');
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [course, setCourse] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [price, setPrice] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/official/${id}/decide`, { cache: 'no-store', credentials: 'include' });
      if (!r.ok) { setD(null); return; }
      const j: Data = await r.json();
      setD(j);
      setCourse(j.decide.course || ''); setDate(j.decide.date || '');
      setTime(j.decide.startTime || ''); setPrice(j.decide.price || '');
    } catch { setD(null); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch(`/api/official/${id}/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch), credentials: 'include',
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.message || '保存できませんでした');
      toast('保存しました');
      await load();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  async function confirm() {
    setBusy(true);
    try {
      const r = await fetch(`/api/official/${id}/decide`, { method: 'PUT', credentials: 'include' });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.message || '確定できませんでした');
      toast('✅ 確定しました');
      router.push(`/round/${id}`);
    } catch (e) { toast((e as Error).message, 'error'); setConfirmOpen(false); }
    finally { setBusy(false); }
  }

  if (!d) return <div className="p-6 text-sm text-sub">読み込み中...</div>;

  const nameOf = (uid?: string) => d.members.find((m) => m.id === uid)?.displayName || '';
  const done = !!d.decide.course && !!d.decide.date && !!d.decide.price;
  const confirmed = d.stage === 'confirmed';

  return (
    <div className="pb-24">
      <div className="px-5 pt-2 pb-1 flex items-center gap-2">
        <button onClick={() => router.back()} className="text-lg" aria-label="戻る">←</button>
        <span className="text-2xl font-black tracking-tight">決めること</span>
      </div>
      <div className="px-5 text-[12.5px] text-sub font-bold mb-3 leading-relaxed">
        <b className="text-text">参加している{d.members.length}人の誰でも入力できます。</b>
        決まったところから埋めてください。
      </div>

      <div className="px-5">
        <div className="bg-card border-2 border-border rounded-card shadow-card p-4">
          <Field label="⛳ ゴルフ場" by={nameOf(d.decide.courseBy)} at={d.decide.courseAt} req>
            <input value={course} onChange={(e) => setCourse(e.target.value)} disabled={confirmed}
              onBlur={() => course !== (d.decide.course || '') && save({ course })}
              placeholder="コース名を入れてください"
              className="w-full border-2 border-border rounded-xl px-3 py-2.5 text-[14px] font-black bg-white disabled:bg-bg" />
          </Field>

          <Field label="📅 日時" by={nameOf(d.decide.dateBy)} at={d.decide.dateAt} req>
            <div className="flex gap-2">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={confirmed}
                onBlur={() => date !== (d.decide.date || '') && save({ date })}
                className="flex-1 min-w-0 border-2 border-border rounded-xl px-3 py-2.5 text-[13.5px] font-black bg-white disabled:bg-bg" />
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={confirmed}
                onBlur={() => time !== (d.decide.startTime || '') && save({ startTime: time })}
                className="w-[110px] flex-none border-2 border-border rounded-xl px-3 py-2.5 text-[13.5px] font-black bg-white disabled:bg-bg" />
            </div>
          </Field>

          <Field label="💰 参加費（1人）" by={nameOf(d.decide.priceBy)} at={d.decide.priceAt} req>
            <div className="flex items-center gap-2">
              <input inputMode="numeric" value={price} disabled={confirmed}
                onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, ''))}
                onBlur={() => price !== (d.decide.price || '') && save({ price })}
                placeholder="12000"
                className="flex-1 min-w-0 border-2 border-border rounded-xl px-3 py-2.5 text-[14px] font-black bg-white disabled:bg-bg" />
              <span className="text-[13px] font-black text-sub">円</span>
            </div>
          </Field>

          {confirmed ? (
            <div className="mt-4 bg-green-light border-2 border-green rounded-xl p-3 text-[13px] font-black text-green text-center">
              ✅ 確定しました
            </div>
          ) : (
            <>
              <button disabled={busy || !done} onClick={() => setConfirmOpen(true)}
                className={'w-full mt-4 py-3.5 rounded-xl text-[15px] font-black border-2 ' +
                  (done ? 'bg-green text-white border-green' : 'bg-[#EDEDED] text-[#A9A9A9] border-muted')}>
                この内容で確定する
              </button>
              <div className="text-[11.5px] font-bold text-sub text-center mt-2.5 leading-relaxed">
                入力するのはこの3つだけ。<br />
                <b className="text-text">集合場所や車のことは、チャットで決めてください。</b>
              </div>
            </>
          )}
        </div>

        <a href={`/round/${id}/chat`}
          className="block w-full mt-3 py-3 rounded-xl text-[13.5px] font-black border-2 border-border bg-card text-center">
          💬 グループチャットへ
        </a>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 bg-black/45 z-[150] flex items-center justify-center p-5">
          <div className="bg-card border-[3px] border-border rounded-card shadow-lg p-5 w-full max-w-[340px]">
            <div className="text-[17px] font-black text-center leading-snug">この内容で確定しますか？</div>
            <div className="text-[12px] font-bold text-sub text-center mt-1.5 leading-relaxed">
              確定すると<b className="text-text">{d.members.length}人全員が参加している状態</b>で<br />ラウンドが作られます
            </div>
            <div className="border-2 border-border rounded-xl bg-white p-3 mt-3.5 text-[13.5px] font-black leading-relaxed">
              <div>⛳ {d.decide.course}</div>
              <div>📅 {String(d.decide.date).replace(/-/g, '/')}{d.decide.startTime ? ` ${d.decide.startTime}` : ''}</div>
              <div>💰 {Number(d.decide.price).toLocaleString()}円</div>
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                <span>👥</span>{d.members.map((m) => (
                  <span key={m.id} className="text-[12px]">{m.displayName}</span>
                ))}
              </div>
            </div>
            <div className="bg-yellow-light border-2 border-dashed border-border rounded-xl p-2.5 mt-3 text-[12px] font-black text-center leading-relaxed">
              全員に確認しましたか？<br />
              <span className="font-bold text-sub">確定すると全員に通知が届きます</span>
            </div>
            <button disabled={busy} onClick={confirm}
              className="w-full mt-3 py-3.5 rounded-xl text-[15px] font-black border-2 bg-green text-white border-green disabled:opacity-50">
              はい、確定する
            </button>
            <button onClick={() => setConfirmOpen(false)}
              className="w-full mt-2 py-2.5 rounded-xl text-[13px] font-bold border-2 border-hair bg-white text-muted">
              もどる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, by, at, req, children }: {
  label: string; by?: string; at?: number; req?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="mt-3.5 first:mt-0">
      <div className="text-[12.5px] font-black flex items-center gap-1.5 mb-1.5">
        {label}
        {req && <span className="text-[9.5px] font-black bg-red text-white rounded px-1.5 py-0.5">必須</span>}
      </div>
      {children}
      {by && <div className="text-[10.5px] font-bold text-muted mt-1.5">{by}さんが入力（{fmtAt(at)}）</div>}
    </div>
  );
}
