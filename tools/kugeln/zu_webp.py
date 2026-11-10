#!/usr/bin/env python3
"""Schneidet die gerenderten Kugel-PNGs symmetrisch um die Mittelachse zu und schreibt assets/img/kugel-<name>.webp (2 Pixel je Einheit, also scharf bis 2x-Bildschirme).
Aufruf (von bauen.mjs): python3 tools/kugeln/zu_webp.py <Ordner mit PNGs> <Z>. Gibt die Größen als fertigen JavaScript-Eintrag für js/winter.js aus (KUGEL_MASS)."""
import sys, json
from pathlib import Path
from PIL import Image, ImageFilter
quelle, Z = Path(sys.argv[1]), int(sys.argv[2])
ziel = Path(__file__).resolve().parent.parent.parent / 'assets/img'
mass = {}
for png in sorted(quelle.glob('*.png')):
    im = Image.open(png).convert('RGBA')
    l, o, r, u = im.getbbox()
    mitte = 60 * Z
    halb = max(mitte - l, r - mitte) + 2 * Z               # etwas Rand für den weichen Rand
    box = (mitte - halb, max(0, o - 2 * Z), mitte + halb, min(im.height, u + 2 * Z))
    im = im.crop(box)
    f = 2 / Z
    im = im.resize((round(im.width * f), round(im.height * f)), Image.LANCZOS)
    # Schatten ins Bild gebacken (ein CSS-Filter auf der schwingenden Kugel ließ sie in Safari verschwinden): weich, dunkelgrün, leicht nach unten; Rand nur seitlich und unten
    pad = 9
    gross = Image.new('RGBA', (im.width + 2 * pad, im.height + pad), (0, 0, 0, 0))
    sch = Image.new('RGBA', gross.size, (0, 10, 4, 0))
    sch.putalpha(Image.new('L', gross.size, 0))
    a = Image.new('L', gross.size, 0); a.paste(im.getchannel('A'), (pad, 3))
    a = a.filter(ImageFilter.GaussianBlur(3.2)).point(lambda v: int(v * .5))
    sch.putalpha(a)
    gross.alpha_composite(sch); gross.alpha_composite(im, (pad, 0))
    im = gross
    pfad = ziel / f'kugel-{png.stem}.webp'
    im.save(pfad, 'WEBP', quality=88, method=6)
    mass[png.stem] = [im.width, im.height]
    print(f'{pfad.name:28s} {im.width}x{im.height}  {pfad.stat().st_size // 1024} KB')
print('const KUGEL_MASS = ' + json.dumps(mass).replace('"', "'") + ';')
