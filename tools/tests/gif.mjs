// Nimmt den Ablauf mit den zwei Gesten als animiertes GIF auf (Headless Chrome, Bildschirmaufnahme über das DevTools-Protokoll):
// A → Geste 1 → B → Geste 2 → C → zurück nach oben → Geste nach oben → B → Geste nach oben → A. Einblendung: Zustand und P.
// Aufruf:  node tools/tests/gif.mjs [handy|ipad|desktop|alle] [Ausgabeordner]   (je Gerät: ablauf-<gerät>.gif und geste2-<gerät>.gif)
// Benötigt Python 3 mit Pillow (pip install pillow) zum Zusammensetzen.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browser, setView, gesture, samples, waitReady, waitZustand, idle, sleep, BASE, DEVICES } from './lib.mjs';

const GERAETE = {
  handy: { view: DEVICES.iphone15, breite: 200 },
  ipad: { view: DEVICES['ipad-air-quer'], breite: 420 },
  desktop: { view: DEVICES['desktop-1440'], breite: 480 },
};
const welche = process.argv[2] && process.argv[2] !== 'alle' ? [process.argv[2]] : Object.keys(GERAETE);
const outDir = process.argv[3] || join(tmpdir(), 'berghof-gifs');
mkdirSync(outDir, { recursive: true });

for (const name of welche) {
  const { view, breite } = GERAETE[name];
  const dir = join(tmpdir(), 'berghof-gif-' + name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const b = await browser({ view });
  const frames = [];
  b.onEvent = (m) => {
    if (m.method !== 'Page.screencastFrame') return;
    frames.push({ t: m.params.metadata.timestamp, data: m.params.data });
    b.send('Page.screencastFrameAck', { sessionId: m.params.sessionId });
  };
  try {
    await setView(b, view);
    await b.send('Page.navigate', { url: BASE });
    await waitReady(b);
    await b.send('Page.startScreencast', { format: 'jpeg', quality: 62, maxWidth: breite, everyNthFrame: 1 });
    await sleep(700);
    await gesture(b, 1); await waitZustand(b, 'B'); await idle(b); await sleep(900);
    await gesture(b, 1); await waitZustand(b, 'C'); await idle(b); await sleep(600);
    await b.js(`window.scrollTo(0, 0)`); await sleep(700);
    await gesture(b, -1); await waitZustand(b, 'B'); await idle(b); await sleep(900);
    await gesture(b, -1); await waitZustand(b, 'A'); await idle(b); await sleep(700);
    await b.send('Page.stopScreencast');
    const S = await samples(b);
    const wall = await b.js('Date.now() - performance.now()');
    const meta = frames.map((f, i) => {
      const ms = f.t * 1000 - wall;
      let best = null, dist = 1e9;
      for (const s of S) { const dd = Math.abs(s.t - ms); if (dd < dist) { dist = dd; best = s; } }
      writeFileSync(join(dir, `f${String(i).padStart(4, '0')}.jpg`), Buffer.from(f.data, 'base64'));
      return { i, t: f.t, z: best?.z ?? '', P: best?.P ?? 0 };
    });
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta));
    console.log(`${name}: ${frames.length} Bilder aufgenommen, Fehler: ${b.errors.length ? b.errors[0] : 'keine'}`);
  } finally { b.close(); }

  // Zusammensetzen: höchstens 15 Bilder pro Sekunde, Zustand und P einblenden. Dazu ein GIF nur von Geste 2 (P von 1 bis 2, mit etwas Vor- und Nachlauf)
  const py = `
import json, sys
from PIL import Image, ImageDraw
d, out, a, b = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
meta = json.load(open(d + '/meta.json'))
imgs, durs, last_t = [], [], None
for m in meta:
    if m['i'] < a or m['i'] > b: continue
    if last_t is not None and m['t'] - last_t < 0.066: continue
    im = Image.open(d + '/f%04d.jpg' % m['i']).convert('RGB')
    dr = ImageDraw.Draw(im)
    dr.rectangle((0, 0, im.width, 16), fill=(20, 20, 20)); dr.text((6, 3), 'Zustand %s   P %.2f' % (m['z'], m['P']), fill=(255, 255, 255))
    imgs.append(im.convert('P', palette=Image.ADAPTIVE, colors=64)); durs.append(66); last_t = m['t']
imgs[0].save(out, save_all=True, append_images=imgs[1:], duration=durs, loop=0, optimize=True)
print(len(imgs), 'Bilder im GIF')
`;
  execFileSync('python3', ['-c', py, dir, join(outDir, `ablauf-${name}.gif`), '0', '999999'], { stdio: 'inherit' });
  console.log('GIF:', join(outDir, `ablauf-${name}.gif`));
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const i0 = meta.findIndex((m) => m.P > 1.001), i1 = meta.findIndex((m, k) => k >= i0 && m.P >= 1.999);
  if (i0 > 0 && i1 > i0) {
    execFileSync('python3', ['-c', py, dir, join(outDir, `geste2-${name}.gif`), String(Math.max(0, i0 - 8)), String(i1 + 10)], { stdio: 'inherit' });
    console.log('GIF Geste 2:', join(outDir, `geste2-${name}.gif`));
  }
}
