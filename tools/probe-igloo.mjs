import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const logs = [];
page.on('console', m => logs.push(m.type() + ': ' + m.text().slice(0, 200)));
const reqs = [];
page.on('request', r => reqs.push(r.url()));
await page.goto('https://www.igloo.inc', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/load-${i}.png` });
  console.log('t', i, JSON.stringify(await page.evaluate(() => document.body.innerText.slice(0, 200))));
}
await page.waitForTimeout(8000);
await page.screenshot({ path: `${out}/after-load.png` });
const info = await page.evaluate(() => {
  const cs = getComputedStyle(document.body);
  const fonts = [...document.fonts].map(f => f.family + ' ' + f.weight + ' ' + f.status);
  const els = [...document.querySelectorAll('*')].slice(0, 400);
  const fam = {};
  els.forEach(e => { const f = getComputedStyle(e).fontFamily; fam[f] = (fam[f] || 0) + 1; });
  const cols = {};
  els.forEach(e => { const s = getComputedStyle(e); [s.color, s.backgroundColor].forEach(c => cols[c] = (cols[c] || 0) + 1); });
  return { title: document.title, bodyBg: cs.backgroundColor, fonts, fam, cols,
    canvases: [...document.querySelectorAll('canvas')].map(c => c.width + 'x' + c.height),
    scrollH: document.documentElement.scrollHeight, text: document.body.innerText.slice(0, 1500),
    wgl: (() => { const c = document.createElement('canvas'); return !!(c.getContext('webgl2')); })() };
});
console.log(JSON.stringify(info, null, 1));
// scroll journey
const steps = 14;
for (let i = 0; i <= steps; i++) {
  await page.mouse.move(720, 400);
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/scroll-${String(i).padStart(2, '0')}.png` });
  const t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 160));
  console.log('scroll', i, JSON.stringify(t));
}
console.log(logs.slice(0, 15).join('\n'));
const ext = {};
reqs.forEach(u => { const m = u.match(/\.(js|glb|gltf|woff2?|png|jpg|webp|mp3|mp4|ktx2|hdr|bin|json|svg)(\?|$)/i); if (m) ext[m[1]] = (ext[m[1]] || []).concat(u.slice(0, 120)); });
console.log(JSON.stringify(Object.fromEntries(Object.entries(ext).map(([k, v]) => [k, v.slice(0, 8)])), null, 1));
await browser.close();
