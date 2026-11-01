import { chromium } from 'playwright-core';
const [out, frac, hx, hy] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)) });
await p.goto('http://127.0.0.1:5173/'); await p.waitForTimeout(13000);
await p.mouse.move(1270, 10);
const max = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
await p.evaluate((y) => window.scrollTo(0, y), Math.round(max * Number(frac)));
await p.waitForTimeout(5000);
if (hx) { await p.mouse.move(Number(hx), Number(hy)); await p.waitForTimeout(3500) }
await p.screenshot({ path: out });
console.log(JSON.stringify(errs.slice(0, 4)));
await b.close();
