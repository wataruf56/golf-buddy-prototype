'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// 管理画面：テストアカウントの一元管理（再会エンジンから外出しした版）。
// ・テストアカウント一覧（LINEユーザーID＋任意ラベル）を追加/削除
// ・「一般ユーザーから隠す」トグル（プロフィール＋募集を一般ユーザーから非表示）
// ・機能ごとの公開範囲（テストのみ / 全員 / OFF）＝新機能の段階公開

export default function AdminTestAccountsPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

type Account = { id: string; label: string; addedAt: number };
type Visibility = 'test-only' | 'all' | 'off';
type FeatureDef = { key: string; label: string; desc: string; defaultVisibility: Visibility };

const VIS_LABEL: Record<Visibility, string> = { 'test-only': 'テストのみ', all: '全員に公開', off: 'OFF（全員に非表示）' };

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [hideFromGeneral, setHideFromGeneral] = useState(true);
  const [registry, setRegistry] = useState<FeatureDef[]>([]);
  const [features, setFeatures] = useState<Record<string, Visibility>>({});
  // 追加フォーム
  const [newId, setNewId] = useState('');
  const [newLabel, setNewLabel] = useState('');

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

  function applyResponse(j: any) {
    setAccounts(Array.isArray(j?.config?.accounts) ? j.config.accounts : []);
    setHideFromGeneral(j?.config?.hideFromGeneral !== false);
    setRegistry(Array.isArray(j?.registry) ? j.registry : []);
    setFeatures(j?.effective && typeof j.effective === 'object' ? j.effective : {});
  }

  async function load() {
    if (!token) return;
    try {
      const r = await fetch(`/api/admin/test-accounts?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) applyResponse(j);
    } catch {}
    setLoaded(true);
  }
  useEffect(() => { if (token) load(); }, [token]);

  function addAccount() {
    const id = newId.trim();
    if (!id) return;
    if (accounts.some((a) => a.id === id)) { setMsg('そのIDは既に登録済みです'); return; }
    setAccounts([...accounts, { id, label: newLabel.trim().slice(0, 60), addedAt: 0 }]);
    setNewId(''); setNewLabel(''); setMsg('');
  }
  function removeAccount(id: string) {
    setAccounts(accounts.filter((a) => a.id !== id));
  }
  function editLabel(id: string, label: string) {
    setAccounts(accounts.map((a) => (a.id === id ? { ...a, label } : a)));
  }

  async function save() {
    if (!token) return;
    setSaving(true); setMsg('');
    try {
      const r = await fetch(`/api/admin/test-accounts?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts, hideFromGeneral, features }), cache: 'no-store',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `${r.status}`);
      applyResponse(j);
      setMsg('保存しました ✅');
    } catch (e) { setMsg('保存失敗: ' + (e as Error).message); }
    setSaving(false);
  }

  if (!token) return <div className="min-h-screen bg-bg p-5 max-w-md mx-auto flex items-center justify-center text-sm text-muted">⚙️ 読み込み中...</div>;

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto pb-16">
      <Link href={`/admin?token=${token}`} className="text-muted text-sm">‹ 管理</Link>
      <div className="text-2xl font-black mb-1 mt-1">🧪 テストアカウント管理</div>
      <div className="text-[12px] text-muted mb-4 leading-relaxed">
        検証用のアカウントを一般ユーザーと分けて管理します。ここに登録したアカウントは<b>一般ユーザーから隠す</b>ことができ、<b>新機能を先行して見せる</b>対象にもなります。
      </div>

      {!loaded ? (
        <div className="text-sm text-muted">読み込み中...</div>
      ) : (
        <>
          {/* テストアカウント一覧 */}
          <div className="bg-card rounded-xl shadow-card p-4 mb-3">
            <div className="text-[13px] font-black mb-2">👤 テストアカウント一覧（{accounts.length}）</div>
            <div className="flex flex-col gap-2 mb-3">
              {accounts.length === 0 && <div className="text-[12px] text-muted">まだ登録がありません。下のフォームから追加してください。</div>}
              {accounts.map((a) => (
                <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg border-[1.5px] border-border bg-bg">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-mono text-sub truncate">{a.id}</div>
                    <input
                      value={a.label}
                      onChange={(e) => editLabel(a.id, e.target.value.slice(0, 60))}
                      placeholder="ラベル（例：自分のiPhone / 田中さん）"
                      className="w-full mt-1 p-1.5 border border-border rounded text-[12px] bg-card outline-none"
                    />
                  </div>
                  <button onClick={() => removeAccount(a.id)} className="shrink-0 px-2 py-1 text-red-600 text-[12px] font-bold border-[1.5px] border-red-300 rounded-lg">削除</button>
                </div>
              ))}
            </div>
            <div className="p-2.5 rounded-lg bg-bg border-[1.5px] border-dashed border-border">
              <div className="text-[11px] font-bold text-sub mb-1.5">＋ 追加</div>
              <input
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="LINEユーザーID（Uxxxxxxxx…）"
                className="w-full p-2 border-[1.5px] border-border rounded-lg text-[11px] font-mono bg-card outline-none mb-1.5"
              />
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="ラベル（任意）"
                className="w-full p-2 border-[1.5px] border-border rounded-lg text-[12px] bg-card outline-none mb-1.5"
              />
              <button onClick={addAccount} className="w-full py-2 bg-sub text-white rounded-lg text-[13px] font-bold">リストに追加</button>
              <div className="text-[10px] text-muted mt-1.5">※ 自分のuserIdは「👥 ユーザー管理」で確認できます。追加後、下の「保存する」で確定します。</div>
            </div>
          </div>

          {/* 可視性 */}
          <div className="bg-card rounded-xl shadow-card p-4 mb-3">
            <label className={`flex items-center justify-between p-2.5 rounded-lg border-[1.5px] ${hideFromGeneral ? 'border-green bg-green-light' : 'border-border'}`}>
              <span className="text-[13px] font-bold">🙈 一般ユーザーから隠す</span>
              <input type="checkbox" className="w-5 h-5 accent-green" checked={hideFromGeneral} onChange={(e) => setHideFromGeneral(e.target.checked)} />
            </label>
            <div className="text-[11px] text-muted mt-2 leading-relaxed">
              ON：テストアカウントの<b>プロフィール</b>（招待候補・ゴル友・参加者名など）と<b>ラウンド募集</b>が、一般ユーザーの画面から完全に消えます。テストアカウント同士では今まで通り相互に見えます。
            </div>
          </div>

          {/* 機能フラグ */}
          <div className="bg-card rounded-xl shadow-card p-4 mb-3">
            <div className="text-[13px] font-black mb-1">🚧 機能の公開範囲</div>
            <div className="text-[11px] text-muted mb-3 leading-relaxed">新機能を「テストのみ」に置くと、テストアカウントにだけ表示されます。検証が済んだら「全員に公開」に切り替えます。</div>
            <div className="flex flex-col gap-2.5">
              {registry.length === 0 && <div className="text-[12px] text-muted">段階公開に対応した機能はまだありません。</div>}
              {registry.map((f) => (
                <div key={f.key} className="p-2.5 rounded-lg border-[1.5px] border-border bg-bg">
                  <div className="text-[13px] font-bold">{f.label}</div>
                  <div className="text-[10px] text-muted mb-2 leading-relaxed">{f.desc}</div>
                  <div className="flex gap-1.5">
                    {(['test-only', 'all', 'off'] as Visibility[]).map((v) => (
                      <button
                        key={v}
                        onClick={() => setFeatures({ ...features, [f.key]: v })}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border-[1.5px] ${
                          (features[f.key] || f.defaultVisibility) === v
                            ? 'border-green bg-green text-white'
                            : 'border-border bg-card text-sub'
                        }`}
                      >
                        {VIS_LABEL[v]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button onClick={save} disabled={saving} className="w-full py-3 bg-green text-white rounded-xl text-sm font-bold disabled:opacity-50">
            {saving ? '保存中…' : 'この内容で保存する'}
          </button>
          {msg && <div className="text-[12px] text-center mt-3 font-bold">{msg}</div>}
        </>
      )}
    </div>
  );
}
