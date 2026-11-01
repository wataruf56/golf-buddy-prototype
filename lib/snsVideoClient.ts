// テスト版の動画（端末側）：表紙の切り出しと、署名URLへの直接アップロード（lib/snsTestMedia・2026-11-01）。
export const MAX_VIDEO_SEC = 60;
export const MAX_VIDEO_MB = 200;

export const isVideoFile = (f: File) => f.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(f.name);
const typeOf = (f: File) => f.type || (/\.mov$/i.test(f.name) ? 'video/quicktime' : /\.webm$/i.test(f.name) ? 'video/webm' : 'video/mp4');

// 端末が表紙を作れない動画（ブラウザが読めない形式など）のときの代わり
function placeholder(): string {
  const c = document.createElement('canvas');
  c.width = 720; c.height = 720;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1E2B27'; g.fillRect(0, 0, 720, 720);
  g.fillStyle = '#FFFFFF'; g.font = '160px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('▶', 360, 360);
  return c.toDataURL('image/jpeg', 0.7);
}

/** 表紙（JPEGのデータURL）と長さ（秒。読めなければ 0）を返す */
export function readVideo(file: File): Promise<{ poster: string; sec: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    let sec = 0;
    let done = false;
    const finish = (poster: string) => { if (done) return; done = true; v.pause(); URL.revokeObjectURL(url); resolve({ poster, sec }); };
    const timer = setTimeout(() => finish(placeholder()), 15000);
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.setAttribute('playsinline', '');
    v.onerror = () => { clearTimeout(timer); finish(placeholder()); };
    v.onloadedmetadata = () => {
      sec = Number.isFinite(v.duration) ? v.duration : 0;
      v.play().catch(() => {});   // iPhone は一度再生しないと絵が描けないことがある
      v.currentTime = Math.min(0.2, sec / 2 || 0);
    };
    v.onseeked = () => {
      clearTimeout(timer);
      try {
        const scale = Math.min(1, 1000 / Math.max(v.videoWidth, v.videoHeight, 1));
        const c = document.createElement('canvas');
        c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
        if (!c.width || !c.height) throw new Error('no_frame');
        c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
        finish(c.toDataURL('image/jpeg', 0.75));
      } catch { finish(placeholder()); }
    };
    v.src = url;
    v.load();
  });
}

/** アップロードして、置いた場所（object）を返す。進み具合は 0〜100 */
export async function uploadVideo(file: File, kind: 'p' | 's', onProgress: (pct: number) => void): Promise<string> {
  const contentType = typeOf(file);
  const r = await fetch('/api/sns/video-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ kind, contentType, size: file.size }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'うまくいきませんでした');
  await new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', j.url);
    Object.entries(j.headers as Record<string, string>).forEach(([k, val]) => x.setRequestHeader(k, val));
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error('動画を送れませんでした')));
    x.onerror = () => reject(new Error('動画を送れませんでした。電波の良いところでもう一度お試しください'));
    x.send(file);
  });
  return j.object;
}
