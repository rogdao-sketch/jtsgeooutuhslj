import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = process.argv[2];
const url = process.argv[3] || 'http://127.0.0.1:5173/';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
console.log('scroll max', max);
await page.mouse.move(724, 430);
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}/hover-tower.png` });
await page.mouse.move(260, 700);
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/hover-ground.png` });
await page.mouse.move(1400, 60);
for (let i = 0; i < 6; i++) {
  await page.evaluate((y) => window.scrollTo(0, y), Math.round((max * i) / 5));
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${out}/chapter-${i + 1}.png` });
}
console.log(JSON.stringify(errs.slice(0, 6)));
await browser.close();
