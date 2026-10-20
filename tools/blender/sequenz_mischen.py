#!/usr/bin/env python3
"""Baut die Bildsequenz der Startseite aus zwei Quellen:
  • Blender-Flasche (tools/blender/sequenz_blender.py → sequenz_komposit.py): Startbild, Standbild und der erste Teil der Fahrt
  • Bilder des 3D-Modells (three.js, tools/sequenz-rendern.html) für die Vogelperspektive und den Kronkorken-Zoom
Beide laufen auf demselben Kamerapfad (tools/sequenz.json). Zwischen Bild A und B wird sanft von Blender zum 3D-Modell übergeblendet.

Aufruf: python3 tools/blender/sequenz_mischen.py <Ordner mit rgba-*> <Ordner mit der 3D-Modell-Sequenz (desktop/, mobil/, manifest.json)> [A B]
Schreibt assets/sequenz/{desktop,mobil}/NNN.webp, still-001.webp, manifest.json und die Standbilder assets/img/flasche-berghof-hell*.webp.
"""
import importlib.util
import json
import pathlib
import shutil
import sys

import numpy as np
from PIL import Image

HIER = pathlib.Path(__file__).resolve().parent
ROOT = HIER.parents[1]


def laden(name, pfad):
    spec = importlib.util.spec_from_file_location(name, pfad)
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod


seq = laden('sequenz', ROOT / 'tools' / 'sequenz.py')
komp = laden('komposit', HIER / 'sequenz_komposit.py')


def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def main():
    quelle, modell = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    A, B = (float(sys.argv[3]), float(sys.argv[4])) if len(sys.argv) > 4 else (20.0, 30.0)
    gain = quelle / 'gold-gain.json'
    if gain.exists():
        komp.GOLD_GAIN.update({k: np.array(v, np.float32) for k, v in json.loads(gain.read_text()).items()})
    manifest = json.loads((modell / 'manifest.json').read_text(encoding='utf-8'))
    for name, cfg in seq.SETS.items():
        out = seq.OUT / name; out.mkdir(parents=True, exist_ok=True)
        n = manifest['sets'][name]['frames']
        total = 0
        for f in range(n):
            wb = 1.0 - smooth(A, B, f)                                       # Anteil Blender
            ziel = out / f'{f + 1:03d}.webp'
            if wb <= 0:
                shutil.copyfile(modell / name / f'{f + 1:03d}.webp', ziel); total += ziel.stat().st_size
                continue
            roh = komp.komposit(quelle / f'rgba-{name}' / f'{f + 1:03d}.png', f, n, name)
            if wb < 1:
                alt = Image.open(modell / name / f'{f + 1:03d}.webp').convert('RGB').resize(roh.size if roh.size == cfg['motion'] else cfg['motion'], Image.LANCZOS)
                neu = roh.resize(alt.size, Image.LANCZOS)
                roh = Image.fromarray(np.clip(np.asarray(neu, np.float32) * wb + np.asarray(alt, np.float32) * (1 - wb) + 0.5, 0, 255).astype(np.uint8))
            total += seq.save(roh.resize(cfg['motion'], Image.LANCZOS), ziel, cfg['quality'])
            if f == 0:                                                       # Ruhebild der Startstation in voller Schärfe
                total += seq.save(roh.resize(cfg['still'], Image.LANCZOS) if roh.size != tuple(cfg['still']) else roh, out / 'still-001.webp', cfg['still_quality'])
        manifest['sets'][name]['motion'] = list(cfg['motion']); manifest['sets'][name]['still'] = list(cfg['still'])
        if name == 'desktop':
            manifest['sets'][name]['titleClear'] = seq.title_clear(manifest['sets'][name]['stations'][0], manifest['sets'][name]['stations'][1], out)
        print(f'{name}: {n} Bilder, {total / 1e6:.1f} MB' + (f', titleClear {manifest["sets"][name]["titleClear"]}' if name == 'desktop' else ''))
    (seq.OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')

    for poster, (base, widths) in seq.POSTERS.items():
        p = quelle / f'rgba-{poster}' / '001.png'
        w, h = komp.POSTER[poster]
        im = komp.komposit(p, 0, 110, poster)
        rand = Image.new('RGB', im.size, komp.CREAM); rand.paste(im.crop((8, 8, im.width - 8, im.height - 8)), (8, 8)); im = rand      # der Entrauscher macht am Rand des Renderausschnitts Fehlpixel → Randstreifen auf Creme
        if im.size != (w, h):
            leinwand = Image.new('RGB', (w, h), komp.CREAM); leinwand.paste(im, ((w - im.width) // 2, 0)); im = leinwand
        x0, y0, x1, y1 = seq.bottle_box(im)
        cx = im.width / 2
        half = max(cx - x0, x1 - cx) + 4
        y0, y1 = max(0, y0 - 4), min(im.height, y1 + 4)
        crop = im.crop((round(cx - half), y0, round(cx + half), y1))
        for bw in widths:
            bh = round(crop.height * bw / crop.width)
            suffix = '' if bw == widths[1] else f'-{bw}'
            seq.save(crop.resize((bw, bh), Image.LANCZOS), seq.IMG / f'{base}{suffix}.webp', 82)
        print(f'{poster}: top {100 * y0 / im.height:.2f}%  height {100 * (y1 - y0) / im.height:.2f}%  aspect-ratio {crop.width} / {crop.height}  (mittlere Breite {widths[1]} × {round(crop.height * widths[1] / crop.width)})')


if __name__ == '__main__':
    main()
