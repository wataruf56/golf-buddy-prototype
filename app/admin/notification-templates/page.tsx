'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { SAMPLE_VARS, NOTIF_GROUPS } from '@/lib/notificationTemplates';
import type { NotifTemplate, NotifChannels } from '@/lib/notificationTemplates';

// 管理画面：通知メッセージ（アプリ内／LINE／スマホ通知）の文面を編集する。
// 文中の {◯◯} は差し込み変数。空欄にするとデフォルト文面に戻る。

export default function AdminNotifTemplatesPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

type Fields = { inApp: string; line: string; webTitle: string; webBody: string };
const FIELD_META: { k: keyof Fields; label: string }[] = [
  { k: 'inApp', label: 'アプリ内お知らせ' },
  { k: 'line', label: 'LINE通知' },
  { k: 'webTitle', label: 'スマホ通知 タイトル' },
  { k: 'webBody', label: 'スマホ通知 本文' },
];

function fillSample(s: string): string {
  return (s || '').replace(/\{([^}]+)\}/g, (_, k) => (k in SAMPLE_VARS ? SAMPLE_VARS[k] : `{${k}}`));
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [templates, setTemplates] = useState<NotifTemplate[]>([]);
  // 各テンプレの編集中テキスト（デフォルト or 上書きで初期化）。
  const [edited, setEdited] = useState<Record<string, Fields>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cached = tokenFromUrl || localStorage.getItem('gb_admin_token') || '';
    if (cached) setToken(cached);
    (async () => {
      try {
        const r = await fetch('/api/admin/init', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (j?.token) { localStorage.setItem('gb_admin_token', j.token); setToken(j.token); }
      } catch {}
    })();
  }, [tokenFromUrl]);

  function hydrate(tpls: NotifTemplate[], overrides: Record<string, NotifChannels>) {
    const ed: Record<string, Fields> = {};
    for (const t of tpls) {
      const ov = overrides[t.key] || {};
      ed[t.key] = {
        inApp: ov.inApp ?? t.inApp ?? '',
        line: ov.line ?? t.line ?? '',
        webTitle: ov.webTitle ?? t.webTitle ?? '',
        webBody: ov.webBody ?? t.webBody ?? '',
      };
    }
    setTemplates(tpls);
    setEdited(ed);
  }

  async function load() {
    if (!token) return;
    try {
      const r = await fetch(`/api/admin/notification-templates?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) hydrate(j.templates || [], j.overrides || {});
    } catch {}
    setLoaded(true);
  }
  useEffect(() => { if (token) load(); }, [token]);

  const defMap = useMemo(() => Object.fromEntries(templates.map((t) => [t.key, t])), [templates]);

  function setField(key: string, f: keyof Fields, v: string) {
    setEdited((e) => ({ ...e, [key]: { ...e[key], [f]: v } }));
  }
  function resetOne(key: string) {
    const t = defMap[key];
    if (!t) return;
    setEdited((e) => ({ ...e, [key]: { inApp: t.inApp ?? '', line: t.line ?? '', webTitle: t.webTitle ?? '', webBody: t.webBody ?? '' } }));
  }

  async function save() {
    if (!token) return;
    setSaving(true); setMsg('');
    // デフォルトと同じ項目は送らない（＝上書きなし＝デフォルト参照）。差分だけ保存。
    const overrides: Record<string, NotifChannels> = {};
    for (const t of templates) {
      const cur = edited[t.key]; if (!cur) continue;
      const c: NotifChannels = {};
      (['inApp', 'line', 'webTitle', 'webBody'] as const).forEach((f) => {
        if (t.noInApp && f === 'inApp') return;
        const val = (cur[f] || '').trim();
        const def = (t[f] || '').trim();
        if (val && val !== def) c[f] = cur[f];
      });
      if (Object.keys(c).length) overrides[t.key] = c;
    }
    try {
      const r = await fetch(`/api/admin/notification-templates?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ overrides }), cache: 'no-store',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `${r.status}`);
      hydrate(templates, j.overrides || {});
      setMsg('保存しました ✅');
    } catch (e) { setMsg('保存失敗: ' + (e as Error).message); }
    setSaving(false);
  }

  if (!token) return <div className="min-h-screen bg-bg p-5 max-w-md mx-auto flex items-center justify-center text-sm text-muted">⚙️ 読み込み中...</div>;

  return (
    <div className="min-h-screen bg-bg p-4 max-w-2xl mx-auto pb-24">
      <Link href={`/admin?token=${token}`} className="text-muted text-sm">‹ 管理</Link>
      <div className="text-2xl font-black mb-1 mt-1">✉️ 通知メッセージ編集</div>
      <div className="text-[12px] text-muted mb-4 leading-relaxed">
        ユーザーに届く「アプリ内お知らせ」「LINE通知」「スマホのプッシュ通知」の文面を編集できます。文中の <b>{'{◯◯}'}</b> は送信時に実際の値へ置き換わる差し込み枠です（消さないでください）。項目を空欄にすると初期の文面に戻ります。
      </div>

      {!loaded ? (
        <div className="text-sm text-muted">読み込み中...</div>
      ) : (
        <>
          {NOTIF_GROUPS.map((group) => (
            <div key={group} className="mb-4">
              <div className="text-[12px] font-black text-sub tracking-wide mb-2 mt-3">{group}</div>
              {templates.filter((t) => t.group === group).map((t) => {
                const cur = edited[t.key]; if (!cur) return null;
                return (
                  <div key={t.key} className="bg-card rounded-xl shadow-card p-4 mb-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <div className="text-[14px] font-black">{t.label}</div>
                        <div className="text-[11px] text-muted leading-relaxed">{t.desc}</div>
                      </div>
                      <button onClick={() => resetOne(t.key)} className="shrink-0 text-[11px] text-sub border-[1.5px] border-border rounded-lg px-2 py-1 font-bold">初期文に戻す</button>
                    </div>

                    {t.placeholders.length > 0 && (
                      <div className="flex flex-wrap gap-1 my-2">
                        {t.placeholders.map((p) => (
                          <span key={p.t} title={p.d} className="text-[10px] font-mono bg-green-light text-green px-1.5 py-0.5 rounded border border-green/40">{'{' + p.t + '}'} <span className="text-[9px] text-sub font-sans">{p.d}</span></span>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-col gap-2 mt-2">
                      {FIELD_META.filter((fm) => !(t.noInApp && fm.k === 'inApp')).map((fm) => {
                        const isTitle = fm.k === 'webTitle';
                        return (
                          <div key={fm.k}>
                            <label className="block text-[11px] font-bold text-sub mb-1">{fm.label}</label>
                            <textarea
                              value={cur[fm.k]}
                              onChange={(e) => setField(t.key, fm.k, e.target.value)}
                              rows={isTitle ? 1 : Math.min(4, Math.max(1, (cur[fm.k].match(/\n/g)?.length || 0) + 1))}
                              className="w-full p-2 border-[1.5px] border-border rounded-lg text-[12.5px] bg-bg outline-none resize-y leading-relaxed"
                            />
                          </div>
                        );
                      })}
                    </div>

                    <details className="mt-2">
                      <summary className="text-[11px] text-muted cursor-pointer">見本（サンプル値で表示）</summary>
                      <div className="mt-1.5 flex flex-col gap-1 text-[11px]">
                        {!t.noInApp && <PreviewLine label="アプリ内" text={fillSample(cur.inApp)} />}
                        <PreviewLine label="LINE" text={fillSample(cur.line)} />
                        <PreviewLine label="通知" text={`【${fillSample(cur.webTitle)}】${fillSample(cur.webBody)}`} />
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          ))}

          <div className="sticky bottom-3 mt-4">
            <button onClick={save} disabled={saving} className="w-full py-3.5 bg-green text-white rounded-xl text-sm font-black shadow-card disabled:opacity-50">
              {saving ? '保存中…' : 'すべての変更を保存する'}
            </button>
            {msg && <div className="text-[12px] text-center mt-2 font-bold">{msg}</div>}
          </div>
        </>
      )}
    </div>
  );
}

function PreviewLine({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-[10px] font-bold text-muted w-12">{label}</span>
      <span className="text-sub whitespace-pre-wrap break-words">{text}</span>
    </div>
  );
}
