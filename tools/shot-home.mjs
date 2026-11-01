import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = process.argv[2];
const url = process.argv[3] || 'http://localhost:5173/';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
for (const [name, vp] of [['desktop', { width: 1440, height: 810 }], ['mobile', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp });
  const errs = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) errs.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}-1-preloader.png` });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${out}/${name}-2-intro.png` });
  await page.mouse.move(vp.width * 0.7, vp.height * 0.4);
  await page.waitForTimeout(5500);
  await page.screenshot({ path: `${out}/${name}-3-hero.png` });
  console.log(name, JSON.stringify(errs.slice(0, 6)));
  await page.close();
}
await browser.close();
