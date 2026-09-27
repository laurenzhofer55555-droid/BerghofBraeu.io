#!/usr/bin/env python3
"""Prüft die statische Website vor dem Veröffentlichen.

- lokale Verweise (href, src, srcset, CSS url()) zeigen auf vorhandene Dateien
- keine Ressourcen von Drittanbietern (DSGVO: Schriften, Skripte, Bilder nur vom eigenen Webspace)
- JSON-LD ist gültiges JSON, keine doppelten ids
- jede Seite verlinkt Impressum und Datenschutz, keine .todo-Platzhalter
- sitemap.xml ist gültig und verweist nur auf vorhandene Seiten
- JavaScript in js/ ist syntaktisch korrekt (node --check), nachgeladene Dateien (import, loadScript, fetch) existieren
- jede Seite hat eine Content-Security-Policy (Meta-Tag); jedes Inline-Skript steht mit seinem sha256-Hash darin,
  Inline-Event-Handler (onload=…, onclick=…) gibt es nicht – sonst blockiert der Browser sie still

Aufruf: python3 .github/scripts/check-site.py [Ordner]   (Standard: aktueller Ordner)
"""
import base64
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
DOMAIN = "berghof-hell.de"
LEGAL_PAGES = ("impressum.html", "datenschutz.html")
# Tags, die beim Laden der Seite etwas nachladen – hier sind nur eigene Dateien erlaubt
LOADING_ATTRS = {
    "script": ("src",), "img": ("src", "srcset"), "source": ("src", "srcset"),
    "iframe": ("src",), "video": ("src", "poster"), "audio": ("src",),
    "embed": ("src",), "object": ("data",), "track": ("src",),
}
# <link rel=…>, die nur Verweise sind und nichts laden
LINK_REL_REFERENCE = {"canonical", "alternate", "author", "license", "me"}
# <script type=…>, die der Browser ausführt (JSON-LD & Co. sind nur Daten)
EXECUTABLE_SCRIPT_TYPES = {"", "text/javascript", "application/javascript", "module"}

errors = []


def fail(where, msg):
    errors.append(f"{where}: {msg}")


def is_external(url):
    return bool(re.match(r"^(https?:)?//", url, re.I))


def is_skippable(url):
    return (not url or url.startswith("#") or
            re.match(r"^(mailto|tel|data|javascript|blob):", url, re.I) is not None)


def check_local(where, base, url):
    """Prüft, ob ein lokaler Verweis auf eine vorhandene Datei zeigt."""
    if is_skippable(url) or is_external(url):
        return
    path = unquote(urlsplit(url).path)
    if not path:
        return
    target = (ROOT / path.lstrip("/")) if path.startswith("/") else (base / path)
    target = target.resolve()
    if target.is_dir():
        target = target / "index.html"
    if ROOT not in target.parents and target != ROOT:
        fail(where, f"Verweis zeigt aus der Website heraus: {url}")
    elif not target.exists():
        fail(where, f"Datei fehlt: {url}")


def srcset_urls(value):
    return [part.strip().split()[0] for part in value.split(",") if part.strip()]


def check_css(where, base, css):
    for m in re.finditer(r"@import\s+(?:url\()?\s*['\"]?([^'\")\s;]+)", css):
        if is_external(m.group(1)):
            fail(where, f"CSS lädt von Drittanbieter: {m.group(1)}")
    # Anführungszeichen beachten: ein data:-SVG kann selbst url(%23…) enthalten
    for m in re.finditer(r"url\(\s*(?:\"([^\"]*)\"|'([^']*)'|([^)\s]*))\s*\)", css):
        url = next(g for g in m.groups() if g is not None).strip()
        if is_external(url):
            fail(where, f"CSS lädt von Drittanbieter: {url}")
        else:
            check_local(where, base, url)


class PageParser(HTMLParser):
    def __init__(self, where, base):
        super().__init__(convert_charrefs=True)
        self.where, self.base = where, base
        self.ids, self.links = set(), set()
        self.in_jsonld = self.in_style = self.in_inline_script = False
        self.buf = []
        self.csp = None                 # Inhalt des Content-Security-Policy-Meta-Tags
        self.inline_scripts = []        # Quelltext der ausführbaren Inline-Skripte

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        if "id" in a:
            if a["id"] in self.ids:
                fail(self.where, f'doppelte id="{a["id"]}"')
            self.ids.add(a["id"])
        if "todo" in a.get("class", "").split():
            fail(self.where, "Platzhalter class=\"todo\" ist noch vorhanden")
        if "style" in a:
            check_css(self.where, self.base, a["style"])
        for attr in a:
            if re.fullmatch(r"on[a-z]+", attr):
                fail(self.where, f"Inline-Event-Handler {attr}=\"…\" an <{tag}> – die Content-Security-Policy blockiert ihn")
        if tag == "meta" and a.get("http-equiv", "").lower() == "content-security-policy":
            self.csp = a.get("content", "")

        if tag == "a" and a.get("href"):
            self.links.add(unquote(urlsplit(a["href"]).path).lstrip("./"))
            check_local(self.where, self.base, a["href"])
        elif tag == "link" and a.get("href"):
            rels = set(a.get("rel", "").lower().split())
            if is_external(a["href"]):
                if not rels & LINK_REL_REFERENCE:
                    fail(self.where, f"<link rel=\"{a.get('rel')}\"> lädt von Drittanbieter: {a['href']}")
            else:
                check_local(self.where, self.base, a["href"])
        for attr in LOADING_ATTRS.get(tag, ()):
            if not a.get(attr):
                continue
            urls = srcset_urls(a[attr]) if attr == "srcset" else [a[attr]]
            for url in urls:
                if is_external(url):
                    fail(self.where, f"<{tag} {attr}> lädt von Drittanbieter: {url}")
                else:
                    check_local(self.where, self.base, url)

        if tag == "script" and a.get("type") == "application/ld+json":
            self.in_jsonld, self.buf = True, []
        elif tag == "script" and not a.get("src") and a.get("type", "").lower() in EXECUTABLE_SCRIPT_TYPES:
            self.in_inline_script, self.buf = True, []
        elif tag == "style":
            self.in_style, self.buf = True, []

    def handle_data(self, data):
        if self.in_jsonld or self.in_style or self.in_inline_script:
            self.buf.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.in_jsonld:
            self.in_jsonld = False
            try:
                json.loads("".join(self.buf))
            except json.JSONDecodeError as e:
                fail(self.where, f"JSON-LD ist kein gültiges JSON: {e}")
        elif tag == "script" and self.in_inline_script:
            self.in_inline_script = False
            self.inline_scripts.append("".join(self.buf))
        elif tag == "style" and self.in_style:
            self.in_style = False
            check_css(self.where, self.base, "".join(self.buf))


