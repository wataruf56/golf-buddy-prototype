'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getMe, store, useStore } from '@/lib/store';
import { toast } from '@/components/Toast';
import { Avatar } from '@/components/Avatar';
import { track } from '@/lib/telemetry';
import { allAreas } from '@/lib/mockData';
import { GOLMOTI_TYPES, getGolmotiType, golmotiImg } from '@/lib/golmoti';
import type { Gender, CarStatus, ScoreEntry } from '@/lib/types';

const playStyles = [
  'のんびり派', 'エンジョイ派', 'サクサク派', '研究派', 'ガチ派',
  '飲み会も楽しむ', '練習熱心', 'コンペ志向', '健康・運動目的', '初心者歓迎', 'マナー重視',
];
const frequencies = [
  '月1回未満', '月1回', '月2回', '月3回', '月4回以上', '週1回以上', 'ほぼ毎日',
];
const avatars = ['⛳', '🧑', '👩', '👨', '🧔', '👱', '🧓', '🤠'];
const scoreRanges = [
  'ラウンド未経験',
  'ラウンド数回',
  '70台',
  '80台',
  '90台',
  '100台',
  '110台',
  '120台',
  '130台',
  '140以上',
];
const genderOptions: { id: Gender; label: string }[] = [
  { id: 'male', label: '男性' },
  { id: 'female', label: '女性' },
  { id: 'other', label: 'その他' },
];
const carOptions: { id: CarStatus; label: string }[] = [
  { id: 'have', label: '🚗 あり' },
  { id: 'none', label: 'なし' },
];
const golfHistoryOptions = ['1年未満', '1〜3年', '3〜5年', '5〜10年', '10年以上'];

