'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getMe, store, useStore } from '@/lib/store';
import { usePopupSlot, POPUP_PRIORITY, popupEvent } from '@/lib/popupSlot';
import { BirthdayPicker } from './BirthdayPicker';
import { toast } from './Toast';

// 前から年齢で登録している会員へ「誕生日を入力してください」（2026-10-20 本人指定）。
// 年齢は誕生日から数える仕様に変えた（lib/ageGate.liveAge・40歳の誕生日から20〜30代は見られなくなる）。
// 出すのはマイページ（/mypage）を開いたときだけ。マイページを開かない人は今まで通り（登録した年齢のまま）。
// 入れるまでは、マイページを開くたびに出す（「あとで」で、そのときは閉じる）。保存は PATCH /api/me { birthday }。
export function BirthdayPrompt({ blocked }: { blocked: boolean }) {
  const me = useStore(getMe) as any;
  const meId = useStore((s) => s.meId);
  const hydrated = useStore((s) => s.hydrated);
  const pathname = usePathname() || '';
  const onMypage = pathname === '/mypage';
  const [closed, setClosed] = useState(false);
  const [birthday, setBirthday] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!onMypage) setClosed(false); }, [onMypage]);
  const want = hydrated && !!meId && meId !== 'me' && !blocked && !closed && onMypage
    && Number(me?.age || 0) > 0 && !me?.birthday;
  const active = usePopupSlot('birthday', POPUP_PRIORITY.birthday, want);
  if (!active) return null;

  async function save() {
    if (!birthday || busy) { if (!birthday) toast('誕生日を選んでください', 'error'); return; }
    setBusy(true);
    try {
      await store.updateMe({ birthday } as any);
      popupEvent('birthday', 'save');
      toast('誕生日を登録しました');
      setClosed(true);
    } catch (e) {
      toast((e as Error).message || '保存できませんでした', 'error');
    } finally { setBusy(false); }
  }

  return (
    <div className="absolute inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-5">
      <div className="bg-card rounded-[22px] max-w-[380px] w-full shadow-[5px_5px_0_#1E3A30] border-[3px] border-border overflow-hidden">
        <div className="bg-green text-white px-5 pt-5 pb-4 border-b-[3px] border-border text-center">
          <div className="text-[34px] leading-none">🎂</div>
          <h3 className="text-[17px] font-black leading-snug mt-2">誕生日を入力してください</h3>
        </div>
        <div className="px-5 pt-4 pb-5">
          <p className="text-[12.5px] text-sub leading-relaxed mb-3">
            年齢ではなく<b className="text-text">誕生日から年齢を判別する仕様</b>に変更したので、誕生日を入力してください。
          </p>
          <BirthdayPicker value={birthday} onChange={setBirthday} />
          <ul className="mt-2 text-[10.5px] text-muted leading-relaxed space-y-0.5">
            <li>・ほかの会員には年齢だけが見え、誕生日は見えません。</li>
            <li>・一度登録すると、あとから変えられません。正しく入れてください。</li>
          </ul>
          <button type="button" onClick={save} disabled={busy}
            className="w-full mt-4 py-3.5 bg-orange text-white rounded-2xl font-black text-[15px] border-[2.5px] border-border shadow-[3px_3px_0_#1E3A30] active:translate-y-[2px] active:shadow-none disabled:opacity-60">{busy ? '保存中…' : '登録する'}</button>
          <button type="button" onClick={() => { popupEvent('birthday', 'later'); setClosed(true); }} className="block w-full mt-2 py-1.5 text-[12px] text-sub font-bold">あとで</button>
        </div>
      </div>
    </div>
  );
}
