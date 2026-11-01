import { chromium, devices } from 'playwright-core';
import fs from 'node:fs';
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ ...devices['Pixel 7'] });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://127.0.0.1:5173/'); await p.waitForTimeout(12000);
await p.screenshot({ path: `${out}/m-1.png` });
await p.touchscreen.tap(206, 400); await p.waitForTimeout(4000);
await p.screenshot({ path: `${out}/m-tap.png` });
const max = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
for (const [i, f] of [[2, 0.2], [3, 0.4], [5, 0.8], [6, 1]]) {
  await p.evaluate((y) => window.scrollTo(0, y), Math.round(max * f));
  await p.waitForTimeout(5000);
  await p.screenshot({ path: `${out}/m-${i}.png` });
}
console.log(JSON.stringify(errs));
await b.close();
