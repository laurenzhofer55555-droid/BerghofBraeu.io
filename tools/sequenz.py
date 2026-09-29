#!/usr/bin/env python3
"""Wandelt die gerenderten PNG-Bilder der Scroll-Sequenz in WebP für die Seite um.

Ablauf (siehe README, „Sequenz neu rendern“):
  1. tools/sequenz-rendern.html im lokalen Aufnahme-Server öffnen und „Rendern“ klicken
     → PNGs in <roh>/sequenz-roh-desktop, <roh>/sequenz-roh-mobil, <roh>/sequenz-roh (Standbilder)
  2. python3 tools/sequenz.py <roh> [desktop|mobil]
     → assets/sequenz/desktop/001.webp …, assets/sequenz/mobil/001.webp …,
       Ruhebild der Startstation in voller Schärfe (still-001.webp), winzige Ersatzbilder (mini/001.webp …, damit beim schnellen
       Scrollen nie ein Bild fehlt), assets/sequenz/manifest.json (inkl. titleClear: Stufe, bis zu der der Titel
       ausgeblendet sein muss, weil die Flasche danach in seinen Bereich kommt),
       neue Standbilder der Flasche (assets/img/flasche-berghof-hell*.webp)
  3. Die ausgegebenen Prozentwerte für .poster (index.html + css/style.css) übernehmen, falls sie sich ändern.
"""
import json
import pathlib
import sys

from PIL import Image, ImageChops, ImageStat

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'sequenz'
IMG = ROOT / 'assets' / 'img'
CREAM = (0xF7, 0xF4, 0xEC)

# Bewegungsbilder klein (fließendes Scrollen, wenig Daten), Ruhebilder an den Stationen groß und scharf
SETS = {
    'desktop': {'motion': (1600, 800), 'still': (2880, 1440), 'quality': 72, 'still_quality': 80},
    'mobil': {'motion': (700, 1129), 'still': (1200, 1935), 'quality': 72, 'still_quality': 80},
}
# Ersatzbilder: winzig (ca. 3 KB), werden zuerst geladen und gezeichnet, solange das scharfe Bild noch fehlt
MINI = {'desktop': (400, 200), 'mobil': (240, 387)}
# Titelbereich der Startseite am Desktop (Anteile der Bildbreite/-höhe, 1440×900: Titel liegt bei 73 bis 93 % der Höhe)
TITLE_ZONE = (0.30, 0.734, 0.70, 0.931)
# Standbild vor dem Laden (Ausschnitt um die Flasche), Breiten wie im srcset von index.html
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


def make_minis(name, first, frames):
    """Mini-Ersatzbilder aus den fertigen Bewegungsbildern (WebP), unabhängig von den PNG-Rohbildern."""
    total = 0
    for i in range(first, frames):
        src = OUT / name / f'{i + 1:03d}.webp'
        out = OUT / name / 'mini' / f'{i + 1:03d}.webp'
        if out.exists() and out.stat().st_mtime >= src.stat().st_mtime:
            total += out.stat().st_size
            continue
        total += save(Image.open(src).convert('RGB').resize(MINI[name], Image.LANCZOS), out, 60)
    return total


def title_clear(first, station1, frames_dir):
    """Erstes Bild, in dem die Flasche in den Titelbereich ragt → Stufe (0 bis 1), bis zu der der Titel weg sein muss."""
    x0, y0, x1, y1 = TITLE_ZONE
    for i in range(first, station1 + 1):
        im = Image.open(frames_dir / f'{i + 1:03d}.webp').convert('RGB')
        w, h = im.size
        zone = im.crop((round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h)))
        diff = ImageChops.difference(zone, Image.new('RGB', zone.size, CREAM)).convert('L').point(lambda v: 255 if v > 40 else 0)
        if ImageStat.Stat(diff).mean[0] / 255 > 0.01:
            return round(max(0.0, (i - first) / (station1 - first)), 3)
    return 1.0


def minis_only():
    """Nur Mini-Bilder und Titelmaß aus den vorhandenen WebP-Bildern (ohne PNG-Rohbilder) neu erzeugen."""
    manifest_path = OUT / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    for name, spec in manifest['sets'].items():
        first, frames = spec['stations'][0], spec['frames']
        mini_total = make_minis(name, first, frames)
        spec['mini'] = list(MINI[name])
        if name == 'desktop':
            spec['titleClear'] = title_clear(first, spec['stations'][1], OUT / name)
        print(f'{name}: Mini-Bilder {mini_total / 1e3:.0f} KB' + (f', titleClear {spec["titleClear"]}' if name == 'desktop' else ''))
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')


def main():
    if len(sys.argv) == 2 and sys.argv[1] == '--minis':
        return minis_only()
    if len(sys.argv) < 2:
        sys.exit('Aufruf: python3 tools/sequenz.py <Ordner mit sequenz-roh-*> [desktop|mobil]  |  python3 tools/sequenz.py --minis')
    raw = pathlib.Path(sys.argv[1])
    only = sys.argv[2] if len(sys.argv) > 2 else None           # nur ein Format umwandeln (das andere bleibt)
    seq = json.loads((ROOT / 'tools' / 'sequenz.json').read_text(encoding='utf-8'))
    manifest_path = OUT / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
    manifest.setdefault('sets', {})
    manifest.pop('frames', None)
    manifest.pop('stations', None)

    # Desktop und Handy haben eigene Stationen und Bildzahlen (tools/sequenz.json → sets)
    for name, cfg in SETS.items():
        if only and only != name:
            continue
        spec = seq['sets'][name]
        stations = [st['frame'] for st in spec['stations']]
        frames = spec['frames']
        src = raw / f'sequenz-roh-{name}'
        total = 0
        for old in (OUT / name).glob('*.webp'):                        # nicht mehr benötigte Bilder entfernen
            k = int(old.stem.replace('still-', '')) - 1
            if k < stations[0] or k >= frames or (old.stem.startswith('still-') and k != stations[0]):
                old.unlink()
        for i in range(stations[0], frames):
            png = src / f'{i + 1:03d}.png'
            targets = [(OUT / name / f'{i + 1:03d}.webp', cfg['motion'], cfg['quality'])]
            if i == stations[0]:                                       # nur die Startstation braucht ein scharfes Ruhebild (passt zum Standbild)
                targets.append((OUT / name / f'still-{i + 1:03d}.webp', cfg['still'], cfg['still_quality']))
            im = None
            for out, size, quality in targets:
                if out.exists() and out.stat().st_mtime > png.stat().st_mtime:   # unverändert → überspringen
                    total += out.stat().st_size
                    continue
                im = im or Image.open(png).convert('RGB')
                total += save(im.resize(size, Image.LANCZOS), out, quality)
        mini_total = make_minis(name, stations[0], frames)
        manifest['sets'][name] = {'motion': list(cfg['motion']), 'still': list(cfg['still']), 'mini': list(MINI[name]),
                                  'frames': frames, 'stations': stations}
        if name == 'desktop':
            manifest['sets'][name]['titleClear'] = title_clear(stations[0], stations[1], OUT / name)
        print(f'{name}: {frames - stations[0]} Bilder + 1 Ruhebild, {total / 1e6:.1f} MB, '
              f'Mini-Bilder {mini_total / 1e3:.0f} KB' + (f', titleClear {manifest["sets"][name]["titleClear"]}' if name == 'desktop' else ''))

    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')

    for poster, (base, widths) in POSTERS.items():
        if only and only != ('desktop' if poster == 'poster-quer' else 'mobil'):
            continue
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
