'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { allAreas, levelOptions } from '@/lib/mockData';
import { store, useStore } from '@/lib/store';
import { toast } from '@/components/Toast';
import { track } from '@/lib/telemetry';
import type { Round, RoundType, DateType } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function CreatePage() {
  const router = useRouter();
  const meId = useStore((s) => s.meId);
  const [step, setStep] = useState<'select' | 'form'>('select');
  const [type, setType] = useState<RoundType>('confirmed');

  // form state
  const [title, setTitle] = useState('');
  const [courseName, setCourseName] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('8:00');
  const [area, setArea] = useState('');
  const [dateType, setDateType] = useState<DateType>('fixed');
  const [dateRange, setDateRange] = useState('');
  const [maxSpots, setMaxSpots] = useState(4);
  const [price, setPrice] = useState('');
  const [levelCondition, setLevelCondition] = useState(levelOptions[0]);
  const [description, setDescription] = useState('');

  const isComp = maxSpots >= 5;
  const spotsRange = Array.from({ length: 49 }, (_, i) => i + 2); // 2..50
  const timeSlots: string[] = [];
  for (let h = 6; h <= 14; h++) {
    for (let m = 0; m < 60; m += 5) timeSlots.push(`${h}:${String(m).padStart(2, '0')}`);
  }

  function chooseType(t: RoundType) {
    setType(t);
    setStep('form');
  }

  async function publish() {
    const payload = {
      title: title || (type === 'confirmed' ? 'ラウンド募集' : 'コース未定の募集'),
      type,
      courseName: type === 'confirmed' ? courseName : undefined,
      area: type === 'flexible' ? area : undefined,
      dateType: (type === 'confirmed' ? 'fixed' : dateType) as 'fixed' | 'range',
      date: type === 'confirmed' ? date : (dateType === 'fixed' ? date : undefined),
      dateRange: type === 'flexible' && dateType === 'range' ? dateRange : undefined,
      startTime: type === 'confirmed' ? startTime : undefined,
      maxSpots,
      price: price || undefined,
      levelCondition,
      description: description || undefined,
    };
    track('round_create_click', { ...payload, isComp });
    try {
      await store.addRound(payload as Partial<Round>);
      track('round_create_success', { title: payload.title });
      toast(isComp ? 'コンペ募集を公開しました' : '募集を公開しました');
      router.push('/home');
    } catch (e) {
      const msg = (e as Error).message;
      track('round_create_error', { message: msg, payload });
      toast('失敗: ' + msg, 'error');
    }
  }

  if (step === 'select') {
    return (
      <>
        <div className="px-5 pt-2 pb-4 text-2xl font-black tracking-tight">ラウンドを募集する</div>
        <div className="px-5">
          <div className="text-[13px] text-sub mb-4">募集タイプを選んでください</div>

          <button
            onClick={() => chooseType('confirmed')}
            className="w-full text-left bg-card rounded-card p-5 shadow-card mb-3 border-2 border-green-light"
          >
            <div className="flex items-center gap-3.5">
              <div className="relative w-14 h-14 rounded-2xl bg-green-light flex items-center justify-center text-3xl">
                ⛳
                <span className="absolute -bottom-0.5 -right-0.5 w-[22px] h-[22px] rounded-full bg-green text-white flex items-center justify-center text-xs font-black">✓</span>
              </div>
              <div className="flex-1">
                <div className="text-base font-black">コース予約済み</div>
                <div className="text-xs text-sub mt-1">予約済みのコースで仲間を募集</div>
              </div>
              <div className="text-xl text-muted">›</div>
            </div>
          </button>

          <button
            onClick={() => chooseType('flexible')}
            className="w-full text-left bg-card rounded-card p-5 shadow-card mb-3 border-2 border-[#EFEFEC]"
          >
            <div className="flex items-center gap-3.5">
              <div className="relative w-14 h-14 rounded-2xl bg-[#EFEFEC] flex items-center justify-center text-3xl">
                🗺️
                <span className="absolute -bottom-0.5 -right-0.5 w-[22px] h-[22px] rounded-full bg-sub text-white flex items-center justify-center text-xs font-black">?</span>
              </div>
              <div className="flex-1">
                <div className="text-base font-black">コース未定（これから決める）</div>
                <div className="text-xs text-sub mt-1">エリア・日程の希望で募集</div>
              </div>
              <div className="text-xl text-muted">›</div>
            </div>
          </button>

          <div className="bg-yellow-light rounded-xl p-3.5 mt-2">
            <div className="text-xs font-bold text-orange mb-1">💡 5人以上の募集について</div>
            <div className="text-[11px] text-sub leading-relaxed">5〜50人の募集はコンペ・イベント扱いとなり、専用デザインで表示されます</div>
          </div>
        </div>
        <div className="h-5" />
      </>
    );
  }

  const isConfirmed = type === 'confirmed';

  return (
    <>
      <div className="px-5 pt-3">
        <button onClick={() => setStep('select')} className="text-sm text-blue font-semibold">← タイプ選択へ</button>
      </div>
      <div className="px-5 pt-2 pb-4 text-2xl font-black">
        {isConfirmed ? '⛳ コース予約済みで募集' : '🗺️ コース未定で募集'}
      </div>

      <div className="px-5">
        <div className="bg-card rounded-card p-5 shadow-card">
          <Field label="タイトル">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 初心者歓迎！のんびりラウンド" className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none" />
          </Field>

          {isConfirmed ? (
            <>
              <Field label="ゴルフ場名" required>
                <input value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="例: 湘南カントリークラブ" className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none" />
              </Field>
              <Field label="プレー日" required>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none" />
              </Field>
              <Field label="スタート時間" required>
                <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none">
                  {timeSlots.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="プレー費の目安">
                <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="例: ¥8,000〜" className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none" />
              </Field>
            </>
          ) : (
            <>
              <Field label="エリア" required>
                <select value={area} onChange={(e) => setArea(e.target.value)} className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none">
                  <option value="">選択してください</option>
                  {allAreas.map((a) => <option key={a}>{a}</option>)}
                </select>
              </Field>
              <Field label="日程指定方法" required>
                <div className="flex gap-2 mb-2.5">
                  <button onClick={() => setDateType('fixed')} className={cn('flex-1 py-2.5 text-sm font-bold rounded-[10px] border-[1.5px]', dateType === 'fixed' ? 'border-green bg-green-light text-green' : 'border-border bg-card text-text')}>📅 日付指定</button>
                  <button onClick={() => setDateType('range')} className={cn('flex-1 py-2.5 text-sm font-bold rounded-[10px] border-[1.5px]', dateType === 'range' ? 'border-green bg-green-light text-green' : 'border-border bg-card text-text')}>📆 期間で希望</button>
                </div>
                {dateType === 'fixed' ? (
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none" />
                ) : (
                  <input value={dateRange} onChange={(e) => setDateRange(e.target.value)} placeholder="例: 5月の土日 / 5/10〜5/25のどこか" className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none" />
                )}
              </Field>
              <Field label="予算の目安">
                <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="例: ¥6,000〜8,000" className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none" />
              </Field>
            </>
          )}

          <Field label="募集人数" required hint="（2〜50人）">
            <select
              value={maxSpots}
              onChange={(e) => setMaxSpots(parseInt(e.target.value) || 2)}
              className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none"
            >
              {spotsRange.map((n) => (
                <option key={n} value={n}>{n}人</option>
              ))}
            </select>
            {isComp && (
              <div className="mt-2 px-3 py-2.5 bg-orange-light rounded-lg text-xs text-orange font-bold">
                🏆 5人以上はコンペ・イベント扱いになります
              </div>
            )}
          </Field>

          <Field label="レベル条件">
            <div className="flex gap-1.5 flex-wrap">
              {levelOptions.map((l) => (
                <button key={l} onClick={() => setLevelCondition(l)} className={cn('px-3.5 py-2 text-xs font-bold rounded-full border-[1.5px]', levelCondition === l ? 'bg-green-light border-green text-green' : 'bg-bg border-border text-sub')}>{l}</button>
              ))}
            </div>
          </Field>

          <Field label="ひとこと">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="募集の趣旨や雰囲気を伝えましょう（200文字以内）" className="w-full h-20 p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none resize-none" />
          </Field>

          <button
            onClick={publish}
            className={cn('w-full py-4 rounded-xl text-[15px] font-bold text-white', isComp ? 'bg-orange' : 'bg-green')}
          >
            {isComp ? '🏆 コンペ募集を公開する' : '募集を公開する'}
          </button>
        </div>
      </div>
      <div className="h-5" />
    </>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-bold text-sub mb-1.5">
        {label} {required && <span className="text-red">*</span>}
        {hint && <span className="text-muted font-medium">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
