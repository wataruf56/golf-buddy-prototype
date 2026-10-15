'use client';

import { useEffect, useState } from 'react';
import { CancelPolicyEditor, emptyCancelDraft, draftToPayload, type CancelPolicyDraft } from '@/components/CancelPolicy';
import { jstToMs, swapConditionForPayment } from '@/lib/cancelPolicy';
import { useRouter } from 'next/navigation';
import { allAreas } from '@/lib/mockData';
import { PickupStationPicker } from '@/components/PickupStationPicker';
import { NumberInput } from '@/components/NumberInput';
import { PriceField } from '@/components/PriceField';
import { getMe, store, useStore } from '@/lib/store';
import { toast } from '@/components/Toast';
import { track } from '@/lib/telemetry';
import type { Round, RoundType, DateType, EventKind, EventQuestion, PayMethod, RoundVisibility } from '@/lib/types';
import { EVENT_KINDS, eventKindMeta, PAY_METHODS, EVENT_TITLE_PRESETS, presetQuestions } from '@/lib/eventRound';
import { VisibilityCard } from '@/components/InvitePicker';
import { EventQuestionEditor } from '@/components/EventQuestionEditor';
import { chatIdFor, cn } from '@/lib/utils';
import { ADMIN_MANAGER_ID } from '@/lib/adminManagerId';
import { Stepper } from '@/components/Stepper';
import { MultiDatePicker } from '@/components/MultiDatePicker';
import { goLogin } from '@/lib/loginLink';

// 毎回タイトルを考えなくて済むよう、よく使う募集タイトルの定型文。
// 既定値。管理画面で編集された場合は /api/round-titles の内容で上書きされる。
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

// 飲み会（eventType='drink'）用のタイトル定型文。
const DRINK_TITLE_PRESETS = [
  'ゴルフ好きで集まって飲もう！',
  'ラウンド後の打ち上げ🍻',
  'ゴルフ談義しながら飲み会',
  'ゆるっと親睦会',
  '初参加歓迎！飲み会',
  '同世代でわいわい飲み会',
  'コンペのお疲れ会',
];

