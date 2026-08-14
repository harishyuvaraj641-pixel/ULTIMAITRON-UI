import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const server = spawn(process.execPath, ['dev/server.mjs'], { stdio: 'ignore', env: {...process.env, PORT: '4178'} });
await sleep(600);
const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 700, height: 460 }, permissions: ['camera'] });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror', e=>errs.push(e.message)); page.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
await page.goto('http://127.0.0.1:4178/', { waitUntil: 'load' });
const el = () => page.evaluate(() => window.nexus ? window.nexus.elapsed : 0);
const adv = async (s, cap=120) => { const a = await el(); const t0=Date.now(); for(;;){ if ((await el())-a>=s || (Date.now()-t0)/1000>cap) return; await sleep(600);} };
await adv(1);
await page.evaluate(() => { globalThis.__NEXUS_TEST_HANDS__ = [{x:0.5,y:0.5,scale:0.16,pose:'open'}]; });
await page.getByRole('button', { name: 'CAMERA' }).click();
await adv(2.5);
const poses = ['open','pinch','fist','point','two','three'];
for (const pose of poses) {
  await page.evaluate((p) => { globalThis.__NEXUS_TEST_HANDS__ = [{x:0.5,y:0.5,scale:0.16,pose:p}]; }, pose);
  await adv(1.6);
  const info = await page.evaluate(() => {
    const h = window.nexus.tracker.hands[0].features;
    return { g: h.gesture, ext: h.extension.map(v=>+v.toFixed(2)), out: h.extended, pinchD: +h.pinchDistance.toFixed(2), open: +h.palmOpenness.toFixed(2) };
  });
  console.log(pose.padEnd(6), '->', info.g.padEnd(12), 'ext', JSON.stringify(info.ext), 'pinchD', info.pinchD, 'open', info.open);
}
// two-hand + swipe
await page.evaluate(() => { globalThis.__NEXUS_TEST_HANDS__ = [{x:0.3,y:0.5,scale:0.15,pose:'open',handedness:'Left'},{x:0.7,y:0.5,scale:0.15,pose:'open',handedness:'Right'}]; });
await adv(1.5);
console.log('two hands ->', await page.evaluate(() => ({ state: window.nexus.gestures.state, scale: +window.nexus.orb.currentScale.toFixed(2) })));
await page.evaluate(() => { globalThis.__NEXUS_TEST_HANDS__ = [{x:0.24,y:0.5,scale:0.15,pose:'open',handedness:'Left'},{x:0.76,y:0.5,scale:0.15,pose:'open',handedness:'Right'}]; });
await adv(2.0);
console.log('spread    ->', await page.evaluate(() => ({ scale: +window.nexus.orb.currentScale.toFixed(2) })));
const modeBefore = await page.textContent('.mode-name');
for (let i=0;i<14;i++){ const x = 0.78 - i*0.045; await page.evaluate((v)=>{ globalThis.__NEXUS_TEST_HANDS__=[{x:v,y:0.5,scale:0.16,pose:'open'}]; }, x); await sleep(22); }
await adv(1.5);
console.log('swipe     ->', modeBefore, '=>', await page.textContent('.mode-name'));
console.log('errors:', errs.length); errs.slice(0,6).forEach(e=>console.log('  ✗',e));
await browser.close(); server.kill(); process.exit(0);
