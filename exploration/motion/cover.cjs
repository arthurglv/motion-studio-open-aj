#!/usr/bin/env node
// Still cover from a variant's last frame, re-framed taller.
//   node exploration/motion/cover.cjs deal
//   MS_H=1920 MS_OFFY=285 node exploration/motion/cover.cjs deal
// Output: exploration/out/<variant>-cover-<w>x<h>.png

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const puppeteer = require('puppeteer-core');

// Canvas works in sRGB and the source flyer is tagged sRGB, but Chrome writes
// the PNG untagged — and an untagged file on a P3 display gets reinterpreted as
// P3 by macOS, which is enough to visibly shift the awwwards red. Splice in the
// 1-byte sRGB chunk after IHDR; pixel data is untouched.
function tagSRGB(buf) {
  if (buf.includes(Buffer.from('sRGB'), 8, 'latin1')) return buf;
  const ihdrEnd = 8 + 4 + 4 + buf.readUInt32BE(8) + 4;
  const chunk = Buffer.alloc(13);
  chunk.writeUInt32BE(1, 0);
  chunk.write('sRGB', 4, 'latin1');
  chunk.writeUInt8(0, 8); // rendering intent: perceptual
  chunk.writeUInt32BE(zlib.crc32(chunk.subarray(4, 9)) >>> 0, 9);
  return Buffer.concat([buf.subarray(0, ihdrEnd), chunk, buf.subarray(ihdrEnd)]);
}

const ROOT = path.resolve(__dirname, '..', '..');
const SCENE = 'file://' + path.join(__dirname, 'scene.html');
const OUT_DIR = path.join(ROOT, 'exploration', 'out');
const CHROME = process.env.MS_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HEIGHT = Number(process.env.MS_H || 1920);
const WIDTH = Number(process.env.MS_W || 1080);
const OFFY = process.env.MS_OFFY ? Number(process.env.MS_OFFY) : null;

(async () => {
  const variants = process.argv.slice(2);
  if (!variants.length) { console.error('usage: cover.cjs <variant...>'); process.exit(1); }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'shell',
    args: ['--hide-scrollbars', '--allow-file-access-from-files'],
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => console.error('  [page error]', e.message));
    await page.goto(SCENE, { waitUntil: 'load' });
    await page.evaluate(() => window.ready);
    for (const v of variants) {
      // draw twice: the first drawImage of a rescaled photo warms Chrome's
      // resample cache and comes out marginally softer than every later one
      const info = await page.evaluate((name, w, h, offy) => {
        const o = { width: w, height: h };
        if (offy != null) o.offsetY = offy;
        window.drawCover(name, o);
        return window.drawCover(name, o);
      }, v, WIDTH, HEIGHT, OFFY);
      const data = await page.evaluate(() => document.getElementById('c').toDataURL('image/png').slice(22));
      const out = path.join(OUT_DIR, `${v}-cover-${info.width}x${info.height}.png`);
      fs.writeFileSync(out, tagSRGB(Buffer.from(data, 'base64')));
      console.log(`-> exploration/out/${path.basename(out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB, ` +
        `plate extended +${info.top} top / +${info.bottom} bottom)`);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
