#!/usr/bin/env python3
"""Schreibt die Standorte aus data/standorte.json als statisches HTML in index.html.

Neuen Standort hinzufügen:
  1. Eintrag in data/standorte.json ergänzen
  2. im Projektordner ausführen:  python3 tools/standorte.py
Der Text steht dann direkt im HTML – Google kann ihn lesen, auch ohne JavaScript.
"""
import html
import json
import pathlib
import re
from urllib.parse import quote

ROOT = pathlib.Path(__file__).resolve().parent.parent
START = '<!-- standorte:start – automatisch aus data/standorte.json (python3 tools/standorte.py) -->'
END = '<!-- standorte:end -->'


def esc(value):
    return html.escape(str(value), quote=True)


def render(loc, indent):
    pad = ' ' * indent
    lines = [f'{pad}<li class="location__item">', f'{pad}  <h3>{esc(loc["name"])}</h3>']
    if loc.get('info'):
        lines.append(f'{pad}  <p>{esc(loc["info"])}</p>')
    lines.append(f'{pad}  <address>{esc(loc["strasse"])}<br />{esc(loc["ort"])}</address>')
    if loc.get('ansprechpartner'):
        lines.append(f'{pad}  <p>Ansprechpartner: {esc(loc["ansprechpartner"])}</p>')
    if loc.get('zeiten'):
        lines.append(f'{pad}  <p>{esc(loc["zeiten"])}</p>')
    if loc.get('telefon'):
        tel = re.sub(r'[^\d+]', '', loc['telefon'])
        if tel.startswith('0') and not tel.startswith('00'):
            tel = '+49' + tel[1:]   # internationales Format für Handys
        lines.append(f'{pad}  <p><a href="tel:{tel}">{esc(loc["telefon"])}</a></p>')
    if loc.get('email'):
        lines.append(f'{pad}  <p><a href="mailto:{esc(loc["email"])}">{esc(loc["email"])}</a></p>')
    query = quote(f'{loc["strasse"]}, {re.sub(r"\s*\(.*?\)", "", loc["ort"])}')
    url = f'https://www.google.com/maps/search/?api=1&amp;query={query}'
    lines.append(f'{pad}  <a class="location__link" href="{url}" target="_blank" rel="noopener">Route planen (Google Maps)</a>')
    lines.append(f'{pad}</li>')
    return '\n'.join(lines)


def main():
    locations = json.loads((ROOT / 'data' / 'standorte.json').read_text(encoding='utf-8'))
    index = ROOT / 'index.html'
    page = index.read_text(encoding='utf-8')
    start = page.index(START)
    end = page.index(END)
    indent = len(page[:start].split('\n')[-1])
    pad = ' ' * indent
    block = (f'{START}\n{pad}<ul class="location__list">\n'
             + '\n'.join(render(loc, indent + 2) for loc in locations)
             + f'\n{pad}</ul>\n{pad}')
    index.write_text(page[:start] + block + page[end:], encoding='utf-8')
    print(f'{len(locations)} Standort(e) in index.html geschrieben.')


if __name__ == '__main__':
    main()
