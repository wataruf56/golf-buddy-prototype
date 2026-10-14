'use client';

// イベントの「❓ 参加者に聞くこと（集計される）」の編集（2026-10-14）。
// 主催者が質問を自由に足す・直す・消す。選んでもらう（選択肢・1つだけ／いくつでも）か、自由に書いてもらうか。
// 保存形式は lib/types の EventQuestion。サーバー側でも sanitizeQuestions で整える。
import { useState } from 'react';
import type { EventQuestion } from '@/lib/types';
import { newQuestionId } from '@/lib/eventRound';
import { toast } from '@/components/Toast';
import { cn } from '@/lib/utils';

export const MAX_QUESTIONS = 10;
const MIN_CHOICES = 2, MAX_CHOICES = 12;

type Draft = { text: string; kind: 'choice' | 'text'; options: string[]; multi: boolean; required: boolean };
const emptyDraft = (): Draft => ({ text: '', kind: 'choice', options: ['', ''], multi: false, required: false });
const toDraft = (q: EventQuestion): Draft => ({
  text: q.text, kind: q.kind,
  options: q.kind === 'choice' && q.options?.length ? [...q.options] : ['', ''],
  multi: !!q.multi, required: !!q.required,
});

/** 質問の要約（選ぶ：A／B／C ・ 自由に書く）。 */
export function questionSummary(q: EventQuestion): string {
  const base = q.kind === 'choice'
    ? `選ぶ${q.multi ? '（いくつでも）' : ''}：${(q.options || []).join('／')}`
    : '自由に書く';
  return q.required ? `${base}・必須` : base;
}

