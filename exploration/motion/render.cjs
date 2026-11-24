#!/usr/bin/env node
// Deterministic frame-stepped render of exploration/motion/scene.html.
//   node exploration/motion/render.cjs eruption marquee deal
// Output: exploration/out/<variant>.mp4  (1080x1350, 60 fps, h264)

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..', '..');
const SCENE = 'file://' + path.join(__dirname, 'scene.html');
const OUT_DIR = path.join(ROOT, 'exploration', 'out');
const CHROME = process.env.MS_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FPS = 60;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let err = '';
    p.stderr.on('data', d => { err += d.toString(); });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}\n${err.slice(-1200)}`)));
  });
}

async function main() {
  const variants = process.argv.slice(2);
  if (!variants.length) { console.error('usage: render.cjs <variant...>'); process.exit(1); }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'shell',
    args: ['--hide-scrollbars', '--disable-lcd-text', '--force-device-scale-factor=1',
      '--allow-file-access-from-files'],
  });

  try {
    const page = await browser.newPage();
    page.on('pageerror', e => console.error('  [page error]', e.message));
    await page.setViewport({ width: 1200, height: 1500, deviceScaleFactor: 1 });
    await page.goto(SCENE, { waitUntil: 'load', timeout: 60_000 });
    await page.evaluate(() => window.ready);

    for (const v of variants) {
      const total = await page.evaluate(name => window.frameCount(name), v);
      if (!total) { console.error(`unknown variant ${v}`); continue; }
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ms-${v}-`));
      process.stdout.write(`rendering ${v}: ${total} frames `);
      const t0 = Date.now();
      for (let f = 0; f < total; f++) {
        const data = await page.evaluate((frame, name) => {
          window.drawFrame(frame, name);
          return document.getElementById('c').toDataURL('image/png').slice(22);
        }, f, v);
        fs.writeFileSync(path.join(dir, `f${String(f).padStart(5, '0')}.png`), Buffer.from(data, 'base64'));
        if (f % 60 === 0) process.stdout.write('.');
      }
      const out = path.join(OUT_DIR, `${v}.mp4`);
      await run('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.png'),
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
        // tag the rec709 primaries explicitly: an untagged file lets the player
        // guess, and a bt601 guess visibly shifts saturated reds
        '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
        '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709',
        '-r', String(FPS), '-movflags', '+faststart', out]);
      fs.rmSync(dir, { recursive: true, force: true });
      const kb = (fs.statSync(out).size / 1024).toFixed(0);
      console.log(` -> exploration/out/${v}.mp4 (${kb} KB, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
