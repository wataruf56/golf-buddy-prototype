// ファネルの各段が「どの画面のことか」を示すスクショを撮る。
// 既存の public/guide-shots と同じ方式（同名で上書きすれば差し替えられる）。
// ローカルに入っている Chrome をそのまま使う（ブラウザのダウンロードをしない）。
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = process.argv[2] || 'public/funnel-shots';
const SESSION = process.argv[3] || '';   // __session クッキー（アプリ内の画面用）

const SHOTS = [
  { key: 'lp-top',   url: 'https://goltomo.com/',  scroll: 0,
    label: 'LPに来た' },
  { key: 'lp-cta',   url: 'https://goltomo.com/',  scroll: 'bottom',
    label: 'LPを最後まで読んだ（下部CTA）' },
  { key: 'home',     url: 'https://app.goltomo.com/home', scroll: 0, wait: 2500, auth: true,
    label: 'ログインが通った（ホーム）' },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 780 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  if (SESSION) {
    await ctx.addCookies([{
      name: '__session', value: SESSION, domain: 'app.goltomo.com', path: '/',
      httpOnly: true, secure: true, sameSite: 'Lax',
    }]);
  }
  for (const s of SHOTS) {
    const page = await ctx.newPage();
    try {
      await page.goto(s.url, { waitUntil: 'networkidle', timeout: 45000 });
      if (s.wait) await page.waitForTimeout(s.wait);
      if (s.scroll === 'bottom') {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(900);
      }
      // PNGだと1枚500KBを超えることがある。管理画面に4枚並べるので JPEG に落とす。
      const file = path.join(OUT, `${s.key}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 72 });
      const kb = Math.round(fs.statSync(file).size / 1024);
      console.log(`  ✓ ${s.key.padEnd(8)} ${String(kb).padStart(4)}KB  ${s.label}`);
    } catch (e) {
      console.log(`  ✗ ${s.key}: ${e.message.split('\n')[0]}`);
    }
    await page.close();
  }
  await browser.close();
})();