export default function CreatePage() {
  const router = useRouter();
  const meId = useStore((s) => s.meId);
  const me = useStore(getMe);
  const isAdmin = useStore((s) => s.isAdmin);
  const noCreate = useStore((s) => !!s.restrictions.noCreate);
  const [step, setStep] = useState<'select' | 'form'>('select');
  // フォームのセクション切り替えタブ（募集内容／募集人数／ピックアップ）。
  const [tab, setTab] = useState<'basic' | 'count' | 'pickup'>('basic');
  // ピックアップ可否（必須で選択）。'' = 未選択 / 'yes' = 送迎できる / 'no' = しない。
  const [pickupMode, setPickupMode] = useState<'' | 'yes' | 'no'>('');
  const [type, setType] = useState<RoundType>('confirmed');
  // イベント種別。'golf' = 通常のラウンド募集 / 'drink' = 飲み会など（コース・送迎・レビュー無し）。
  const [eventType, setEventType] = useState<'golf' | 'drink'>('golf');
  // 飲み会の会場（店名やエリアの自由記述・任意）。
  const [venue, setVenue] = useState('');
  // ===== イベント（ラウンド以外・2026-10-14・lib/eventRound） =====
  // eventKind が入っていれば新しいイベント（出欠＋質問の集計つき）。null は従来の飲み会フロー（今は入口なし）。
  const [eventKind, setEventKind] = useState<EventKind | null>(null);
  const [eventDateMode, setEventDateMode] = useState<'fixed' | 'candidates'>('fixed');
  const [dateOptions, setDateOptions] = useState<{ id: string; date: string; startTime: string }[]>([]);
  const [venueUrl, setVenueUrl] = useState('');
  const [payMethods, setPayMethods] = useState<PayMethod[]>([]);
  const [payNote, setPayNote] = useState('');
  const [eventCap, setEventCap] = useState<number | null>(null);      // 定員（自分を含む・空欄＝定員なし）
  const [eventDeadline, setEventDeadline] = useState('');             // 申込の締切（YYYY-MM-DD）
  const [questions, setQuestions] = useState<EventQuestion[]>([]);
  // 種類を切り替えたとき、質問がおすすめのまま（手を入れていない）なら新しい種類のおすすめに入れ替えるための控え
  const [presetQs, setPresetQs] = useState<EventQuestion[]>([]);
  // ===== 公開範囲（ラウンド・イベント共通・2026-10-14） =====
  const [visibility, setVisibility] = useState<RoundVisibility>('public');
  const [inviteIds, setInviteIds] = useState<string[]>([]);
  // Admin-only (福田渉): post as ゴルトモ公式 or as personal account.
  const [postAsOfficial, setPostAsOfficial] = useState<boolean>(false);

  // form state
  const [title, setTitle] = useState('');
  const [titlePresets, setTitlePresets] = useState<string[]>(DEFAULT_TITLE_PRESETS);
  const [courseName, setCourseName] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('8:00');
  const [meetingInfo, setMeetingInfo] = useState('');
  const [titleFree, setTitleFree] = useState(false);
  const [area, setArea] = useState('');
  const [dateType, setDateType] = useState<DateType>('fixed');
  const [dateRange, setDateRange] = useState('');
  // maxSpots = 合計人数 = 主催者(1) + 主催者の知り合い(男女) + 募集枠(性別内訳)。
  // 初期値は0（未入力）。投稿時に必須チェックする。
  const [maxSpots, setMaxSpots] = useState(0);
  const [externalMale, setExternalMale] = useState(0);   // 主催者の知り合い（男性）
  const [externalFemale, setExternalFemale] = useState(0); // 主催者の知り合い（女性）
  // 知り合い枠の人数ぶんの名前（任意）。入力するとゲストとして参加者一覧・入金タブに並ぶ。
  const [guestNames, setGuestNames] = useState<string[]>([]);
  const [spotsMale, setSpotsMale] = useState(0);
  const [spotsFemale, setSpotsFemale] = useState(0);
  const [price, setPrice] = useState('');
  // 男女別料金（無料・割引プランなどで男女で参加費が異なる場合）。
  const [splitPrice, setSplitPrice] = useState(false);
  const [priceMale, setPriceMale] = useState('');
  const [priceFemale, setPriceFemale] = useState('');
  // 再会エンジンからの遷移（?rematch=pairId）。相手を自動招待＋合意日をプリセット。
  const [rematchPairId, setRematchPairId] = useState('');
  const [rematchPartnerId, setRematchPartnerId] = useState('');
  const [rematchPartnerName, setRematchPartnerName] = useState('');
  // 日程調整（?pollId=...&date=...&startTime=...）から来た場合、決まった日程をプリセットし、
  // 投稿時にこのポールへ roundId を紐付ける。
  const [fromPollId, setFromPollId] = useState('');
  // Replaced free-form levelCondition string with two structured selectors.
  const [beginnerOnly, setBeginnerOnly] = useState<boolean>(false);
  const [description, setDescription] = useState('');
  // 主催者がピックアップ（送迎）できる代表駅（複数選択）。
  const [pickupStations, setPickupStations] = useState<string[]>([]);
  const [pickupCapacity, setPickupCapacity] = useState(0); // 自分含め乗れる人数

  // 入金管理（主催者が事前集金してまとめて払うケース）。ONにすると詳細に「💰 入金」タブが出る。
  const [paymentEnabled, setPaymentEnabled] = useState(false);
  // 事前集金の金額・振込先・入金期日（作成時に paymentInfo として保存）（2026-10-12）
  const [payAmount, setPayAmount] = useState<number | null>(null);
  const [payAccount, setPayAccount] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payTime, setPayTime] = useState('23:59');
  const payDeadline = jstToMs(payDate, payTime);
  // 事前集金を切り替えたら、キャンセル条件のテンプレートも同じ記号（a/b）の文例に差し替える（自由記入はそのまま）
  function togglePaymentEnabled() {
    const next = !paymentEnabled;
    setPaymentEnabled(next);
    setCancelDraft((d) => ({ ...d, condition: swapConditionForPayment(d.condition, next) }));
  }
  const [cancelDraft, setCancelDraft] = useState<CancelPolicyDraft>(emptyCancelDraft);   // キャンセル規定（任意）
  // 共同管理者（任意・複数可）。ゴル友（マッチ済み）から選ぶ。主催者と同権限＋作成時から参加確定。
  const [coHostIds, setCoHostIds] = useState<string[]>([]);
  const [coHostPickerOpen, setCoHostPickerOpen] = useState(false);
  const [coHostCandidates, setCoHostCandidates] = useState<{ id: string; displayName: string; avatar: string; avatarUrl?: string }[]>([]);

  const isComp = maxSpots >= 5;
  const MIN_TOTAL = 2, MAX_TOTAL = 50;
  const extTotal = externalMale + externalFemale;               // 知り合い合計
  // ゴルトモ公式として投稿するときは主催者（管理者）を人数に数えない（2026-10-12）。主催者の枠は 0。
  const hostNotCounted = isAdmin && postAsOfficial;
  const hostSeatN = hostNotCounted ? 0 : 1;
  // 性別内訳は「自分を含めた全体(=募集人数)」の内訳。男 + 女 + どちらでも = maxSpots。
  // spotsMale / spotsFemale は内訳の男/女。どちらでも(bAny)は残りの自動計算。
  const bAny = Math.max(0, maxSpots - spotsMale - spotsFemale);

  // 共同管理者の候補（ゴル友＝マッチ済みユーザー）をピッカーを開いたとき遅延取得。
  useEffect(() => {
    if (!coHostPickerOpen || coHostCandidates.length) return;
    fetch('/api/me/matches', { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.matches) return;
        const list = Object.keys(d.matches).map((id) => ({
          id,
          displayName: d.users?.[id]?.displayName || 'メンバー',
          avatar: d.users?.[id]?.avatar || '⛳',
          avatarUrl: d.users?.[id]?.avatarUrl || '',
        }));
        setCoHostCandidates(list);
      })
      .catch(() => {});
  }, [coHostPickerOpen, coHostCandidates.length]);

  // 管理画面で編集されたタイトル定型文を取得（失敗時は既定値のまま）。
  useEffect(() => {
    fetch('/api/round-titles', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.titles) && d.titles.length) setTitlePresets(d.titles); })
      .catch(() => {});
  }, []);

  // 再会エンジン（?rematch=pairId）：コース確定フォームに合意日をプリセット。
  useEffect(() => {
    let rp = '';
    try { rp = new URLSearchParams(window.location.search).get('rematch') || ''; } catch {}
    if (!rp) return;
    setRematchPairId(rp);
    fetch(`/api/rematch/${encodeURIComponent(rp)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setRematchPartnerId(d.other?.id || '');
        setRematchPartnerName(d.other?.displayName || '');
        // タイプ（未定/予約済み）は通常どおりユーザーに選ばせる。合意日だけプリセット。
        // タイトルは通常投稿と同じく空白のまま（自動セットしない）。
        if (d.agreedDate) setDate(d.agreedDate);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 日程調整ポール（?pollId&date&startTime）から来たら、決まった日程をフォームにセット。
  useEffect(() => {
    let pid = '', d = '', st = '';
    try {
      const sp = new URLSearchParams(window.location.search);
      pid = sp.get('pollId') || ''; d = sp.get('date') || ''; st = sp.get('startTime') || '';
    } catch {}
    if (pid) setFromPollId(pid);
    if (d) { setDate(d); setDateType('fixed'); }
    if (st) setStartTime(st);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 「まず日程調整する」→ 新しいポールを作って日程調整ページへ。
  async function startPoll() {
    if (!meId) { goLogin('/create'); return; }   // LINEの外のブラウザでも LIFF（LINEの中）で開き直す
    try {
      const res = await fetch('/api/polls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (!res.ok) { toast('日程調整の作成に失敗しました', 'error'); return; }
      const j = await res.json();
      track('poll_create', {});
      if (j.poll?.id) router.push(`/poll/${j.poll.id}`);
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  // 内訳(男+女)が maxSpots を超えないようにクランプ。
  function clampBreakdown(nextMax: number) {
    const nm = Math.min(spotsMale, nextMax);
    const nf = Math.min(spotsFemale, Math.max(0, nextMax - nm));
    setSpotsMale(nm); setSpotsFemale(nf);
  }
  function changeTotal(delta: number) {
    const next = Math.max(MIN_TOTAL, Math.min(MAX_TOTAL, maxSpots + delta));
    // 知り合いは「自分以外」の枠に収める（合計 ≤ maxSpots-1）。
    let em = externalMale, ef = externalFemale;
    let over = (em + ef) - (next - hostSeatN);
    if (over > 0) { const cf = Math.min(ef, over); ef -= cf; over -= cf; em = Math.max(0, em - over); }
    setMaxSpots(next); setExternalMale(em); setExternalFemale(ef);
    clampBreakdown(next);
  }
  function changeExtMale(delta: number) {
    setExternalMale(Math.max(0, Math.min(externalMale + delta, maxSpots - hostSeatN - externalFemale)));
  }
  function changeExtFemale(delta: number) {
    setExternalFemale(Math.max(0, Math.min(externalFemale + delta, maxSpots - hostSeatN - externalMale)));
  }
  // 内訳(自分含む全体)の 男/女。男+女 ≤ maxSpots（残りは「どちらでも」）。
  function changeMale(delta: number) {
    setSpotsMale((m) => Math.max(0, Math.min(m + delta, maxSpots - spotsFemale)));
  }
  function changeFemale(delta: number) {
    setSpotsFemale((f) => Math.max(0, Math.min(f + delta, maxSpots - spotsMale)));
  }
  // 内訳(自分含む全体) → API用の実募集枠(自分・知り合いを除く)へ変換。
  // これにより保存されるデータ(spots*)の意味は従来どおり「募集枠」のまま保たれる。
  function recruitmentSlots(): { spotsMale: number; spotsFemale: number; spotsAny: number } {
    // 公式募集は主催者が内訳に入らない（2026-10-12）
    const hostMale = hostSeatN && me?.gender === 'male' ? 1 : 0;
    const hostFemale = hostSeatN && me?.gender === 'female' ? 1 : 0;
    const recruitTotal = Math.max(0, maxSpots - hostSeatN - extTotal);
    const rMale = Math.max(0, Math.min(spotsMale - hostMale - externalMale, recruitTotal));
    const rFemale = Math.max(0, Math.min(spotsFemale - hostFemale - externalFemale, recruitTotal - rMale));
    const rAny = Math.max(0, recruitTotal - rMale - rFemale);
    return { spotsMale: rMale, spotsFemale: rFemale, spotsAny: rAny };
  }
  // 単一性別のみ厳格ゲート。実募集枠から導出。
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

  function chooseType(t: RoundType) {
    setEventType('golf');
    setEventKind(null);
    setType(t);
    setTab('basic');
    setStep('form');
  }
  // イベントを企画（2026-10-14）：飲み会・シミュゴル・練習会・観戦など。コース・組分け・送迎・レビュー無し。
  // 内部は従来の飲み会と同じ eventType='drink'（日付固定扱い）に eventKind を載せる。
  const defaultEventTime = (k: EventKind) => (k === 'drink' || k === 'simgolf' ? '19:00' : '10:00');
  function chooseEvent(k: EventKind = 'drink') {
    setEventType('drink');
    setType('confirmed');   // 内部的には日付固定イベント扱い
    setDateType('fixed');
    setPickupMode('no');    // 送迎の概念なし（必須チェックを通すため）
    setStartTime(defaultEventTime(k));
    // 前に別の種類で入れていたら、タイトル（おすすめのまま）と質問（おすすめのまま）は新しい種類に合わせる
    switchKind(k);
    setTab('basic');
    setStep('form');
  }
  // 種類を切り替え：タイトルがおすすめのままなら消す／質問がおすすめのまま（手を入れていない）なら入れ替える
  function switchKind(k: EventKind) {
    const prev = eventKind;
    if (prev && prev !== k && EVENT_TITLE_PRESETS[prev].includes(title)) setTitle('');
    const untouched = prev == null || JSON.stringify(questions) === JSON.stringify(presetQs);
    if (untouched && prev !== k) {
      const next = presetQuestions(k);
      setQuestions(next); setPresetQs(next);
    }
    if (prev && prev !== k && startTime === defaultEventTime(prev)) setStartTime(defaultEventTime(k));
    setEventKind(k);
  }
  function addDateOption() {
    setDateOptions((xs) => (xs.length >= 20 ? xs : [...xs, { id: `d${Date.now().toString(36)}${xs.length}`, date: '', startTime: xs[xs.length - 1]?.startTime || startTime }]));
  }
  function togglePayMethod(m: PayMethod) {
    setPayMethods((xs) => (xs.includes(m) ? xs.filter((x) => x !== m) : [...xs, m]));
  }

  // イベントの公開（2026-10-14）。必須は日程だけ（決まっている日 or 候補日2つ以上）。
  async function publishEvent() {
    if (!eventKind) return;
    const opts = dateOptions.filter((o) => o.date);
    if (eventDateMode === 'fixed' && !date) { toast('開催日を入れてください', 'error'); return; }
    if (eventDateMode === 'candidates' && opts.length < 2) { toast('候補日を2つ以上入れてください', 'error'); return; }
    const firstDate = eventDateMode === 'fixed' ? date : [...opts].sort((a, b) => a.date.localeCompare(b.date))[0].date;
    if (eventDeadline && eventDateMode === 'fixed' && eventDeadline > date) { toast('申込の締切は開催日までの日にしてください', 'error'); return; }
    if (eventCap != null && eventCap > 0 && eventCap < 2) { toast('定員は2人以上にしてください（空欄なら定員なし）', 'error'); return; }
    const url = venueUrl.trim();
    if (url && !/^https?:\/\/\S+$/.test(url)) { toast('URLは http:// か https:// から入れてください', 'error'); return; }
    if (visibility === 'invite' && inviteIds.length === 0) { toast('招待する人を1人以上選んでください', 'error'); return; }
    const payApp = payMethods.includes('app');
    if (payApp && payDate && !payDeadline) { toast('入金期日の日付・時刻を確認してください', 'error'); return; }
    const meta = eventKindMeta(eventKind);
    const payload = {
      eventType: 'drink' as const,
      eventKind,
      title: title.trim() || meta.label,
      type: 'confirmed' as const,
      dateType: 'fixed' as const,
      date: firstDate,
      startTime: eventDateMode === 'fixed' ? (startTime || undefined) : undefined,
      eventDateOptions: eventDateMode === 'candidates' ? opts.map((o) => ({ id: o.id, date: o.date, ...(o.startTime ? { startTime: o.startTime } : {}) })) : undefined,
      venue: venue.trim() || undefined,
      venueUrl: url || undefined,
      price: price.trim() || undefined,
      payMethods: payMethods.length ? payMethods : undefined,
      payNote: payNote.trim() || undefined,
      // 定員（自分を含めた人数）。空欄なら送らない＝定員なし
      maxSpots: eventCap && eventCap >= 2 ? eventCap : undefined,
      eventDeadline: eventDeadline || undefined,
      eventQuestions: questions.length ? questions : undefined,
      hostNote: description.trim() || undefined,
      pickupOffered: false,
      cancelPolicy: null,
      // 「アプリで事前集金」はラウンドと同じ入金管理（振込先・期日・催促）
      paymentEnabled: payApp,
      paymentInfo: payApp ? { amount: payAmount || 0, account: payAccount.trim(), deadline: payDeadline } : undefined,
      visibility: visibility === 'invite' ? 'invite' as const : undefined,
      inviteIds: visibility === 'invite' ? inviteIds : undefined,
      asOfficial: isAdmin ? postAsOfficial : undefined,
    };
    track('round_create_click', { ...payload, isEvent: true });
    try {
      const created = await store.addRound(payload as Partial<Round>);
      track('round_create_success', { title: payload.title, eventKind });
      toast(visibility === 'invite' ? `🔒 ${inviteIds.length}人に招待状を送りました` : `${meta.emoji} イベントを公開しました`);
      router.push(created?.id ? `/round/${created.id}` : '/home');
    } catch (e) {
      const msg = (e as Error).message;
      track('round_create_error', { message: msg, payload });
      toast('失敗: ' + msg, 'error');
    }
  }

  async function publish() {
    // 新しいイベント（eventKind あり）は別の入力・送信（2026-10-14）
    if (eventType === 'drink' && eventKind) { await publishEvent(); return; }
    // 必須チェック（タブで抜け漏れが起きないよう、足りないタブへ切り替えて知らせる）。
    const isDrink = eventType === 'drink';
    const basicMissing = isDrink
      ? !date                                   // 飲み会は日付だけ必須（場所・エリア・時間は任意）
      : type === 'confirmed'
        ? (!courseName.trim() || !area || !date)
        : (!area || (dateType === 'fixed' ? !date : !dateRange.trim()));
    if (basicMissing) {
      toast(isDrink ? '開催日を入力してください' : '募集内容の必須項目（コース／エリア／日程）を入力してください', 'error');
      setTab('basic'); return;
    }
    // キャンセル規定：ONなら締切日は必須（2026-10-10）
    if (!isDrink && cancelDraft.on && !jstToMs(cancelDraft.date, cancelDraft.time)) {
      toast('キャンセル日（締切）の日付を入れてください', 'error'); setTab('basic'); return;
    }
    if (!isDrink && paymentEnabled && payDate && !payDeadline) {
      toast('入金期日の日付・時刻を確認してください', 'error'); setTab('basic'); return;
    }
    // 飲み会は募集人数を決めない（定員なし）。人数チェックはゴルフのみ。
    if (!isDrink && maxSpots < 2) {
      toast('募集人数を入力してください', 'error');
      setTab('count'); return;
    }
    // 飲み会はピックアップ（送迎）の概念がないのでチェックしない。
    if (!isDrink && pickupMode === '') {
      toast('ピックアップ（送迎）の可否を選んでください', 'error');
      setTab('pickup'); return;
    }
    // 招待した人だけ（非公開）は1人以上選ぶ（2026-10-14）
    if (visibility === 'invite' && inviteIds.length === 0) {
      toast('招待する人を1人以上選んでください', 'error');
      setTab('basic'); return;
    }
    // 内訳(自分含む全体) → 実募集枠へ変換して送信（保存データの意味は従来どおり）。
    const rSlots = recruitmentSlots();
    const offerPickup = !isDrink && pickupMode === 'yes';
    const payload = {
      eventType,
      title: title || (isDrink ? '飲み会' : type === 'confirmed' ? 'ラウンド募集' : 'コース未定の募集'),
      type: isDrink ? 'confirmed' : type,
      courseName: !isDrink && type === 'confirmed' ? courseName : undefined,
      venue: isDrink && venue.trim() ? venue.trim() : undefined,
      area: area || undefined,
      dateType: (isDrink || type === 'confirmed' ? 'fixed' : dateType) as 'fixed' | 'range',
      date: isDrink ? date : (type === 'confirmed' ? date : (dateType === 'fixed' ? date : undefined)),
      dateRange: !isDrink && type === 'flexible' && dateType === 'range' ? dateRange : undefined,
      startTime: isDrink ? (startTime || undefined) : (type === 'confirmed' ? startTime : undefined),
      meetingInfo: !isDrink && type === 'confirmed' && meetingInfo.trim() ? meetingInfo.trim() : undefined,
      maxSpots,
      externalMale,
      externalFemale,
      // 知り合い枠の名前（任意）。サーバー側で人数ぶんのゲストに変換される。
      guestNames: extTotal > 0 ? Array.from({ length: extTotal }, (_, i) => guestNames[i] || '') : undefined,
      spotsMale: rSlots.spotsMale,
      spotsFemale: rSlots.spotsFemale,
      spotsAny: rSlots.spotsAny,
      price: splitPrice ? undefined : (price || undefined),
      priceMale: splitPrice ? (priceMale || undefined) : undefined,
      priceFemale: splitPrice ? (priceFemale || undefined) : undefined,
      beginnerOnly,
      genderCondition: deriveGenderCondition(rSlots.spotsMale, rSlots.spotsFemale, rSlots.spotsAny),
      // 「主催者からのメッセージ」は round.hostNote に保存（旧「ひとこと」description は使わない）（2026-10-12）
      hostNote: description.trim() || undefined,
      pickupOffered: offerPickup,
      pickupStations: offerPickup && pickupStations.length ? pickupStations : undefined,
      pickupCapacity: offerPickup && pickupStations.length && pickupCapacity > 0 ? pickupCapacity : undefined,
      // 共同管理者（任意・複数可）。サーバー側で実在ユーザーを検証し、承認済み参加者＋同権限として登録する。
      coHostIds: coHostIds.length ? coHostIds : undefined,
      // 入金管理（ONなら詳細に「💰 入金」タブが出て、主催者が入金チェックを付けられる）。
      paymentEnabled,
      // 金額・振込先・入金期日（2026-10-12）。サーバー側で整形し、paymentEnabled のときだけ保存する。
      paymentInfo: paymentEnabled ? { amount: payAmount || 0, account: payAccount.trim(), deadline: payDeadline } : undefined,
      cancelPolicy: !isDrink ? draftToPayload(cancelDraft, jstToMs) : null,
      // Admin-only: request publishing under the ゴルトモ公式 identity. Server
      // re-validates the caller is actually an admin before honoring this.
      asOfficial: isAdmin ? postAsOfficial : undefined,
      // 公開範囲（2026-10-14）。'invite' のときは選んだ人へサーバーが「非公開の招待状」を送る
      visibility: visibility === 'invite' ? 'invite' as const : undefined,
      inviteIds: visibility === 'invite' ? inviteIds : undefined,
    };
    track('round_create_click', { ...payload, isComp });
    try {
      const created = await store.addRound(payload as Partial<Round>);
      track('round_create_success', { title: payload.title });
      // 再会エンジン経由なら、相手を「誘う/承認」なしで自動参加確定＋成立を記録。
      if (rematchPairId && created?.id) {
        try {
          await fetch(`/api/rematch/${encodeURIComponent(rematchPairId)}/posted`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roundId: created.id }), cache: 'no-store',
          });
        } catch { /* 参加確定/記録の失敗は投稿自体を妨げない */ }
      }
      // 日程調整ポールから来た場合は、そのポールに作成した募集を紐付け、
      // ポール回答者を最初から参加者として自動追加する（サーバー側で実施）。
      if (fromPollId && created?.id) {
        try {
          await fetch(`/api/polls/${encodeURIComponent(fromPollId)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'link-round', roundId: created.id }), cache: 'no-store',
          });
          // 参加者が入った状態を即反映させるため一覧を取り直す。
          await store.refreshRounds().catch(() => {});
        } catch { /* 紐付け失敗は投稿を妨げない */ }
      }
      toast(visibility === 'invite' ? `🔒 ${inviteIds.length}人に招待状を送りました` : isComp ? 'コンペ募集を公開しました' : '募集を公開しました');
      // 公開直後は作った募集の詳細ページへ。id が取れなければホームへ。
      router.push(created?.id ? `/round/${created.id}` : '/home');
    } catch (e) {
      const msg = (e as Error).message;
      track('round_create_error', { message: msg, payload });
      toast('失敗: ' + msg, 'error');
    }
  }

  // 募集が制限されている場合は、フォームに入らせず手前で止める。
  if (noCreate) {
    return (
      <div className="px-5 py-16 text-center">
        <div className="text-4xl mb-3">🚫</div>
        <div className="text-sm font-black mb-1">ラウンド募集の利用が制限されています</div>
        {/* 問い合わせは「ゴル友」タブの一番上「管理者にDM」に一本化（2026-10-13） */}
        <div className="text-[12px] text-sub mb-6 leading-relaxed">ご不明な点は、下の「ゴル友」タブの一番上<br />「🛡️ 管理者にDM」からお問い合わせください。</div>
        <div className="flex flex-col items-center gap-2">
          <button onClick={() => router.push(`/chat/${chatIdFor(meId, ADMIN_MANAGER_ID)}?other=${ADMIN_MANAGER_ID}`)} className="px-5 py-2.5 bg-green text-white border-2 border-border rounded-xl text-sm font-black">🛡️ 管理者にDM</button>
          <button onClick={() => router.push('/home')} className="px-5 py-2.5 bg-bg border-[1.5px] border-border rounded-xl text-sm font-bold">ホームに戻る</button>
        </div>
      </div>
    );
  }

  if (step === 'select') {
    return (
      <>
        <div className="px-5 pt-2 pb-4 text-2xl font-black tracking-tight">募集・企画する</div>
        <div className="px-5">
          {/* まず日程調整（任意）。募集の前に候補日を出し合って日程を決められる。 */}
          <button
            onClick={startPoll}
            className="w-full text-left bg-blue-light rounded-card p-4 shadow-card mb-3 border-2 border-blue"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-blue text-white flex items-center justify-center text-2xl flex-shrink-0">📅</div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-black text-blue">まず日程調整する</div>
                <div className="text-[11px] text-sub mt-0.5">みんなの予定を◯△✕で集めてから募集（任意・URL共有OK）</div>
              </div>
              <div className="text-xl text-blue">›</div>
            </div>
          </button>
          <div className="text-[11px] text-muted text-center mb-4">日程がもう決まっていれば、下から直接どうぞ</div>

          {isAdmin && (
            <div className="bg-card rounded-card p-4 shadow-card mb-4 border-2 border-green-light">
              <div className="text-[13px] font-black mb-2.5">📣 どの名義で投稿しますか？</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPostAsOfficial(true)}
                  className={cn('flex-1 py-3 rounded-[10px] border-[1.5px] text-sm font-bold', postAsOfficial ? 'border-green bg-green-light text-green' : 'border-border bg-bg text-sub')}
                >
                  🏆 ゴルトモ公式
                </button>
                <button
                  onClick={() => setPostAsOfficial(false)}
                  className={cn('flex-1 py-3 rounded-[10px] border-[1.5px] text-sm font-bold', !postAsOfficial ? 'border-green bg-green-light text-green' : 'border-border bg-bg text-sub')}
                >
                  👤 個人アカウント
                </button>
              </div>
              <div className="text-[11px] text-muted mt-2">
                {postAsOfficial
                  ? 'この募集は「ゴルトモ公式」として表示されます'
                  : 'この募集はあなた個人の名義で表示されます'}
              </div>
            </div>
          )}
          <div className="text-[13px] font-bold text-sub mb-3">⛳ ラウンド</div>

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

          {/* ラウンド以外のイベント（2026-10-14）：旧「飲み会・親睦会を企画」をここに統合。紫でラウンド（緑）と区別 */}
          <div className="text-[13px] font-bold text-sub mt-5 mb-3">🎉 ラウンド以外のイベント</div>
          <button
            onClick={() => chooseEvent('drink')}
            className="w-full text-left bg-[#EFEAFF] rounded-card p-5 shadow-card mb-2.5 border-2 border-[#7B5CD6]"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-[#7B5CD6] text-white flex items-center justify-center text-3xl flex-shrink-0">
                🎉
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-black text-[#7B5CD6]">イベントを企画する</div>
                <div className="text-xs text-sub mt-1 leading-relaxed">飲み会・シミュレーションゴルフ・練習会・観戦など。出欠と質問を集計できる</div>
              </div>
              <div className="text-xl text-[#7B5CD6]">›</div>
            </div>
          </button>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {EVENT_KINDS.map((k) => (
              <button key={k.key} type="button" onClick={() => chooseEvent(k.key)}
                className="px-3 py-1.5 rounded-full border-[1.5px] border-border bg-card text-[12px] font-black text-text">
                {k.emoji} {k.label}
              </button>
            ))}
          </div>

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
  const isDrink = eventType === 'drink';
  const isEvent = isDrink && !!eventKind;
  const activeTitlePresets = isEvent ? EVENT_TITLE_PRESETS[eventKind!] : isDrink ? DRINK_TITLE_PRESETS : titlePresets;

  // タイトル（定型文から選ぶ＋自由入力）。ラウンド・イベント共通
  const titleField = (
    <Field label="タイトル">
      <select
        value={titleFree ? '__free__' : (activeTitlePresets.includes(title) ? title : (title ? '__free__' : ''))}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__free__') { setTitleFree(true); setTitle(''); }
          else { setTitleFree(false); setTitle(v); }
        }}
        className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none"
      >
        <option value="">選択してください</option>
        {activeTitlePresets.map((t) => <option key={t} value={t}>{t}</option>)}
        <option value="__free__">✏️ 自由入力</option>
      </select>
      {(titleFree || (title && !activeTitlePresets.includes(title))) && (
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 60))}
          placeholder={isEvent ? 'タイトルを自由に入力（例: 年内ラストの忘年会）' : 'タイトルを自由に入力（例: 朝イチ集合・早上がり）'}
          maxLength={60}
          className="w-full mt-2 p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none"
        />
      )}
    </Field>
  );
  // 事前集金の金額・振込先・入金期日。ラウンドの「事前集金」とイベントの「アプリで事前集金」で共通（2026-10-14）
  const paymentDetails = (
    <div className="mt-2 p-3 rounded-xl border-[1.5px] border-border bg-card flex flex-col gap-3">
      <div>
        <label className="block text-[11px] font-bold text-sub mb-1">金額（1人あたり・任意）</label>
        <div className="flex items-center gap-2">
          <NumberInput value={payAmount} onChange={setPayAmount} min={0} max={1000000} placeholder="例: 12000" ariaLabel="金額（1人あたり）"
            className="flex-1 min-w-0 p-3 border-[1.5px] border-border rounded-xl text-sm bg-bg outline-none" />
          <span className="text-sm font-bold text-sub flex-shrink-0">円</span>
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-bold text-sub mb-1">振込先の口座（任意）</label>
        <textarea value={payAccount} onChange={(e) => setPayAccount(e.target.value)} rows={2} maxLength={300}
          placeholder="例）◯◯銀行 △△支店 普通 1234567 ゴルトモ タロウ ／ PayPay ID: xxxx"
          className="w-full p-3 border-[1.5px] border-border rounded-xl text-sm bg-bg outline-none leading-relaxed resize-y" />
        <div className="text-[10px] text-muted mt-1">振込先は、参加している人にだけ表示されます。</div>
      </div>
      <div>
        <label className="block text-[11px] font-bold text-sub mb-1">入金期日（日付と時刻・任意）</label>
        <div className="flex gap-2">
          <input type="date" value={payDate} max={isEvent && eventDateMode === 'candidates' ? undefined : (date || undefined)} onChange={(e) => setPayDate(e.target.value)}
            className="flex-[3] min-w-0 p-3 border-[1.5px] border-border rounded-xl text-sm bg-bg outline-none" />
          <input type="time" value={payTime} onChange={(e) => setPayTime(e.target.value)}
            className="flex-[2] min-w-0 p-3 border-[1.5px] border-border rounded-xl text-sm bg-bg outline-none" />
        </div>
        {payDate && <button type="button" onClick={() => { setPayDate(''); setPayTime('23:59'); }} className="mt-1 text-[11px] text-sub font-bold">期日をなしにする</button>}
      </div>
      <div className="text-[10px] text-muted">あとから募集の詳細の「💰 入金」タブでも変更できます。</div>
    </div>
  );

  // ===== イベントの作成フォーム（2026-10-14）。ラウンドのタブ・コース・組分け・送迎・キャンセル規定は出さない =====
  if (isEvent && eventKind) {
    const inputCls = 'w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none';
    const dateCls = 'w-full min-w-0 max-w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none appearance-none';
    const payApp = payMethods.includes('app');
    const validOpts = dateOptions.filter((o) => o.date).length;
    return (
      <>
        <div className="px-5 pt-3">
          <button onClick={() => setStep('select')} className="text-sm text-blue font-semibold">← タイプ選択へ</button>
        </div>
        <div className="px-5 pt-2 pb-4 text-2xl font-black">🎉 イベントを企画</div>

        <div className="px-5">
          <div className="bg-card rounded-card p-5 shadow-card mb-4">
            <Field label="種類">
              <div className="flex flex-wrap gap-1.5">
                {EVENT_KINDS.map((k) => (
                  <button key={k.key} type="button" onClick={() => switchKind(k.key)}
                    className={cn('px-3 py-1.5 rounded-full border-[1.5px] text-[12px] font-black',
                      eventKind === k.key ? 'bg-[#7B5CD6] border-[#7B5CD6] text-white' : 'border-border bg-bg text-text')}>
                    {k.emoji} {k.label}
                  </button>
                ))}
              </div>
            </Field>

            {titleField}

            <Field label="📅 日程" required>
              <div className="flex gap-1 mb-2.5 bg-bg rounded-[10px] p-1">
                {([['fixed', 'この日に決まっている'], ['candidates', '候補日から決める']] as const).map(([k, label]) => (
                  <button key={k} type="button"
                    onClick={() => {
                      setEventDateMode(k);
                      // 候補日に切り替えたとき空なら2行用意（決まっている日があれば1つ目に入れる）
                      if (k === 'candidates' && dateOptions.length === 0) {
                        const t = Date.now().toString(36);
                        // カレンダーで選ぶので空の行は作らない（決めていた日があれば、それを1つ目の候補に）（2026-10-15）
                        setDateOptions(date ? [{ id: `d${t}0`, date, startTime }] : []);
                      }
                    }}
                    className={cn('flex-1 py-2 rounded-lg text-[12px] font-black', eventDateMode === k ? 'bg-[#7B5CD6] text-white' : 'text-sub')}>
                    {label}
                  </button>
                ))}
              </div>
              {eventDateMode === 'fixed' ? (
                <div className="flex gap-2">
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(dateCls, 'flex-[3]')} style={{ boxSizing: 'border-box' }} />
                  <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className="flex-[2] min-w-0 p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none">
                    {timeSlots.map((t) => <option key={t} value={t}>{t}〜</option>)}
                  </select>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {/* カレンダーで複数の日をまとめて選ぶ（2026-10-15）。タップで足す／外す。時間は下の行で1日ずつ、または「まとめて」 */}
                  <MultiDatePicker
                    selected={dateOptions.map((o) => o.date)}
                    max={20}
                    onToggle={(d) => setDateOptions((xs) => {
                      if (xs.some((x) => x.date === d)) return xs.filter((x) => x.date !== d);
                      const filled = xs.filter((x) => x.date);   // 日付が空の行は、カレンダーで選んだ日で置き換える
                      if (filled.length >= 20) return xs;   // 候補日は20日まで（2026-10-15）
                      const t = filled[filled.length - 1]?.startTime ?? startTime;
                      return [...filled, { id: `d${Date.now().toString(36)}${filled.length}`, date: d, startTime: t }]
                        .sort((a, b) => a.date.localeCompare(b.date));
                    })}
                  />
                  {dateOptions.filter((o) => o.date).length >= 2 && (
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-sub">
                      <span className="flex-shrink-0">時間をまとめて</span>
                      <select value="__ph" onChange={(e) => { const v = e.target.value; if (v === '__ph') return; setDateOptions((xs) => xs.map((x) => ({ ...x, startTime: v }))); }}
                        className="flex-1 min-w-0 p-2 border-[1.5px] border-border rounded-[10px] text-[12px] bg-bg outline-none">
                        <option value="__ph" disabled hidden>選ぶ（全部の候補日に入る）</option>
                        <option value="">時間未定</option>
                        {timeSlots.map((t) => <option key={t} value={t}>{t}〜</option>)}
                      </select>
                    </div>
                  )}
                  {dateOptions.map((o, i) => (
                    <div key={o.id} className="flex items-center gap-1.5">
                      <span className="w-5 text-[11px] font-black text-[#7B5CD6] text-center flex-shrink-0">{i + 1}</span>
                      <input type="date" value={o.date}
                        onChange={(e) => setDateOptions((xs) => xs.map((x) => (x.id === o.id ? { ...x, date: e.target.value } : x)).sort((a, b) => (a.date || '9').localeCompare(b.date || '9')))}
                        className="flex-[3] min-w-0 p-2.5 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none appearance-none" style={{ boxSizing: 'border-box' }} />
                      <select value={o.startTime}
                        onChange={(e) => setDateOptions((xs) => xs.map((x) => (x.id === o.id ? { ...x, startTime: e.target.value } : x)))}
                        className="flex-[2] min-w-0 p-2.5 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none">
                        <option value="">時間未定</option>
                        {timeSlots.map((t) => <option key={t} value={t}>{t}〜</option>)}
                      </select>
                      <button type="button" aria-label="この候補日を消す"
                        onClick={() => setDateOptions((xs) => xs.filter((x) => x.id !== o.id))}
                        className="w-7 h-7 flex items-center justify-center text-muted font-black flex-shrink-0">✕</button>
                    </div>
                  ))}
                  {dateOptions.length < 20 && (
                    <button type="button" onClick={addDateOption}
                      className="w-full py-2 rounded-[10px] border-[1.5px] border-dashed border-[#7B5CD6] text-[12px] font-black text-[#7B5CD6] bg-card">
                      ＋ 候補日を足す
                    </button>
                  )}
                  <div className={cn('text-[11px] font-bold', validOpts >= 2 ? 'text-[#7B5CD6]' : 'text-orange')}>
                    候補日 {validOpts}つ{validOpts < 2 ? '（2つ以上入れてください）' : ''}・20日まで
                  </div>
                </div>
              )}
              <div className="mt-1.5 text-[10px] text-muted font-medium leading-relaxed">
                「候補日から決める」なら、みんなに◯△✕で答えてもらって、あとで主催者がどの日でも選んで決められる
              </div>
            </Field>

            <Field label="📍 場所（自由に書ける）" hint="（任意）">
              <input value={venue} onChange={(e) => setVenue(e.target.value.slice(0, 80))} maxLength={80}
                placeholder="例：新宿駅付近（お店は決まりしだい連絡）" className={inputCls} />
              <input value={venueUrl} onChange={(e) => setVenueUrl(e.target.value.slice(0, 400))} inputMode="url"
                placeholder="お店・地図のURL（任意・あとからでもOK）" className={cn(inputCls, 'mt-2')} />
            </Field>

            <Field label="💴 会費と払い方" hint="（任意）">
              <input value={price} onChange={(e) => setPrice(e.target.value.slice(0, 40))} maxLength={40}
                placeholder="例：5,000円くらい（飲み放題つき）" className={inputCls} />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {PAY_METHODS.map((m) => {
                  const on = payMethods.includes(m.key);
                  return (
                    <button key={m.key} type="button" onClick={() => togglePayMethod(m.key)}
                      className={cn('px-3 py-1.5 rounded-full border-[1.5px] text-[12px] font-black',
                        on ? 'bg-[#7B5CD6] border-[#7B5CD6] text-white' : 'border-border bg-bg text-sub')}>
                      {on ? '✓ ' : ''}{m.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-1.5 text-[10px] text-muted font-medium leading-relaxed">
                いくつでも選べる。「アプリで事前集金」はラウンドと同じ入金管理（振込先・期日・催促）が使えます。
              </div>
              <input value={payNote} onChange={(e) => setPayNote(e.target.value.slice(0, 200))} maxLength={200}
                placeholder="補足（任意・例：PayPayは当日までに）" className={cn(inputCls, 'mt-2')} />
              {payApp && paymentDetails}
            </Field>

            <div className="flex gap-2 mb-1.5">
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-bold text-sub mb-1.5">定員 <span className="text-muted font-medium">（任意）</span></label>
                <div className="flex items-center gap-1.5">
                  <NumberInput value={eventCap} onChange={setEventCap} min={2} max={200} placeholder="なし" ariaLabel="定員（自分を含む）"
                    className="flex-1 min-w-0 p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none" />
                  <span className="text-sm font-bold text-sub flex-shrink-0">人</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-bold text-sub mb-1.5">申込の締切 <span className="text-muted font-medium">（任意）</span></label>
                <input type="date" value={eventDeadline} max={eventDateMode === 'fixed' ? (date || undefined) : undefined}
                  onChange={(e) => setEventDeadline(e.target.value)} className={dateCls} style={{ boxSizing: 'border-box' }} />
              </div>
            </div>
            <div className="mb-4 text-[10px] text-muted font-medium">定員は自分を含めた人数。空欄なら定員なし。締切はその日まで申し込めます。</div>

            <VisibilityCard visibility={visibility} onVisibility={setVisibility} inviteIds={inviteIds} onInviteIds={setInviteIds} accent="purple" />
          </div>

          <div className="bg-card rounded-card p-5 shadow-card mb-4">
            <div className="text-[13px] font-black mb-2.5">❓ 参加者に聞くこと <span className="text-[11px] text-muted font-bold">（集計される）</span></div>
            <EventQuestionEditor value={questions} onChange={setQuestions} />
          </div>

          <div className="bg-card rounded-card p-5 shadow-card mb-4">
            <Field label="説明・ひとこと" hint="（任意・参加者に表示されます）">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000}
                placeholder="どんな集まりか・持ち物・集合のしかたなどを自由に。改行OK"
                className="w-full h-28 p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none resize-y" />
            </Field>
            <button onClick={publish} className="w-full py-4 rounded-xl text-[15px] font-black text-white bg-[#7B5CD6] border-2 border-border">
              {visibility === 'invite' ? `🔒 ${inviteIds.length}人に招待状を送って企画する` : '🎉 この内容で企画する'}
            </button>
          </div>
        </div>
        <div className="h-5" />
      </>
    );
  }

  return (
    <>
      <div className="px-5 pt-3">
        <button onClick={() => setStep('select')} className="text-sm text-blue font-semibold">← タイプ選択へ</button>
      </div>
      <div className="px-5 pt-2 pb-4 text-2xl font-black">
        {isDrink ? '🍻 飲み会・親睦会を企画' : isConfirmed ? '⛳ コース予約済みで募集' : '🗺️ コース未定で募集'}
      </div>

      <div className="px-5">
        <div className="bg-card rounded-card p-5 shadow-card">
          {rematchPairId && rematchPartnerName && (
            <div className="mb-4 bg-green-light border-[1.5px] border-green rounded-xl p-3">
              <div className="text-[12px] font-black text-green">🔁 {rematchPartnerName}さんとの再ラウンド</div>
              <div className="text-[11px] text-sub mt-0.5">合意した日程をセットしました。「未定」でも「予約済み」でもOK。投稿すると{rematchPartnerName}さんは招待・承認なしで自動で参加確定になります。</div>
            </div>
          )}

          {/* セクション切り替えタブ（募集内容／募集人数／ピックアップ）。入金は「募集内容」のキャンセル日の上へ移動（2026-10-12）。
              飲み会は「募集人数」も「ピックアップ」も無く1セクションのみなのでタブ自体を出さない。 */}
          {!isDrink && (
            <div className="flex gap-1 mb-4 bg-bg rounded-xl p-1">
              {([['basic', '募集内容'], ['count', '募集人数'], ['pickup', 'ピックアップ']] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={'flex-1 py-2 rounded-lg text-[11px] font-black ' + (tab === k ? 'bg-orange text-white shadow-sm' : 'text-sub')}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* ── 募集内容 タブ（前半） ── */}
          {tab === 'basic' && (
          <>
          {titleField}

          {isDrink ? (
            <>
              <Field label="場所（店名など）" hint="（任意・「未定」でもOK）">
                <input value={venue} onChange={(e) => setVenue(e.target.value.slice(0, 60))} placeholder="例: 新宿の居酒屋◯◯ / 未定（あとで決める）" className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none" />
              </Field>
              <Field label="開催日" required>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full min-w-0 max-w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none appearance-none" style={{ boxSizing: 'border-box' }} />
              </Field>
              <Field label="開始時間" hint="（任意）">
                <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none">
                  {timeSlots.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="会費の目安" hint="（任意）">
                <input value={price} onChange={(e) => setPrice(e.target.value.slice(0, 40))} placeholder="例: ¥4,000〜5,000 / 割り勘" className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none" />
              </Field>
            </>
          ) : isConfirmed ? (
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
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full min-w-0 max-w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none appearance-none" style={{ boxSizing: 'border-box' }} />
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
            <label className="block text-xs font-bold text-sub mb-1.5">募集人数 <span className="text-red">*</span> <span className="text-muted font-medium">（2〜50人）</span></label>
            <Stepper value={maxSpots} onMinus={() => changeTotal(-1)} onPlus={() => changeTotal(1)} minusDisabled={maxSpots <= MIN_TOTAL} plusDisabled={maxSpots >= MAX_TOTAL} suffix="人" />
            {maxSpots < 2 ? (
              <div className="mt-1.5 px-3 py-2 bg-orange-light rounded-lg text-[11px] text-orange font-bold">＋ を押して募集人数を選んでください（必須）</div>
            ) : (
              <div className="mt-1.5 px-3 py-2 bg-green-light rounded-lg text-[11px] text-green font-bold">
                {hostNotCounted ? '🏆 ゴルトモ公式（主催者）は人数に入りません。プレーする人の合計人数です' : '👤 主催者（あなた）を含めた合計人数です'}
              </div>
            )}

            {/* 性別ごとの募集内訳（人数ボタンのすぐ下・間隔を詰める） */}
            <div className="mt-3">
              <label className="block text-xs font-bold text-sub mb-1.5">性別ごとの募集内訳 <span className="text-muted font-medium">{hostNotCounted ? `合計 ${maxSpots}人（ゴルトモ公式は人数に入りません）` : `（合計 ${maxSpots}人・自分を含む）`}</span></label>
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
                合計 <b className="text-text">{spotsMale + spotsFemale + bAny}</b>人{hostNotCounted ? '（ゴルトモ公式は人数に入りません）' : '（自分を含む）'}＝ 男性{spotsMale}・女性{spotsFemale}・どちらでも{bAny}
                <span className="block text-[10px] text-muted font-medium mt-0.5">この合計が上の「募集人数（{maxSpots}人）」と一致します。「どちらでもOK」は残りから自動計算。</span>
              </div>
            </div>

            {/* 主催者の知り合い（内訳のうち既に集まっている人） */}
            <Field label="主催者の知り合い" hint="（この内訳のうち、既に集まっている人・任意）">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-blue flex items-center gap-1.5">👨 男性</span>
                  <Stepper sm value={externalMale} onMinus={() => changeExtMale(-1)} onPlus={() => changeExtMale(1)} minusDisabled={externalMale <= 0} plusDisabled={extTotal >= maxSpots - hostSeatN} suffix="人" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-pink-600 flex items-center gap-1.5">👩 女性</span>
                  <Stepper sm value={externalFemale} onMinus={() => changeExtFemale(-1)} onPlus={() => changeExtFemale(1)} minusDisabled={externalFemale <= 0} plusDisabled={extTotal >= maxSpots - hostSeatN} suffix="人" />
                </div>
              </div>
              <div className="mt-1.5 text-[10px] text-muted font-medium">
                ゴルトモにいないメンバー（他アプリ等で既に集まっている人）。上の募集人数の内数で、その分ゴルトモでの募集枠が減ります。
              </div>

              {/* 人数ぶんの名前入力（任意）。入力するとそのまま参加者一覧・入金タブにゲストとして並ぶ。 */}
              {extTotal > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="text-[11px] font-bold text-sub mb-1.5">👤 知り合いの名前 <span className="text-muted font-medium">（任意・空欄でもOK）</span></div>
                  <div className="flex flex-col gap-1.5">
                    {Array.from({ length: extTotal }, (_, i) => (
                      <input
                        key={i}
                        value={guestNames[i] || ''}
                        onChange={(e) => setGuestNames((prev) => {
                          const next = [...prev];
                          while (next.length < extTotal) next.push('');
                          next[i] = e.target.value;
                          return next;
                        })}
                        maxLength={30}
                        placeholder={`${i + 1}人目（例: 田中さん）`}
                        className="w-full text-[13px] border-[1.5px] border-border rounded-lg px-2.5 py-2 bg-bg outline-none"
                      />
                    ))}
                  </div>
                  <div className="mt-1.5 text-[10px] text-muted font-medium">
                    入力した名前は参加者一覧に「ゲスト」として並び、入金タブでも入金チェックの対象になります。
                  </div>
                </div>
              )}
            </Field>

            {/* 共同管理者（任意・ゴル友から複数選択可） */}
            <Field label="共同管理者" hint="（任意・ゴル友から複数可／あなたと同じ管理権限）">
              {coHostIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {coHostIds.map((id) => {
                    const c = coHostCandidates.find((x) => x.id === id);
                    return (
                      <span key={id} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 bg-green-light rounded-full">
                        <span className="text-[13px] font-bold text-text">🤝 {c?.displayName || 'メンバー'}</span>
                        <button type="button" className="w-5 h-5 flex items-center justify-center text-red font-black" onClick={() => setCoHostIds((prev) => prev.filter((x) => x !== id))}>×</button>
                      </span>
                    );
                  })}
                </div>
              )}
              <button type="button" onClick={() => setCoHostPickerOpen((v) => !v)} className="w-full px-3 py-2 bg-bg rounded-lg text-sm font-bold text-sub border border-line">
                {coHostPickerOpen ? '閉じる' : '＋ 共同管理者を選ぶ'}
              </button>
              {coHostPickerOpen && (
                <div className="mt-2 flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                  {coHostCandidates.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-muted font-medium">選べるゴル友（レビューで「行きたい」同士になった人）がまだいません。</div>
                  ) : coHostCandidates.map((c) => {
                    const selected = coHostIds.includes(c.id);
                    return (
                      <button key={c.id} type="button"
                        onClick={() => setCoHostIds((prev) => selected ? prev.filter((x) => x !== c.id) : [...prev, c.id])}
                        className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-left', selected ? 'bg-green-light' : 'bg-bg')}>
                        {c.avatarUrl ? <img src={c.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" /> : <span className="text-lg">{c.avatar}</span>}
                        <span className="text-sm font-bold text-text flex-1">{c.displayName}</span>
                        {selected && <span className="text-green font-black">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="mt-1.5 text-[10px] text-muted font-medium">
                選ばれた人は投稿と同時に参加確定（申請不要）になり、あなたと同じく編集・承認・組み分けなどの管理操作ができます。参加確定として枠を使います（人数が足りなければ自動で+1）。
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
            {pickupMode === 'no' && <div className="mt-2 px-3 py-2 bg-bg rounded-lg text-[11px] text-sub font-medium">送迎なしで投稿します。</div>}

            {pickupMode === 'yes' && (
              <div className="mt-3">
                <label className="block text-xs font-bold text-sub mb-1.5">🚗 ピックアップできる駅 <span className="text-muted font-medium">（任意・あとから追加OK）</span></label>
                <PickupStationPicker value={pickupStations} onChange={setPickupStations} />
                {pickupStations.length > 0 && (
                  <>
                    <div className="mt-2.5 flex items-center gap-2">
                      <span className="text-xs font-bold text-sub">自分含め乗れる人数</span>
                      <NumberInput
                        min={1} max={8}
                        value={pickupCapacity || null}
                        onChange={(v) => setPickupCapacity(v ?? 0)}
                        placeholder="例: 4"
                        ariaLabel="自分含め乗れる人数"
                        className="w-16 px-2 py-1.5 border-[1.5px] border-border rounded-[8px] text-sm bg-bg outline-none text-center"
                      />
                      <span className="text-xs text-sub">名</span>
                    </div>
                    <div className="mt-2 px-3 py-2 bg-green-light rounded-lg text-[11px] font-bold text-green">
                      {pickupStations.join('・')} から送迎OK{pickupCapacity ? `（自分含め${pickupCapacity}名）` : ''} として表示されます🚗
                    </div>
                  </>
                )}
              </div>
            )}
          </>
          )}

          {/* ── 募集内容 タブ（後半：主催者からのメッセージ） ── */}
          {tab === 'basic' && (
          <>
          {/* 募集ページの「📣 主催者からのメッセージ」と同じ hostNote（2026-10-12） */}
          <Field label="主催者からのメッセージ" hint="（任意・参加者に表示されます）">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} placeholder="注意事項・集合や進行のルール・持ち物・表彰などを自由に。改行OK" className="w-full h-28 p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none resize-y" />
          </Field>
          {/* 事前集金はキャンセル日より先に決める（条件の文例・期日の「合わせる」が連動する）（2026-10-12） */}
          {!isDrink && (
            <Field label="事前集金" hint="（任意・事前に集金してまとめて払うとき）">
              <button
                type="button"
                onClick={togglePaymentEnabled}
                className={cn('w-full flex items-center gap-3 p-3 rounded-[10px] border-[1.5px] text-left',
                  paymentEnabled ? 'border-green bg-green-light' : 'border-border bg-bg')}
              >
                <span className={cn('w-6 h-6 rounded-md flex items-center justify-center text-[14px] font-black flex-shrink-0 border-2',
                  paymentEnabled ? 'bg-green border-green text-white' : 'bg-card border-border text-transparent')}>✓</span>
                <span className="flex-1 min-w-0">
                  <span className={cn('block text-sm font-bold', paymentEnabled ? 'text-green' : 'text-sub')}>💰 事前集金する（入金管理を使う）</span>
                  <span className="block text-[10px] text-muted font-medium mt-0.5">参加者ごとに入金済みかチェックできます</span>
                </span>
              </button>
              <div className="mt-1.5 text-[10px] text-muted font-medium">
                ONにすると募集の詳細に「💰 入金」タブが出ます。主催者・共同管理者が参加者一覧をポチポチして入金確認でき、その状況は参加メンバー全員が見られます。使わない場合はこのままでOK（あとから編集画面でONにもできます）。
              </div>
              {paymentEnabled && paymentDetails}
            </Field>
          )}
          {!isDrink && (
            <Field label="キャンセル日" hint="（任意）">
              <CancelPolicyEditor value={cancelDraft} onChange={setCancelDraft} roundDate={date || undefined}
                prepaid={paymentEnabled} paymentDeadline={paymentEnabled ? payDeadline : 0} />
            </Field>
          )}
          {/* 公開範囲（2026-10-14）：みんなに公開／招待した人だけ（選んだ人にだけ非公開の招待状） */}
          <VisibilityCard visibility={visibility} onVisibility={setVisibility} inviteIds={inviteIds} onInviteIds={setInviteIds} />
          </>
          )}

          <button
            onClick={publish}
            className={cn('w-full py-4 rounded-xl text-[15px] font-bold text-white', isComp ? 'bg-orange' : 'bg-green')}
          >
            {visibility === 'invite' ? `🔒 ${inviteIds.length}人に招待を送って募集する`
              : isDrink ? (isComp ? '🍻 飲み会を公開する（5人以上）' : '🍻 飲み会を公開する') : isComp ? '🏆 コンペ募集を公開する' : '募集を公開する'}
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
