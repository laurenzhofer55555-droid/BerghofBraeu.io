#!/usr/bin/env python3
"""Cache-Stempel: GitHub Pages liefert alles mit max-age=600 aus. Wer die Seite kurz vor einem Deploy besucht hatte, bekam danach neues HTML
mit altem CSS/JS/Bildern (zerschossene Darstellung). Dieses Skript hängt an CSS, JS, Sequenzbilder und Standbild eine Versionsnummer an
(?v=…), die sich nur ändert, wenn sich der Inhalt ändert. Vor jedem Veröffentlichen ausführen:  python3 tools/stempeln.py
  · H (Code): Hash von css/style.css und js/*.js → css/style.css?v=H, js/main.js?v=H, alle Importe in js/main.js und js/sequenz.js
  · A (Bilder): Hash von assets/sequenz/**, assets/img/flasche-berghof-hell*.webp → manifest.json („v“), Sequenzbilder, Standbild in index.html
  · --pruefen: nur prüfen (Rückgabewert 1, wenn Stempel veraltet sind)"""
import hashlib, re, sys, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
V = re.compile(r'\?v=[0-9a-f]{8}')
def sha(parts):
    h = hashlib.sha1()
    for p in parts: h.update(p)
    return h.hexdigest()[:8]

code = [ROOT / 'css/style.css'] + sorted((ROOT / 'js').glob('*.js'))
H = sha(V.sub('', f.read_text(encoding='utf-8')).encode() for f in code)
manifest_path = ROOT / 'assets/sequenz/manifest.json'
man = json.loads(manifest_path.read_text(encoding='utf-8')); man.pop('v', None)
files = sorted((ROOT / 'assets/sequenz').rglob('*.webp')) + sorted((ROOT / 'assets/img').glob('flasche-berghof-hell*.webp'))
A = sha([f.name.encode() + f.read_bytes() for f in files] + [json.dumps(man, sort_keys=True).encode()])

changed = []
def write(path, text):
    if path.read_text(encoding='utf-8') != text:
        changed.append(path.name)
        if '--pruefen' not in sys.argv: path.write_text(text, encoding='utf-8')

# manifest.json
man2 = dict(man); man2['v'] = A
new_manifest = json.dumps(man2, ensure_ascii=False, indent=2) + '\n'
old_txt = manifest_path.read_text(encoding='utf-8')
if json.loads(old_txt).get('v') != A: changed.append('manifest.json')
if '--pruefen' not in sys.argv and json.loads(old_txt).get('v') != A: manifest_path.write_text(new_manifest, encoding='utf-8')

# index.html: CSS, main.js, Standbild
p = ROOT / 'index.html'; t = p.read_text(encoding='utf-8')
t = V.sub('', t)
t = t.replace('href="css/style.css"', f'href="css/style.css?v={H}"').replace('src="js/main.js"', f'src="js/main.js?v={H}"')
t = re.sub(r'(assets/img/flasche-berghof-hell[\w-]*\.webp)', lambda m: m.group(1) + f'?v={A}', t)
write(p, t)
# Importe in js/main.js und js/sequenz.js
for name in ('main.js', 'sequenz.js'):
    p = ROOT / 'js' / name; t = p.read_text(encoding='utf-8')
    t = re.sub(r"(['\"])(\./[a-z-]+\.js)(?:\?v=[0-9a-f]{8})?\1", lambda m: f"{m.group(1)}{m.group(2)}?v={H}{m.group(1)}", t)
    write(p, t)
print(f'Code-Version {H}, Bilder-Version {A}; geändert: {", ".join(changed) or "nichts (alles aktuell)"}')
sys.exit(1 if changed and '--pruefen' in sys.argv else 0)
