'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getMe, store, useStore } from '@/lib/store';
import { toast } from '@/components/Toast';
import { NumberInput } from '@/components/NumberInput';
import { formatDate } from '@/lib/utils';

// ゲスト招待リンクの着地ページ（2026-10-08）。
// liff.line.me?to=/invite/<id>?g=<guestId>&t=<token> から来る。LINE の中でログイン済み・友だち追加の
// 関所（/liff の FriendGate、Messaging API で確認）を通ったあとにここに着く。
// 年齢・性別が未入力ならこの画面で入れてもらい、「参加確定する」でゲストの枠を自分に置き換える。
type Info = {
  status: 'ok' | 'already_member' | 'joined' | 'used' | 'invalid' | 'not_found';
  round?: { id: string; title: string; date: string; dateRange: string; startTime: string; courseName: string; area: string; price: string; eventType: string; status: string; hostName: string };
  guest?: { id: string; name: string; gender: string };
  pickup?: { status: string; stations: string[] } | null;
};

function pickupText(p: Info['pickup']): string {
  if (!p) return '';
  const st = (p.stations || []).join('・');
  if (p.status === 'want') return `🚗 ピックアップ希望${st ? `（${st}）` : ''}`;
  if (p.status === 'can') return `🚗 ピックアップできる${st ? `（${st}）` : ''}`;
  if (p.status === 'no_need' || p.status === 'cannot') return '🚶 自分で行く';
  return '';
}

