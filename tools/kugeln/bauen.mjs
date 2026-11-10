// Rendert die handgemalten Christbaumkugeln (tools/kugeln/kugel.html) in Chrome zu transparenten PNGs und wandelt sie mit zu_webp.py in assets/img/kugel-*.webp.
// Aufruf:  node tools/kugeln/bauen.mjs        (Z = Pixel pro Einheit, Standard 4)
import { browser, sleep } from '../tests/lib.mjs';
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const hier = dirname(fileURLToPath(import.meta.url));
const Z = +(process.env.Z || 4);
const NAMEN = ['gold-punkte', 'creme-flocke', 'eis-berge', 'rot-streifen', 'gold-wirbel', 'eis-stern', 'tropfen-creme', 'tropfen-rot'];
const png = mkdtempSync(join(tmpdir(), 'kugeln-'));
const b = await browser({ view: 'desktop' });
try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 120 * Z, height: 156 * Z, deviceScaleFactor: 1, mobile: false });
  await b.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  for (const n of NAMEN) {
    await b.send('Page.navigate', { url: `file://${hier}/kugel.html?v=${n}&z=${Z}` });
    for (let i = 0; i < 40 && !(await b.js('window.__fertig === true')); i++) await sleep(100);
    await sleep(400);
    const r = await b.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 120 * Z, height: 156 * Z, scale: 1 }, fromSurface: true });
    writeFileSync(join(png, n + '.png'), Buffer.from(r.result.data, 'base64'));
  }
} finally { b.close(); }
console.log(execFileSync('python3', [join(hier, 'zu_webp.py'), png, String(Z)], { encoding: 'utf-8' }));
