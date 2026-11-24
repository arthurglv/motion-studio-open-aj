#!/usr/bin/env node
// Contact sheet of a variant: node exploration/motion/sheet.cjs eruption
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const SCENE = 'file://' + path.join(__dirname, 'scene.html');
const OUT = path.join(__dirname, '.sheets');
const CHROME = process.env.MS_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = Number(process.env.MS_SHOTS || 8);
const COLS = Number(process.env.MS_COLS || 4);

(async () => {
  const variants = process.argv.slice(2);
  fs.mkdirSync(OUT, { recursive: true });
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
      const data = await page.evaluate((name, shots, cols) => {
        const total = window.frameCount(name);
        const src = document.getElementById('c');
        const cellW = 300, cellH = Math.round(cellW * src.height / src.width), label = 18, pad = 6;
        const rows = Math.ceil(shots / cols);
        const s = document.createElement('canvas');
        s.width = cols * cellW + (cols + 1) * pad;
        s.height = rows * (cellH + label) + (rows + 1) * pad;
        const g = s.getContext('2d');
        g.fillStyle = '#141418'; g.fillRect(0, 0, s.width, s.height);
        g.font = '12px ui-monospace, monospace'; g.textBaseline = 'top';
        for (let i = 0; i < shots; i++) {
          const f = Math.round(i / (shots - 1) * (total - 1));
          window.drawFrame(f, name);
          const col = i % cols, row = Math.floor(i / cols);
          const x = pad + col * (cellW + pad), y = pad + row * (cellH + label + pad);
          g.fillStyle = '#8a8a94';
          g.fillText(`f${f} · ${(f / 60).toFixed(2)}s`, x, y);
          g.drawImage(src, x, y + label, cellW, cellH);
        }
        return s.toDataURL('image/jpeg', 0.88).slice(23);
      }, v, SHOTS, COLS);
      const file = path.join(OUT, `${v}.jpg`);
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      console.log('->', file);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
