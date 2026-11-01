import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = process.argv[2];
const steps = (process.argv[3] || '0.06,0.08,0.095,0.105,0.12,0.14').split(',').map(Number);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
await p.goto('http://127.0.0.1:5173/'); await p.waitForTimeout(13000);
await p.mouse.move(950, 10);
const max = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
for (const [i, f] of steps.entries()) {
  await p.evaluate((y) => window.scrollTo(0, y), Math.round(max * f));
  await p.waitForTimeout(3500);
  await p.screenshot({ path: `${out}/t-${i}.png` });
}
await b.close();
