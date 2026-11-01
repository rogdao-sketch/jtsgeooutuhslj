import { chromium } from 'playwright-core';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto('http://127.0.0.1:5173/');
await p.waitForTimeout(14000);
// hide the HUD captions, keep the logo
await p.addStyleTag({ content: '.hud{display:none!important}' });
await p.mouse.move(600, 260);
await p.waitForTimeout(5000);
await p.screenshot({ path: out });
await b.close();
