'use client';

import { useState } from 'react';
import { toast } from '@/components/Toast';

// 再会の画面の先頭に置く「いまの気持ち」の確認。
//
// 1ヶ月前に「また回りたい」と押していても、いま同じとは限らない。
// 日程を入れる前にここで聞き直して、その場で選び直せるようにする。
//
// 既定は**いまの選択**が入った状態。何もしなければ今までどおり進む。
// 別のものを選んだときだけ「決定する」が押せるようになる。
//
// 確認ダイアログの本文は1文だけにしている。裏では過去のレビューが
// 書き換わり相手の公開数字も動くが、それを並べても選ぶ助けにならない。
// 迷っている人が本当に気にするのは「相手にバレないか」だけ。
export type Feeling = 'again' | 'romantic' | 'either' | 'never';

export function FeelingBox({
  pairId, isRomantic, otherName, roundDate, onChanged,
}: {
  pairId: string;
  isRomantic: boolean;
  otherName: string;
  roundDate?: string;
  onChanged: (f: Feeling) => void;
}) {
  const current: Feeling = isRomantic ? 'romantic' : 'again';
  const [sel, setSel] = useState<Feeling>(current);
  const [confirm, setConfirm] = useState<Feeling | null>(null);
  const [busy, setBusy] = useState(false);
  const [openHow, setOpenHow] = useState(false);

  // 気になるマッチのときは「友人としてまた回りたい」への切り替えも出す。
  const options: { key: Feeling; label: string; note?: string }[] = isRomantic
    ? [
        { key: 'romantic', label: '気になる' },
        { key: 'again', label: '友人としてまた回りたい', note: 'ゴルフ仲間として。会い方の相談は出なくなります' },
        { key: 'either', label: 'どっちでもいい' },
        { key: 'never', label: 'ごめんなさい' },
      ]
    : [
        { key: 'again', label: 'また回りたい' },
        { key: 'either', label: 'どっちでもいい' },
        { key: 'never', label: 'ごめんなさい' },
      ];

  // 気になるマッチは画面全体がピンク基調なので、この枠もそれに合わせる。
  // また回りたいマッチは青（再会は同性どうしでも成立するため、性別を連想させない色）。
  const c = isRomantic
    ? { box: 'bg-pink-50 border-pink-500', on: 'border-pink-600 bg-white', dot: 'border-pink-600 bg-pink-600',
        btn: 'bg-pink-600 border-pink-600', link: 'text-pink-600' }
    : { box: 'bg-blue-light border-blue', on: 'border-green bg-green-light', dot: 'border-green bg-green',
        btn: 'bg-blue border-blue', link: 'text-blue' };

  async function save(f: Feeling) {
    setBusy(true);
    try {
      const r = await fetch(`/api/rematch/${encodeURIComponent(pairId)}/feeling`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feeling: f }), credentials: 'include',
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.message || '変更できませんでした');
      setConfirm(null);
      onChanged(f);
    } catch (e) {
      toast((e as Error).message, 'error');
      setConfirm(null);
    } finally { setBusy(false); }
  }

  const changed = sel !== current;
  const label = (k: Feeling) => options.find((o) => o.key === k)?.label || '';

  return (
    <>
      <div className={'border-2 rounded-card p-4 mb-4 ' + c.box}>
        <div className="text-[14px] font-black">
          🤔 いまも「{isRomantic ? '気になる' : 'また回りたい'}」ですか？
        </div>
        <div className="text-[11px] font-bold text-sub mt-1 leading-relaxed">
          {roundDate ? `${roundDate} のあと、` : ''}あなたは「{isRomantic ? '異性として気になる' : 'また回りたい'}」を選んでいます。
          気が変わっていたら、ここで変えられます。
        </div>

        <div className="mt-2.5 space-y-2">
          {options.map((o) => {
            const on = sel === o.key;
            return (
              <button key={o.key} onClick={() => setSel(o.key)}
                className={'w-full flex items-center gap-2 text-left border-2 rounded-xl px-3 py-2.5 '
                  + (on ? c.on : 'border-border bg-white')}>
                <span className={'w-[15px] h-[15px] rounded-full border-2 flex-none '
                  + (on ? c.dot : 'border-muted')} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-black leading-tight">{o.label}</span>
                  {o.note && <span className="block text-[10px] font-bold text-sub mt-0.5">{o.note}</span>}
                </span>
              </button>
            );
          })}
        </div>

        <button disabled={!changed || busy} onClick={() => setConfirm(sel)}
          className={'w-full mt-3 py-3 rounded-xl text-[14px] font-black border-2 '
            + (changed ? c.btn + ' text-white' : 'bg-[#EDEDED] text-[#A9A9A9] border-muted')}>
          決定する{changed ? '' : '（いまのまま）'}
        </button>

        <button onClick={() => setOpenHow((v) => !v)}
          className={'block w-full text-center text-[11px] font-bold underline mt-2 ' + c.link}>
          再会エンジンってなに？ {openHow ? '▴' : '▾'}
        </button>

        {openHow && (
          <div className="mt-2 bg-white border-[1.5px] border-dashed border-border rounded-xl p-3">
            {[
              ['1', <>一緒に回ったあと、<b>おたがいが</b>「また回りたい」を選ぶと成立します。片方だけでは動きません。</>],
              ['2', <>しばらく経つと<b>運営から自動でお誘い</b>が届きます。</>],
              ['3', <>ふたりが<b>行ける日を入れる</b>と、重なった日だけが表示されます。</>],
              ['4', <>日を決めると<b>ラウンドの募集が自動で作られます</b>。</>],
              ['･', <>気が変わったら上でいつでも止められます。<b>相手に知られることはありません。</b></>],
            ].map(([n, body], i) => (
              <div key={i} className={'flex gap-2 text-[11px] font-bold leading-relaxed '
                + (i ? 'mt-2 pt-2 border-t border-dashed border-hair' : '')}>
                <span className={'flex-none w-4 h-4 rounded-full text-white grid place-items-center text-[9px] font-black mt-0.5 '
                  + (isRomantic ? 'bg-pink-600' : 'bg-blue')}>{n as string}</span>
                <span>{body}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirm && (
        <div className="fixed inset-0 bg-black/45 z-[150] flex items-center justify-center p-5">
          <div className="bg-card border-[3px] border-border rounded-card shadow-lg p-5 w-full max-w-[330px]">
            <div className="text-[16.5px] font-black text-center leading-snug">
              「{label(confirm)}」に<br />変えますか？
            </div>
            <div className="text-[12.5px] font-bold text-sub text-center mt-2.5 leading-relaxed">
              {otherName}さんに<b className="text-text">知られることはありません。</b>
            </div>
            <button disabled={busy} onClick={() => save(confirm)}
              className={'w-full mt-4 py-3.5 rounded-xl text-[15px] font-black border-2 text-white disabled:opacity-50 ' + c.btn}>
              {busy ? '変更中…' : 'はい、変更する'}
            </button>
            <button onClick={() => { setConfirm(null); setSel(current); }}
              className="w-full mt-2 py-2.5 rounded-xl text-[13px] font-bold border-2 border-hair bg-white text-muted">
              もどる
            </button>
          </div>
        </div>
      )}
    </>
  );
}
