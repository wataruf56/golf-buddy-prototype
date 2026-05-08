'use client';

import { useRef, useState } from 'react';
import type { SwingUploadRole } from '@/types/swing';

const MAX_BYTES = 50 * 1024 * 1024; // 50MB

type Props = {
  swingId: string;
  role: SwingUploadRole;
  label: string;
  onUploaded: (gcsUri: string) => void;
};

export function VideoUploader({ swingId, role, label, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string>('');
  const [filename, setFilename] = useState<string>('');

  async function handle(file: File) {
    setErr('');
    setFilename(file.name);
    if (!file.type.startsWith('video/')) { setErr('動画ファイルを選んでください'); return; }
    if (file.size > MAX_BYTES) { setErr(`50MB以下にしてください（現在 ${(file.size / 1024 / 1024).toFixed(1)}MB）`); return; }

    setBusy(true);
    try {
      // 1) Get signed URL — send the file's actual mime type
      // (iOS records as video/quicktime / .mov)
      const fileType = file.type || 'video/mp4';
      const r = await fetch('/api/swing/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swingId, role, contentType: fileType }),
      });
      if (!r.ok) throw new Error(`upload-url ${r.status}`);
      const { uploadUrl, gcsUri, contentType: signedType } = await r.json();

      // 2) PUT directly to GCS with progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', signedType || fileType);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`PUT ${xhr.status}`)));
        xhr.onerror = () => reject(new Error('upload network error'));
        xhr.send(file);
      });

      setDone(true);
      onUploaded(gcsUri);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-card rounded-xl p-4 border-[1.5px] border-border">
      <div className="text-xs font-bold mb-2">{label}</div>
      {!done ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="w-full py-3 bg-green text-white rounded-xl text-sm font-bold disabled:opacity-50"
          >
            {busy ? `アップロード中 ${progress}%` : '🎥 動画を選ぶ'}
          </button>
          <div className="text-[10px] text-muted mt-1.5">MP4・20秒以内・50MB以下推奨</div>
        </>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-light rounded-lg text-xs">
          <span className="text-green">✓</span>
          <span className="flex-1 truncate">{filename}</span>
        </div>
      )}
      {err && <div className="mt-2 text-[11px] text-red-600">{err}</div>}
    </div>
  );
}
