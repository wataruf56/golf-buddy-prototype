'use client';

import { useCallback, useEffect, useState } from 'react';

// Instagram 投稿の下書き・予約画面。
// スマホから開いて、本文を直して、公開または予約する想定。

type Post = {
  id: string;
  roundId?: string;
  imageUrl: string;
  imageUrls: string[];
  videoUrl?: string | null;
  coverUrl?: string | null;
  mediaType: 'IMAGE' | 'CAROUSEL' | 'REELS';
  caption: string;
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'canceled' | 'failed';
  scheduledAt?: number | null;
  createdAt: number;
  publishedAt?: number | null;
  igMediaId?: string | null;
  error?: string | null;
  hidden?: boolean;
};

const STATUS_LABEL: Record<Post['status'], string> = {
  draft: '下書き', scheduled: '予約済み', publishing: '公開処理中',
  published: '公開済み', canceled: '取りやめ', failed: '失敗',
};
const STATUS_COLOR: Record<Post['status'], string> = {
  draft: '#6b7280', scheduled: '#2563eb', publishing: '#b45309',
  published: '#15803d', canceled: '#9ca3af', failed: '#dc2626',
};
const TYPE_LABEL: Record<Post['mediaType'], string> = {
  IMAGE: '写真', CAROUSEL: 'カルーセル', REELS: 'リール',
};

// 上部のタブ。状態ごとに分けて見られるようにする。
// 「予約」には公開処理中（リールの変換待ち）も入れる。まだ出ていないものは同じ扱いのため。
// 「失敗」には取りやめも入れる。どちらも「出なかったもの」なので。
type Tab = 'all' | 'draft' | 'scheduled' | 'published' | 'failed';

const TABS: { key: Tab; label: string; match: (p: Post) => boolean }[] = [
  { key: 'all',       label: 'すべて',   match: () => true },
  { key: 'draft',     label: '未投稿',   match: (p) => p.status === 'draft' },
  { key: 'scheduled', label: '予約',     match: (p) => p.status === 'scheduled' || p.status === 'publishing' },
  { key: 'published', label: '公開済', match: (p) => p.status === 'published' },
  { key: 'failed',    label: '失敗',     match: (p) => p.status === 'failed' || p.status === 'canceled' },
];