def check_csp(where, csp, inline_scripts):
    """Content-Security-Policy vorhanden, streng, und passend zu den Inline-Skripten der Seite."""
    if csp is None:
        fail(where, "Content-Security-Policy (Meta-Tag) fehlt")
        return
    directives = {}
    for part in csp.split(";"):
        words = part.split()
        if words:
            directives[words[0].lower()] = words[1:]
    for name in ("default-src", "script-src", "object-src", "base-uri", "form-action"):
        if name not in directives:
            fail(where, f"Content-Security-Policy: {name} fehlt")
    script_src = directives.get("script-src", directives.get("default-src", []))
    for word in ("'unsafe-inline'", "'unsafe-eval'", "*"):
        if word in script_src:
            fail(where, f"Content-Security-Policy: script-src erlaubt {word}")
    for code in inline_scripts:
        digest = base64.b64encode(hashlib.sha256(code.encode("utf-8")).digest()).decode()
        if f"'sha256-{digest}'" not in script_src:
            fail(where, f"Inline-Skript nicht in der Content-Security-Policy: 'sha256-{digest}' fehlt in script-src "
                        "(Skript geändert? Hash in allen Seiten-Köpfen aktualisieren)")


def check_pages():
    pages = sorted(ROOT.glob("*.html"))
    if not pages:
        fail(str(ROOT), "keine HTML-Seiten gefunden")
    for page in pages:
        where = page.name
        parser = PageParser(where, page.parent)
        parser.feed(page.read_text(encoding="utf-8"))
        parser.close()
        check_csp(where, parser.csp, parser.inline_scripts)
        for legal in LEGAL_PAGES:
            if legal not in parser.links:
                fail(where, f"Link auf {legal} fehlt")
    for css in sorted(ROOT.glob("css/**/*.css")):
        check_css(str(css.relative_to(ROOT)), css.parent, css.read_text(encoding="utf-8"))


def check_scripts():
    """Eigene Skripte: keine Imports/Fetches von fremden Servern, gültige Syntax."""
    files = sorted(ROOT.glob("js/**/*.js"))
    for f in files:
        src = f.read_text(encoding="utf-8")
        where = str(f.relative_to(ROOT))
        for m in re.finditer(r"(?:\bfrom\s*|\bimport\s*\(?\s*|\bfetch\(\s*)['\"`]((?:https?:)?//[^'\"`]+)", src):
            fail(where, f"lädt von Drittanbieter: {m.group(1)}")
        # nachgeladene eigene Dateien: Module relativ zur Datei, alles andere relativ zur Seite (Hauptordner)
        for m in re.finditer(r"(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['\"](\.{1,2}/[^'\"]+)['\"]", src, re.M):
            check_local(where, f.parent, m.group(1))
        for m in re.finditer(r"['\"`]((?:vendor|assets|js|css)/[^'\"`$]+\.(?:js|mjs|json|css|webp|png|jpg|svg|woff2))['\"`]", src):
            check_local(where, ROOT, m.group(1))
    node = shutil.which("node")
    if not node:
        print("Hinweis: node nicht gefunden, JavaScript-Syntax wird nicht geprüft")
        return
    with tempfile.TemporaryDirectory() as tmp:
        for f in files:
            # als Modul prüfen (die Seite lädt die Skripte mit type="module")
            copy = Path(tmp) / (f.stem + ".mjs")
            copy.write_text(f.read_text(encoding="utf-8"), encoding="utf-8")
            r = subprocess.run([node, "--check", str(copy)], capture_output=True, text=True)
            if r.returncode:
                fail(str(f.relative_to(ROOT)), "JavaScript-Syntaxfehler:\n" + r.stderr.strip())


def check_sitemap():
    sitemap = ROOT / "sitemap.xml"
    if not sitemap.exists():
        fail("sitemap.xml", "fehlt")
        return
    try:
        tree = ET.parse(sitemap)
    except ET.ParseError as e:
        fail("sitemap.xml", f"kein gültiges XML: {e}")
        return
    for loc in tree.iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc"):
        url = urlsplit((loc.text or "").strip())
        if url.netloc != DOMAIN:
            fail("sitemap.xml", f"fremde Domain: {loc.text}")
            continue
        check_local("sitemap.xml", ROOT, url.path or "/")


def main():
    check_pages()
    check_scripts()
    check_sitemap()
    if errors:
        print(f"{len(errors)} Fehler gefunden:\n")
        for e in errors:
            print(" ✗ " + e)
        sys.exit(1)
    print("Alle Prüfungen bestanden ✓")


if __name__ == "__main__":
    main()
