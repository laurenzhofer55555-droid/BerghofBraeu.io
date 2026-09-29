#!/usr/bin/env python3
"""Lokaler Testserver wie GitHub Pages: gzip für Text, Cache-Control max-age=600.
Aufruf: python3 tools/tests/serve.py <Ordner> <Port>   (nur für Tests, wird nicht veröffentlicht)"""
import gzip
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

COMPRESS = ('.html', '.css', '.js', '.json', '.svg', '.txt', '.xml', '.webmanifest')


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.webmanifest': 'application/manifest+json',
                      '.webp': 'image/webp', '.woff2': 'font/woff2', '.js': 'text/javascript'}

    def end_headers(self):
        self.send_header('Cache-Control', 'max-age=600')   # wie GitHub Pages
        super().end_headers()

    def send_head(self):
        path = self.translate_path(self.path)
        if path.endswith('/') or self.path.split('?')[0].endswith('/'):
            path = path.rstrip('/') + '/index.html'
        if path.endswith(COMPRESS) and 'gzip' in self.headers.get('Accept-Encoding', ''):
            try:
                with open(path, 'rb') as f:
                    body = gzip.compress(f.read())
            except OSError:
                return super().send_head()
            self.send_response(200)
            self.send_header('Content-Type', self.guess_type(path))
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            from io import BytesIO
            return BytesIO(body)
        return super().send_head()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    root, port = sys.argv[1], int(sys.argv[2])
    ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=root)).serve_forever()
