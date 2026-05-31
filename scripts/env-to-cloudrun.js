// One-off: convert a Vercel `vercel env pull` .env file into a Cloud Run
// --env-vars-file YAML, dropping Vercel/build-internal + NEXT_PUBLIC vars.
const fs = require('fs');

const src = process.argv[2] || '/tmp/prod.env';
const dst = process.argv[3] || '/tmp/cr-env.yaml';

const raw = fs.readFileSync(src, 'utf8');
const lines = raw.split(/\r?\n/);
const out = {};
const re = /^([A-Z_][A-Z0-9_]*)=(.*)$/;
for (const l of lines) {
  const m = l.match(re);
  if (!m) continue;
  let [, k, v] = m;
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    v = v.slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  out[k] = v;
}

const drop = new Set([
  'NX_DAEMON', 'TURBO_CACHE', 'TURBO_DOWNLOAD_LOCAL_ENABLED', 'TURBO_REMOTE_ONLY',
  'TURBO_RUN_SUMMARY', 'VERCEL', 'VERCEL_ENV', 'VERCEL_GIT_COMMIT_AUTHOR_LOGIN',
  'VERCEL_GIT_COMMIT_AUTHOR_NAME', 'VERCEL_GIT_COMMIT_MESSAGE', 'VERCEL_GIT_COMMIT_REF',
  'VERCEL_GIT_COMMIT_SHA', 'VERCEL_GIT_PREVIOUS_SHA', 'VERCEL_GIT_PROVIDER',
  'VERCEL_GIT_PULL_REQUEST_ID', 'VERCEL_GIT_REPO_ID', 'VERCEL_GIT_REPO_OWNER',
  'VERCEL_GIT_REPO_SLUG', 'VERCEL_OIDC_TOKEN', 'VERCEL_TARGET_ENV', 'VERCEL_URL',
  // NEXT_PUBLIC_* are baked at build time via cloudbuild.yaml.
  'NEXT_PUBLIC_LIFF_ID', 'NEXT_PUBLIC_LINE_BOT_BASIC_ID', 'NEXT_PUBLIC_DEMO_MODE',
]);

out['NEXTAUTH_URL'] = 'https://app.goltomo.com';

const keep = Object.entries(out).filter(([k]) => !drop.has(k));
const yaml = keep.map(([k, v]) => {
  v = String(v);
  if (v.includes('\n')) {
    return k + ': |\n' + v.split('\n').map((x) => '  ' + x).join('\n');
  }
  return k + ': ' + JSON.stringify(v);
}).join('\n');

fs.writeFileSync(dst, yaml + '\n');
console.log('Cloud Run vars:', keep.length);
console.log(keep.map(([k]) => k).join(', '));
