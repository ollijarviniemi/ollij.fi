#!/usr/bin/env python3
"""Static harness server for the comment-layer test suites: serves the repo source tree
(so the mockup + assets/js/comments.js are live-editable) while mapping the one
Jekyll-compiled asset, /assets/css/site.css, to its _site build. Port = argv[1]."""
import http.server, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8790


class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = super().translate_path(path)
        if path.split('?')[0] == '/assets/css/site.css':
            built = os.path.join(ROOT, '_site/assets/css/site.css')
            if os.path.exists(built):
                return built
        return p

    def log_message(self, *a):
        pass


os.chdir(ROOT)
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
