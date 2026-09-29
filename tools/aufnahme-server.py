#!/usr/bin/env python3
"""Aufnahme-Server fürs Rendern (tools/sequenz-rendern.html): liefert den Repo-Ordner aus und speichert
POST /__shot?dir=…&name=… als PNG (mit &ext=json als JSON, z. B. die Kronkorken-Mitte je Bild).
Aufruf: python3 tools/aufnahme-server.py <Repo> <Ausgabeordner> <Port>   (nur lokal, wird nicht veröffentlicht)"""
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

SAFE = re.compile(r'^[\w-]+$')


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.webp': 'image/webp'}
    out = Path('.')

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        d, n = q.get('dir', [''])[0], q.get('name', [''])[0]
        if u.path != '/__shot' or not SAFE.match(d) or not SAFE.match(n):
            self.send_error(400)
            return
        body = self.rfile.read(int(self.headers['Content-Length']))
        target = self.out / d
        target.mkdir(parents=True, exist_ok=True)
        ext = 'json' if q.get('ext', [''])[0] == 'json' else 'png'
        (target / f'{n}.{ext}').write_bytes(body)
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    repo, out, port = sys.argv[1], Path(sys.argv[2]), int(sys.argv[3])
    Handler.out = out
    ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=repo)).serve_forever()
