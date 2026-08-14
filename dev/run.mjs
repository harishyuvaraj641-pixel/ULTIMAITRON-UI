/**
 * DEV-ONLY verification driver.
 *
 * Boots the app in headless Chromium with a fake camera device, walks it
 * through every gesture using the synthetic hand stub, and reports console
 * errors, WebGL/shader failures and FPS. Screenshots land in dev/shots/.
 * Not part of the shipped application.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4173;
const SHOTS = new URL('./shots/', import.meta.url).pathname;

const server = spawn(process.execPath, [new URL('./server.mjs', import.meta.url).pathname], {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(PORT) },
});

process.on('exit', () => server.kill());

async function main() {
  await mkdir(SHOTS, { recursive: true });
  await sleep(700);

  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    permissions: ['camera'],
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const errors = [];
  const warnings = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error') errors.push(text);
    else if (message.type() === 'warning') warnings.push(text);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });

  const shot = async (name) => {
    await page.screenshot({ path: `${SHOTS}${name}.png` });
    console.log(`  · captured ${name}.png`);
  };

  console.log('\n[1] boot sequence');
  await sleep(1200);
  await shot('01-boot');
  await sleep(4200);
  await shot('02-idle');

  const renderer = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return 'none';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  console.log(`  · renderer: ${renderer}`);

  console.log('\n[2] pointer fallback');
  await page.mouse.move(1100, 380);
  await sleep(400);
  await page.mouse.down();
  for (let i = 0; i < 24; i++) {
    await page.mouse.move(1100 - i * 12, 380 + i * 3);
    await sleep(16);
  }
  await page.mouse.up();
  await sleep(600);
  await shot('03-pointer-drag');

  console.log('\n[3] enabling synthetic camera');
  await page.evaluate(() => {
    globalThis.__NEXUS_TEST_HANDS__ = [{ x: 0.5, y: 0.5, scale: 0.16, pose: 'open' }];
  });
  await page.getByRole('button', { name: 'CAMERA' }).click();
  await sleep(2500);
  await shot('04-camera-open-palm');

  const poses = [
    ['05-pinch', [{ x: 0.42, y: 0.46, scale: 0.17, pose: 'pinch' }]],
    ['06-fist', [{ x: 0.5, y: 0.5, scale: 0.18, pose: 'fist' }]],
    ['07-point', [{ x: 0.6, y: 0.4, scale: 0.16, pose: 'point' }]],
    [
      '08-two-hands',
      [
        { x: 0.28, y: 0.5, scale: 0.15, pose: 'open', handedness: 'Left' },
        { x: 0.74, y: 0.5, scale: 0.15, pose: 'open', handedness: 'Right' },
      ],
    ],
  ];

  for (const [name, hands] of poses) {
    await page.evaluate((value) => {
      globalThis.__NEXUS_TEST_HANDS__ = value;
    }, hands);
    await sleep(1600);
    await shot(name);
    const state = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.hud-left .row')].map((r) => r.textContent);
      return rows.join(' | ');
    });
    console.log(`  · ${name}: ${state}`);
  }

  console.log('\n[4] fist release -> power burst');
  await page.evaluate(() => {
    globalThis.__NEXUS_TEST_HANDS__ = [{ x: 0.5, y: 0.5, scale: 0.18, pose: 'fist' }];
  });
  await sleep(900);
  await page.evaluate(() => {
    globalThis.__NEXUS_TEST_HANDS__ = [{ x: 0.5, y: 0.5, scale: 0.18, pose: 'open' }];
  });
  await sleep(320);
  await shot('09-power-burst');

  console.log('\n[5] swipe -> mode change');
  for (let i = 0; i < 10; i++) {
    const x = 0.72 - i * 0.055;
    await page.evaluate((value) => {
      globalThis.__NEXUS_TEST_HANDS__ = [{ x: value, y: 0.5, scale: 0.16, pose: 'open' }];
    }, x);
    await sleep(28);
  }
  await sleep(1200);
  await shot('10-after-swipe');
  const mode = await page.textContent('.mode-name');
  console.log(`  · mode after swipe: ${mode}`);

  console.log('\n[6] modes via keyboard');
  for (const key of ['2', '3', '4', '5']) {
    await page.keyboard.press(key);
    await sleep(1500);
    await shot(`11-mode-${key}`);
  }
  await page.keyboard.press('1');
  await sleep(1400);

  console.log('\n[7] debug overlay');
  await page.keyboard.press('d');
  await sleep(900);
  await shot('12-debug');
  const debugText = await page.textContent('.debug .readouts');
  console.log(`  · readouts: ${debugText?.replace(/\s+/g, ' ').slice(0, 400)}`);
  await page.keyboard.press('d');

  console.log('\n[8] sustained frame rate');
  await page.evaluate(() => {
    globalThis.__NEXUS_TEST_HANDS__ = [{ x: 0.5, y: 0.45, scale: 0.17, pose: 'open' }];
  });
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - start >= 4000) resolve((frames * 1000) / (performance.now() - start));
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  console.log(`  · ${fps.toFixed(1)} fps (software rasteriser)`);

  console.log('\n[9] resize + hud toggle');
  await page.setViewportSize({ width: 700, height: 900 });
  await sleep(900);
  await shot('13-narrow');
  await page.setViewportSize({ width: 1600, height: 900 });
  await sleep(700);

  console.log('\n[10] memory / leak check');
  const memory = await page.evaluate(() => {
    const info = performance.memory;
    return info ? Math.round(info.usedJSHeapSize / 1048576) : -1;
  });
  console.log(`  · JS heap: ${memory} MB`);

  await page.getByRole('button', { name: 'CAMERA' }).click();
  await sleep(800);
  await shot('14-camera-off');

  console.log('\n──────── results ────────');
  console.log(`console errors : ${errors.length}`);
  for (const error of errors.slice(0, 25)) console.log(`   ✗ ${error}`);
  const relevantWarnings = warnings.filter((w) => !/vision. worker unavailable/i.test(w));
  console.log(`console warnings: ${relevantWarnings.length}`);
  for (const warning of relevantWarnings.slice(0, 15)) console.log(`   ! ${warning}`);

  await browser.close();
  server.kill();
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  server.kill();
  process.exit(1);
});