export default function ProfileEditPage() {
  const router = useRouter();
  const search = useSearchParams();
  // Allow callers (e.g. the round-detail page when a friend without a profile
  // taps "join") to specify where to bounce after save. Restricted to
  // same-origin paths to avoid open-redirect abuse.
  const returnToRaw = search?.get('returnTo') || '';
  const returnTo = returnToRaw.startsWith('/') && !returnToRaw.startsWith('//') ? returnToRaw : '';
  const hydrated = useStore((s) => s.hydrated);
  const me = useStore(getMe);
  const meId = useStore((s) => s.meId);
  // Once hydration completes we can populate the form. If meId is missing
  // (e.g. transient session loading) we still allow the form so the user
  // isn't blocked — saves are gated separately by the API auth check.
  const meLoaded = hydrated;

  const [displayName, setDisplayName] = useState('');
  const [realNameLast, setRealNameLast] = useState('');
  const [realNameFirst, setRealNameFirst] = useState('');
  const [age, setAge] = useState<string>('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [car, setCar] = useState<CarStatus | ''>('');
  const [bio, setBio] = useState('');
  const [area, setArea] = useState('');
  const [scoreRange, setScoreRange] = useState('');
  const [playStyle, setPlayStyle] = useState('');
  const [golmotiType, setGolmotiType] = useState('');
  const [golmotiOpen, setGolmotiOpen] = useState(false);
  const [frequency, setFrequency] = useState('');
  const [recentScores, setRecentScores] = useState<ScoreEntry[]>([]);
  const [golfHistory, setGolfHistory] = useState('');
  const [avatar, setAvatar] = useState('⛳');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [initialized, setInitialized] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Hydrate form state from store EXACTLY ONCE, after the real user record arrives.
  useEffect(() => {
    if (!meLoaded || initialized) return;
    setDisplayName(me.displayName || '');
    setRealNameLast(me.realNameLast || '');
    setRealNameFirst(me.realNameFirst || '');
    setAge(me.age ? String(me.age) : '');
    setGender(me.gender || '');
    setCar(me.car || '');
    setBio(me.bio || '');
    setArea(me.area || '');
    setScoreRange(me.scoreRange || '');
    setPlayStyle(me.playStyle || '');
    setGolmotiType(me.golmotiType || '');
    setFrequency(me.frequency || '');
    setRecentScores(Array.isArray(me.recentScores) ? me.recentScores : []);
    setGolfHistory(me.golfHistory || '');
    setAvatar(me.avatar || '⛳');
    setAvatarUrl(me.avatarUrl || undefined);
    setInitialized(true);
    track('profile_edit_initialized', {
      hydrated, meId, meIdInStore: me.id,
      displayName: me.displayName, age: me.age, area: me.area,
      hasAvatarUrl: !!me.avatarUrl,
    });
  }, [meLoaded, initialized, me.id, me.displayName, me.age, me.area, me.scoreRange, me.playStyle, me.frequency, me.avatar, me.avatarUrl]);

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
    if (!initialized) {
      track('profile_save_blocked_uninitialized');
      toast('読み込み中です。少し待ってください', 'error');
      return;
    }
    const missing: string[] = [];
    if (!displayName.trim()) missing.push('表示名');
    if (!age || parseInt(age, 10) <= 0) missing.push('年齢');
    if (!gender) missing.push('性別');
    if (!car) missing.push('車');
    if (!area) missing.push('エリア');
    if (!scoreRange) missing.push('スコア帯');
    if (!golfHistory) missing.push('ゴルフ歴');
    if (missing.length) {
      toast(`必須項目を入力してください: ${missing.join('・')}`, 'error');
      return;
    }
    track('profile_save_click', {
      displayName, age, area, scoreRange, playStyle, frequency, avatar,
      hasAvatarUrl: !!avatarUrl, avatarUrlLength: avatarUrl?.length || 0,
    });
    try {
      const ageNum = age ? parseInt(age, 10) : 0;
      const cleanedScores = recentScores
        .filter((s) => s.score > 0 && s.date)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 10);
      await store.updateMe({
        displayName,
        realNameLast: realNameLast.trim(),
        realNameFirst: realNameFirst.trim(),
        age: ageNum,
        gender: (gender || undefined) as Gender | undefined,
        car: (car || undefined) as CarStatus | undefined,
        bio,
        area, scoreRange, playStyle, frequency, avatar,
        golmotiType: golmotiType || '',
        avatarUrl: avatarUrl || '',
        recentScores: cleanedScores,
        golfHistory,
      });
      track('profile_save_success', { displayName });
      toast('保存しました');
      track('profile_save_navigate_attempt', { returnTo });
      router.push(returnTo || '/mypage');
      track('profile_save_navigate_called');
    } catch (e) {
      track('profile_save_error', { message: (e as Error).message });
      toast('保存失敗: ' + (e as Error).message, 'error');
    }
  }

  if (!initialized) {
    return (
      <div className="px-5 py-3">
        <button onClick={() => router.back()} className="text-sm text-blue font-semibold mb-4">← 戻る</button>
        <div className="text-2xl font-black mb-5">プロフィール編集</div>
        <div className="bg-card rounded-card p-12 shadow-card text-center">
          <div className="text-3xl mb-3 animate-pulse">⛳</div>
          <div className="text-sm text-muted">読み込み中...</div>
        </div>
      </div>
    );
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

        <Field label="お名前（漢字フルネーム）" hint="（任意）">
          <div className="flex items-center gap-2">
            <input
              value={realNameLast}
              onChange={(e) => setRealNameLast(e.target.value)}
              placeholder="名字"
              className="flex-1 min-w-0 p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none"
            />
            <input
              value={realNameFirst}
              onChange={(e) => setRealNameFirst(e.target.value)}
              placeholder="名前"
              className="flex-1 min-w-0 p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none"
            />
          </div>
          <ul className="mt-2 text-[10px] text-muted leading-relaxed space-y-0.5">
            <li>・一般のユーザーや他の友だちには公開されません。</li>
            <li>・ラウンドを募集・参加した際、そのラウンドの<b className="text-sub">募集者にのみ</b>表示されます。</li>
            <li>・ゴルフ場へフルネームでの届出が必要になるためです。</li>
          </ul>
        </Field>

        <Field label="年齢" required>
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

        <Field label="性別" required>
          <div className="flex gap-1.5 flex-wrap">
            {genderOptions.map((g) => (
              <button key={g.id} type="button" onClick={() => setGender(gender === g.id ? '' : g.id)} className={`px-3.5 py-2 text-xs font-bold rounded-full border-[1.5px] ${gender === g.id ? 'bg-green-light border-green text-green' : 'bg-bg border-border text-sub'}`}>{g.label}</button>
            ))}
          </div>
        </Field>

        <Field label="車" required hint="（送迎可否の参考に）">
          <div className="flex gap-1.5 flex-wrap">
            {carOptions.map((c) => (
              <button key={c.id} type="button" onClick={() => setCar(car === c.id ? '' : c.id)} className={`px-3.5 py-2 text-xs font-bold rounded-full border-[1.5px] ${car === c.id ? 'bg-green-light border-green text-green' : 'bg-bg border-border text-sub'}`}>{c.label}</button>
            ))}
          </div>
        </Field>

        <Field label="エリア" required>
          <select value={area} onChange={(e) => setArea(e.target.value)} className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none">
            <option value="">未設定</option>
            {allAreas.map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>

        <Field label="スコア帯" required>
          <select value={scoreRange} onChange={(e) => setScoreRange(e.target.value)} className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none">
            <option value="">未設定</option>
            {scoreRanges.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>

        <Field label="ゴルフ歴" required>
          <div className="flex gap-1.5 flex-wrap">
            {golfHistoryOptions.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGolfHistory(golfHistory === g ? '' : g)}
                className={`px-3.5 py-2 text-xs font-bold rounded-full border-[1.5px] ${golfHistory === g ? 'bg-green-light border-green text-green' : 'bg-bg border-border text-sub'}`}
              >{g}</button>
            ))}
          </div>
        </Field>

        <Field label="プレースタイル" hint="（任意）">
          <div className="flex gap-1.5 flex-wrap">
            {playStyles.map((s) => (
              <button key={s} onClick={() => setPlayStyle(playStyle === s ? '' : s)} className={`px-3.5 py-2 text-xs font-bold rounded-full border-[1.5px] ${playStyle === s ? 'bg-green-light border-green text-green' : 'bg-bg border-border text-sub'}`}>{s}</button>
            ))}
          </div>
        </Field>

        <Field label="ゴルフ診断タイプ（GOLMOTI）" hint="（任意）">
          <button
            type="button"
            onClick={() => setGolmotiOpen((o) => !o)}
            className="w-full flex items-center gap-2.5 p-2.5 border-[1.5px] border-border rounded-[10px] text-sm bg-bg"
          >
            {golmotiType ? (
              <>
                <img src={golmotiImg(golmotiType)} alt="" className="w-9 h-9 object-contain flex-shrink-0" />
                <span className="font-bold">{getGolmotiType(golmotiType)?.name}</span>
                <span className="text-muted text-[11px] font-num">{golmotiType}</span>
              </>
            ) : (
              <span className="text-muted">未設定（タップして選択）</span>
            )}
            <span className="ml-auto text-muted text-xs">{golmotiOpen ? '▲' : '▼'}</span>
          </button>
          {golmotiOpen && (
            <div className="mt-2 border-[1.5px] border-border rounded-[10px] bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => { setGolmotiType(''); setGolmotiOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs font-bold text-sub border-b border-border"
              >未設定にする</button>
              <div className="grid grid-cols-2 gap-1.5 p-2 max-h-80 overflow-y-auto">
                {GOLMOTI_TYPES.map((t) => (
                  <button
                    key={t.code}
                    type="button"
                    onClick={() => { setGolmotiType(t.code); setGolmotiOpen(false); }}
                    className={`flex items-center gap-2 p-1.5 rounded-lg border-[1.5px] text-left ${golmotiType === t.code ? 'border-green bg-green-light' : 'border-border bg-bg'}`}
                  >
                    <img src={golmotiImg(t.code)} alt="" className="w-10 h-10 object-contain flex-shrink-0" />
                    <span className="text-[11px] font-bold leading-tight">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <a href="/golmoti" className="inline-block mt-2 text-[11px] font-bold text-green underline">
            まだの人は無料診断でチェック →
          </a>
        </Field>

        <Field label="プレー頻度" hint="（任意）">
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none"
          >
            <option value="">未設定</option>
            {frequencies.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </Field>

        <Field label="自己紹介" hint="（任意・最大300文字）">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 300))}
            placeholder="例: ゴルフ歴3年、ホームコースは○○。マナー重視で楽しく回りたいです！"
            className="w-full h-28 p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none resize-none font-[inherit]"
          />
          <div className="text-[10px] text-muted text-right mt-0.5">{bio.length}/300</div>
        </Field>

        <button onClick={save} className="w-full py-4 bg-green text-white rounded-xl text-[15px] font-bold mt-4">
          保存する
        </button>
      </div>
      <div className="h-5" />
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-bold text-sub mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
        {hint && <span className="text-muted font-medium ml-1">{hint}</span>}
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
