#!/usr/bin/env python3
"""Freigestelltes Produktbild der Flasche für die Seite (assets/img/flasche-*.webp) und der Bodenschatten als eigene Ebene.

Ablauf: tools/sequenz-rendern.html öffnen und in der Konsole `__produkt()` aufrufen (Aufnahme-Server läuft, siehe tools/aufnahme-server.py);
das legt creme.png, schwarz.png und weiss.png (gleiche Kamera wie Bild 1 der Sequenz, vor Creme, Schwarz und Weiß) im Ordner produkt-roh ab.
Danach:  python3 tools/flasche.py <Ordner mit produkt-roh> [Ausgabe, Standard assets/img]

Farbe: das Bild vor Creme (#F7F4EC, Seitenhintergrund). Das gefärbte Glas lässt die Farbkanäle verschieden durch; als ein Alpha-Wert wird es grau.
Alpha: nur die Silhouette aus dem Paar Schwarz/Weiß (Hintergrundanteil = kleinste Durchlässigkeit der Kanäle). Die Flasche steht auf Creme, an den Kanten ist das ein sauberer Übergang.
Ausgabe: flasche-180/360/540.webp (Breiten für srcset, Höhe nach Seitenverhältnis), flasche-schatten.webp (weicher Bodenschatten, 2 Größen).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

BREITEN = (180, 360, 540)
PAD = 8                                     # px Rand um die Flasche im Rohbild


def matte(roh: Path) -> Image.Image:
    c = np.asarray(Image.open(roh / 'creme.png').convert('RGB'), dtype=np.float32)
    s_ = np.asarray(Image.open(roh / 'schwarz.png').convert('RGB'), dtype=np.float32) / 255
    w = np.asarray(Image.open(roh / 'weiss.png').convert('RGB'), dtype=np.float32) / 255
    durch = (w - s_).min(axis=2)                       # 1 = nur Hintergrund, kleiner = Flasche (Glas lässt im Blaukanal am wenigsten durch)
    alpha = np.clip((1 - durch) / 0.92, 0, 1)
    alpha = np.where(alpha > 0.985, 1.0, alpha)
    rgba = np.dstack([c / 255, alpha])
    return Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA')


def zuschneiden(im: Image.Image) -> Image.Image:
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > 8)
    return im.crop((max(0, xs.min() - PAD), max(0, ys.min() - PAD), min(im.width, xs.max() + 1 + PAD), min(im.height, ys.max() + 1 + PAD)))


def schatten(breite: int) -> Image.Image:
    """Weicher Bodenschatten: flache Ellipse, stark weichgezeichnet, dunkles Tannengrün (wie der Text) statt reinem Schwarz."""
    h = max(8, breite // 6)
    pad = breite // 6
    im = Image.new('L', (breite + 2 * pad, h + 2 * pad), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(im).ellipse((pad + breite * 0.08, pad + h * 0.15, pad + breite * 0.92, pad + h * 0.85), fill=150)
    im = im.filter(ImageFilter.GaussianBlur(breite / 22))
    out = Image.new('RGBA', im.size, (31, 48, 31, 0))
    out.putalpha(im)
    return out


def main() -> None:
    roh = Path(sys.argv[1]) / 'produkt-roh'
    ziel = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / 'assets' / 'img'
    ziel.mkdir(parents=True, exist_ok=True)
    flasche = zuschneiden(matte(roh))
    print('Flasche zugeschnitten', flasche.size, 'Seitenverhältnis %.4f' % (flasche.width / flasche.height))
    for b in BREITEN:
        h = round(flasche.height * b / flasche.width)
        flasche.resize((b, h), Image.LANCZOS).save(ziel / f'flasche-{b}.webp', 'WEBP', quality=90, alpha_quality=100, method=6)
        print(f'flasche-{b}.webp {b}×{h}', (ziel / f'flasche-{b}.webp').stat().st_size, 'Bytes')
    for b in (320, 640):                       # Schatten: Breite der Ebene entspricht ca. 1,6 × Flaschenbreite
        s = schatten(b)
        s.save(ziel / f'flasche-schatten-{b}.webp', 'WEBP', quality=85, alpha_quality=90, method=6)
        print(f'flasche-schatten-{b}.webp {s.width}×{s.height}', (ziel / f'flasche-schatten-{b}.webp').stat().st_size, 'Bytes')


if __name__ == '__main__':
    main()
