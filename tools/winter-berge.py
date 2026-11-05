#!/usr/bin/env python3
"""Erzeugt das Spachtel-Bild der Winter-Schlussszene (assets/img/winter-berge-*.webp): Schneeberge in dicker Farbe, Schatten kühl, Himmel hellgrau.
Aufruf:  python3 tools/winter-berge.py     (benötigt numpy und Pillow; das Bild wird einmal erzeugt und liegt dann im Repository)
Die Geometrie (Gipfel, Grat, Aufstiegsweg der Schafe, Lager) steht in js/winter-gipfel.js im selben Koordinatensystem (1600 × 960)."""
import math
import numpy as np
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

W, H = 1600, 960
ROOT = Path(__file__).resolve().parent.parent
rng = np.random.default_rng(23)

# Farben der Seite: Creme-Schnee, Himmel als warmes Hellgrau, Schatten als kühles Tannen-Blaugrau
SCHNEE = np.array([249, 247, 241], float)
HIMMEL = np.array([216, 215, 210], float)
SCHATTEN = np.array([112, 140, 150], float)
SCHATTEN_TIEF = np.array([78, 108, 118], float)


def rauh(punkte, tiefe=4, amp=.035):
    """Kanten wie von Hand gezogen: Mittelpunkte werden zufällig quer verschoben."""
    for _ in range(tiefe):
        neu = []
        for (x0, y0), (x1, y1) in zip(punkte, punkte[1:]):
            l = math.hypot(x1 - x0, y1 - y0)
            nx, ny = (-(y1 - y0) / (l or 1), (x1 - x0) / (l or 1))
            d = rng.normal(0, amp * l)
            neu += [(x0, y0), ((x0 + x1) / 2 + nx * d, (y0 + y1) / 2 + ny * d)]
        punkte = neu + [punkte[-1]]
        amp *= .62
    return punkte


def maske(punkte, glatt=1.3):
    im = Image.new('L', (W, H), 0)
    ImageDraw.Draw(im).polygon(rauh(punkte), fill=255)
    return np.asarray(im.filter(ImageFilter.GaussianBlur(glatt)), float) / 255


# ── Flächen ──
# Berge als Schnee, darunter der Himmel; Schatten als Bänder entlang der linken Hänge
berge = maske([(0, 960), (0, 560), (110, 440), (300, 280), (440, 205), (520, 200), (620, 280), (700, 360), (790, 400), (880, 320), (1010, 135),
               (1090, 150), (1230, 300), (1400, 440), (1600, 560), (1600, 960)])
schatten_links = maske([(300, 280), (440, 205), (500, 240), (470, 330), (400, 440), (300, 540), (170, 630), (0, 700), (0, 560), (110, 440)])
schatten_rinne = maske([(1010, 135), (1090, 150), (1120, 230), (1060, 330), (990, 420), (900, 540), (800, 680), (720, 820), (640, 960), (500, 960),
                        (680, 640), (790, 480), (790, 400), (880, 320), (940, 220)])
himmel = 1 - berge
# Vordergrund: flacher Hügel, auf dem das Lagerfeuer steht; sein Schatten fällt auf den Hang dahinter
KAMM = [(0, 716), (250, 692), (520, 676), (800, 672), (1080, 676), (1350, 692), (1600, 708)]
huegel = maske(KAMM + [(1600, 960), (0, 960)], 1.6)
schatten_kamm = maske(KAMM + [(x, y - 26) for x, y in reversed(KAMM)], 6) * (1 - huegel)


