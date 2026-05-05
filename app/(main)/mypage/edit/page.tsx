'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMe, store, useStore } from '@/lib/store';
import { toast } from '@/components/Toast';
import { Avatar } from '@/components/Avatar';
import { track } from '@/lib/telemetry';
import { allAreas } from '@/lib/mockData';

const playStyles = ['のんびり派', 'エンジョイ派', 'サクサク派', '研究派', 'ガチ派'];
const frequencies = ['月1回', '月2回', '月3回', '月4回以上'];
const avatars = ['⛳', '🧑', '👩', '👨', '🧔', '👱', '🧓', '🤠'];
const scoreRanges = ['90以下', '90〜100', '100〜110', '105〜115', '110〜120', '120以上'];

export default function ProfileEditPage() {
  const router = useRouter();
  const me = useStore(getMe);

  const [displayName, setDisplayName] = useState(me.displayName);
  const [age, setAge] = useState<string>(me.age ? String(me.age) : '');
  const [area, setArea] = useState(me.area || '');
  const [scoreRange, setScoreRange] = useState(me.scoreRange || '');
  const [playStyle, setPlayStyle] = useState(me.playStyle || '');
  const [frequency, setFrequency] = useState(me.frequency || '');
  const [avatar, setAvatar] = useState(me.avatar || '⛳');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(me.avatarUrl);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    track('photo_pick', { name: file.name, size: file.size, type: file.type });
    if (!file.type.startsWith('image/')) {
      track('photo_pick_invalid_type');
      toast('画像ファイルを選んでください', 'error');
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await resizeToDataUrl(file, 320, 0.7);
      setAvatarUrl(dataUrl);
      track('photo_resize_success', { dataUrlLength: dataUrl.length });
      toast('写真を取り込みました（保存ボタンで確定）');
    } catch (e) {
      track('photo_resize_error', { message: (e as Error).message });
      toast('読み込み失敗: ' + (e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function clearPhoto() {
    setAvatarUrl(undefined);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function save() {
    track('profile_save_click', {
      displayName, age, area, scoreRange, playStyle, frequency, avatar,
      hasAvatarUrl: !!avatarUrl, avatarUrlLength: avatarUrl?.length || 0,
    });
    try {
      const ageNum = age ? parseInt(age, 10) : 0;
      await store.updateMe({
        displayName, age: ageNum, area, scoreRange, playStyle, frequency, avatar,
        avatarUrl: avatarUrl || '',
      });
      track('profile_save_success', { displayName });
      toast('保存しました');
      track('profile_save_navigate_attempt');
      router.push('/mypage');
      track('profile_save_navigate_called');
    } catch (e) {
      track('profile_save_error', { message: (e as Error).message });
      toast('保存失敗: ' + (e as Error).message, 'error');
    }
  }

  return (
    <div className="px-5 py-3">
      <button onClick={() => router.back()} className="text-sm text-blue font-semibold mb-4">← 戻る</button>
      <div className="text-2xl font-black mb-5">プロフィール編集</div>

      <div className="bg-card rounded-card p-5 shadow-card">
        <div className="mb-5">
          <label className="block text-xs font-bold text-sub mb-2">プロフィール写真</label>
          <div className="flex items-center gap-4">
            <Avatar user={{ avatar, avatarUrl, color: me.color }} size={72} emojiSize={36} />
            <div className="flex-1 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="px-4 py-2.5 bg-green text-white rounded-lg text-sm font-bold disabled:opacity-50"
              >
                {busy ? '読み込み中...' : avatarUrl ? '写真を変更' : '写真をアップロード'}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="px-4 py-2 bg-bg text-sub rounded-lg text-xs font-bold"
                >
                  写真を削除（絵文字に戻す）
                </button>
              )}
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>

        {!avatarUrl && (
          <div className="mb-4">
            <label className="block text-xs font-bold text-sub mb-1.5">絵文字アバター（写真未設定時）</label>
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
        )}

        <Field label="表示名">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none" />
        </Field>

        <Field label="年齢" hint="（任意）">
          <input
            type="number"
            inputMode="numeric"
            min={18}
            max={99}
            placeholder="例: 32"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none"
          />
        </Field>

        <Field label="エリア" hint="（任意）">
          <select value={area} onChange={(e) => setArea(e.target.value)} className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none">
            <option value="">未設定</option>
            {allAreas.map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>

        <Field label="スコア帯" hint="（任意）">
          <select value={scoreRange} onChange={(e) => setScoreRange(e.target.value)} className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none">
            <option value="">未設定</option>
            {scoreRanges.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>

        <Field label="プレースタイル" hint="（任意）">
          <div className="flex gap-1.5 flex-wrap">
            {playStyles.map((s) => (
              <button key={s} onClick={() => setPlayStyle(playStyle === s ? '' : s)} className={`px-3.5 py-2 text-xs font-bold rounded-full border-[1.5px] ${playStyle === s ? 'bg-green-light border-green text-green' : 'bg-bg border-border text-sub'}`}>{s}</button>
            ))}
          </div>
        </Field>

        <Field label="プレー頻度" hint="（任意）">
          <div className="flex gap-1.5 flex-wrap">
            {frequencies.map((f) => (
              <button key={f} onClick={() => setFrequency(frequency === f ? '' : f)} className={`px-3.5 py-2 text-xs font-bold rounded-full border-[1.5px] ${frequency === f ? 'bg-green-light border-green text-green' : 'bg-bg border-border text-sub'}`}>{f}</button>
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-bold text-sub mb-1.5">
        {label}{hint && <span className="text-muted font-medium ml-1">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

async function resizeToDataUrl(file: File, maxSize: number, quality: number): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const ratio = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * ratio));
    const h = Math.max(1, Math.round(img.naturalHeight * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unsupported');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}
