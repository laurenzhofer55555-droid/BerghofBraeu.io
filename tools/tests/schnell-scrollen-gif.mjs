// Nimmt das Verhalten beim schnellen Scrollen als animiertes GIF auf (Headless Chrome, Bildschirmaufnahme über das
// DevTools-Protokoll) und legt es ab. Zeigt Fortschritt und Stufe als Einblendung: dieselbe Stelle = dasselbe Bild.
// Aufruf:  node tools/tests/schnell-scrollen-gif.mjs [desktop|handy] [Ausgabedatei.gif]
// Benötigt Python 3 mit Pillow (pip install pillow) zum Zusammensetzen.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browser, open, setView, gesture, range, waitStart, settle, samples, sleep } from './lib.mjs';

const view = process.argv[2] === 'handy' ? 'handy' : 'desktop';
const out = process.argv[3] || join(tmpdir(), `berghof-schnell-scrollen-${view}.gif`);
const dir = join(tmpdir(), 'berghof-gif-' + view);
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
  await open(b, '', { wait: 2500 });
  await b.js(`window.dispatchEvent(new Event('pointerdown')), 1`);
  await waitStart(b);
  await settle(b);
  const R = await range(b);
  const w = view === 'desktop' ? 480 : 200;
  await b.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: w, everyNthFrame: 1 });
  await sleep(400);
  const t0 = await b.js('Date.now()');
  // schnelles Hinunter, Schwung, sofort zurück, wieder hinunter bis ins Bier, dann in Etappen hoch und runter
  const plan = [R * 0.5, -R * 0.35, R * 0.9, -R * 0.6, R * 1.4, -R * 0.45, R * 0.3, -R * 2, R * 3];
  for (const d of plan) { await gesture(b, d, { speed: 5000 }); await sleep(180); }
  await sleep(1500);
  await b.send('Page.stopScreencast');
  const S = await samples(b);
  const wall = await b.js('Date.now() - performance.now()');
  // Einblendung je Bild: Stufe u und Scrollposition aus dem nächstgelegenen Messwert
  const meta = frames.map((f, i) => {
    const ms = f.t * 1000 - wall;
    let best = null, dist = 1e9;
    for (const s of S) { const dd = Math.abs(s.t - ms); if (dd < dist) { dist = dd; best = s; } }
    writeFileSync(join(dir, `f${String(i).padStart(4, '0')}.jpg`), Buffer.from(f.data, 'base64'));
    return { i, t: f.t, u: best ? best.u : null, y: best ? best.y : null };
  });
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta));
  console.log(`${frames.length} Bilder aufgenommen, Fehler: ${b.errors.length ? b.errors[0] : 'keine'}`);
} finally { b.close(); }

// Zusammensetzen: Zeitabstände der Aufnahme übernehmen (höchstens 15 Bilder pro Sekunde), Stufe einblenden
const py = `
import json, sys, glob
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]
meta = json.load(open(d + '/meta.json'))
imgs, durs = [], []
last_t = None
for m in meta:
    if last_t is not None and m['t'] - last_t < 0.066: continue
    im = Image.open(d + '/f%04d.jpg' % m['i']).convert('RGB')
    dr = ImageDraw.Draw(im)
    txt = 'Stufe %.2f von 3   Scroll %s px' % (m['u'] if m['u'] is not None else 0, m['y'])
    dr.rectangle((0, 0, im.width, 16), fill=(20, 20, 20)); dr.text((6, 3), txt, fill=(255, 255, 255))
    imgs.append(im.convert('P', palette=Image.ADAPTIVE, colors=64))
    durs.append(66)
    last_t = m['t']
imgs[0].save(out, save_all=True, append_images=imgs[1:], duration=durs, loop=0, optimize=True)
print(len(imgs), 'Bilder im GIF')
`;
execFileSync('python3', ['-c', py, dir, out], { stdio: 'inherit' });
console.log('GIF:', out);