def streichfeld(winkel, lang, quer, seed):
    """Rauschen, in einer Richtung gestreckt (wie Spachtelzüge)."""
    r = np.random.default_rng(seed)
    n = Image.fromarray((r.random((H // quer + 2, W // lang + 2)) * 255).astype('uint8'))
    n = n.resize((W * 2, H * 2), Image.BICUBIC).rotate(winkel, resample=Image.BICUBIC)
    n = n.crop((W // 2, H // 2, W // 2 + W, H // 2 + H))
    a = np.asarray(n, float) / 255
    return a - a.mean()


def spachtelzuege(m, winkel, anzahl, laenge, breite, seed):
    """Einzelne Spachtelzüge als helle Wülste mit dunklem Rand, nur innerhalb der Fläche m."""
    r = np.random.default_rng(seed)
    hell = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(hell)
    ys, xs = np.nonzero(m > .6)
    for _ in range(anzahl):
        i = r.integers(len(xs))
        x, y = xs[i], ys[i]
        a = math.radians(winkel + r.normal(0, 10))
        l = laenge * (.4 + r.random())
        w = int(breite * (.5 + r.random()))
        x2, y2 = x + math.cos(a) * l, y + math.sin(a) * l
        d.line([(x, y), ((x + x2) / 2 + r.normal(0, 4), (y + y2) / 2 + r.normal(0, 4)), (x2, y2)], fill=int(110 + r.random() * 120), width=max(2, w))
    return np.asarray(hell.filter(ImageFilter.GaussianBlur(2.4)), float) / 255 * m


# ── Höhenkarte der Farbe ──
hoehe = streichfeld(-30, 160, 16, 1) * 1.1 * berge
hoehe += streichfeld(-60, 120, 14, 3) * .8 * (schatten_links + schatten_rinne)
hoehe += spachtelzuege(berge * (1 - schatten_rinne), -28, 190, 300, 22, 5) * .85
hoehe += spachtelzuege(berge * (1 - schatten_rinne), 8, 100, 340, 20, 6) * .6
hoehe += spachtelzuege(huegel, 3, 160, 330, 13, 8) * .5
hoehe += spachtelzuege((schatten_links + schatten_rinne).clip(0, 1), -58, 110, 200, 14, 7) * .5
hoehe += np.random.default_rng(9).normal(0, .008, (H, W))
hoehe = np.asarray(Image.fromarray((hoehe * 150 + 128).clip(0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(2.2)), float) / 255

# Licht von links oben auf die Farbwülste
gy, gx = np.gradient(hoehe * 13)
licht = np.clip(.5 + (-gx * .8 - gy * .6) * 1.6, 0, 1)

# ── Farbe ──
farbe = np.ones((H, W, 3)) * HIMMEL
farbe = farbe * himmel[..., None] + SCHNEE * berge[..., None]
sch = (schatten_links + schatten_rinne).clip(0, 1)
farbe = farbe * (1 - sch[..., None]) + SCHATTEN * sch[..., None]
farbe = farbe * (1 - schatten_kamm[..., None] * .32) + SCHATTEN * schatten_kamm[..., None] * .32
farbe = farbe * (1 + huegel[..., None] * .012)
tief = np.clip((np.arange(H)[:, None] - 150) / 520, 0, 1) * sch
farbe = farbe * (1 - tief[..., None] * .5) + SCHATTEN_TIEF * tief[..., None] * .5
# Wülste hell/dunkel; im Schnee kräftiger, im Himmel kaum
stark = .04 + .3 * berge
farbe *= (1 - stark / 2 + stark * licht)[..., None]
# sanfte Farbflecken (ungleichmäßig aufgetragen) und Korn
fleck = np.asarray(Image.fromarray((np.random.default_rng(4).random((6, 10)) * 255).astype('uint8')).resize((W, H), Image.BICUBIC), float) / 255
farbe *= (.965 + .07 * fleck)[..., None]
farbe += np.random.default_rng(12).normal(0, 2.0, (H, W, 1))
farbe = np.clip(farbe, 0, 255).astype('uint8')

bild = Image.fromarray(farbe, 'RGB')
for breite, name in ((1600, 'winter-berge-1600.webp'), (800, 'winter-berge-800.webp')):
    b = bild if breite == W else bild.resize((breite, round(H * breite / W)), Image.LANCZOS)
    pfad = ROOT / 'assets' / 'img' / name
    b.save(pfad, 'WEBP', quality=80, method=6)
    print(name, b.size, pfad.stat().st_size // 1024, 'KB')