export default function GuestInvitePage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const g = search?.get('g') || '';
  const t = search?.get('t') || '';
  const hydrated = useStore((s) => s.hydrated);
  const meId = useStore((s) => s.meId);
  const me = useStore(getMe);
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [age, setAge] = useState<number | null>(null);
  const [gender, setGender] = useState<'' | 'male' | 'female'>('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');

  useEffect(() => {
    if (!params?.id) return;
    fetch(`/api/rounds/${params.id}/guest-invite?g=${encodeURIComponent(g)}&t=${encodeURIComponent(t)}`, { cache: 'no-store', credentials: 'include' })
      .then((r) => r.json()).then((j) => setInfo(j)).catch(() => setInfo({ status: 'not_found' }));
  }, [params?.id, g, t]);

  // プロフィールの初期値（LINE の表示名・既存の値）
  useEffect(() => {
    if (!me || me.id === 'me') return;
    setName((v) => v || me.displayName || '');
    setAge((v) => v ?? (me.age ? me.age : null));
    setGender((v) => v || ((me.gender === 'male' || me.gender === 'female') ? me.gender : ''));
    setLastName((v) => v || (me as any).realNameLast || '');
    setFirstName((v) => v || (me as any).realNameFirst || '');
  }, [me]);

  const needProfile = !!meId && (!me?.age || !(me?.gender === 'male' || me?.gender === 'female'));

  async function claim() {
    if (!info?.guest || busy) return;
    setBusy(true);
    try {
      if (needProfile) {
        if (!name.trim()) { toast('表示名を入れてください', 'error'); return; }
        if (!age || age < 18 || age > 99) { toast('年齢を入れてください', 'error'); return; }
        if (!gender) { toast('性別を選んでください', 'error'); return; }
        const body: Record<string, unknown> = { displayName: name.trim().slice(0, 20), age, gender };
        if (lastName.trim()) body.realNameLast = lastName.trim().slice(0, 20);
        if (firstName.trim()) body.realNameFirst = firstName.trim().slice(0, 20);
        const pr = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
        if (!pr.ok) { toast('プロフィールを保存できませんでした', 'error'); return; }
      }
      const res = await fetch(`/api/rounds/${params.id}/guest-invite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ guestId: g, token: t }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast(j?.message || '参加できませんでした', 'error'); return; }
      await store.hydrate().catch(() => {});
      toast(`参加確定になりました（${j?.guestName || info.guest.name}さんの枠）`);
      router.replace(`/round/${params.id}`);
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated || !info) return <div className="p-5 text-center text-sub">読み込み中...</div>;

  const r = info.round;
  const when = r ? [r.date ? formatDate(r.date) : r.dateRange, r.startTime].filter(Boolean).join(' ') : '';
  const where = r ? [r.courseName, r.area].filter(Boolean).join(' ・ ') : '';

  if (info.status === 'invalid' || info.status === 'not_found' || !r) {
    return (
      <div className="p-6 text-center">
        <div className="text-4xl mb-3">🔗</div>
        <div className="text-base font-black mb-2">この招待リンクは使えません</div>
        <div className="text-[13px] text-sub leading-relaxed mb-5">募集が削除されたか、リンクが途中で切れている可能性があります。送ってくれた主催者に確認してください。</div>
        <Link href="/home" className="inline-block px-5 py-2.5 bg-green text-white rounded-xl font-bold text-sm">ホームへ</Link>
      </div>
    );
  }
  if (info.status === 'joined' || info.status === 'already_member' || info.status === 'used') {
    const mine = info.status !== 'used';
    return (
      <div className="p-6 text-center">
        <div className="text-4xl mb-3">{mine ? '✅' : '🔗'}</div>
        <div className="text-base font-black mb-2">{mine ? 'この募集にはもう参加しています' : 'この招待はすでに使われています'}</div>
        <div className="text-[13px] text-sub leading-relaxed mb-5">「{r.title}」{mine ? '' : '。心当たりがない場合は主催者に確認してください。'}</div>
        <Link href={`/round/${r.id}`} className="inline-block px-5 py-2.5 bg-green text-white rounded-xl font-bold text-sm">募集ページを見る</Link>
      </div>
    );
  }

  const pk = pickupText(info.pickup);
  return (
    <div className="p-4 pb-10">
      <div className="bg-card border-2 border-border rounded-2xl p-4 text-center shadow-[2px_2px_0_#1E3A30]">
        <div className="text-[12px] text-sub font-bold">{r.hostName}さんから招待が届いています</div>
        <div className="text-lg font-black mt-1">{r.title}</div>
        <div className="text-[12px] text-sub mt-0.5">{[when, where, r.price].filter(Boolean).join(' ・ ')}</div>
        <div className="inline-block mt-3 px-3 py-1 rounded-full text-[11px] font-black" style={{ background: '#FFF1C9', color: '#8A5A00', border: '1.5px solid #C9A24A' }}>
          👤 {info.guest?.name}さんの枠{pk ? `（${pk}）` : ''}
        </div>
        <div className="text-[11px] text-sub mt-3 leading-relaxed">「参加確定する」を押すと、主催者が用意した{info.guest?.name}さんの枠にあなたが入ります。配車・入金のチェックもそのまま引き継がれます。</div>
      </div>

      {needProfile && (
        <div className="mt-4">
          <div className="text-[13px] font-black mb-2">プロフィール（1分）</div>
          <label className="block text-[11px] font-bold text-sub mb-1">表示名（ニックネーム）</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} className="w-full p-3 border-[1.5px] border-border rounded-xl text-sm bg-bg mb-3" placeholder="例: まなか" />
          <label className="block text-[11px] font-bold text-sub mb-1">年齢</label>
          <NumberInput value={age} onChange={setAge} min={18} max={99} placeholder="例: 26" className="w-full p-3 border-[1.5px] border-border rounded-xl text-sm bg-bg mb-3" ariaLabel="年齢" />
          <label className="block text-[11px] font-bold text-sub mb-1">性別</label>
          <div className="flex gap-2 mb-3">
            {([['male', '👨 男性'], ['female', '👩 女性']] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setGender(v)} className={'flex-1 py-2.5 rounded-xl text-sm font-bold border-[1.5px] ' + (gender === v ? 'bg-green text-white border-green' : 'bg-bg border-border text-sub')}>{l}</button>
            ))}
          </div>
          <label className="block text-[11px] font-bold text-sub mb-1">本名 <span className="text-muted font-medium">（任意・主催者だけに見えます。ゴルフ場の受付用）</span></label>
          <div className="flex gap-2 mb-1">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={20} className="flex-1 min-w-0 p-3 border-[1.5px] border-border rounded-xl text-sm bg-bg" placeholder="姓" />
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={20} className="flex-1 min-w-0 p-3 border-[1.5px] border-border rounded-xl text-sm bg-bg" placeholder="名" />
          </div>
        </div>
      )}

      <button onClick={claim} disabled={busy} className="w-full mt-5 py-3.5 rounded-xl bg-orange text-white font-black text-[15px] border-2 border-[#C24E2C] shadow-[0_3px_0_#C24E2C] disabled:opacity-60">
        {busy ? '処理中…' : needProfile ? '登録して参加確定する' : '参加確定する'}
      </button>
      <div className="text-[11px] text-muted text-center mt-3">ゴルトモは20〜30代限定のゴルフ仲間コミュニティです（登録無料）</div>
    </div>
  );
}
