import { NextRequest, NextResponse } from 'next/server';
import { getTestAccountConfig, saveTestAccountConfig } from '@/lib/testAccounts';
import type { TestAccount } from '@/lib/testAccounts';
import { FEATURE_REGISTRY, effectiveVisibilities, isFeatureVisibility } from '@/lib/featureFlags';
import type { FeatureVisibility } from '@/lib/featureFlags';

// 管理者用：テストアカウント一覧・可視性設定・機能フラグの取得/更新。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function GET(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const config = await getTestAccountConfig();
  return NextResponse.json(
    { config, registry: FEATURE_REGISTRY, effective: effectiveVisibilities(config.features) },
    { headers: noStore },
  );
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = await req.json(); } catch {}

  // accounts: [{id,label}] を正規化。新規（addedAt 未設定）にはタイムスタンプを付ける。
  let accounts: TestAccount[] | undefined;
  if (Array.isArray(body?.accounts)) {
    const now = Date.now();
    const seen = new Set<string>();
    accounts = [];
    for (const a of body.accounts) {
      const id = String(a?.id ?? '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      accounts.push({
        id,
        label: String(a?.label ?? '').trim().slice(0, 60),
        addedAt: Number.isFinite(a?.addedAt) && Number(a.addedAt) > 0 ? Number(a.addedAt) : now,
      });
    }
  }

  // features: 登録済みキーだけ受け付ける（未知キー・不正値は無視）。
  let features: Record<string, FeatureVisibility> | undefined;
  if (body?.features && typeof body.features === 'object') {
    features = {};
    for (const f of FEATURE_REGISTRY) {
      const v = body.features[f.key];
      if (isFeatureVisibility(v)) features[f.key] = v;
    }
  }

  try {
    const config = await saveTestAccountConfig({
      accounts,
      hideFromGeneral: typeof body?.hideFromGeneral === 'boolean' ? body.hideFromGeneral : undefined,
      features,
    });
    return NextResponse.json(
      { ok: true, config, registry: FEATURE_REGISTRY, effective: effectiveVisibilities(config.features) },
      { headers: noStore },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
