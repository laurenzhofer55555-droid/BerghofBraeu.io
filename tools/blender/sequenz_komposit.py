#!/usr/bin/env python3
"""Legt die freigestellten Blender-Bilder (rgba-<set>/NNN.png, Schatten als Alpha) auf Creme und schreibt die Rohbilder für tools/sequenz.py.

Aufruf: python3 tools/blender/sequenz_komposit.py <Ordner mit rgba-*> <Ausgabeordner> [desktop|mobil|poster-quer|poster-hoch]
Ausgabe: <aus>/sequenz-roh-desktop/NNN.png, <aus>/sequenz-roh-mobil/NNN.png, <aus>/sequenz-roh/poster-quer.png, poster-hoch.png, kappe.json

Korrekturen (nur Nachbearbeitung, die Blender-Szene bleibt unverändert):
  1. Schatten: der Boden-Schatten (reines Schwarz mit Alpha) verliert sein flaches Grundrauschen, damit außerhalb von Flasche und Kontaktschatten genau Creme bleibt.
  2. Bierfarbe in der Vogelperspektive: der lange Weg durch das Bier färbt rot, hier wird der Farbton Richtung Bernstein gedreht (nur Bilder 25 bis 90 der Fahrt).
  3. Kronkorken-Farbe im Zoom: die Farbe des letzten Bildes wird auf die Seitenfarbe --gold-beer (#C5A149) angepasst, damit die Bierfarbe nahtlos aus dem Bild herauswächst.
"""
import json
import pathlib
import sys

import numpy as np
from PIL import Image

CREAM = (247, 244, 236)
GOLD = np.array([197, 161, 73], float)
FORMATE = {'desktop': (1600, 800), 'mobil': (700, 1129)}
POSTER = {'poster-quer': (4000, 2500), 'poster-hoch': (1280, 2771)}
SCHATTEN_ABSCHNITT = 0.07          # Alpha unter 7 % im reinen Schatten wird entfernt (Rauschen/Weltlicht-Dunkelung weit weg von der Flasche)
GOLD_GAIN = {}                     # je Satz: Verstärkung der Kronkorkenfarbe im letzten Bild (aus einem Probelauf)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def komposit(path, f, n, satz):
    im = np.asarray(Image.open(path).convert('RGBA'), dtype=np.float32)
    rgb, al = im[..., :3], im[..., 3] / 255.0
    schwarz = rgb.sum(axis=2) < 14                                           # reiner Schatten (keine Flasche)
    al = np.where(schwarz, np.clip((al - SCHATTEN_ABSCHNITT) / (1 - SCHATTEN_ABSCHNITT), 0, 1), al)
    out = rgb * al[..., None] + np.array(CREAM, np.float32) * (1 - al[..., None])
    # Bierfarbe Richtung Bernstein in der Vogelperspektive
    w = float(smooth(20, 40, f) * (1 - smooth(78, 95, f))) if satz in ('desktop', 'mobil') else 0.0
    if w > 0:
        hsv = np.asarray(Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).convert('HSV'), dtype=np.float32)
        h = hsv[..., 0] * 360 / 255.0
        hd = np.minimum(np.abs(h - 4), np.abs(h - 364))                      # Abstand zum Rot (Mitte 4°)
        m = (1 - smooth(10, 24, hd)) * smooth(0.45, 0.65, hsv[..., 1] / 255.0) * (al > 0.95) * w
        hsv[..., 0] = np.mod(hsv[..., 0] + m * (24 * 255 / 360.0), 256)
        hsv[..., 1] = hsv[..., 1] * (1 - 0.08 * m)
        out = np.asarray(Image.fromarray(hsv.astype(np.uint8), 'HSV').convert('RGB'), dtype=np.float32)
    # Kronkorkenfarbe im Zoom
    g = GOLD_GAIN.get(satz)
    if g is not None and f > 50:
        wz = float(smooth(0.35, 0.85, (f - 50) / (n - 1 - 50)))
        gold = np.clip((np.abs(out - np.array(CREAM, np.float32)).max(axis=2) - 25) / 40, 0, 1) * ((out[..., 0] - out[..., 2]) > 50)
        out = out * (1 + (g - 1) * wz * gold[..., None])
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8), 'RGB')


def main():
    quelle, ziel = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    nur = sys.argv[3] if len(sys.argv) > 3 else None
    gain = quelle / 'gold-gain.json'
    if gain.exists():
        GOLD_GAIN.update({k: np.array(v, np.float32) for k, v in json.loads(gain.read_text()).items()})
    for satz, (w, h) in FORMATE.items():
        if nur and nur != satz:
            continue
        ordner = quelle / f'rgba-{satz}'
        if not ordner.exists():
            continue
        dateien = sorted(ordner.glob('[0-9][0-9][0-9].png'))
        aus = ziel / f'sequenz-roh-{satz}'; aus.mkdir(parents=True, exist_ok=True)
        for p in dateien:
            f = int(p.stem) - 1
            komposit(p, f, 110, satz).save(aus / p.name)
        print(satz, len(dateien), 'Bilder')
        capq = quelle / f'kappe-{satz}.json'
        if capq.exists():
            kappe = ziel / 'sequenz-roh' / 'kappe.json'; kappe.parent.mkdir(parents=True, exist_ok=True)
            alt = json.loads(kappe.read_text()) if kappe.exists() else {}
            c = json.loads(capq.read_text()); alt[satz] = [c[str(i)] for i in range(len(c))]
            kappe.write_text(json.dumps(alt))
    for name, (w, h) in POSTER.items():
        if nur and nur != name:
            continue
        p = quelle / f'rgba-{name}' / '001.png'
        if not p.exists():
            continue
        im = komposit(p, 0, 110, name)
        if im.size != (w, h):                                                 # nur Mittelstreifen gerendert → auf Creme-Fläche setzen
            leinwand = Image.new('RGB', (w, h), CREAM); leinwand.paste(im, ((w - im.width) // 2, 0)); im = leinwand
        (ziel / 'sequenz-roh').mkdir(parents=True, exist_ok=True)
        im.save(ziel / 'sequenz-roh' / f'{name}.png')
        print(name, im.size)


if __name__ == '__main__':
    main()