/** タブごとに並び順を変える。予約はこれから出る順、公開済みは新しい順。 */
function sortFor(tab: Tab, a: Post, b: Post): number {
  if (tab === 'scheduled') return (a.scheduledAt || 0) - (b.scheduledAt || 0);
  if (tab === 'published') return (b.publishedAt || 0) - (a.publishedAt || 0);
  return b.createdAt - a.createdAt;
}

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
  const [cron, setCron] = useState<{ lastRunAt: number; lastOkAt: number | null; lastError: string | null;
    igBlocked?: string | null; igBlockedAt?: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [times, setTimes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>('');
  const [showHidden, setShowHidden] = useState(false);
  const [tab, setTab] = useState<Tab>('all');

  const load = useCallback(async (tk: string) => {
    setLoading(true);
    try {
      const q = showHidden ? '&all=1' : '';
      const r = await fetch(`/api/admin/ig?token=${encodeURIComponent(tk)}${q}`, { cache: 'no-store' });
      const j = await r.json();
      if (j.error) { setMsg(j.error); return; }
      setPosts(j.posts || []);
      setIgReady(!!j.igConfigured);
      setCron(j.cron || null);
      const d: Record<string, string> = {}; const t: Record<string, string> = {};
      for (const p of (j.posts || []) as Post[]) { d[p.id] = p.caption; t[p.id] = toLocalInput(p.scheduledAt); }
      setDrafts(d); setTimes(t);
    } catch (e) { setMsg(String(e)); } finally { setLoading(false); }
  }, [showHidden]);

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/admin/init', { cache: 'no-store' });
      const j = await r.json();
      setToken(j.token || '');
      if (j.token) await load(j.token); else setLoading(false);
    })();
  }, [load]);

  // 「消したものも見る」を切り替えたら読み直す。
  useEffect(() => { if (token) load(token); }, [showHidden, token, load]);

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

  const match = TABS.find((t) => t.key === tab)!.match;
  const shown = posts.filter(match).slice().sort((a, b) => sortFor(tab, a, b));

  if (loading) return <main style={S.wrap}><p>読み込み中…</p></main>;

  return (
    <main style={S.wrap}>
      <div style={S.head}>
        <h1 style={S.h1}>Instagram 投稿</h1>
        <button style={S.link} onClick={() => { setShowHidden(!showHidden); }}>
          {showHidden ? '消したものを隠す' : '消したものも見る'}
        </button>
      </div>
      {!igReady && (
        <p style={S.warn}>
          IG_ACCESS_TOKEN が未設定です。Cloud Run に Secret Manager の ig-access-token を注入してください。
        </p>
      )}
      {/* Instagram 側で接続が止められているとき。投稿の中身の問題ではない。 */}
      {cron?.igBlocked && (
        <p style={S.warn}>
          🚫 Instagramに接続できません。公開・予約とも通りません。<br />
          <span style={S.small}>
            {cron.igBlocked}
            {cron.igBlockedAt ? ` / ${new Date(cron.igBlockedAt).toLocaleString('ja-JP')} 時点` : ''}
            <br />Meta for Developers のアプリ画面で制限が出ていないか確認してください。
          </span>
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

      <div style={S.tabs}>
        {TABS.map((t) => {
          const n = posts.filter(t.match).length;
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
                    style={{ ...S.tab, ...(on ? S.tabOn : {}) }}>
              {t.label}
              <span style={{ ...S.tabNum, ...(on ? S.tabNumOn : {}) }}>{n}</span>
            </button>
          );
        })}
      </div>

      {!posts.length && <p style={{ color: '#6b7280' }}>投稿はまだありません。</p>}
      {posts.length > 0 && !shown.length && (
        <p style={{ color: '#6b7280' }}>ここに入る投稿はありません。</p>
      )}

      {shown.map((p) => {
        const editable = p.status === 'draft' || p.status === 'scheduled' || p.status === 'failed';
        const len = (drafts[p.id] || '').length;
        return (
          <section key={p.id} style={S.card}>
            <div style={S.row}>
              <span style={{ ...S.badge, background: STATUS_COLOR[p.status] }}>{STATUS_LABEL[p.status]}</span>
              <span style={S.typeBadge}>{TYPE_LABEL[p.mediaType] || '写真'}</span>
              {p.scheduledAt ? <span style={S.small}>予約: {new Date(p.scheduledAt).toLocaleString('ja-JP')}</span> : null}
              {p.publishedAt ? <span style={S.small}>公開: {new Date(p.publishedAt).toLocaleString('ja-JP')}</span> : null}
              {p.hidden ? <span style={S.hiddenTag}>一覧から削除済み</span> : null}
              <span style={{ marginLeft: 'auto' }}>
                {p.hidden ? (
                  <button style={S.link} disabled={busy === p.id}
                    onClick={() => act(p.id, { action: 'unhide' }, '一覧に戻しました')}>
                    一覧に戻す
                  </button>
                ) : (
                  <button style={S.del} disabled={busy === p.id}
                    onClick={() => {
                      const done = p.status === 'published';
                      const q = done
                        ? 'この投稿を一覧から消します。Instagram上の投稿は消えません。よろしいですか？'
                        : 'この下書きを削除します。元に戻せません。よろしいですか？';
                      if (!confirm(q)) return;
                      act(p.id, { action: 'delete' }, done ? '一覧から消しました' : '削除しました');
                    }}>
                    削除
                  </button>
                )}
              </span>
            </div>

            {p.mediaType === 'REELS' && p.videoUrl ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={p.videoUrl} poster={p.coverUrl || undefined} controls playsInline
                     preload="metadata" style={S.video} />
            ) : (p.imageUrls?.length ?? 0) > 1 ? (
              // カルーセルは横スクロールで全ページ確認できるようにする
              <div style={S.strip}>
                {p.imageUrls.map((u, i) => (
                  <div key={u} style={S.slide}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="" style={S.slideImg} />
                    <span style={S.slideNo}>{i + 1} / {p.imageUrls.length}</span>
                  </div>
                ))}
              </div>
            ) : p.imageUrl ? (
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
  h1: { fontSize: 20, fontWeight: 700, margin: 0 },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          margin: '8px 0 16px' },
  link: { background: 'none', border: 'none', color: '#2563eb', fontSize: 13,
          cursor: 'pointer', padding: 4 },
  del: { background: 'none', border: '1px solid #fca5a5', color: '#dc2626', fontSize: 12,
         borderRadius: 8, padding: '3px 10px', cursor: 'pointer' },
  hiddenTag: { background: '#f3f4f6', color: '#6b7280', borderRadius: 999,
               padding: '2px 9px', fontSize: 11 },
  card: { border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, marginBottom: 18, background: '#fff' },
  row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
  badge: { color: '#fff', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 },
  small: { fontSize: 12, color: '#6b7280' },
  note: { fontSize: 12, color: '#9ca3af', marginTop: 6 },
  img: { width: '100%', borderRadius: 10, display: 'block', marginBottom: 10 },
  video: { width: '100%', maxHeight: 460, borderRadius: 10, display: 'block',
           marginBottom: 10, background: '#000' },
  typeBadge: { border: '1px solid #d1d5db', color: '#374151', borderRadius: 999,
               padding: '2px 9px', fontSize: 12 },
  strip: { display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 10, paddingBottom: 4 },
  slide: { position: 'relative', flex: '0 0 auto', width: '62%' },
  slideImg: { width: '100%', borderRadius: 10, display: 'block' },
  slideNo: { position: 'absolute', right: 8, bottom: 8, background: 'rgba(0,0,0,.6)', color: '#fff',
             fontSize: 11, borderRadius: 999, padding: '2px 8px' },
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
  // 5つを狭い画面にも収める。入り切らない機種でも横スクロールで見られる。
  tabs: { display: 'flex', gap: 3, overflowX: 'auto', margin: '4px 0 16px', paddingBottom: 2 },
  tab: { flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
         whiteSpace: 'nowrap', padding: '7px 8px', borderRadius: 999, border: '1px solid #d1d5db',
         background: '#fff', color: '#374151', fontSize: 12.5, fontFamily: 'inherit' },
  tabOn: { background: '#111827', borderColor: '#111827', color: '#fff', fontWeight: 700 },
  tabNum: { background: '#f3f4f6', color: '#6b7280', borderRadius: 999,
            padding: '1px 5px', fontSize: 11, fontWeight: 700 },
  tabNumOn: { background: 'rgba(255,255,255,.24)', color: '#fff' },
};
