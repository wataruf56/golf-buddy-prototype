'use client';

import { useCallback, useEffect, useState } from 'react';

// Instagram 投稿の下書き・予約画面。
// スマホから開いて、本文を直して、公開または予約する想定。

type Post = {
  id: string;
  roundId?: string;
  imageUrl: string;
  caption: string;
  status: 'draft' | 'scheduled' | 'published' | 'canceled' | 'failed';
  scheduledAt?: number | null;
  createdAt: number;
  publishedAt?: number | null;
  igMediaId?: string | null;
  error?: string | null;
};

const STATUS_LABEL: Record<Post['status'], string> = {
  draft: '下書き', scheduled: '予約済み', published: '公開済み', canceled: '取りやめ', failed: '失敗',
};
const STATUS_COLOR: Record<Post['status'], string> = {
  draft: '#6b7280', scheduled: '#2563eb', published: '#15803d', canceled: '#9ca3af', failed: '#dc2626',
};

/** epoch ms → datetime-local 用の文字列（ローカル時刻）。 */
function toLocalInput(ms?: number | null): string {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function AdminIgPage() {
  const [token, setToken] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [igReady, setIgReady] = useState(true);
  const [cron, setCron] = useState<{ lastRunAt: number; lastOkAt: number | null; lastError: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [times, setTimes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>('');

  const load = useCallback(async (tk: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/ig?token=${encodeURIComponent(tk)}`, { cache: 'no-store' });
      const j = await r.json();
      if (j.error) { setMsg(j.error); return; }
      setPosts(j.posts || []);
      setIgReady(!!j.igConfigured);
      setCron(j.cron || null);
      const d: Record<string, string> = {}; const t: Record<string, string> = {};
      for (const p of (j.posts || []) as Post[]) { d[p.id] = p.caption; t[p.id] = toLocalInput(p.scheduledAt); }
      setDrafts(d); setTimes(t);
    } catch (e) { setMsg(String(e)); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/admin/init', { cache: 'no-store' });
      const j = await r.json();
      setToken(j.token || '');
      if (j.token) await load(j.token); else setLoading(false);
    })();
  }, [load]);

  async function act(id: string, body: any, okMsg: string) {
    setBusy(id); setMsg('');
    try {
      const r = await fetch(`/api/admin/ig/${id}?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j.error) setMsg(`⚠️ ${j.error}`); else { setMsg(okMsg); await load(token); }
    } catch (e) { setMsg(String(e)); } finally { setBusy(''); }
  }

  if (loading) return <main style={S.wrap}><p>読み込み中…</p></main>;

  return (
    <main style={S.wrap}>
      <h1 style={S.h1}>Instagram 投稿</h1>
      {!igReady && (
        <p style={S.warn}>
          IG_ACCESS_TOKEN が未設定です。Cloud Run に Secret Manager の ig-access-token を注入してください。
        </p>
      )}
      {/* 予約投稿のcronが黙って止まっていても気づけるようにする。 */}
      {cron && (cron.lastError || !cron.lastOkAt || Date.now() - cron.lastOkAt > 30 * 60 * 1000) && (
        <p style={S.warn}>
          ⚠️ 予約投稿の自動実行が止まっています。予約しても公開されません。<br />
          <span style={S.small}>
            最後に成功: {cron.lastOkAt ? new Date(cron.lastOkAt).toLocaleString('ja-JP') : 'なし'}
            {cron.lastError ? ` / ${cron.lastError}` : ''}
          </span>
        </p>
      )}
      {msg && <p style={S.msg}>{msg}</p>}
      {!posts.length && <p style={{ color: '#6b7280' }}>投稿はまだありません。</p>}

      {posts.map((p) => {
        const editable = p.status === 'draft' || p.status === 'scheduled' || p.status === 'failed';
        const len = (drafts[p.id] || '').length;
        return (
          <section key={p.id} style={S.card}>
            <div style={S.row}>
              <span style={{ ...S.badge, background: STATUS_COLOR[p.status] }}>{STATUS_LABEL[p.status]}</span>
              {p.scheduledAt ? <span style={S.small}>予約: {new Date(p.scheduledAt).toLocaleString('ja-JP')}</span> : null}
              {p.publishedAt ? <span style={S.small}>公開: {new Date(p.publishedAt).toLocaleString('ja-JP')}</span> : null}
            </div>

            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.imageUrl} alt="" style={S.img} />
            ) : null}

            {p.error ? <p style={S.err}>エラー: {p.error}</p> : null}

            <textarea
              value={drafts[p.id] ?? ''}
              onChange={(e) => setDrafts({ ...drafts, [p.id]: e.target.value })}
              disabled={!editable}
              rows={14}
              style={S.ta}
            />
            <div style={S.small}>{len} / 2200 文字</div>

            {editable && (
              <>
                <div style={S.actions}>
                  <button style={S.btn} disabled={busy === p.id}
                    onClick={() => act(p.id, { action: 'save', caption: drafts[p.id] }, '保存しました')}>
                    保存
                  </button>
                  <button style={{ ...S.btn, ...S.primary }} disabled={busy === p.id}
                    onClick={() => {
                      if (!confirm('いますぐInstagramに公開します。よろしいですか？')) return;
                      act(p.id, { action: 'publish' }, '公開しました');
                    }}>
                    いま公開する
                  </button>
                  <button style={{ ...S.btn, ...S.ghost }} disabled={busy === p.id}
                    onClick={() => act(p.id, { action: 'cancel' }, '取りやめました')}>
                    取りやめ
                  </button>
                </div>

                <div style={S.actions}>
                  <input type="datetime-local" value={times[p.id] ?? ''} style={S.dt}
                    onChange={(e) => setTimes({ ...times, [p.id]: e.target.value })} />
                  <button style={S.btn} disabled={busy === p.id}
                    onClick={() => {
                      const v = times[p.id];
                      if (!v) { setMsg('予約時刻を入れてください'); return; }
                      const at = new Date(v).getTime();
                      if (at < Date.now()) { setMsg('⚠️ 過去の時刻です。未来の時刻を入れてください'); return; }
                      // 本文も一緒に送る。「保存」を押し忘れても編集が消えないように。
                      act(p.id, { action: 'schedule', scheduledAt: at, caption: drafts[p.id] },
                          `${new Date(at).toLocaleString('ja-JP')} に予約しました`);
                    }}>
                    この時刻に予約
                  </button>
                  {p.status === 'scheduled' && (
                    <button style={{ ...S.btn, ...S.ghost }} disabled={busy === p.id}
                      onClick={() => act(p.id, { action: 'unschedule' }, '予約を解除しました')}>
                      予約解除
                    </button>
                  )}
                </div>
                <p style={S.note}>
                  ※「保存」は本文だけ更新します。予約する前に保存してください。
                </p>
              </>
            )}

            {p.igMediaId && (
              <p style={S.small}>
                <a href="https://www.instagram.com/goltomo.golf/" target="_blank" rel="noreferrer">Instagramで見る</a>
              </p>
            )}
          </section>
        );
      })}
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 720, margin: '0 auto', padding: '16px 14px 64px', fontFamily: 'system-ui, sans-serif' },
  h1: { fontSize: 20, fontWeight: 700, margin: '8px 0 16px' },
  card: { border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, marginBottom: 18, background: '#fff' },
  row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
  badge: { color: '#fff', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 },
  small: { fontSize: 12, color: '#6b7280' },
  note: { fontSize: 12, color: '#9ca3af', marginTop: 6 },
  img: { width: '100%', borderRadius: 10, display: 'block', marginBottom: 10 },
  ta: { width: '100%', boxSizing: 'border-box', fontSize: 14, lineHeight: 1.6, padding: 10,
        border: '1px solid #d1d5db', borderRadius: 8, fontFamily: 'inherit' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' },
  btn: { padding: '9px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb',
         fontSize: 14, cursor: 'pointer' },
  primary: { background: '#15803d', color: '#fff', borderColor: '#15803d', fontWeight: 700 },
  ghost: { background: '#fff', color: '#6b7280' },
  dt: { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 },
  msg: { background: '#eff6ff', border: '1px solid #bfdbfe', padding: '8px 12px', borderRadius: 8, fontSize: 14 },
  warn: { background: '#fef3c7', border: '1px solid #fcd34d', padding: '8px 12px', borderRadius: 8, fontSize: 14 },
  err: { color: '#dc2626', fontSize: 13, margin: '4px 0' },
};
