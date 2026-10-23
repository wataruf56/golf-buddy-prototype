'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/components/Toast';

// プロフィールの「自分だけのメモ」（2026-10-23 本人指定）。
// 「この人どんな仕事をしてたっけ」などを忘れないための覚え書き。見られるのは自分だけで、相手には伝わらない（吹き出しで明記）。
// 1,000文字まで。保存は PUT /api/users/[id]/note（空にして保存すると消える）。
// プロフィール（ProfileNote）と DM 画面の右上（components/DmNoteButton）で同じメモを読み書きする。
export const NOTE_MAX = 1000;

export function useProfileNote(userId: string) {
  const [saved, setSaved] = useState('');
  const [text, setText] = useState('');
  const [updatedAt, setUpdatedAt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    setLoaded(false);
    fetch(`/api/users/${encodeURIComponent(userId)}/note`, { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (off || !j) return; setSaved(j.text || ''); setText(j.text || ''); setUpdatedAt(j.updatedAt || 0); })
      .catch(() => {})
      .finally(() => { if (!off) setLoaded(true); });
    return () => { off = true; };
  }, [userId]);

  const len = Array.from(text).length;
  const dirty = loaded && text !== saved;

  const save = useCallback(async (opts: { quiet?: boolean } = {}) => {
    if (busy || !dirty) return true;
    if (len > NOTE_MAX) { toast(`メモは${NOTE_MAX.toLocaleString()}文字までです`, 'error'); return false; }
    setBusy(true);
    try {
      const r = await fetch(`/api/users/${encodeURIComponent(userId)}/note`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', cache: 'no-store',
        body: JSON.stringify({ text }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || '保存できませんでした');
      setSaved(j.text || ''); setText(j.text || ''); setUpdatedAt(j.updatedAt || 0);
      if (!opts.quiet) toast(j.text ? 'メモを保存しました' : 'メモを消しました');
      return true;
    } catch (e) {
      toast((e as Error).message, 'error');
      return false;
    } finally { setBusy(false); }
  }, [busy, dirty, len, text, userId]);

  return { text, setText, saved, updatedAt, loaded, busy, len, dirty, save };
}

type NoteState = ReturnType<typeof useProfileNote>;

/** 吹き出し（相手には伝わらない）＋入力欄＋文字数＋保存。プロフィールと DM で共通 */
export function NoteEditor({ note, name, rows = 3, autoFocus }: { note: NoteState; name: string; rows?: number; autoFocus?: boolean }) {
  const { text, setText, loaded, busy, len, dirty, save } = note;
  const lines = text.split('\n').length;
  return (
    <>
      <div className="relative inline-block mb-2 ml-1 px-2.5 py-1 rounded-lg bg-[#FFF6D9] border border-[#E9CF7A] text-[10.5px] font-bold text-[#7A5B00]">
        🔒 あなたにしか見えません。{name}さんには伝わりません
        <span aria-hidden className="absolute -bottom-[6px] left-4 w-2.5 h-2.5 rotate-45 bg-[#FFF6D9] border-r border-b border-[#E9CF7A]" />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!loaded}
        autoFocus={autoFocus}
        rows={lines > rows ? Math.min(10, lines + 1) : rows}
        placeholder="例：仕事は不動産。千葉在住。ドライバーがよく飛ぶ。次は飲みも誘う"
        aria-label={`${name}さんについての自分だけのメモ`}
        className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-[13px] bg-bg outline-none leading-relaxed resize-y disabled:opacity-60"
      />
      <div className="flex items-center justify-between mt-1.5">
        <span className={`text-[10.5px] ${len > NOTE_MAX ? 'text-red-600 font-bold' : 'text-muted'}`}>{len.toLocaleString()} / {NOTE_MAX.toLocaleString()}文字</span>
        <button type="button" onClick={() => save()} disabled={busy || !dirty || len > NOTE_MAX}
          className="px-4 py-1.5 rounded-full bg-green text-white text-[12px] font-black disabled:opacity-40">{busy ? '保存中…' : '保存'}</button>
      </div>
    </>
  );
}

export const noteWhen = (at: number) => (at ? new Date(at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : '');

export function ProfileNote({ userId, name }: { userId: string; name: string }) {
  const note = useProfileNote(userId);
  const when = noteWhen(note.updatedAt);
  return (
    <div className="mt-3 bg-card rounded-card p-4 shadow-card">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[13px] font-black">📝 自分だけのメモ</div>
        {when && <div className="text-[10px] text-muted">{when} 更新</div>}
      </div>
      <NoteEditor note={note} name={name} />
    </div>
  );
}
