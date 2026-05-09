'use client';

import Link from 'next/link';
import { ageGateReason } from '@/lib/ageGate';

export function AgeGateScreen({ age }: { age: number | undefined | null }) {
  const reason = ageGateReason(age);
  const isUnset = reason === 'unset';

  return (
    <div className="px-5 py-3">
      <div className="bg-card rounded-card p-6 shadow-card text-center mt-6">
        <div className="text-4xl mb-3">{isUnset ? '📝' : '🔒'}</div>
        <div className="text-base font-black mb-2">
          {isUnset ? '年齢を登録してください' : '20〜30代の方限定の機能です'}
        </div>
        <div className="text-[12px] text-sub leading-relaxed mb-4">
          {isUnset ? (
            <>
              この機能を使うには<br />
              プロフィールに年齢を登録してください。
            </>
          ) : (
            <>
              ラウンド募集・参加・メッセージ機能は<br />
              <b className="text-text">20〜39歳の方</b>がご利用いただけます。
              <br /><br />
              <span className="text-[11px] text-muted">
                スイング解析機能は引き続きご利用いただけます。
              </span>
            </>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {isUnset && (
            <Link href="/mypage/edit" className="block w-full py-3 bg-green text-white rounded-xl text-sm font-bold">
              プロフィールを編集する
            </Link>
          )}
          <Link href="/swing" className="block w-full py-3 bg-blue text-white rounded-xl text-sm font-bold">
            🏌️ スイング解析を試す
          </Link>
          <Link href="/mypage" className="block w-full py-3 bg-bg border-[1.5px] border-border rounded-xl text-sm font-bold">
            マイページに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
