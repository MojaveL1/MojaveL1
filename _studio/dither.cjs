// 1 bit dither art for the site: ordered bayer, chunky cells, tone normalised so thin shapes survive
'use strict';
const { open, sleep } = require('./cdp.cjs');
const fs = require('fs'); const path = require('path');
const OUT = path.join(__dirname, '..', 'site', 'img');

const SCRIPT = `
(async () => {
  const B = [0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,
             3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21];
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('img ' + src)); i.src = src; });
  const mark = await load('/img/mark.png');

  // bounds of the ink, so the artwork fills its box
  const probe = document.createElement('canvas'); probe.width = 256; probe.height = 256;
  const pg = probe.getContext('2d', { willReadFrequently: true }); pg.drawImage(mark, 0, 0, 256, 256);
  const pd = pg.getImageData(0, 0, 256, 256).data;
  let x0 = 256, y0 = 256, x1 = 0, y1 = 0;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4, lum = (0.299 * pd[i] + 0.587 * pd[i + 1] + 0.114 * pd[i + 2]) / 255;
    if (lum < 0.86) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  }
  const box = { x: x0 / 256, y: y0 / 256, w: (x1 - x0 + 1) / 256, h: (y1 - y0 + 1) / 256 };

  function dither(draw, sw, sh, cell, mode, gain) {
    const small = document.createElement('canvas'); small.width = sw; small.height = sh;
    const s = small.getContext('2d', { willReadFrequently: true });
    s.fillStyle = '#fff'; s.fillRect(0, 0, sw, sh); draw(s, sw, sh);
    const d = s.getImageData(0, 0, sw, sh).data;
    const out = document.createElement('canvas'); out.width = sw * cell; out.height = sh * cell;
    const g = out.getContext('2d'); g.fillStyle = '#fff';
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      const t = (B[(y % 8) * 8 + (x % 8)] + 0.5) / 64;
      const ink = mode === 'light' ? lum : 1 - lum;
      if (Math.min(1, Math.max(0, (ink - 0.04) * gain)) > t) g.fillRect(x * cell, y * cell, cell, cell);
    }
    return out;
  }

  const drawMark = (g, sw, sh, scale = 1, cx = 0.5, cy = 0.5) => {
    const w = sw * box.w * scale, h = sh * box.h * scale;
    g.drawImage(mark, box.x * mark.width, box.y * mark.height, box.w * mark.width, box.h * mark.height,
      sw * cx - w / 2, sh * cy - h / 2, w, h);
  };
  const drawSky = (g, sw, sh, cx, cy, r) => {
    const grd = g.createRadialGradient(sw * cx, sh * cy, 0, sw * cx, sh * cy, Math.max(sw, sh) * r);
    grd.addColorStop(0, '#000'); grd.addColorStop(0.5, '#555'); grd.addColorStop(1, '#fff');
    g.fillStyle = grd; g.fillRect(0, 0, sw, sh);
  };

  // 1. the mark, stippled
  const big = dither((g, sw, sh) => drawMark(g, sw, sh, 0.98), 210, 210, 3, 'dark', 2.4);

  // 2. a dim sky for banner backgrounds
  const sky = dither((g, sw, sh) => drawSky(g, sw, sh, 0.3, 0.25, 1.2), 220, 110, 4, 'light', 1.15);

  // 3. band: six panels, alternating mark and sky
  const pw = 240, ph = 210, cell = 3;
  const band = document.createElement('canvas'); band.width = pw * 6; band.height = ph;
  const bg = band.getContext('2d'); bg.fillStyle = '#0b0b0b'; bg.fillRect(0, 0, band.width, ph);
  for (let k = 0; k < 6; k++) {
    const p = k % 3 === 1
      ? dither((g, sw, sh) => drawSky(g, sw, sh, 0.35 + 0.06 * k, 0.5, 0.85), pw / cell, ph / cell, cell, 'light', 1.15)
      : dither((g, sw, sh) => drawMark(g, sw, sh, 0.76 + 0.04 * k), pw / cell, ph / cell, cell, 'dark', 2.4);
    bg.drawImage(p, k * pw, 0);
  }

  return { mark: big.toDataURL('image/png'), band: band.toDataURL('image/png'), sky: sky.toDataURL('image/png') };
})()
`;

(async () => {
  const b = await open('http://127.0.0.1:4400/index.html', 400, 300, 9802);
  await sleep(1200);
  const out = await b.ev(SCRIPT);
  b.close();
  if (!out) throw new Error('dither failed');
  const write = (name, url) => { const f = path.join(OUT, name); fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log(name, (fs.statSync(f).size / 1024).toFixed(0) + 'kb'); };
  write('dither-mark.png', out.mark);
  write('dither-band.png', out.band);
  write('dither-sky.png', out.sky);
})();
