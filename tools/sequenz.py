#!/usr/bin/env python3
"""Wandelt die gerenderten PNG-Bilder der Scroll-Sequenz in WebP für die Seite um.

Ablauf (siehe README, „Sequenz neu rendern“):
  1. tools/sequenz-rendern.html im lokalen Aufnahme-Server öffnen und „Rendern“ klicken
     → PNGs in <roh>/sequenz-roh-desktop, <roh>/sequenz-roh-mobil, <roh>/sequenz-roh (Standbilder)
  2. python3 tools/sequenz.py <roh>
     → assets/sequenz/desktop/001.webp …, assets/sequenz/mobil/001.webp …,
       Ruhebilder in voller Schärfe (still-001.webp …), assets/sequenz/manifest.json,
       neue Standbilder der Flasche (assets/img/flasche-berghof-hell*.webp),
       Texturen für Stufe 7 aus tools/schaum-rendern.html (schaum/schaumrand/perlen.webp), falls vorhanden
  3. Die ausgegebenen Prozentwerte für .poster (index.html + css/style.css) übernehmen, falls sie sich ändern.
"""
import json
import pathlib
import sys

from PIL import Image, ImageChops

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'sequenz'
IMG = ROOT / 'assets' / 'img'
CREAM = (0xF7, 0xF4, 0xEC)

# Bewegungsbilder klein (fließendes Scrollen, wenig Daten), Ruhebilder an den Stationen groß und scharf
SETS = {
    'desktop': {'motion': (1600, 800), 'still': (2880, 1440), 'quality': 72, 'still_quality': 80},
    'mobil': {'motion': (700, 1129), 'still': (1200, 1935), 'quality': 72, 'still_quality': 80},
}
# Standbild vor dem Laden (Ausschnitt um die Flasche), Breiten wie im srcset von index.html
# Texturen für Stufe 7 „das Bier wird leer“ (mit Transparenz) → WebP-Qualität
TEXTURES = {'schaum': 70, 'schaumrand': 82, 'perlen': 75}
POSTERS = {
    'poster-quer': ('flasche-berghof-hell', [322, 474, 701]),
    'poster-hoch': ('flasche-berghof-hell-hoch', [285, 419, 586]),
}


def save(img, path, quality):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, 'WEBP', quality=quality, method=6)
    return path.stat().st_size


def bottle_box(img):
    """Rahmen um alles, was sich vom Creme-Hintergrund abhebt (Flasche + Schatten)."""
    diff = ImageChops.difference(img.convert('RGB'), Image.new('RGB', img.size, CREAM)).convert('L')
    return diff.point(lambda v: 255 if v > 6 else 0).getbbox()


def main():
    if len(sys.argv) < 2:
        sys.exit('Aufruf: python3 tools/sequenz.py <Ordner mit sequenz-roh-*>')
    raw = pathlib.Path(sys.argv[1])
    seq = json.loads((ROOT / 'tools' / 'sequenz.json').read_text(encoding='utf-8'))
    # Die Seite beginnt bei der Startstation (sequenz.json → start); Bilder davor werden nicht ausgeliefert
    names = [s['name'] for s in seq['stations']]
    first = names.index(seq.get('start', names[0]))
    stations = [s['frame'] for s in seq['stations']][first:]
    manifest = {'frames': seq['frames'], 'stations': stations, 'sets': {}}

    for name, cfg in SETS.items():
        src = raw / f'sequenz-roh-{name}'
        total = 0
        for old in (OUT / name).glob('*.webp'):                        # nicht mehr benötigte Bilder entfernen
            k = int(old.stem.replace('still-', '')) - 1
            if k < stations[0] or (old.stem.startswith('still-') and k not in stations):
                old.unlink()
        for i in range(stations[0], seq['frames']):
            png = src / f'{i + 1:03d}.png'
            targets = [(OUT / name / f'{i + 1:03d}.webp', cfg['motion'], cfg['quality'])]
            if i in stations:
                targets.append((OUT / name / f'still-{i + 1:03d}.webp', cfg['still'], cfg['still_quality']))
            im = None
            for out, size, quality in targets:
                if out.exists() and out.stat().st_mtime > png.stat().st_mtime:   # unverändert → überspringen
                    total += out.stat().st_size
                    continue
                im = im or Image.open(png).convert('RGB')
                total += save(im.resize(size, Image.LANCZOS), out, quality)
        manifest['sets'][name] = {'motion': list(cfg['motion']), 'still': list(cfg['still'])}
        print(f'{name}: {seq["frames"] - stations[0]} Bilder + {len(stations)} Ruhebilder, {total / 1e6:.1f} MB')

    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')

    for name, quality in TEXTURES.items():
        png = raw / 'sequenz-roh' / f'{name}.png'
        if png.exists():
            size = save(Image.open(png).convert('RGBA'), OUT / f'{name}.webp', quality)
            print(f'{name}.webp: {size / 1e3:.0f} KB')

    for poster, (base, widths) in POSTERS.items():
        im = Image.open(raw / 'sequenz-roh' / f'{poster}.png').convert('RGB')
        x0, y0, x1, y1 = bottle_box(im)
        cx = im.width / 2                    # Kamera schaut mittig → Flasche waagrecht zentriert
        half = max(cx - x0, x1 - cx) + 4
        y0, y1 = max(0, y0 - 4), min(im.height, y1 + 4)
        crop = im.crop((round(cx - half), y0, round(cx + half), y1))
        for w in widths:
            h = round(crop.height * w / crop.width)
            suffix = '' if w == widths[1] else f'-{w}'
            save(crop.resize((w, h), Image.LANCZOS), IMG / f'{base}{suffix}.webp', 82)
        print(f'{poster}: top {100 * y0 / im.height:.2f}%  height {100 * (y1 - y0) / im.height:.2f}%  '
              f'aspect-ratio {crop.width} / {crop.height}  (mittlere Breite {widths[1]} × {round(crop.height * widths[1] / crop.width)})')


if __name__ == '__main__':
    main()
