'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '@/components/Toast';
import { confirmDialog } from '@/components/ConfirmDialog';
import { resizeImage } from '@/lib/resizeImage';
import type { RoundPhoto } from '@/lib/types';

// ラウンドの写真アルバム。参加者が写真をアップロード・共有できる。写真のみ。
// 画像はクライアントでリサイズして dataURL で送る（チャット画像と同じ方式）。
export function RoundAlbum({ roundId, meId, isHost }: { roundId: string; meId: string; isHost: boolean }) {
  const [photos, setPhotos] = useState<RoundPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null); // 拡大表示中のURL
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const r = await fetch(`/api/rounds/${roundId}/photos`, { cache: 'no-store', credentials: 'include' });
      const d = await r.json();
      if (r.ok && Array.isArray(d.photos)) setPhotos(d.photos);
    } catch { /* noop */ }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [roundId]);

  async function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    // 複数選択に対応。1枚ずつリサイズ→アップロード。
    for (const file of Array.from(files).slice(0, 20)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const dataUrl = await resizeImage(file, 1400, 0.7);
        const r = await fetch(`/api/rounds/${roundId}/photos`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: dataUrl }), cache: 'no-store', credentials: 'include',
        });
        if (r.ok) ok++;
      } catch { /* skip this file */ }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    if (ok > 0) { toast(`${ok}枚アップロードしました📷`); load(); }
    else toast('アップロードに失敗しました', 'error');
  }

  // 表示中の写真を端末に保存（ダウンロード）。iOS/LINEアプリ内は Web Share（写真に保存）を
  // 優先し、無ければ <a download>、最後は新規タブ（長押しで保存）にフォールバックする。
  const [saving, setSaving] = useState(false);
  async function savePhoto(url: string) {
    if (saving) return;
    setSaving(true);
    const filename = `goltomo_${Date.now()}.jpg`;
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
      const nav = navigator as any;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file] });
        setSaving(false);
        return;
      }
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
      toast('写真を保存しました');
    } catch {
      try { window.open(url, '_blank'); toast('画像を長押しで保存してください'); }
      catch { toast('保存に失敗しました', 'error'); }
    }
    setSaving(false);
  }

  async function remove(p: RoundPhoto) {
    if (!(await confirmDialog('この写真を削除しますか？'))) return;
    try {
      const r = await fetch(`/api/rounds/${roundId}/photos/${p.id}`, { method: 'DELETE', cache: 'no-store', credentials: 'include' });
      if (!r.ok) throw new Error(String(r.status));
      setPhotos((prev) => prev.filter((x) => x.id !== p.id));
      if (viewer === p.url) setViewer(null);
    } catch { toast('削除に失敗しました', 'error'); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[12px] text-sub">📷 このラウンドの写真アルバム（参加者で共有）</div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="px-3 py-1.5 bg-green text-white rounded-full text-[12px] font-black disabled:opacity-50"
        >{uploading ? 'アップ中…' : '＋ 写真を追加'}</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPick(e.target.files)} />

      {loading ? (
        <div className="text-center text-[12px] text-muted py-8">読み込み中...</div>
      ) : photos.length === 0 ? (
        <div className="text-center text-[12px] text-muted py-8 leading-relaxed">
          まだ写真がありません。<br />「＋ 写真を追加」から、このラウンドの写真をみんなで共有できます。
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((p) => (
            <button
              key={p.id}
              onClick={() => setViewer(p.url)}
              className="relative aspect-square rounded-lg overflow-hidden bg-bg border border-border"
            >
              <img src={p.url} alt="" className="w-full h-full object-cover" />
              {(p.uploadedBy === meId || isHost) && (
                <span
                  onClick={(e) => { e.stopPropagation(); remove(p); }}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 text-white text-[12px] flex items-center justify-center"
                >×</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* 拡大ビュー（画面全体に確実に出すため body へポータル） */}
      {viewer && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col" onClick={() => setViewer(null)}>
          {/* 上部バー：保存＋閉じる（下部ナビに隠れないよう上に配置） */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => savePhoto(viewer)}
              disabled={saving}
              className="px-4 py-2.5 bg-white text-black rounded-full text-sm font-black shadow-lg disabled:opacity-60"
            >⬇ {saving ? '保存中…' : '写真を保存'}</button>
            <button onClick={() => setViewer(null)} className="w-10 h-10 rounded-full bg-white/20 text-white text-xl font-black">×</button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-4">
            <img src={viewer} alt="" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