export function EventQuestionEditor({ value, onChange }: { value: EventQuestion[]; onChange: (qs: EventQuestion[]) => void }) {
  // editing: 'new' ＝新しい質問 / 質問ID ＝その質問を編集中 / null ＝閉じている
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  function openNew() {
    if (value.length >= MAX_QUESTIONS) { toast(`質問は${MAX_QUESTIONS}個までです`, 'error'); return; }
    setDraft(emptyDraft()); setEditing('new');
  }
  function openEdit(q: EventQuestion) { setDraft(toDraft(q)); setEditing(q.id); }
  function close() { setEditing(null); }

  function save() {
    const text = draft.text.trim().slice(0, 80);
    if (!text) { toast('質問文を入れてください', 'error'); return; }
    let q: EventQuestion;
    const id = editing && editing !== 'new' ? editing : newQuestionId();
    if (draft.kind === 'choice') {
      const options = Array.from(new Set(draft.options.map((o) => o.trim().slice(0, 30)).filter(Boolean)));
      if (options.length < MIN_CHOICES) { toast(`選択肢を${MIN_CHOICES}つ以上入れてください`, 'error'); return; }
      q = { id, text, kind: 'choice', options: options.slice(0, MAX_CHOICES), multi: draft.multi, required: draft.required };
    } else {
      q = { id, text, kind: 'text', required: draft.required };
    }
    onChange(editing === 'new' ? [...value, q] : value.map((x) => (x.id === id ? q : x)));
    setEditing(null);
  }

  function remove(id: string) {
    onChange(value.filter((x) => x.id !== id));
    if (editing === id) setEditing(null);
  }

  const setOpt = (i: number, v: string) => setDraft((d) => ({ ...d, options: d.options.map((o, j) => (j === i ? v.slice(0, 30) : o)) }));
  const delOpt = (i: number) => setDraft((d) => ({ ...d, options: d.options.filter((_, j) => j !== i) }));
  const addOpt = () => setDraft((d) => (d.options.length >= MAX_CHOICES ? d : { ...d, options: [...d.options, ''] }));

  const editorBox = (
    <div className="p-3 rounded-[12px] border-2 border-[#7B5CD6] bg-[#EFEAFF] flex flex-col gap-2.5">
      <div className="text-[12px] font-black text-[#7B5CD6]">{editing === 'new' ? '＋ 新しい質問' : '✏️ 質問を直す'}</div>
      <input
        value={draft.text}
        onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value.slice(0, 80) }))}
        placeholder="例：二次会、どこに行きたい？"
        className="w-full p-2.5 border-[1.5px] border-border rounded-[10px] text-sm bg-card outline-none"
      />
      <Seg
        options={[['choice', '選んでもらう'], ['text', '自由に書いてもらう']]}
        value={draft.kind}
        onChange={(k) => setDraft((d) => ({ ...d, kind: k as Draft['kind'] }))}
      />
      {draft.kind === 'choice' && (
        <>
          <div className="text-[11px] font-bold text-sub">選択肢（自由に決められる・{MIN_CHOICES}〜{MAX_CHOICES}個）</div>
          <div className="flex flex-col gap-1.5">
            {draft.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-card border-[1.5px] border-border rounded-[10px]">
                <span className={cn('w-3.5 h-3.5 border-2 border-sub flex-shrink-0', draft.multi ? 'rounded-[3px]' : 'rounded-full')} />
                <input
                  value={o}
                  onChange={(e) => setOpt(i, e.target.value)}
                  placeholder={`選択肢${i + 1}`}
                  className="flex-1 min-w-0 text-sm bg-transparent outline-none py-1"
                />
                <button type="button" onClick={() => delOpt(i)} disabled={draft.options.length <= MIN_CHOICES}
                  className="w-6 h-6 flex items-center justify-center text-muted font-black disabled:opacity-30" aria-label="選択肢を消す">✕</button>
              </div>
            ))}
          </div>
          {draft.options.length < MAX_CHOICES && (
            <button type="button" onClick={addOpt} className="w-full py-2 rounded-[10px] border-[1.5px] border-dashed border-[#7B5CD6] text-[12px] font-black text-[#7B5CD6] bg-card">
              ＋ 選択肢を足す
            </button>
          )}
          <Seg
            options={[['single', '1つだけ選ぶ'], ['multi', 'いくつでも選べる']]}
            value={draft.multi ? 'multi' : 'single'}
            onChange={(k) => setDraft((d) => ({ ...d, multi: k === 'multi' }))}
          />
        </>
      )}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setDraft((d) => ({ ...d, required: !d.required }))} className="flex items-center gap-2 flex-1 text-left">
          <span className={cn('w-6 h-6 rounded-md flex items-center justify-center text-[13px] font-black border-2 flex-shrink-0',
            draft.required ? 'bg-[#7B5CD6] border-[#7B5CD6] text-white' : 'bg-card border-border text-transparent')}>✓</span>
          <span className="text-[12px] font-bold text-text">答えは必須</span>
        </button>
        <button type="button" onClick={close} className="px-3 py-1.5 rounded-full text-[12px] font-bold text-sub">キャンセル</button>
        <button type="button" onClick={save} className="px-4 py-1.5 rounded-full bg-[#7B5CD6] text-white text-[12px] font-black">
          {editing === 'new' ? '追加する' : '保存'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {value.length === 0 && editing !== 'new' && (
        <div className="px-3 py-2 bg-bg rounded-lg text-[11px] text-muted font-medium">まだ質問はありません（なくてもOK）</div>
      )}
      {value.map((q) => (
        editing === q.id ? <div key={q.id}>{editorBox}</div> : (
          <div key={q.id} className="flex items-start gap-2 px-3 py-2.5 bg-bg border-[1.5px] border-border rounded-[12px]">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black text-text break-words">{q.text}</div>
              <div className="text-[11px] text-sub font-medium mt-0.5 break-words">{questionSummary(q)}</div>
            </div>
            <button type="button" onClick={() => openEdit(q)} className="text-[11px] font-black text-[#7B5CD6] px-1.5 py-0.5">編集</button>
            <button type="button" onClick={() => remove(q.id)} className="text-[11px] font-black text-red px-1.5 py-0.5">削除</button>
          </div>
        )
      ))}
      {editing === 'new' ? editorBox : (
        value.length < MAX_QUESTIONS && (
          <button type="button" onClick={openNew} className="w-full py-2.5 rounded-[12px] border-[1.5px] border-dashed border-[#7B5CD6] text-[13px] font-black text-[#7B5CD6] bg-card">
            ＋ 質問を足す
          </button>
        )
      )}
      <div className="text-[10px] text-muted font-medium">質問は{MAX_QUESTIONS}個まで。答えは自動で集計されます。</div>
    </div>
  );
}

// 2択の切り替え（紫）
function Seg({ options, value, onChange }: { options: readonly (readonly [string, string])[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="flex gap-1 bg-card border-[1.5px] border-border rounded-[10px] p-1">
      {options.map(([k, label]) => (
        <button key={k} type="button" onClick={() => onChange(k)}
          className={cn('flex-1 py-1.5 rounded-lg text-[12px] font-black', value === k ? 'bg-[#7B5CD6] text-white' : 'text-sub')}>
          {label}
        </button>
      ))}
    </div>
  );
}
