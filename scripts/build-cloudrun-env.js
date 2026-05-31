// Build the complete Cloud Run env-vars YAML by merging:
//   1. existing values already on the Cloud Run service (Firebase + auth + admin)
//   2. authoritative values gathered from GCP (GCS key, bucket, analyzer)
//   3. LINE values transferred via browser download
// env-vars-file is a FULL REPLACE on Cloud Run, so every var must be present.
const fs = require('fs');
const TMP = process.env.TEMP || 'C:/Users/da_is/AppData/Local/Temp';
const DL = 'C:/Users/da_is/Downloads';

// (1) current service env
const svc = JSON.parse(fs.readFileSync(TMP + '/svc.json', 'utf8'));
const cur = {};
for (const e of (svc.spec.template.spec.containers[0].env || [])) if (e.value) cur[e.name] = e.value;

// (2) GCS signer key (raw JSON string, single line)
const gcsKey = fs.readFileSync(TMP + '/gcs-key.json', 'utf8').trim();

// (3) LINE secrets from download
const line = JSON.parse(fs.readFileSync(DL + '/goltomo-line.json', 'utf8'));

const all = {
  ...cur, // FIREBASE_*, NEXTAUTH_*, CRON_SECRET, ADMIN_LOG_TOKEN, ADMIN_PASSWORD
  // GCS (cross-project: golf-ai-line-app)
  GCS_PROJECT_ID: 'golf-ai-line-app',
  GCS_BUCKET: 'golf-ai-line-videos',
  GCS_SA_KEY_JSON: gcsKey,
  // Swing analyzer (read from the analyzer service's own env)
  SWING_ANALYZER_URL: 'https://swing-analyzer-4amu3rxdsq-an.a.run.app/analyze',
  SWING_ANALYZER_SHARED_SECRET: 'analyze_20251229_wataru_k8P3mZ',
  // LINE Login channel (id is public; secret from console)
  LINE_CLIENT_ID: '2009973733',
  LIFF_CHANNEL_ID: '2009973733',
  LINE_CLIENT_SECRET: line.LINE_CLIENT_SECRET,
  // Optional behaviour flags (mirror Vercel intent)
  NEXT_PUBLIC_DEMO_MODE: 'false',
};
// Carry over messaging-channel push token if we already captured it.
if (line.LINE_CHANNEL_ACCESS_TOKEN) all.LINE_CHANNEL_ACCESS_TOKEN = line.LINE_CHANNEL_ACCESS_TOKEN;
if (line.LINE_CHANNEL_SECRET) all.LINE_CHANNEL_SECRET = line.LINE_CHANNEL_SECRET;

const yaml = Object.entries(all).map(([k, v]) => k + ': ' + JSON.stringify(String(v))).join('\n');
fs.writeFileSync(TMP + '/full-env.yaml', yaml + '\n');
console.log('TOTAL vars:', Object.keys(all).length);
for (const [k, v] of Object.entries(all)) console.log('  ', k, String(v).length);
