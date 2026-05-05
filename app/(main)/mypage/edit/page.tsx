'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMe, store, useStore } from '@/lib/store';
import { allAreas, levelOptions } from '@/lib/mockData';

const playStyles = ['のんびり派', 'エンジョイ派', 'サクサク派', '研究派', 'ガチ派'];
const frequencies = ['月1回', '月2回', '月3回', '月4回以上'];
const avatars = ['⛳', '🧑', '👩', '👨', '🧔', '👱', '🧓', '🤠'];

export default function ProfileEditPage() {
  const router = useRouter();
  const me = useStore(getMe);

  const [displayName, setDisplayName] = useState(me.displayName);
  const [age, setAge] = useState(me.age);
  const [area, setArea] = useState(me.area);
  const [scoreRange, setScoreRange] = useState(me.scoreRange);
  const [playStyle, setPlayStyle] = useState(me.playStyle);
  const [frequency, setFrequency] = useState(me.frequency);
  const [avatar, setAvatar] = useState(me.avatar);

  function save() {
    store.updateMe({ displayName, age, area, scoreRange, playStyle, frequency, avatar });
    router.push('/mypage');
  }

  return (
    <div className="px-5 py-3">
      <button onClick={() => router.back()} className="text-sm text-blue font-semibold mb-4">← 戻る</button>
      <div className="text-2xl font-black mb-5">プロフィール編集</div>

      <div className="bg-card rounded-card p-5 shadow-card">
        <div className="mb-4">
          <label className="block text-xs font-bold text-sub mb-1.5">アバター</label>
          <div className="flex gap-2 flex-wrap">
            {avatars.map((a) => (
              <button
                key={a}
                onClick={() => setAvatar(a)}
                className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl border-[1.5px] ${
                  avatar === a ? 'border-green bg-green-light' : 'border-border bg-bg'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <Field label="表示名">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none" />
        </Field>

        <Field label="年齢">
          <input type="number" min={18} max={99} value={age} onChange={(e) => setAge(parseInt(e.target.value) || 0)} className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none" />
        </Field>

        <Field label="エリア">
          <select value={area} onChange={(e) => setArea(e.target.value)} className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none">
            {allAreas.map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>

        <Field label="スコア帯">
          <select value={scoreRange} onChange={(e) => setScoreRange(e.target.value)} className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none">
            {['90以下', '90〜100', '100〜110', '105〜115', '110〜120', '120以上'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>

        <Field label="プレースタイル">
          <div className="flex gap-1.5 flex-wrap">
            {playStyles.map((s) => (
              <button key={s} onClick={() => setPlayStyle(s)} className={`px-3.5 py-2 text-xs font-bold rounded-full border-[1.5px] ${playStyle === s ? 'bg-green-light border-green text-green' : 'bg-bg border-border text-sub'}`}>{s}</button>
            ))}
          </div>
        </Field>

        <Field label="プレー頻度">
          <div className="flex gap-1.5 flex-wrap">
            {frequencies.map((f) => (
              <button key={f} onClick={() => setFrequency(f)} className={`px-3.5 py-2 text-xs font-bold rounded-full border-[1.5px] ${frequency === f ? 'bg-green-light border-green text-green' : 'bg-bg border-border text-sub'}`}>{f}</button>
            ))}
          </div>
        </Field>

        <button onClick={save} className="w-full py-4 bg-green text-white rounded-xl text-[15px] font-bold mt-4">
          保存する
        </button>
      </div>
      <div className="h-5" />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-bold text-sub mb-1.5">{label}</label>
      {children}
    </div>
  );
}
