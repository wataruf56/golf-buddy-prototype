'use client';

import Link from 'next/link';
import { ageGateReason } from '@/lib/ageGate';

export function AgeGateScreen({ age }: { age: number | undefined | null }) {
  const reason = ageGateReason(age);
  const isUnset = reason === 'unset';
  const tooYoung = reason === 'too_young';
  const tooOld = reason === 'too_old';

  return (
    <div className="px-5 py-3">
      <div className="bg-card rounded-card p-6 shadow-card text-center mt-6">
        <div className="text-4xl mb-3">{isUnset ? '📝' : '🔒'}</div>
        <div className="text-base font-black mb-2">
          {isUnset
            ? '年齢を登録してください'
            : tooYoung
              ? '20歳以上の方限定です'
              : '60歳以上の方は今後対応予定です'}
        </div>
        <div className="text-[12px] text-sub leading-relaxed mb-4">
          {isUnset ? (
            <>
              この機能を使うには<br />
              プロフィールに年齢を登録してください。
            </>
          ) : (
            <>
              現在ご用意しているコミュニティは<br />
              <b className="text-text">20〜30代</b>と<b className="text-text">40〜50代</b>の2つです。
              <br /><br />
              <span className="text-[11px] text-muted">
                対象外の方も<br />スイング解析機能はご利用いただけます。
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
