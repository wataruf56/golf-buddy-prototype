'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { allAreas } from '@/lib/mockData';
import { PickupStationPicker } from '@/components/PickupStationPicker';
import { PriceField } from '@/components/PriceField';
import { getMe, store, useStore } from '@/lib/store';
import { toast } from '@/components/Toast';
import type { Round } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Stepper } from '@/components/Stepper';

// 募集タイトルのプルダウン既定値。管理画面で編集されると /api/round-titles で上書き。
const DEFAULT_TITLE_PRESETS = [
  '初心者歓迎！のんびりラウンド',
  'ワイワイ楽しく18ホール',
  '同世代でゆるっとゴルフ',
  '真剣勝負！スコアアップラウンド',
  '平日ゆったりラウンド',
  '土日にラウンドしましょう！',
  '朝活ゴルフ',
  '早朝スルーでサクッと',
  '仕事終わりにサクッとハーフ',
  'ナイターで一緒に回りましょう',
  '女性も安心♪エンジョイゴルフ',
  '20〜30代で集まりましょう',
  '40〜50代でゆったりゴルフ',
  'コンペ前の練習ラウンド',
  '一緒に上達しましょう！',
  '気軽にゴルフ仲間募集',
];

export default function EditRoundPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meId = useStore((s) => s.meId);
  const me = useStore(getMe);
  const isAdmin = useStore((s) => s.isAdmin);
  const storeRound = useStore((s) => s.rounds.find((r) => r.id === params.id));
  const [postAsOfficial, setPostAsOfficial] = useState(false);

  const [round, setRound] = useState<Round | null>(storeRound || null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'notfound' | 'forbidden'>('idle');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 編集画面のセクション切り替えタブ（募集内容／募集人数／ピックアップ）。
  const [tab, setTab] = useState<'basic' | 'count' | 'pickup'>('basic');
  // ピックアップ可否（必須）。'' = 未選択 / 'yes' = 送迎できる / 'no' = しない。
  const [pickupMode, setPickupMode] = useState<'' | 'yes' | 'no'>('');

  // form state
  const [title, setTitle] = useState('');
  const [titlePresets, setTitlePresets] = useState<string[]>(DEFAULT_TITLE_PRESETS);
  const [titleFree, setTitleFree] = useState(false);
  const [courseName, setCourseName] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('8:00');
  const [meetingInfo, setMeetingInfo] = useState('');
  const [area, setArea] = useState('');
  const [dateType, setDateType] = useState<'fixed' | 'range'>('fixed');
  const [dateRange, setDateRange] = useState('');
  const [maxSpots, setMaxSpots] = useState(4);
  const [externalMale, setExternalMale] = useState(0);
  const [externalFemale, setExternalFemale] = useState(0);
  const [spotsMale, setSpotsMale] = useState(0);
  const [spotsFemale, setSpotsFemale] = useState(0);
  const [price, setPrice] = useState('');
  const [splitPrice, setSplitPrice] = useState(false);
  const [priceMale, setPriceMale] = useState('');
  const [priceFemale, setPriceFemale] = useState('');
  const [beginnerOnly, setBeginnerOnly] = useState(false);
  const [description, setDescription] = useState('');
  const [pickupStations, setPickupStations] = useState<string[]>([]);
  const [pickupCapacity, setPickupCapacity] = useState(0);
  const [openChatUrl, setOpenChatUrl] = useState('');

  // 管理画面で編集されたタイトル定型文を取得（失敗時は既定値のまま）。
  useEffect(() => {
    fetch('/api/round-titles', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.titles) && d.titles.length) setTitlePresets(d.titles); })
      .catch(() => {});
  }, []);

  // Pull the round directly if it isn't in the store (e.g. cold load on edit URL).
  useEffect(() => {
    if (storeRound) { setRound(storeRound); return; }
    if (round || !params.id) return;
    let cancelled = false;
    setLoadState('loading');
    (async () => {
      try {
        const res = await fetch(`/api/rounds/${encodeURIComponent(params.id)}`, { cache: 'no-store' });
        if (cancelled) return;
        if (res.status === 404) { setLoadState('notfound'); return; }
        if (!res.ok) { setLoadState('notfound'); return; }
        const d = await res.json();
        setRound(d.round);
        setLoadState('idle');
      } catch { if (!cancelled) setLoadState('notfound'); }
    })();
    return () => { cancelled = true; };
  }, [params.id, storeRound, round]);

  // Initialise the form once the round is known.
  useEffect(() => {
    if (!round) return;
    setTitle(round.title || '');
    setCourseName(round.courseName || '');
    setDate(round.date || '');
    setStartTime(round.startTime || '8:00');
    setMeetingInfo(round.meetingInfo || '');
    setArea(round.area || '');
    setDateType(round.dateType === 'range' ? 'range' : 'fixed');
    setDateRange(round.dateRange || '');
    setMaxSpots(round.maxSpots || 4);
    const em0 = round.externalMale || 0, ef0 = round.externalFemale || 0;
    setExternalMale(em0);
    setExternalFemale(ef0);
    // 内訳は「自分を含めた全体(=募集人数)」で編集する。保存されている募集枠(自分・
    // 知り合いを除く)に、主催者本人と知り合いを足して、全体の内訳へ変換して初期化。
    const hostMale = me?.gender === 'male' ? 1 : 0;
    const hostFemale = me?.gender === 'female' ? 1 : 0;
    const recruited = Math.max(0, (round.maxSpots || 1) - 1 - (em0 + ef0 || (round.externalCount || 0)));
    let rMale = 0, rFemale = 0;
    if (round.spotsMale != null || round.spotsFemale != null || round.spotsAny != null) {
      rMale = round.spotsMale || 0; rFemale = round.spotsFemale || 0;
    } else if (round.genderCondition === 'male') {
      rMale = recruited;
    } else if (round.genderCondition === 'female') {
      rFemale = recruited;
    }
    setSpotsMale(rMale + hostMale + em0);
    setSpotsFemale(rFemale + hostFemale + ef0);
    setPrice(round.price || '');
    setPriceMale(round.priceMale || '');
    setPriceFemale(round.priceFemale || '');
    setSplitPrice(!!(round.priceMale && round.priceFemale));
    setBeginnerOnly(!!round.beginnerOnly);
    setDescription(round.description || '');
    setPickupStations(round.pickupStations || []);
    setPickupCapacity(round.pickupCapacity || 0);
    // ピックアップ可否。明示フラグ優先。旧データは駅があれば「可」、なければ「不可」。
    setPickupMode(
      typeof round.pickupOffered === 'boolean'
        ? (round.pickupOffered ? 'yes' : 'no')
        : ((round.pickupStations || []).length > 0 ? 'yes' : 'no'),
    );
    setOpenChatUrl(round.openChatUrl || '');
    setPostAsOfficial(!!round.isOfficial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, me?.gender]);

  const isConfirmed = round?.type === 'confirmed';
  const isComp = maxSpots >= 5;
  const currentCount = round?.currentCount || 1;
  const approvedApp = round?.applicantIds?.length || 0; // ゴルトモ経由で承認済みの人数
  const extTotal = externalMale + externalFemale;
  // 合計は「主催者1 + 知り合い + 承認済みアプリ参加者」を下回れない。
  const MIN_TOTAL = Math.max(2, 1 + extTotal + approvedApp);
  const MAX_TOTAL = 50;
  // 性別内訳は「自分を含めた全体(=募集人数)」。男 + 女 + どちらでも = maxSpots。
  const bAny = Math.max(0, maxSpots - spotsMale - spotsFemale);
  function clampBreakdown(nextMax: number) {
    const nm = Math.min(spotsMale, nextMax);
    const nf = Math.min(spotsFemale, Math.max(0, nextMax - nm));
    setSpotsMale(nm); setSpotsFemale(nf);
  }
  function changeTotal(delta: number) {
    const next = Math.max(MIN_TOTAL, Math.min(MAX_TOTAL, maxSpots + delta));
    let em = externalMale, ef = externalFemale;
    let over = (em + ef) - (next - 1);
    if (over > 0) { const cf = Math.min(ef, over); ef -= cf; over -= cf; em = Math.max(0, em - over); }
    setMaxSpots(next); setExternalMale(em); setExternalFemale(ef);
    clampBreakdown(next);
  }
  // 知り合いは「自分以外・かつ承認済み人数を残す」範囲で。
  function changeExtMale(delta: number) {
    setExternalMale(Math.max(0, Math.min(externalMale + delta, maxSpots - 1 - approvedApp - externalFemale)));
  }
  function changeExtFemale(delta: number) {
    setExternalFemale(Math.max(0, Math.min(externalFemale + delta, maxSpots - 1 - approvedApp - externalMale)));
  }
  // 内訳(自分含む全体)の 男/女。男+女 ≤ maxSpots（残りは「どちらでも」）。
  function changeMale(delta: number) { setSpotsMale((m) => Math.max(0, Math.min(m + delta, maxSpots - spotsFemale))); }
  function changeFemale(delta: number) { setSpotsFemale((f) => Math.max(0, Math.min(f + delta, maxSpots - spotsMale))); }
  // 内訳(自分含む全体) → API用の実募集枠(自分・知り合いを除く)へ変換。
  function recruitmentSlots(): { spotsMale: number; spotsFemale: number; spotsAny: number } {
    const hostMale = me?.gender === 'male' ? 1 : 0;
    const hostFemale = me?.gender === 'female' ? 1 : 0;
    const recruitTotal = Math.max(0, maxSpots - 1 - extTotal);
    const rMale = Math.max(0, Math.min(spotsMale - hostMale - externalMale, recruitTotal));
    const rFemale = Math.max(0, Math.min(spotsFemale - hostFemale - externalFemale, recruitTotal - rMale));
    const rAny = Math.max(0, recruitTotal - rMale - rFemale);
    return { spotsMale: rMale, spotsFemale: rFemale, spotsAny: rAny };
  }
  function deriveGenderCondition(rMale: number, rFemale: number, rAny: number): 'any' | 'male' | 'female' {
    if (rAny === 0 && rFemale === 0 && rMale > 0) return 'male';
    if (rAny === 0 && rMale === 0 && rFemale > 0) return 'female';
    return 'any';
  }
  const timeSlots: string[] = [];
  for (let h = 6; h <= 23; h++) {
    for (let m = 0; m < 60; m += 5) timeSlots.push(`${h}:${String(m).padStart(2, '0')}`);
  }
  timeSlots.push('24:00'); // ナイター対応（深夜0時まで選択可）

  // Guard: only the host may edit.
  if (round && meId && round.hostId !== meId) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <div className="text-base font-black mb-2">主催者のみ編集できます</div>
        <button onClick={() => router.push(`/round/${params.id}`)} className="mt-4 px-5 py-2.5 bg-green text-white rounded-xl text-sm font-bold">募集の詳細へ戻る</button>
      </div>
    );
  }
  if (loadState === 'notfound') {
    return <div className="p-5 text-sub">募集が見つかりません</div>;
  }
  if (!round) {
    return <div className="p-5 text-sub">読み込み中...</div>;
  }
  if (round.status === 'completed') {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8 text-center">
        <div className="text-4xl mb-3">✅</div>
        <div className="text-base font-black mb-2">完了した募集は編集できません</div>
        <button onClick={() => router.push(`/round/${params.id}`)} className="mt-4 px-5 py-2.5 bg-green text-white rounded-xl text-sm font-bold">募集の詳細へ戻る</button>
      </div>
    );
  }

  async function save() {
    // 必須チェック（足りないタブへ切り替えて知らせる）。
    if (maxSpots < 2) {
      toast('募集人数を入力してください', 'error');
      setTab('count'); return;
    }
    if (pickupMode === '') {
      toast('ピックアップ（送迎）の可否を選んでください', 'error');
      setTab('pickup'); return;
    }
    setSaving(true);
    // 内訳(自分含む全体) → 実募集枠へ変換して送信（保存データの意味は従来どおり）。
    const rSlots = recruitmentSlots();
    const offerPickup = pickupMode === 'yes';
    const patch: Partial<Round> & { asOfficial?: boolean } = {
      title: title || round!.title,
      maxSpots,
      // ゴルトモ公式 ⇄ 個人 の切替（管理者のみ。サーバーで再検証）。
      ...(isAdmin ? { asOfficial: postAsOfficial } : {}),
      externalMale,
      externalFemale,
      spotsMale: rSlots.spotsMale,
      spotsFemale: rSlots.spotsFemale,
      spotsAny: rSlots.spotsAny,
      price: splitPrice ? '' : (price || ''),
      priceMale: splitPrice ? (priceMale || '') : '',
      priceFemale: splitPrice ? (priceFemale || '') : '',
      beginnerOnly,
      genderCondition: deriveGenderCondition(rSlots.spotsMale, rSlots.spotsFemale, rSlots.spotsAny),
      description: description || '',
      pickupOffered: offerPickup,
      pickupStations: offerPickup ? pickupStations : [],
      pickupCapacity: offerPickup && pickupStations.length && pickupCapacity > 0 ? pickupCapacity : undefined,
      openChatUrl: openChatUrl.trim(),
    };
    if (isConfirmed) {
      patch.courseName = courseName;
      patch.area = area; // 都道府県
      patch.dateType = 'fixed';
      patch.date = date;
      patch.startTime = startTime;
      patch.meetingInfo = meetingInfo.trim();
    } else {
      patch.area = area;
      patch.dateType = dateType;
      patch.date = dateType === 'fixed' ? date : '';
      patch.dateRange = dateType === 'range' ? dateRange : '';
    }
    try {
      await store.editRound(params.id, patch);
      toast('投稿を更新しました');
      router.push(`/round/${params.id}`);
    } catch (e) {
      toast('失敗: ' + (e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await store.deleteRound(params.id);
      toast('投稿を削除しました');
      router.push('/home');
    } catch (e) {
      toast('失敗: ' + (e as Error).message, 'error');
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="px-5 pt-3">
        <button onClick={() => router.push(`/round/${params.id}`)} className="text-sm text-blue font-semibold">← 募集の詳細へ</button>
      </div>
      <div className="px-5 pt-2 pb-4 text-2xl font-black">✏️ 投稿を編集</div>

      <div className="px-5">
        <div className="bg-card rounded-card p-5 shadow-card">
          {/* セクション切り替えタブ（募集内容／募集人数／ピックアップ） */}
          <div className="flex gap-1 mb-4 bg-bg rounded-xl p-1">
            {([['basic', '募集内容'], ['count', '募集人数'], ['pickup', 'ピックアップ']] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={'flex-1 py-2 rounded-lg text-[12px] font-black ' + (tab === k ? 'bg-orange text-white shadow-sm' : 'text-sub')}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── 募集内容 タブ（前半：種類・タイトル・日程・費用） ── */}
          {tab === 'basic' && (
          <>
          {isAdmin && (
            <Field label="投稿の種類（管理者のみ）">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPostAsOfficial(false)}
                  className={cn('flex-1 py-2.5 text-sm font-bold rounded-[10px] border-[1.5px]', !postAsOfficial ? 'border-green bg-green-light text-green' : 'border-border bg-card text-text')}
                >👤 個人投稿</button>
                <button
                  type="button"
                  onClick={() => setPostAsOfficial(true)}
                  className={cn('flex-1 py-2.5 text-sm font-bold rounded-[10px] border-[1.5px]', postAsOfficial ? 'border-green bg-green text-white' : 'border-border bg-card text-text')}
                >✓ ゴルトモ公式</button>
              </div>
            </Field>
          )}
          <Field label="タイトル">
            <select
              value={titleFree ? '__free__' : (titlePresets.includes(title) ? title : (title ? '__free__' : ''))}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__free__') { setTitleFree(true); setTitle(''); }
                else { setTitleFree(false); setTitle(v); }
              }}
              className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none"
            >
              <option value="">選択してください</option>
              {titlePresets.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value="__free__">✏️ 自由入力</option>
            </select>
            {(titleFree || (title && !titlePresets.includes(title))) && (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 60))}
                placeholder="タイトルを自由に入力（例: 朝イチ集合・早上がり）"
                maxLength={60}
                className="w-full mt-2 p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none"
              />
            )}
          </Field>

          {isConfirmed ? (
            <>
              <Field label="ゴルフ場名" required>
                <input value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="例: 湘南カントリークラブ" className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none" />
              </Field>
              <Field label="都道府県" required>
                <select value={area} onChange={(e) => setArea(e.target.value)} className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none">
                  <option value="">選択してください</option>
                  {allAreas.map((a) => <option key={a}>{a}</option>)}
                </select>
              </Field>
              <Field label="プレー日" required>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full min-w-0 max-w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none appearance-none" style={{ boxSizing: 'border-box' }} />
              </Field>
              <Field label="スタート時間" required>
                <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none">
                  {timeSlots.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="集合場所・集合時間">
                <textarea
                  value={meetingInfo}
                  onChange={(e) => setMeetingInfo(e.target.value.slice(0, 200))}
                  placeholder="例: クラブハウス前に 7:30 集合 / 7:00 に◯◯駅集合して相乗り など"
                  className="w-full h-20 p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none resize-none"
                />
                <div className="text-[10px] text-muted text-right mt-0.5">{meetingInfo.length}/200</div>
              </Field>
              <Field label="プレー費の目安">
                <PriceField
                  split={splitPrice} onSplitChange={setSplitPrice}
                  price={price} onPriceChange={setPrice}
                  priceMale={priceMale} onPriceMaleChange={setPriceMale}
                  priceFemale={priceFemale} onPriceFemaleChange={setPriceFemale}
                  singlePlaceholder="例: ¥8,000〜"
                />
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
                <PriceField
                  split={splitPrice} onSplitChange={setSplitPrice}
                  price={price} onPriceChange={setPrice}
                  priceMale={priceMale} onPriceMaleChange={setPriceMale}
                  priceFemale={priceFemale} onPriceFemaleChange={setPriceFemale}
                  singlePlaceholder="例: ¥6,000〜8,000"
                />
              </Field>
            </>
          )}

          </>
          )}

          {/* ── 募集人数 タブ ── */}
          {tab === 'count' && (
          <>
            {/* 5人以上コンペ note ― 人数ボタンの上に表示 */}
            {isComp && (
              <div className="mb-3 px-3 py-2.5 bg-orange-light rounded-lg text-xs text-orange font-bold">
                🏆 5人以上はコンペ・イベント扱いになります
              </div>
            )}
            {/* 募集人数（このすぐ下に性別内訳を詰めて配置） */}
            <label className="block text-xs font-bold text-sub mb-1.5">募集人数 <span className="text-red">*</span> <span className="text-muted font-medium">（{MIN_TOTAL}〜50人）</span></label>
            <Stepper value={maxSpots} onMinus={() => changeTotal(-1)} onPlus={() => changeTotal(1)} minusDisabled={maxSpots <= MIN_TOTAL} plusDisabled={maxSpots >= MAX_TOTAL} suffix="人" />
            <div className="mt-1.5 px-3 py-2 bg-green-light rounded-lg text-[11px] text-green font-bold">👤 主催者（あなた）を含めた合計人数です</div>
            {currentCount > 1 && (
              <div className="mt-1 text-[11px] text-muted">すでに{currentCount}人が参加しているため、それ未満には変更できません</div>
            )}

            {/* 性別ごとの募集内訳（人数ボタンのすぐ下・間隔を詰める） */}
            <div className="mt-3">
              <label className="block text-xs font-bold text-sub mb-1.5">性別ごとの募集内訳 <span className="text-muted font-medium">（合計 {maxSpots}人・自分を含む）</span></label>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-blue flex items-center gap-1.5">👨 男性</span>
                  <Stepper sm value={spotsMale} onMinus={() => changeMale(-1)} onPlus={() => changeMale(1)} minusDisabled={spotsMale <= 0} plusDisabled={spotsMale + spotsFemale >= maxSpots} suffix="人" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-pink-600 flex items-center gap-1.5">👩 女性</span>
                  <Stepper sm value={spotsFemale} onMinus={() => changeFemale(-1)} onPlus={() => changeFemale(1)} minusDisabled={spotsFemale <= 0} plusDisabled={spotsMale + spotsFemale >= maxSpots} suffix="人" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-sub flex items-center gap-1.5">🙆 どちらでもOK</span>
                  <span className="flex items-center gap-2"><span className="text-[10px] font-bold text-muted">自動</span><span className="text-lg font-black font-mono w-8 text-center">{bAny}</span><span className="text-xs text-sub">人</span></span>
                </div>
              </div>
              <div className="mt-2.5 px-3 py-2 bg-bg rounded-lg text-[11px] font-bold text-sub">
                合計 <b className="text-text">{spotsMale + spotsFemale + bAny}</b>人（自分を含む）＝ 男性{spotsMale}・女性{spotsFemale}・どちらでも{bAny}
                <span className="block text-[10px] text-muted font-medium mt-0.5">この合計が上の「募集人数（{maxSpots}人）」と一致します。「どちらでもOK」は残りから自動計算。</span>
              </div>
            </div>

            {/* 主催者の知り合い（内訳のうち既に集まっている人） */}
            <Field label="主催者の知り合い" hint="（この内訳のうち、既に集まっている人・任意）">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-blue flex items-center gap-1.5">👨 男性</span>
                  <Stepper sm value={externalMale} onMinus={() => changeExtMale(-1)} onPlus={() => changeExtMale(1)} minusDisabled={externalMale <= 0} plusDisabled={extTotal >= maxSpots - 1 - approvedApp} suffix="人" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-pink-600 flex items-center gap-1.5">👩 女性</span>
                  <Stepper sm value={externalFemale} onMinus={() => changeExtFemale(-1)} onPlus={() => changeExtFemale(1)} minusDisabled={externalFemale <= 0} plusDisabled={extTotal >= maxSpots - 1 - approvedApp} suffix="人" />
                </div>
              </div>
              <div className="mt-1.5 text-[10px] text-muted font-medium">
                ゴルトモにいないメンバー（他アプリ等で既に集まっている人）。上の募集人数の内数で、その分ゴルトモでの募集枠が減ります。
              </div>
            </Field>
          </>
          )}

          {/* ── ピックアップ タブ（可否は必須） ── */}
          {tab === 'pickup' && (
          <>
            <label className="block text-xs font-bold text-sub mb-1.5">ピックアップ（送迎）の可否 <span className="text-red">*</span></label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPickupMode('yes')} className={cn('flex-1 py-3 rounded-[10px] border-[1.5px] text-sm font-bold', pickupMode === 'yes' ? 'border-green bg-green-light text-green' : 'border-border bg-card text-sub')}>🚗 送迎できる</button>
              <button type="button" onClick={() => setPickupMode('no')} className={cn('flex-1 py-3 rounded-[10px] border-[1.5px] text-sm font-bold', pickupMode === 'no' ? 'border-green bg-green-light text-green' : 'border-border bg-card text-sub')}>送迎しない</button>
            </div>
            {pickupMode === '' && <div className="mt-1.5 text-[11px] text-orange font-bold">※ どちらかを選んでください（必須）</div>}
            {pickupMode === 'no' && <div className="mt-2 px-3 py-2 bg-bg rounded-lg text-[11px] text-sub font-medium">送迎なしで保存します。</div>}

            {pickupMode === 'yes' && (
              <div className="mt-3">
                <label className="block text-xs font-bold text-sub mb-1.5">🚗 ピックアップできる駅 <span className="text-muted font-medium">（任意・あとから追加OK）</span></label>
                <PickupStationPicker value={pickupStations} onChange={setPickupStations} />
                {pickupStations.length > 0 && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className="text-xs font-bold text-sub">自分含め乗れる人数</span>
                    <input
                      type="number" min={1} max={8} inputMode="numeric"
                      value={pickupCapacity || ''}
                      onChange={(e) => setPickupCapacity(Math.max(0, Math.min(8, Number(e.target.value) || 0)))}
                      placeholder="例: 4"
                      className="w-16 px-2 py-1.5 border-[1.5px] border-border rounded-[8px] text-sm bg-bg outline-none text-center"
                    />
                    <span className="text-xs text-sub">名</span>
                  </div>
                )}
              </div>
            )}
          </>
          )}

          {/* ── 募集内容 タブ（後半：ひとこと・オープンチャット） ── */}
          {tab === 'basic' && (
          <>
            <Field label="ひとこと">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="募集の趣旨や雰囲気を伝えましょう（200文字以内）" className="w-full h-20 p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none resize-none" />
            </Field>

            <Field label="LINEオープンチャットURL" hint="（任意・参加者に表示されます）">
              <input
                value={openChatUrl}
                onChange={(e) => setOpenChatUrl(e.target.value)}
                placeholder="https://line.me/ti/g2/..."
                className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none"
              />
            </Field>
          </>
          )}

          <button
            onClick={save}
            disabled={saving}
            className={cn('w-full py-4 rounded-xl text-[15px] font-bold text-white disabled:opacity-50', isComp ? 'bg-orange' : 'bg-green')}
          >
            {saving ? '保存中...' : '変更を保存する'}
          </button>
        </div>

        {/* Danger zone — delete the post */}
        <div className="bg-card rounded-card p-5 shadow-card mt-4 border border-red/30">
          <div className="text-[13px] font-bold text-red mb-1">投稿の削除</div>
          <div className="text-[11px] text-sub leading-relaxed mb-3">
            削除すると、この募集と参加者・チャットの内容がすべて消えます。元に戻せません。
          </div>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full py-3 bg-card border-[1.5px] border-red text-red rounded-xl text-sm font-bold"
            >🗑️ この投稿を削除する</button>
          ) : (
            <div className="space-y-2">
              <div className="text-[12px] font-bold text-red text-center">本当に削除しますか？</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="flex-1 py-3 bg-bg text-sub rounded-xl text-sm font-bold disabled:opacity-50"
                >キャンセル</button>
                <button
                  onClick={remove}
                  disabled={deleting}
                  className="flex-1 py-3 bg-red text-white rounded-xl text-sm font-bold disabled:opacity-50"
                >{deleting ? '削除中...' : '削除する'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="h-8" />
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
